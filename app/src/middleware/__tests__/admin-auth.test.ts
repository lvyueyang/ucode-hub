/**
 * 管理端鉴权中间件测试：AdminAuthError + resolveAdminAuthContext 鉴权逻辑
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyToken, mockGetAdminUserForAuth } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockGetAdminUserForAuth: vi.fn(),
}));

vi.mock("#/shared-services/jwt", () => ({
  jwt: { verifyToken: mockVerifyToken },
}));

vi.mock("#/services/admin-auth/admin-auth.server", () => ({
  getAdminUserForAuth: mockGetAdminUserForAuth,
}));

import { type AdminAuthContext, AdminAuthError } from "#/middleware/admin-auth";
import { resolveAdminAuthContext } from "#/middleware/admin-auth.server";

describe("AdminAuthError", () => {
  it("包含 statusCode 属性", () => {
    const err401 = new AdminAuthError("未登录", 401);
    expect(err401.message).toBe("未登录");
    expect(err401.statusCode).toBe(401);
    expect(err401.name).toBe("AdminAuthError");
    expect(err401).toBeInstanceOf(Error);
  });

  it("403 状态码", () => {
    const err403 = new AdminAuthError("权限不足", 403);
    expect(err403.statusCode).toBe(403);
  });
});

describe("AdminAuthContext 类型", () => {
  it("user 包含必要字段，包括 isRoot", () => {
    const ctx: AdminAuthContext = {
      user: {
        id: "user-1",
        username: "admin",
        email: "admin@test.com",
        userType: "admin",
        isRoot: false,
      },
      rolePermissions: ["news:*", "admin:view"],
    };
    expect(ctx.user.id).toBe("user-1");
    expect(ctx.user.isRoot).toBe(false);
    expect(ctx.rolePermissions).toHaveLength(2);
  });

  it("isRoot 为 true 的 root 用户", () => {
    const ctx: AdminAuthContext = {
      user: {
        id: "root-1",
        username: "root",
        email: "root@test.com",
        userType: "admin",
        isRoot: true,
      },
      rolePermissions: ["**"],
    };
    expect(ctx.user.isRoot).toBe(true);
    expect(ctx.rolePermissions).toEqual(["**"]);
  });
});

describe("resolveAdminAuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("无 token 时抛 401", async () => {
    await expect(resolveAdminAuthContext(undefined)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it("token 无效时抛 401", async () => {
    mockVerifyToken.mockResolvedValue(null);
    await expect(resolveAdminAuthContext("invalid")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("非 admin 类型 token 抛 403", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "client-1",
      username: "client",
      userType: "client",
      v: 0,
    });
    await expect(resolveAdminAuthContext("client-token")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockGetAdminUserForAuth).not.toHaveBeenCalled();
  });

  it("有效 admin token 返回用户上下文与权限", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
      v: 0,
    });
    mockGetAdminUserForAuth.mockResolvedValue({
      success: true,
      id: "admin-1",
      username: "admin",
      email: "admin@test.com",
      isRoot: true,
      tokenVersion: 0,
      rolePermissions: ["**"],
    });

    const ctx = await resolveAdminAuthContext("valid-token");
    expect(ctx).toMatchObject({
      user: { id: "admin-1", isRoot: true, userType: "admin" },
      rolePermissions: ["**"],
    });
  });

  it("载荷令牌版本落后于当前版本时抛 401（会话已被撤销）", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
      v: 0,
    });
    // 改密 / 被重置 / 登出后库内版本已自增，旧令牌不得放行
    mockGetAdminUserForAuth.mockResolvedValue({
      success: true,
      id: "admin-1",
      username: "admin",
      email: "admin@test.com",
      isRoot: false,
      tokenVersion: 1,
      rolePermissions: [],
    });

    await expect(resolveAdminAuthContext("stale-token")).rejects.toMatchObject({
      statusCode: 401,
      message: "登录已失效，请重新登录",
    });
  });

  it("用户不存在时抛 401", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "ghost",
      username: "ghost",
      userType: "admin",
      v: 0,
    });
    mockGetAdminUserForAuth.mockResolvedValue({
      success: false,
      reason: "not_found",
    });
    await expect(resolveAdminAuthContext("ghost-token")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("用户被禁用时抛 403", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "disabled-1",
      username: "disabled",
      userType: "admin",
      v: 0,
    });
    mockGetAdminUserForAuth.mockResolvedValue({
      success: false,
      reason: "disabled",
    });
    await expect(resolveAdminAuthContext("disabled-token")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
