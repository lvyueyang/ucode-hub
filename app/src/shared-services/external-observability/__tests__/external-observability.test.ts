/**
 * 外部系统调用可观测模块测试：pino 日志分级 + Prometheus 指标
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger, mockInc, mockObserve } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockInc: vi.fn(),
  mockObserve: vi.fn(),
}));

vi.mock("#/shared-services/logger", () => ({ logger: mockLogger }));
vi.mock("#/shared-services/metrics", () => ({
  externalCallsTotal: { inc: mockInc },
  externalCallDurationSeconds: { observe: mockObserve },
}));

import {
  isAbortError,
  logExternalRequest,
  observeExternalStream,
} from "#/shared-services/external-observability";
import { runWithRequestContext } from "#/shared-services/request-context";

describe("logExternalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("成功调用记 debug 日志并累加 success 指标", () => {
    logExternalRequest({
      system: "external",
      requestType: "login",
      path: "/api/token/",
      duration: 50,
      success: true,
    });

    expect(mockInc).toHaveBeenCalledWith({
      system: "external",
      outcome: "success",
    });
    expect(mockObserve).toHaveBeenCalledWith(0.05, { system: "external" });
    expect(mockLogger.debug).toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("失败调用记 warn 日志并累加 error 指标", () => {
    logExternalRequest({
      system: "integration",
      requestType: "business",
      path: "/rest/data/query",
      duration: 200,
      success: false,
      error: "timeout",
    });

    expect(mockInc).toHaveBeenCalledWith({
      system: "integration",
      outcome: "error",
    });
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it("ALS 上下文内注入操作者与 requestId", () => {
    runWithRequestContext(
      {
        requestId: "req-1",
        operator: {
          id: "a1",
          username: "张三",
          email: null,
          type: "admin",
        },
      },
      () => {
        logExternalRequest({
          system: "external",
          requestType: "business",
          path: "/api/test",
          duration: 10,
          success: true,
        });
      },
    );

    expect(mockLogger.debug.mock.calls.at(-1)?.[0]).toMatchObject({
      operatorId: "a1",
      operatorName: "张三",
      operatorType: "admin",
      requestId: "req-1",
    });
  });

  it("无 ALS 上下文时操作者兜底为 system", () => {
    logExternalRequest({
      system: "external",
      requestType: "business",
      path: "/api/test",
      duration: 10,
      success: true,
    });

    expect(mockLogger.debug.mock.calls.at(-1)?.[0]).toMatchObject({
      operatorId: null,
      operatorName: null,
      operatorType: "system",
    });
  });

  it("extra 元数据并入日志字段", () => {
    logExternalRequest({
      system: "external",
      requestType: "business",
      path: "/api/test",
      duration: 10,
      success: true,
      extra: { apiCode: "scm" },
    });

    expect(mockLogger.debug.mock.calls.at(-1)?.[0]).toMatchObject({
      apiCode: "scm",
      path: "/api/test",
    });
  });
});

/** 逐块产出的异步流 */
async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

/** 迭代中途抛错的异步流 */
async function* failing(): AsyncGenerator<number> {
  yield 1;
  throw new Error("上游断流");
}

describe("isAbortError", () => {
  it("识别 AbortError 与普通异常/非 Error 值", () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    expect(isAbortError(abortErr)).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe("observeExternalStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("透传全部块，并在流自然结束时记成功", async () => {
    const chunks: number[] = [];
    for await (const chunk of observeExternalStream(fromArray([1, 2, 3]), {
      system: "ai",
      requestType: "business",
      path: "chat/completions",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([1, 2, 3]);
    expect(mockInc).toHaveBeenCalledWith({ system: "ai", outcome: "success" });
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it("流内抛错时记失败并原样抛出", async () => {
    const consume = async () => {
      for await (const _ of observeExternalStream(failing(), {
        system: "ai",
        requestType: "business",
        path: "chat/completions",
      })) {
        // 仅消费
      }
    };

    await expect(consume()).rejects.toThrow("上游断流");
    expect(mockInc).toHaveBeenCalledWith({ system: "ai", outcome: "error" });
    expect(mockLogger.warn.mock.calls.at(-1)?.[0]).toMatchObject({
      error: "上游断流",
    });
  });

  it("消费方中途放弃时不计任何结果", async () => {
    for await (const _ of observeExternalStream(fromArray([1, 2, 3]), {
      system: "ai",
      requestType: "business",
      path: "chat/completions",
    })) {
      break;
    }

    expect(mockInc).not.toHaveBeenCalled();
  });

  it("客户端主动取消（AbortError）不计失败", async () => {
    async function* aborted(): AsyncGenerator<number> {
      yield 1;
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    const consume = async () => {
      for await (const _ of observeExternalStream(aborted(), {
        system: "ai",
        requestType: "business",
        path: "chat/completions",
      })) {
        // 仅消费
      }
    };

    await expect(consume()).rejects.toThrow("aborted");
    expect(mockInc).not.toHaveBeenCalled();
  });
});
