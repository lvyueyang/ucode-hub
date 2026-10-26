/**
 * 错误脱敏工具测试：sanitizeError 敏感信息脱敏
 */

import { describe, expect, it } from "vitest";
import {
  appendSfnErrorMeta,
  classifyError,
  getDisplayErrorMessage,
  getErrorMessage,
  parseSfnErrorMeta,
  sanitizeError,
  stripSfnErrorMeta,
  toClientError,
} from "../index";

describe("sanitizeError", () => {
  it("对 Error 对象进行脱敏并返回 name 和 message", () => {
    const err = new Error("操作失败: password 错误");
    const result = sanitizeError(err, false);
    expect(result.name).toBe("Error");
    expect(result.message).toBeDefined();
  });

  it("脱敏 password JSON 字段", () => {
    const err = new Error('请求参数: {"password":"secret123","username":"admin"}');
    const result = sanitizeError(err, false);
    expect(result.message).toContain("***REDACTED***");
    expect(result.message).not.toContain("secret123");
  });

  it("脱敏 token JSON 字段", () => {
    const err = new Error('认证失败: {"token":"eyJhbGciOiJIUzI1NiJ9.xxx","user":"admin"}');
    const result = sanitizeError(err, false);
    expect(result.message).toContain("***REDACTED***");
    expect(result.message).not.toContain("eyJhbGci");
  });

  it("脱敏单引号 token 字段", () => {
    const err = new Error("参数: 'token':'abc123','user':'admin'");
    const result = sanitizeError(err, false);
    expect(result.message).toContain("***REDACTED***");
    expect(result.message).not.toContain("abc123");
  });

  it("脱敏 Bearer Token", () => {
    const err = new Error("Unauthorized: Bearer sk-1234567890abcdef");
    const result = sanitizeError(err, false);
    expect(result.message).toContain("***REDACTED***");
    expect(result.message).not.toContain("sk-1234567890abcdef");
  });

  it("脱敏 secret 参数", () => {
    const err = new Error("配置错误: secret=my-api-key-123");
    const result = sanitizeError(err, false);
    expect(result.message).toContain("***REDACTED***");
    expect(result.message).not.toContain("my-api-key-123");
  });

  it("非 Error 类型返回 message 字符串", () => {
    const result = sanitizeError("plain string error", false);
    expect(result.message).toBe("plain string error");
  });

  it("非 Error 对象返回转换后的字符串", () => {
    const result = sanitizeError({ code: 500 }, false);
    expect(result.message).toBe("[object Object]");
  });

  it("不含敏感信息的错误原样保留", () => {
    const err = new Error("数据库连接失败");
    const result = sanitizeError(err, false);
    expect(result.message).toBe("数据库连接失败");
  });

  it("递归脱敏 error.cause 中的敏感信息", () => {
    const cause = new Error('底层原因: {"password":"nested-secret"}');
    const err = new Error("外层错误", { cause });
    const result = sanitizeError(err, false);
    expect(result.cause).toBeDefined();
    const causeResult = result.cause as Record<string, unknown>;
    expect(causeResult.message).toContain("***REDACTED***");
    expect(causeResult.message).not.toContain("nested-secret");
  });

  it("error.cause 非 Error 时保留结构并脱敏内部敏感字符串", () => {
    const err = new Error("外层错误", {
      cause: { code: 503, headers: { Authorization: "Bearer sk-secret" } },
    });
    const result = sanitizeError(err, false);
    expect(result.cause).toEqual({
      code: 503,
      headers: { Authorization: "Bearer ***REDACTED***" },
    });
  });

  it("非 Error cause 含 password/token 时同样脱敏", () => {
    const err = new Error("外层错误", {
      cause: { body: '{"password":"p@ss","token":"t-1"}' },
    });
    const result = sanitizeError(err, false);
    const causeResult = result.cause as Record<string, unknown>;
    expect(causeResult.body).toContain("***REDACTED***");
    expect(causeResult.body).not.toContain("p@ss");
    expect(causeResult.body).not.toContain("t-1");
  });

  it("非 Error cause 循环引用时截断而非无限递归", () => {
    const obj: Record<string, unknown> = { name: "self-ref" };
    obj.self = obj;
    const err = new Error("循环 cause", { cause: obj });
    expect(() => sanitizeError(err, false)).not.toThrow();
    const causeResult = sanitizeError(err, false).cause as Record<string, unknown>;
    expect(causeResult.self).toBe("[cause 循环或过深，已截断]");
  });

  it("cause 循环引用时截断而非无限递归", () => {
    const err = new Error("自引用错误");
    (err as { cause?: unknown }).cause = err;
    expect(() => sanitizeError(err, false)).not.toThrow();
    const result = sanitizeError(err, false);
    const causeResult = result.cause as Record<string, unknown>;
    expect(causeResult.message).toContain("截断");
  });

  it("深层 cause 链超限时截断", () => {
    let err = new Error("最底层");
    for (let i = 0; i < 15; i++) {
      err = new Error(`第 ${i} 层`, { cause: err });
    }
    const result = sanitizeError(err, false);
    // 深度达到上限后不再递归，直接返回截断标记
    let depth = 0;
    let current: unknown = result;
    while (current && typeof current === "object" && "cause" in current) {
      depth += 1;
      current = (current as Record<string, unknown>).cause;
    }
    expect(depth).toBeLessThanOrEqual(12);
  });

  it("无 cause 时不输出 cause 字段", () => {
    const result = sanitizeError(new Error("无原因错误"), false);
    expect("cause" in result).toBe(false);
  });

  it("isDev 为 false 时不输出 stack trace（生产路径）", () => {
    const err = new Error("系统错误");
    err.stack = "Error: 系统错误\n    at foo";
    const result = sanitizeError(err, false);
    expect("stack" in result).toBe(false);
  });

  it("isDev 为 true 时输出脱敏后的 stack trace", () => {
    const err = new Error("系统错误");
    err.stack = "Error: system\n    at foo (Bearer abc123)";
    const result = sanitizeError(err, true);
    expect(result.stack).toContain("at foo");
    expect(result.stack).not.toContain("abc123");
  });
});

describe("toClientError", () => {
  it("校验错误（issues 数组）归一化为参数校验失败文案", () => {
    const err = toClientError({ issues: [{ message: "标题不能为空", path: ["title"] }] }, true);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("参数校验失败：标题不能为空");
  });

  it("TanStack 序列化的 issues JSON 错误可识别", () => {
    const err = toClientError(new Error(JSON.stringify([{ message: "邮箱格式不正确" }])), true);
    expect((err as Error).message).toBe("参数校验失败：邮箱格式不正确");
  });

  it("业务错误（含中文文案）原样透传", () => {
    const biz = new Error("新闻不存在或已被删除");
    expect(toClientError(biz, true)).toBe(biz);
  });

  it("生产环境技术错误（英文）兜底为通用文案", () => {
    const err = toClientError(
      new Error('duplicate key value violates unique constraint "xxx"'),
      true,
    );
    expect((err as Error).message).toBe("服务器内部错误，请稍后重试");
  });

  it("开发环境技术错误保留原始错误", () => {
    const biz = new Error("some technical error");
    expect(toClientError(biz, false)).toBe(biz);
  });

  it("非 Error 抛出值（重定向对象）原样透传", () => {
    const redirect = { status: 302, location: "/login" };
    expect(toClientError(redirect, true)).toBe(redirect);
  });

  it("空 message 的 Error 在开发环境保留，生产环境兜底", () => {
    const empty = new Error("");
    expect(toClientError(empty, false)).toBe(empty);
    expect((toClientError(empty, true) as Error).message).toBe("服务器内部错误，请稍后重试");
  });
});

describe("getErrorMessage", () => {
  it("Error 实例返回其 message", () => {
    expect(getErrorMessage(new Error("保存失败"))).toBe("保存失败");
  });

  it("带 message 的对象返回其 message", () => {
    expect(getErrorMessage({ message: "对象错误" })).toBe("对象错误");
  });

  it("字符串直接返回", () => {
    expect(getErrorMessage("字符串错误")).toBe("字符串错误");
  });

  it("无法提取时返回兜底文案", () => {
    expect(getErrorMessage(null, "操作失败，请稍后重试")).toBe("操作失败，请稍后重试");
    expect(getErrorMessage(new Error(""), "兜底")).toBe("兜底");
    expect(getErrorMessage(undefined)).toBe("未知错误");
  });
});

describe("classifyError", () => {
  it("校验错误归类 validation", () => {
    expect(classifyError({ issues: [{ message: "标题不能为空" }] })).toBe("validation");
  });

  it("含中文文案归类 business", () => {
    expect(classifyError(new Error("库存不足"))).toBe("business");
  });

  it("技术错误（英文/未知）归类 internal", () => {
    expect(classifyError(new Error("duplicate key"))).toBe("internal");
    expect(classifyError(undefined)).toBe("internal");
  });
});

describe("getDisplayErrorMessage", () => {
  it("业务文案剥离元信息后返回", () => {
    const error = new Error(appendSfnErrorMeta("库存不足", { requestId: "req-1" }));
    expect(getDisplayErrorMessage(error)).toBe("库存不足");
  });

  it("校验错误返回 issue 文案", () => {
    expect(getDisplayErrorMessage({ issues: [{ message: "标题不能为空" }] })).toBe("标题不能为空");
  });

  it("技术错误（英文 / 未知）返回 null，不透出内部细节", () => {
    expect(getDisplayErrorMessage(new Error("duplicate key"))).toBeNull();
    expect(getDisplayErrorMessage(undefined)).toBeNull();
  });

  it("服务端标记为系统错误（kind=internal）时即使文案含中文也返回 null", () => {
    const error = new Error(
      appendSfnErrorMeta("服务器内部错误，请稍后重试", {
        kind: "internal",
        requestId: "req-9",
      }),
    );
    expect(getDisplayErrorMessage(error)).toBeNull();
  });
});

describe("appendSfnErrorMeta / parseSfnErrorMeta / stripSfnErrorMeta", () => {
  it("追加请求号与方法名后可解析还原", () => {
    const message = appendSfnErrorMeta("服务器内部错误，请稍后重试", {
      requestId: "req-1",
      sfnName: "getFooSFn",
    });
    expect(message).toBe("服务器内部错误，请稍后重试（请求号：req-1；SFn：getFooSFn）");
    expect(parseSfnErrorMeta(message)).toEqual({
      message: "服务器内部错误，请稍后重试",
      requestId: "req-1",
      sfnName: "getFooSFn",
    });
    expect(stripSfnErrorMeta(message)).toBe("服务器内部错误，请稍后重试");
  });

  it("仅方法名时正常解析", () => {
    const message = appendSfnErrorMeta("库存不足", {
      sfnName: "createOrderSFn",
    });
    expect(message).toBe("库存不足（SFn：createOrderSFn）");
    expect(parseSfnErrorMeta(message)).toEqual({
      message: "库存不足",
      sfnName: "createOrderSFn",
    });
  });

  it("携带类型时解析回分类", () => {
    const message = appendSfnErrorMeta("服务器内部错误，请稍后重试", {
      kind: "internal",
      requestId: "req-1",
      sfnName: "getFooSFn",
    });
    expect(message).toBe("服务器内部错误，请稍后重试（类型：系统；请求号：req-1；SFn：getFooSFn）");
    expect(parseSfnErrorMeta(message)).toEqual({
      message: "服务器内部错误，请稍后重试",
      kind: "internal",
      requestId: "req-1",
      sfnName: "getFooSFn",
    });
  });

  it("无字段时原样返回", () => {
    expect(appendSfnErrorMeta("库存不足", {})).toBe("库存不足");
  });

  it("业务文案自带的括号不被误解析", () => {
    const raw = "库存不足（当前 3 件）";
    expect(parseSfnErrorMeta(raw)).toEqual({ message: raw });
    expect(stripSfnErrorMeta(raw)).toBe(raw);
  });
});
