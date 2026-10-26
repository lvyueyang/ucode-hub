/**
 * 客户端 SFn 错误处理模块测试：提示器注册 / 错误标记 / 信息组装 / 调用 helper / 全局兜底
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callSfn,
  getSfnFunctionId,
  installSfnErrorFallback,
  isErrorHandled,
  isSfnError,
  markErrorHandled,
  markSfnError,
  notifySfnError,
  registerSfnNotifier,
  type SfnErrorInfo,
  sfnUnwrap,
} from "../sfn-error";

let notifier: ReturnType<typeof vi.fn<(info: SfnErrorInfo) => void>>;
let unregister: () => void;

/** 单调递增时钟：避免不同用例间同标题被去重窗口误伤 */
let clock = 1_000_000;

/** 取最近一次提示信息 */
function lastInfo(): SfnErrorInfo {
  const calls = notifier.mock.calls;
  return calls[calls.length - 1]?.[0] as SfnErrorInfo;
}

beforeEach(() => {
  vi.restoreAllMocks();
  clock += 10_000;
  vi.spyOn(Date, "now").mockReturnValue(clock);
  // 诊断日志会打 console，测试中静音以免刷屏（静默用例仍可断言）
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  notifier = vi.fn<(info: SfnErrorInfo) => void>();
  unregister = registerSfnNotifier(notifier);
});

afterEach(() => {
  vi.unstubAllEnvs();
  unregister();
});

describe("registerSfnNotifier / notifySfnError", () => {
  it("注册提示器后由其承接错误信息", () => {
    notifySfnError({ title: "注册提示器-用例" });
    expect(lastInfo().title).toBe("注册提示器-用例");
  });

  it("注销后降级 console.error", () => {
    unregister();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    notifySfnError({ title: "未注册提示器-用例" });
    expect(notifier).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it("相同标题在去重窗口内只提示一次", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1000);
    notifySfnError({ title: "去重文案-用例" });
    now.mockReturnValue(1500);
    notifySfnError({ title: "去重文案-用例" });
    expect(notifier).toHaveBeenCalledTimes(1);

    now.mockReturnValue(4000);
    notifySfnError({ title: "去重文案-用例" });
    expect(notifier).toHaveBeenCalledTimes(2);
  });
});

describe("SFn 错误标记", () => {
  it("markSfnError 标记 Error 并记录不透明 id（诊断兜底）", () => {
    const err = new Error("标记-用例");
    expect(isSfnError(err)).toBe(false);
    markSfnError(err, "getFooSFn");
    expect(isSfnError(err)).toBe(true);
    expect(getSfnFunctionId(err)).toBe("getFooSFn");
  });

  it("非 Error 抛出值不会被标记", () => {
    markSfnError("字符串");
    expect(isSfnError("字符串")).toBe(false);
  });

  it("markErrorHandled / isErrorHandled 生效", () => {
    const err = new Error("处理标记-用例");
    markSfnError(err);
    expect(isErrorHandled(err)).toBe(false);
    markErrorHandled(err);
    expect(isErrorHandled(err)).toBe(true);
  });
});

describe("callSfn", () => {
  it("成功时返回数据且不提示", async () => {
    const result = await callSfn(Promise.resolve({ id: "1" }));
    expect(result).toEqual({ id: "1" });
    expect(notifier).not.toHaveBeenCalled();
  });

  it("业务错误剥离元信息后展示原文，详情含请求号与方法名", async () => {
    const err = new Error("保存失败-用例（类型：业务；请求号：req-biz；SFn：updateFooSFn）");
    markSfnError(err, "opaque-id");
    await expect(callSfn(Promise.reject(err))).rejects.toBe(err);
    expect(lastInfo().title).toBe("保存失败-用例");
    expect(lastInfo().details?.requestId).toBe("req-biz");
    expect(lastInfo().details?.sfnName).toBe("updateFooSFn");
    expect(isErrorHandled(err)).toBe(true);
  });

  it("系统错误显示统一标题，请求号与方法名收进详情", async () => {
    const err = new Error(
      "服务器内部错误，请稍后重试（类型：系统；请求号：req-abc；SFn：getFooSFn）",
    );
    markSfnError(err, "opaque-id");
    await expect(callSfn(Promise.reject(err))).rejects.toBe(err);
    expect(lastInfo().title).toBe("系统错误，请稍后重试");
    expect(lastInfo().details?.requestId).toBe("req-abc");
    expect(lastInfo().details?.sfnName).toBe("getFooSFn");
  });

  it("非生产环境将原始技术信息收进详情，标题仍为系统错误", async () => {
    const err = new Error(
      "demo internal failure: connection reset by peer（类型：系统；请求号：req-dev；SFn：demoInternalErrorSFn）",
    );
    markSfnError(err, "opaque-id");
    await expect(callSfn(Promise.reject(err))).rejects.toBe(err);
    expect(lastInfo().title).toBe("系统错误，请稍后重试");
    expect(lastInfo().details?.requestId).toBe("req-dev");
    expect(lastInfo().details?.sfnName).toBe("demoInternalErrorSFn");
    expect(lastInfo().details?.rawMessage).toBe("demo internal failure: connection reset by peer");
  });

  it("生产环境仅保留请求号，隐藏 SFn 方法名与原始信息", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const err = new Error(
      "服务器内部错误，请稍后重试（类型：系统；请求号：req-prod；SFn：getFooSFn）",
    );
    markSfnError(err, "opaque-id");
    await expect(callSfn(Promise.reject(err))).rejects.toBe(err);
    expect(lastInfo().title).toBe("系统错误，请稍后重试");
    expect(lastInfo().details?.requestId).toBe("req-prod");
    expect(lastInfo().details?.sfnName).toBeUndefined();
    expect(lastInfo().details?.rawMessage).toBeUndefined();
  });

  it("生产环境诊断日志以请求号定位，不输出框架不透明 id", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new Error(
      "服务器内部错误，请稍后重试（类型：系统；请求号：req-diag；SFn：getFooSFn）",
    );
    markSfnError(err, "opaque-id-xyz");
    await sfnUnwrap(Promise.reject(err));
    const line = (warn.mock.calls.at(-1) ?? []).join(" ");
    expect(line).not.toContain("opaque-id-xyz");
    expect(line).toContain("req-diag");
  });

  it("传输失败（TypeError）提示网络异常且无详情", async () => {
    const err = new TypeError("Failed to fetch");
    markSfnError(err, "opaque-id");
    await expect(callSfn(Promise.reject(err))).rejects.toBe(err);
    expect(lastInfo().title).toBe("网络异常，请检查网络后重试");
    expect(lastInfo().details).toBeUndefined();
  });

  it("options.error 覆盖标题但仍带出请求号 / 方法名", async () => {
    const err = new Error("服务端文案（类型：业务；请求号：req-1；SFn：getFooSFn）");
    markSfnError(err);
    await expect(callSfn(Promise.reject(err), { error: "保存失败，请稍后重试" })).rejects.toBe(err);
    expect(lastInfo().title).toBe("保存失败，请稍后重试");
    expect(lastInfo().details?.requestId).toBe("req-1");
    expect(lastInfo().details?.sfnName).toBe("getFooSFn");
  });

  it("silent 不提示但仍标记已处理并保留诊断", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new Error("静默失败-用例（类型：系统；请求号：req-s；SFn：pollSFn）");
    markSfnError(err);
    await expect(callSfn(Promise.reject(err), { silent: true })).rejects.toBe(err);
    expect(notifier).not.toHaveBeenCalled();
    expect(isErrorHandled(err)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe("sfnUnwrap", () => {
  it("成功返回 [data, null]", async () => {
    const [data, err] = await sfnUnwrap(Promise.resolve(42));
    expect(data).toBe(42);
    expect(err).toBeNull();
  });

  it("失败返回 [null, error] 并统一提示", async () => {
    const err = new Error("查询失败-用例（类型：业务；请求号：req-2；SFn：listFooSFn）");
    markSfnError(err);
    const [data, reason] = await sfnUnwrap(Promise.reject(err));
    expect(data).toBeNull();
    expect(reason).toBe(err);
    expect(lastInfo().title).toBe("查询失败-用例");
    expect(lastInfo().details?.sfnName).toBe("listFooSFn");
    expect(isErrorHandled(err)).toBe(true);
  });
});

describe("installSfnErrorFallback", () => {
  type Handler = (event: { reason: unknown }) => void;
  const handlers: Record<string, Handler> = {};

  function installWithStubWindow() {
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (type: string, handler: Handler) => {
        handlers[type] = handler;
      },
      removeEventListener: vi.fn(),
    };
    return installSfnErrorFallback();
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete handlers.unhandledrejection;
  });

  it("提示已标记且未处理的 SFn 错误（系统错误带请求号）", () => {
    const cleanup = installWithStubWindow();
    const err = new Error(
      "服务器内部错误，请稍后重试（类型：系统；请求号：req-xyz；SFn：getFooSFn）",
    );
    markSfnError(err);
    handlers.unhandledrejection({ reason: err });
    expect(lastInfo().title).toBe("系统错误，请稍后重试");
    expect(lastInfo().details?.requestId).toBe("req-xyz");
    expect(lastInfo().details?.sfnName).toBe("getFooSFn");
    expect(isErrorHandled(err)).toBe(true);
    cleanup();
  });

  it("已处理的错误不再重复提示", () => {
    installWithStubWindow();
    const err = new Error("已处理-用例");
    markSfnError(err);
    markErrorHandled(err);
    handlers.unhandledrejection({ reason: err });
    expect(notifier).not.toHaveBeenCalled();
  });

  it("非 SFn 错误不提示", () => {
    installWithStubWindow();
    handlers.unhandledrejection({ reason: new Error("非 SFn") });
    expect(notifier).not.toHaveBeenCalled();
  });
});
