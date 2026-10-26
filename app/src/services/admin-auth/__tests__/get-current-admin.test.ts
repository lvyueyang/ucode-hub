/**
 * getCurrentAdmin 逻辑测试：JWT 解析 + 管理员查询
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyToken } = vi.hoisted(() => ({ mockVerifyToken: vi.fn() }));
vi.mock("#/shared-services/jwt", () => ({
  jwt: { verifyToken: mockVerifyToken },
}));

const { mockDb, mockRows, mockSelectChain } = vi.hoisted(() => {
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
    mockSelectChain: chain,
    mockDb: {
      select: vi.fn(() => chain),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import { getCurrentAdmin } from "#/services/admin-auth/admin-auth.server";

describe("getCurrentAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("查询管理员时 where 条件同时包含 id 等值与未删除约束（防止 && 吞条件）", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
    });
    // 用户存在（非 root），随后查询角色
    mockRows
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: "admin-1",
          username: "admin",
          email: "admin@t.com",
          isRoot: false,
          adminRoleIds: ["role-1"],
          status: "active",
          deletedAt: null,
        },
      ])
      .mockResolvedValue([{ name: "编辑者" }]);

    await getCurrentAdmin("valid-token");

    // where 应为 and(eq(id), isNull(deletedAt)) 的组合，两个条件都必须存在
    expect(mockSelectChain.where).toHaveBeenCalled();
    const sql = extractSqlText(mockSelectChain.where.mock.calls[0][0] as unknown);
    expect(sql).toContain("id");
    expect(sql).toContain("is null");
  });

  it("token 为 undefined 返回 null", async () => {
    const result = await getCurrentAdmin(undefined);
    expect(result).toBeNull();
  });

  it("无效 token 返回 null", async () => {
    mockVerifyToken.mockResolvedValue(null);
    const result = await getCurrentAdmin("invalid-token");
    expect(result).toBeNull();
  });

  it("client 类型 token 返回 null", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "c-1",
      username: "client",
      userType: "client",
    });
    const result = await getCurrentAdmin("client-token");
    expect(result).toBeNull();
  });

  it("有效 admin token 返回管理员信息", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
    });
    // 用户存在（非 root），随后查询角色名称
    mockRows
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: "admin-1",
          username: "admin",
          email: "admin@t.com",
          isRoot: false,
          adminRoleIds: ["role-1"],
          status: "active",
          deletedAt: null,
        },
      ])
      .mockResolvedValue([{ name: "编辑者" }, { name: "审核者" }]);

    const result = await getCurrentAdmin("valid-token");
    expect(result).toMatchObject({
      id: "admin-1",
      username: "admin",
      email: "admin@t.com",
      userType: "admin",
      isRoot: false,
      roleNames: ["编辑者", "审核者"],
    });
  });

  it("admin 用户被软删除返回 null", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
    });
    mockRows.mockReset().mockResolvedValue([
      {
        id: "admin-1",
        username: "admin",
        email: "a@t.com",
        status: "active",
        deletedAt: new Date(),
      },
    ]);

    const result = await getCurrentAdmin("valid-token");
    expect(result).toBeNull();
  });
});

/** 递归提取 drizzle SQL 对象的 SQL 文本 */
function extractSqlText(value: unknown): string {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") {
      if (typeof node === "string") out.push(node);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      for (const chunk of obj.queryChunks) walk(chunk);
      return;
    }
    if (Array.isArray(obj.value)) {
      for (const v of obj.value) walk(v);
      return;
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(value);
  return out.join("").toLowerCase();
}
