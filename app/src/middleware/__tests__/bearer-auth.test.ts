/**
 * Bearer 令牌鉴权测试：令牌解析、用户定位、守卫的中断与上下文注入
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyToken, mockGetAdminUserForAuth, mockGetClientUserForAuth } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockGetAdminUserForAuth: vi.fn(),
  mockGetClientUserForAuth: vi.fn(),
}));

vi.mock("#/shared-services/jwt", () => ({
  jwt: { verifyToken: mockVerifyToken },
}));

vi.mock("#/services/admin-auth/admin-auth.server", () => ({
  getAdminUserForAuth: mockGetAdminUserForAuth,
}));

vi.mock("#/services/client-auth/client-auth.server", () => ({
  getClientUserForAuth: mockGetClientUserForAuth,
}));

vi.mock("#/shared-services/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  type BearerAuthContext,
  BearerAuthError,
  bearerAuthRouteGuard,
  parseBearerToken,
  resolveBearerUser,
} from "#/middleware/bearer-auth";
import { getRequestOperator } from "#/shared-services/request-context";
import type { UserRef } from "#/types/user";

const ADMIN_USER = {
  success: true,
  id: "admin-1",
  username: "alice",
  email: "alice@example.com",
  isRoot: false,
  rolePermissions: [],
};

const CLIENT_USER = {
  success: true,
  id: "client-1",
  username: "bob",
  email: "bob@example.com",
  rolePermissions: [],
};

/** 构造带 Authorization 头的请求 */
const requestWith = (authorization?: string): Request =>
  new Request("http://localhost/api/v1/devices/list", {
    headers: authorization ? { authorization } : {},
  });

describe("parseBearerToken", () => {
  it("无头返回 null", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
  });

  it("头格式不对返回 null", () => {
    expect(parseBearerToken("token-without-scheme")).toBeNull();
    expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer  ")).toBeNull();
    expect(parseBearerToken("Bearer a b")).toBeNull();
  });

  it("取出 Bearer 令牌，方案大小写与首尾空白不影响", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearerToken("  Bearer   abc.def.ghi  ")).toBe("abc.def.ghi");
  });
});

describe("BearerAuthError", () => {
  it("默认 401 与固定文案", () => {
    const err = new BearerAuthError("未认证或凭证无效");
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("BearerAuthError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("resolveBearerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无 Authorization 头返回 null，且不校验令牌", async () => {
    expect(await resolveBearerUser(requestWith())).toBeNull();
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it("头格式不对返回 null", async () => {
    expect(await resolveBearerUser(requestWith("Token abc"))).toBeNull();
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it("签名校验失败返回 null", async () => {
    mockVerifyToken.mockResolvedValue(null);
    expect(await resolveBearerUser(requestWith("Bearer bad.token"))).toBeNull();
    expect(mockGetAdminUserForAuth).not.toHaveBeenCalled();
  });

  it("令牌载荷取管理端用户", async () => {
    mockVerifyToken.mockResolvedValue({ userId: "admin-1", username: "alice", userType: "admin" });
    mockGetAdminUserForAuth.mockResolvedValue(ADMIN_USER);

    const user: UserRef | null = await resolveBearerUser(requestWith("Bearer good.token"));
    expect(user).toEqual({ type: "admin", id: "admin-1" });
    expect(mockGetAdminUserForAuth).toHaveBeenCalledWith("admin-1");
    expect(mockGetClientUserForAuth).not.toHaveBeenCalled();
  });

  it("令牌载荷取客户端用户", async () => {
    mockVerifyToken.mockResolvedValue({ userId: "client-1", username: "bob", userType: "client" });
    mockGetClientUserForAuth.mockResolvedValue(CLIENT_USER);

    expect(await resolveBearerUser(requestWith("Bearer good.token"))).toEqual({
      type: "client",
      id: "client-1",
    });
    expect(mockGetClientUserForAuth).toHaveBeenCalledWith("client-1");
  });

  it("用户不存在或被禁用返回 null", async () => {
    mockVerifyToken.mockResolvedValue({ userId: "gone", username: "gone", userType: "admin" });
    mockGetAdminUserForAuth.mockResolvedValue({ success: false, reason: "not_found" });
    expect(await resolveBearerUser(requestWith("Bearer good.token"))).toBeNull();

    mockGetAdminUserForAuth.mockResolvedValue({ success: false, reason: "disabled" });
    expect(await resolveBearerUser(requestWith("Bearer good.token"))).toBeNull();
  });

  it("查库异常原样抛出，不吞成未认证", async () => {
    mockVerifyToken.mockResolvedValue({ userId: "admin-1", username: "alice", userType: "admin" });
    mockGetAdminUserForAuth.mockRejectedValue(new Error("连接池耗尽"));
    await expect(resolveBearerUser(requestWith("Bearer good.token"))).rejects.toThrow("连接池耗尽");
  });
});

/** 中间件对象在测试里直接当函数调：入参含 request 与 next，返回 Response 或 next 的结果 */
type GuardFn = (options: {
  request: Request;
  pathname: string;
  context: unknown;
  handlerType: "router";
  next: (options?: { context?: unknown }) => unknown;
}) => unknown;

const guard = bearerAuthRouteGuard as unknown as { options: { server: GuardFn } };

describe("bearerAuthRouteGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无令牌时回 401 JSON，不进入后续链路", async () => {
    const next = vi.fn();
    const response = await guard.options.server({
      request: requestWith(),
      pathname: "/api/v1/devices/list",
      context: {},
      handlerType: "router",
      next,
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(await (response as Response).json()).toEqual({ error: "未认证或凭证无效" });
    expect(next).not.toHaveBeenCalled();
  });

  it("令牌无效时回 401 JSON", async () => {
    mockVerifyToken.mockResolvedValue(null);
    const response = await guard.options.server({
      request: requestWith("Bearer bad.token"),
      pathname: "/api/v1/devices/list",
      context: {},
      handlerType: "router",
      next: vi.fn(),
    });

    expect((response as Response).status).toBe(401);
    expect(await (response as Response).json()).toEqual({ error: "未认证或凭证无效" });
  });

  it("令牌有效时注入用户上下文与操作者身份后继续", async () => {
    mockVerifyToken.mockResolvedValue({ userId: "client-1", username: "bob", userType: "client" });
    mockGetClientUserForAuth.mockResolvedValue(CLIENT_USER);

    let injected: BearerAuthContext | undefined;
    let operator = getRequestOperator();
    const response = await guard.options.server({
      request: requestWith("Bearer good.token"),
      pathname: "/api/v1/devices/list",
      context: {},
      handlerType: "router",
      next: (options) => {
        injected = options?.context as BearerAuthContext;
        operator = getRequestOperator();
        return new Response("ok");
      },
    });

    expect(injected).toEqual({
      user: { type: "client", id: "client-1" },
      username: "bob",
      email: "bob@example.com",
    });
    expect(operator).toEqual({
      id: "client-1",
      username: "bob",
      email: "bob@example.com",
      type: "client",
    });
    expect((response as Response).status).toBe(200);
  });

  it("查库异常不当作鉴权失败，继续向上抛", async () => {
    mockVerifyToken.mockResolvedValue({ userId: "admin-1", username: "alice", userType: "admin" });
    mockGetAdminUserForAuth.mockRejectedValue(new Error("连接池耗尽"));

    await expect(
      guard.options.server({
        request: requestWith("Bearer good.token"),
        pathname: "/api/v1/devices/list",
        context: {},
        handlerType: "router",
        next: vi.fn(),
      }),
    ).rejects.toThrow("连接池耗尽");
  });
});
