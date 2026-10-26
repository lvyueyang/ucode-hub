/**
 * 请求上下文 ALS 模块测试
 */
import { describe, expect, it } from "vitest";
import {
  getRequestContext,
  getRequestId,
  getRequestOperator,
  runWithRequestContext,
} from "../index";

describe("runWithRequestContext / getRequestContext", () => {
  it("在上下文内可读取注入的操作者", () => {
    runWithRequestContext(
      {
        operator: {
          id: "user-1",
          username: "张三",
          email: "z@x.com",
          type: "admin",
        },
      },
      () => {
        const ctx = getRequestContext();
        expect(ctx?.operator?.id).toBe("user-1");
        expect(ctx?.operator?.username).toBe("张三");
        expect(ctx?.operator?.email).toBe("z@x.com");
        expect(ctx?.operator?.type).toBe("admin");
      },
    );
  });

  it("异步调用链中上下文持续传播", async () => {
    await runWithRequestContext(
      {
        operator: {
          id: "client-1",
          username: "李四",
          email: null,
          type: "client",
        },
      },
      async () => {
        await Promise.resolve();
        const ctx = getRequestContext();
        expect(ctx?.operator?.id).toBe("client-1");
        expect(ctx?.operator?.username).toBe("李四");
        expect(ctx?.operator?.type).toBe("client");
      },
    );
  });

  it("无上下文时 getRequestContext 返回 undefined", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("嵌套上下文内层覆盖外层", () => {
    runWithRequestContext(
      {
        operator: { id: "outer", username: "外", email: null, type: "admin" },
      },
      () => {
        expect(getRequestOperator().id).toBe("outer");
        runWithRequestContext(
          {
            operator: {
              id: "inner",
              username: "内",
              email: null,
              type: "client",
            },
          },
          () => {
            expect(getRequestOperator().id).toBe("inner");
            expect(getRequestOperator().type).toBe("client");
          },
        );
        expect(getRequestOperator().id).toBe("outer");
      },
    );
  });
});

describe("getRequestId", () => {
  it("无上下文时返回 undefined", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("上下文内返回注入的 requestId", () => {
    runWithRequestContext({ requestId: "req-123" }, () => {
      expect(getRequestId()).toBe("req-123");
    });
  });
});

describe("runWithRequestContext 合并语义", () => {
  it("后写入字段与已有字段浅合并，不覆盖先写入的 requestId", () => {
    runWithRequestContext({ requestId: "req-merge" }, () => {
      runWithRequestContext(
        {
          operator: {
            id: "u-1",
            username: "合并",
            email: null,
            type: "admin",
          },
        },
        () => {
          expect(getRequestId()).toBe("req-merge");
          expect(getRequestOperator().id).toBe("u-1");
        },
      );
    });
  });
});

describe("getRequestOperator", () => {
  it("无上下文时兜底返回 system", () => {
    const op = getRequestOperator();
    expect(op.id).toBeNull();
    expect(op.username).toBeNull();
    expect(op.email).toBeNull();
    expect(op.type).toBe("system");
  });

  it("上下文内返回注入的操作者", () => {
    runWithRequestContext(
      {
        operator: {
          id: "admin-1",
          username: "管理员",
          email: "a@x.com",
          type: "admin",
        },
      },
      () => {
        const op = getRequestOperator();
        expect(op.id).toBe("admin-1");
        expect(op.username).toBe("管理员");
        expect(op.type).toBe("admin");
      },
    );
  });
});
