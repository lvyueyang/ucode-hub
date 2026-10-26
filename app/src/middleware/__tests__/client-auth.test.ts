/**
 * 客户端鉴权中间件测试：ClientAuthError 状态码 + resolveClientAuthContext 守卫拒绝路径
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyToken, mockGetClientUserForAuth } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockGetClientUserForAuth: vi.fn(),
}));

vi.mock("#/shared-services/jwt", () => ({
  jwt: { verifyToken: mockVerifyToken },
}));

vi.mock("#/services/client-auth/client-auth.server", () => ({
  getClientUserForAuth: mockGetClientUserForAuth,
}));

import { ClientAuthError } from "#/middleware/client-auth";
import { resolveClientAuthContext } from "#/middleware/client-auth.server";
import { type ClientPermissionDef, hasClientPermission } from "#/permissions/client-permissions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClientAuthError", () => {
  it("携带 statusCode 与 name", () => {
    const err = new ClientAuthError("请先登录", 401);
    expect(err.message).toBe("请先登录");
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("ClientAuthError");
    expect(err).toBeInstanceOf(Error);
  });

  it("403 用于权限不足", () => {
    expect(new ClientAuthError("权限不足", 403).statusCode).toBe(403);
  });
});

describe("resolveClientAuthContext", () => {
  it("无 token 时抛 401，不查询用户", async () => {
    await expect(resolveClientAuthContext(undefined)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(mockGetClientUserForAuth).not.toHaveBeenCalled();
  });

  it("token 无效（校验失败）时抛 401", async () => {
    mockVerifyToken.mockResolvedValue(null);
    await expect(resolveClientAuthContext("bad-token")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("管理员 token 冒用客户端身份时抛 401", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
    });
    await expect(resolveClientAuthContext("admin-token")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockGetClientUserForAuth).not.toHaveBeenCalled();
  });

  it("用户不存在时抛 401", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "ghost",
      username: "ghost",
      userType: "client",
    });
    mockGetClientUserForAuth.mockResolvedValue({
      success: false,
      reason: "not_found",
    });
    await expect(resolveClientAuthContext("ghost")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("账号被禁用时抛 403", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "disabled-1",
      username: "disabled",
      userType: "client",
    });
    mockGetClientUserForAuth.mockResolvedValue({
      success: false,
      reason: "disabled",
    });
    await expect(resolveClientAuthContext("disabled")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("有效 token 返回用户上下文与角色权限", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "client-1",
      username: "user",
      userType: "client",
    });
    mockGetClientUserForAuth.mockResolvedValue({
      success: true,
      id: "client-1",
      username: "user",
      email: "user@example.com",
      rolePermissions: ["demo:view"],
    });

    await expect(resolveClientAuthContext("valid")).resolves.toEqual({
      userId: "client-1",
      username: "user",
      email: "user@example.com",
      rolePermissions: ["demo:view"],
    });
  });
});

describe("hasClientPermission", () => {
  // 权限集为空期间只能手工构造夹具，故显式断言到 ClientPermissionDef 保持可编译；
  // CLIENT_PERMISSIONS 填入权限码后该类型会收窄为字面量联合，届时应从真实定义派生该夹具
  const required = {
    code: "demo:view",
    name: "",
    desc: "",
    group: "demo",
  } as ClientPermissionDef;

  it("角色权限命中时返回 true", () => {
    expect(hasClientPermission(["demo:*"], required)).toBe(true);
  });

  it("角色权限不命中时返回 false", () => {
    expect(hasClientPermission(["news:view"], required)).toBe(false);
  });

  it("空权限集合返回 false", () => {
    expect(hasClientPermission([], required)).toBe(false);
  });
});
