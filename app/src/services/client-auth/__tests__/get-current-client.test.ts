/**
 * getCurrentClient 逻辑测试：JWT 解析 + 客户端用户查询
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

// 通过 vi.hoisted 持有 mock 对象引用，避免在测试中直接 import 缓存实例
const { mockCacheMethods } = vi.hoisted(() => {
  const cacheStore = new Map();
  return {
    mockCacheMethods: {
      get: vi.fn((key: string) => cacheStore.get(key)),
      set: vi.fn((key: string, value: unknown) => cacheStore.set(key, value)),
      clear: vi.fn(() => cacheStore.clear()),
    },
  };
});
vi.mock("#/services/client-auth/client-user.cache", () => ({
  clientUserCache: mockCacheMethods,
}));

import { getCurrentClient } from "#/services/client-auth/client-auth.server";

describe("getCurrentClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheMethods.clear();
  });

  it("查询客户端用户时 where 条件同时包含 id 等值与未删除约束（防止 && 吞条件）", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "c-1",
      username: "client",
      userType: "client",
    });
    mockRows.mockResolvedValue([
      {
        id: "c-1",
        username: "client",
        email: "c@t.com",
        avatar: null,
        clientRoleIds: ["role-1"],
        status: "active",
        deletedAt: null,
      },
    ]);

    await getCurrentClient("valid-token");

    // where 应为 and(eq(id), isNull(deletedAt)) 的组合，两个条件都必须存在
    expect(mockSelectChain.where).toHaveBeenCalled();
    const sql = extractSqlText(mockSelectChain.where.mock.calls[0][0] as unknown);
    expect(sql).toContain("id");
    expect(sql).toContain("is null");
  });

  it("token 为 undefined 返回 null", async () => {
    const result = await getCurrentClient(undefined);
    expect(result).toBeNull();
  });

  it("无效 token 返回 null", async () => {
    mockVerifyToken.mockResolvedValue(null);
    const result = await getCurrentClient("invalid-token");
    expect(result).toBeNull();
  });

  it("admin 类型 token 返回 null", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      userType: "admin",
    });
    const result = await getCurrentClient("admin-token");
    expect(result).toBeNull();
  });

  it("有效 client token 返回客户端用户信息", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "c-1",
      username: "client",
      userType: "client",
    });
    mockRows.mockResolvedValue([
      {
        id: "c-1",
        username: "client",
        email: "c@t.com",
        avatar: null,
        status: "active",
        deletedAt: null,
      },
    ]);

    const result = await getCurrentClient("valid-token");
    expect(result).toMatchObject({
      id: "c-1",
      username: "client",
      email: "c@t.com",
      isRoot: false,
      userType: "client",
    });
  });

  it("client 用户被禁用返回 null", async () => {
    mockVerifyToken.mockResolvedValue({
      userId: "c-1",
      username: "client",
      userType: "client",
    });
    mockRows.mockResolvedValue([
      {
        id: "c-1",
        username: "client",
        email: "c@t.com",
        status: "disabled",
        deletedAt: null,
      },
    ]);

    const result = await getCurrentClient("valid-token");
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
