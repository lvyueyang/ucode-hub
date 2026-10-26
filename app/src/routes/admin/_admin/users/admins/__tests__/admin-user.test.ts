/**
 * 管理员用户管理测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockBcryptHash, mockDb, mockRows } = vi.hoisted(() => {
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
    mockBcryptHash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
    mockRows: rows,
    mockDb: {
      $count: vi.fn(),
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn() })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});

vi.mock("bcryptjs", () => ({
  default: { hash: mockBcryptHash },
}));

vi.mock("#/db", () => ({ db: mockDb }));

import {
  createAdminUser,
  deleteAdminUser,
  getAdminUser,
  getAdminUserList,
  resetAdminPassword,
  updateAdminUser,
} from "#/services/admin-user/admin-user.server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminUserList", () => {
  it("返回分页列表及总数", async () => {
    const mockUsers = [
      {
        id: "1",
        username: "admin",
        email: "admin@test.com",
        adminRoleIds: ["role-1"],
      },
      {
        id: "2",
        username: "editor",
        email: "editor@test.com",
        adminRoleIds: ["role-1"],
      },
    ];
    mockRows
      .mockReset()
      .mockResolvedValueOnce(mockUsers)
      .mockResolvedValueOnce([{ id: "role-1", name: "编辑者" }]);
    mockDb.$count.mockResolvedValue(5);

    const result = await getAdminUserList();

    expect(result.records).toEqual([
      { ...mockUsers[0], roleNames: ["编辑者"] },
      { ...mockUsers[1], roleNames: ["编辑者"] },
    ]);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("分页参数正确传递", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    mockDb.$count.mockResolvedValue(0);

    const result = await getAdminUserList({ page: 3, pageSize: 10 });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
  });

  it("支持关键词搜索", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    mockDb.$count.mockResolvedValue(0);

    const result = await getAdminUserList({
      page: 1,
      pageSize: 20,
      keyword: "admin",
    });

    expect(result.records).toEqual([]);
    expect(mockDb.select).toHaveBeenCalled();
  });
});

describe("getAdminUser", () => {
  it("找到用户时返回用户记录", async () => {
    const mockUser = { id: "1", username: "admin", email: "admin@test.com" };
    mockRows.mockResolvedValue([mockUser]);

    const result = await getAdminUser("1");

    expect(result).toEqual(mockUser);
  });

  it("用户不存在时返回 undefined", async () => {
    mockRows.mockResolvedValue([]);

    const result = await getAdminUser("notfound");

    expect(result).toBeUndefined();
  });
});

describe("createAdminUser", () => {
  it("散列密码并插入数据库", async () => {
    const input = {
      username: "newadmin",
      email: "new@test.com",
      password: "plainpassword",
      adminRoleIds: ["role-1"],
    };
    const createdUser = {
      id: "2",
      username: "newadmin",
      email: "new@test.com",
    };
    mockRows.mockResolvedValue([{ id: "role-1", name: "管理员" }]);
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([createdUser]),
      })),
    });

    const result = await createAdminUser(input);

    expect(result).toEqual(createdUser);
    expect(mockBcryptHash).toHaveBeenCalledWith("plainpassword", 12);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("角色不存在时抛出错误", async () => {
    const input = {
      username: "newadmin",
      email: "new@test.com",
      password: "plainpassword",
      adminRoleIds: ["role-1", "role-ghost"],
    };
    mockRows.mockResolvedValue([{ id: "role-1", name: "管理员" }]);

    await expect(createAdminUser(input)).rejects.toThrow("存在无效或已删除的角色");
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("updateAdminUser", () => {
  it("部分更新管理员信息", async () => {
    const updatedUser = {
      id: "1",
      username: "updated",
      email: "updated@test.com",
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([updatedUser]),
        })),
      })),
    });

    const result = await updateAdminUser("1", { username: "updated" });

    expect(result).toEqual(updatedUser);
  });

  it("未找到用户时返回 undefined", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const result = await updateAdminUser("notfound", { username: "x" });

    expect(result).toBeUndefined();
  });

  it("更新角色为无效角色时抛出错误", async () => {
    mockRows.mockResolvedValue([{ id: "role-1", name: "管理员" }]);

    await expect(updateAdminUser("1", { adminRoleIds: ["role-ghost"] })).rejects.toThrow(
      "存在无效或已删除的角色",
    );
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("deleteAdminUser", () => {
  it("用户不存在时返回 false", async () => {
    mockRows.mockResolvedValue([]);

    const result = await deleteAdminUser("notfound", "current-1");

    expect(result).toBe(false);
  });

  it("root 管理员不可删除抛出错误", async () => {
    mockRows.mockResolvedValue([
      {
        id: "root-1",
        isRoot: true,
      },
    ]);

    await expect(deleteAdminUser("root-1", "current-1")).rejects.toThrow("不允许删除 root 管理员");
  });

  it("不可删除自己抛出错误", async () => {
    mockRows.mockResolvedValue([
      {
        id: "same-1",
        isRoot: false,
      },
    ]);

    await expect(deleteAdminUser("same-1", "same-1")).rejects.toThrow("不允许删除自己的账号");
  });

  it("成功软删除返回 true", async () => {
    mockRows.mockResolvedValue([
      {
        id: "user-2",
        isRoot: false,
        username: "testuser",
      },
    ]);

    const result = await deleteAdminUser("user-2", "current-1");

    expect(result).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("resetAdminPassword", () => {
  it("成功重置密码返回 true", async () => {
    const mockRecord = { id: "1", username: "admin" };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await resetAdminPassword("1", "newpassword");

    expect(result).toBe(true);
    expect(mockBcryptHash).toHaveBeenCalledWith("newpassword", 12);
  });

  it("用户不存在时返回 false", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const result = await resetAdminPassword("notfound", "newpassword");

    expect(result).toBe(false);
  });
});
