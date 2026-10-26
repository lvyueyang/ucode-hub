/**
 * 客户端用户管理测试：CRUD 操作
 */

import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("mocked_hash"),
  },
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
      $count: vi.fn(),
      select: vi.fn((..._args: unknown[]) => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn() })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      })),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import {
  createClientUser,
  deleteClientUser,
  getClientUser,
  getClientUserList,
  resetClientPassword,
  updateClientUser,
} from "#/services/client-user/client-user.server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getClientUserList", () => {
  const userRows = [
    {
      id: "u1",
      username: "user1",
      email: "user1@test.com",
      clientRoleIds: ["cr-1"],
      status: "active",
      emailVerified: false,
      createdAt: new Date("2024-01-01"),
    },
    {
      id: "u2",
      username: "user2",
      email: "user2@test.com",
      clientRoleIds: [],
      status: "active",
      emailVerified: true,
      createdAt: new Date("2024-01-02"),
    },
  ];

  it("返回用户列表和总数", async () => {
    // 分页查询返回用户行，随后角色名称查询返回角色行
    mockRows
      .mockReset()
      .mockResolvedValueOnce(userRows)
      .mockResolvedValueOnce([{ id: "cr-1", name: "会员" }]);
    mockDb.$count.mockResolvedValue(2);

    const result = await getClientUserList({ page: 1, pageSize: 20 });

    expect(result.records).toEqual([
      { ...userRows[0], roleNames: ["会员"] },
      { ...userRows[1], roleNames: [] },
    ]);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("关键词搜索按 username 和 email 过滤", async () => {
    mockRows
      .mockReset()
      .mockResolvedValueOnce([userRows[0]])
      .mockResolvedValueOnce([{ id: "cr-1", name: "会员" }]);
    mockDb.$count.mockResolvedValue(1);

    const result = await getClientUserList({
      page: 1,
      pageSize: 20,
      keyword: "user1",
    });

    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("getClientUser", () => {
  it("找到用户时返回用户记录", async () => {
    const mockUser = {
      id: "u1",
      username: "testuser",
      email: "test@test.com",
    };
    mockRows.mockResolvedValue([mockUser]);

    const result = await getClientUser("u1");

    expect(result).toEqual(mockUser);
  });

  it("用户不存在时返回 undefined", async () => {
    mockRows.mockResolvedValue([]);

    const result = await getClientUser("不存在");

    expect(result).toBeUndefined();
  });

  it("详情投影不含 passwordHash", async () => {
    mockRows.mockResolvedValue([]);

    await getClientUser("u1");

    const projection = mockDb.select.mock.calls[0][0] as Record<string, unknown>;
    expect(projection).toBeDefined();
    expect(Object.keys(projection)).not.toContain("passwordHash");
  });
});

describe("createClientUser", () => {
  it("创建用户并返回用户记录", async () => {
    const mockRecord = {
      id: "u1",
      username: "newuser",
      email: "new@test.com",
      status: "active",
    };
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([mockRecord]),
      })),
    });

    const result = await createClientUser({
      username: "newuser",
      email: "new@test.com",
      password: "secret123",
    });

    expect(result).toEqual(mockRecord);
    expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 12);
  });

  it("插入记录时 status 默认为 active", async () => {
    const mockRecord = {
      id: "u1",
      username: "newuser",
      email: "new@test.com",
      status: "active",
    };
    const valuesSpy = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([mockRecord]),
    }));
    mockDb.insert.mockReturnValue({ values: valuesSpy });

    await createClientUser({
      username: "newuser",
      email: "new@test.com",
      password: "secret123",
    });

    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "newuser",
        email: "new@test.com",
        status: "active",
        passwordHash: "mocked_hash",
      }),
    );
  });

  it("返回投影不含 passwordHash", async () => {
    const returningSpy = vi.fn((..._args: unknown[]) => Promise.resolve([]));
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: returningSpy })),
    });

    await createClientUser({
      username: "newuser",
      email: "new@test.com",
      password: "secret123",
    });

    const projection = returningSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(projection).toBeDefined();
    expect(Object.keys(projection)).not.toContain("passwordHash");
  });
});

describe("updateClientUser", () => {
  it("部分更新用户名", async () => {
    const mockRecord = {
      id: "u1",
      username: "updated_name",
      email: "test@test.com",
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await updateClientUser("u1", { username: "updated_name" });

    expect(result).toEqual(mockRecord);
  });

  it("部分更新邮箱和状态", async () => {
    const mockRecord = {
      id: "u1",
      username: "test",
      email: "updated@test.com",
      status: "disabled",
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await updateClientUser("u1", {
      email: "updated@test.com",
      status: "disabled",
    });

    expect(result).toEqual(mockRecord);
  });

  it("更新邮箱验证状态", async () => {
    const mockRecord = {
      id: "u1",
      username: "test",
      email: "test@test.com",
      emailVerified: true,
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await updateClientUser("u1", { emailVerified: true });

    expect(result).toEqual(mockRecord);
  });

  it("更新角色为无效角色时抛出错误", async () => {
    mockRows.mockResolvedValue([{ id: "cr-1", name: "会员" }]);

    await expect(updateClientUser("u1", { clientRoleIds: ["cr-ghost"] })).rejects.toThrow(
      "存在无效或已删除的角色",
    );
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("返回投影不含 passwordHash", async () => {
    const returningSpy = vi.fn((..._args: unknown[]) => Promise.resolve([]));
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: returningSpy })),
      })),
    });

    await updateClientUser("u1", { username: "renamed" });

    const projection = returningSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(projection).toBeDefined();
    expect(Object.keys(projection)).not.toContain("passwordHash");
  });
});

describe("deleteClientUser", () => {
  it("用户不存在时返回 false", async () => {
    mockRows.mockResolvedValue([]);

    const result = await deleteClientUser("不存在");

    expect(result).toBe(false);
  });

  it("软删除成功返回 true", async () => {
    mockRows.mockResolvedValue([
      {
        id: "u1",
        username: "deleteme",
      },
    ]);

    const result = await deleteClientUser("u1");

    expect(result).toBe(true);
  });
});

describe("resetClientPassword", () => {
  it("重置密码成功返回 true", async () => {
    const mockRecord = {
      id: "u1",
      username: "testuser",
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await resetClientPassword("u1", "newpass123");

    expect(result).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("newpass123", 12);
  });

  it("用户不存在时返回 false", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });
    // update.returning 默认返回空数组，表示用户不存在或已删除
    const result = await resetClientPassword("不存在", "newpass123");

    expect(result).toBe(false);
    expect(bcrypt.hash).toHaveBeenCalledWith("newpass123", 12);
  });
});
