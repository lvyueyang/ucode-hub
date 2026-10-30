/**
 * 管理员登录逻辑测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

const { mockSignToken } = vi.hoisted(() => ({
  mockSignToken: vi.fn(),
}));

vi.mock("#/shared-services/jwt", () => ({
  jwt: { signToken: mockSignToken },
}));

const { mockDb, mockRows } = vi.hoisted(() => {
  const rows = vi.fn().mockResolvedValue([]);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
  };
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: (value: unknown) => unknown) => rows().then(onFulfilled),
  });
  return {
    mockRows: rows,
    mockDb: {
      select: vi.fn(() => chain),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn() })),
        where: vi.fn(),
      })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});

vi.mock("#/db", () => ({ db: mockDb }));

import bcrypt from "bcryptjs";
import { adminLogin, getAdminUserForAuth } from "#/services/admin-auth/admin-auth.server";
import { adminUserCache } from "#/services/admin-auth/admin-user.cache";

describe("adminLogin", () => {
  const mockUser = {
    id: "admin-1",
    username: "admin",
    email: "admin@test.com",
    passwordHash: "hashed-pw",
    status: "active",
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正确凭据登录成功，返回 token 和用户信息", async () => {
    mockRows.mockResolvedValue([mockUser]);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    mockSignToken.mockResolvedValue("jwt-token-abc");

    const result = await adminLogin("admin", "correct-password");

    expect(result.success).toBe(true);
    expect(result.token).toBe("jwt-token-abc");
    expect(result.user).toEqual({
      id: "admin-1",
      username: "admin",
      email: "admin@test.com",
    });
  });

  it("用户不存在返回失败", async () => {
    mockRows.mockResolvedValue([]);

    const result = await adminLogin("nobody", "pw");
    expect(result.success).toBe(false);
    expect(result.message).toBe("用户名或密码错误");
  });

  it("密码错误返回失败", async () => {
    mockRows.mockResolvedValue([mockUser]);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const result = await adminLogin("admin", "wrong");
    expect(result.success).toBe(false);
    expect(result.message).toBe("用户名或密码错误");
  });

  it("用户被软删除返回失败", async () => {
    mockRows.mockResolvedValue([{ ...mockUser, deletedAt: new Date() }]);

    const result = await adminLogin("admin", "pw");
    expect(result.success).toBe(false);
  });

  it("用户被禁用返回失败", async () => {
    mockRows.mockResolvedValue([{ ...mockUser, status: "disabled" }]);

    const result = await adminLogin("admin", "pw");
    expect(result.success).toBe(false);
  });

  it("登录成功后更新 lastLoginAt", async () => {
    mockRows.mockResolvedValue([mockUser]);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    mockSignToken.mockResolvedValue("token");

    await adminLogin("admin", "pw");

    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("getAdminUserForAuth", () => {
  const cachedUser = {
    id: "admin-1",
    username: "admin",
    email: "admin@test.com",
    avatar: null,
    isRoot: false,
    adminRoleIds: ["role-1"],
    status: "active",
    tokenVersion: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adminUserCache.clear();
  });

  it("缓存命中且未启用时返回 disabled", async () => {
    adminUserCache.set("admin-1", { ...cachedUser, status: "disabled" });

    const result = await getAdminUserForAuth("admin-1");

    expect(result).toEqual({ success: false, reason: "disabled" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("缓存命中且是 root 用户时返回通配权限", async () => {
    adminUserCache.set("admin-1", { ...cachedUser, isRoot: true });

    const result = await getAdminUserForAuth("admin-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.isRoot).toBe(true);
      expect(result.rolePermissions).toEqual(["**"]);
    }
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("缓存命中且非 root 时合并角色权限并去重", async () => {
    // 缓存里的令牌版本即校验侧比对的值，透传出去才可能拦下被撤销的令牌
    adminUserCache.set("admin-1", { ...cachedUser, tokenVersion: 3 });
    mockRows.mockResolvedValue([
      { id: "role-1", permissions: ["news:view", "news:create"] },
      { id: "role-2", permissions: ["news:view", "dict:view"] },
    ]);

    const result = await getAdminUserForAuth("admin-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rolePermissions).toEqual(["news:view", "news:create", "dict:view"]);
      expect(result.tokenVersion).toBe(3);
    }
  });

  it("缓存命中且无角色时权限为空数组", async () => {
    adminUserCache.set("admin-1", { ...cachedUser, adminRoleIds: [] });

    const result = await getAdminUserForAuth("admin-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rolePermissions).toEqual([]);
    }
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("缓存未命中且用户不存在时返回 not_found", async () => {
    mockRows.mockReset().mockResolvedValue([]);

    const result = await getAdminUserForAuth("ghost");

    expect(result).toEqual({ success: false, reason: "not_found" });
  });

  it("缓存未命中且用户未启用时返回 disabled", async () => {
    mockRows.mockReset().mockResolvedValue([{ ...cachedUser, status: "disabled" }]);

    const result = await getAdminUserForAuth("admin-1");

    expect(result).toEqual({ success: false, reason: "disabled" });
  });

  it("缓存未命中且是 root 用户时返回通配权限并写入缓存", async () => {
    mockRows.mockReset().mockResolvedValue([{ ...cachedUser, isRoot: true }]);

    const result = await getAdminUserForAuth("admin-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rolePermissions).toEqual(["**"]);
    }
    expect(adminUserCache.has("admin-1")).toBe(true);
    // root 用户只查用户本身，不查询角色表
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("缓存未命中且非 root 时查询角色合并权限", async () => {
    // 先查用户（存在），再查角色权限
    mockRows
      .mockReset()
      .mockResolvedValueOnce([cachedUser])
      .mockResolvedValue([{ id: "role-1", permissions: ["news:view"] }]);

    const result = await getAdminUserForAuth("admin-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rolePermissions).toEqual(["news:view"]);
    }
  });
});
