/**
 * 角色管理测试：CRUD 操作
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
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
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import {
  createAdminRole,
  deleteAdminRole,
  getAdminRoleList,
  getAllAdminRoles,
  updateAdminRole,
} from "#/services/admin-role/admin-role.server";

describe("getAdminRoleList", () => {
  it("返回分页列表及总数", async () => {
    const mockRoles = [
      { id: "r-1", name: "管理员", slug: "admin", permissions: ["**"] },
      { id: "r-2", name: "编辑", slug: "editor", permissions: ["news:read"] },
    ];
    mockRows.mockResolvedValue(mockRoles);
    mockDb.$count.mockResolvedValue(2);

    const result = await getAdminRoleList();
    expect(result.records).toEqual(mockRoles);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("分页参数正确传递", async () => {
    mockRows.mockResolvedValue([]);
    mockDb.$count.mockResolvedValue(0);

    const result = await getAdminRoleList({ page: 3, pageSize: 10 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
  });

  it("支持关键词搜索", async () => {
    mockRows.mockResolvedValue([]);
    mockDb.$count.mockResolvedValue(0);

    const result = await getAdminRoleList({ keyword: "管理" });
    expect(result.records).toEqual([]);
    expect(mockDb.select).toHaveBeenCalled();
  });
});

describe("getAllAdminRoles", () => {
  it("返回全部角色（不分页）", async () => {
    const mockRoles = [{ id: "r-1", name: "管理员", slug: "admin", permissions: ["**"] }];
    mockRows.mockResolvedValue(mockRoles);

    const result = await getAllAdminRoles();
    expect(result).toEqual(mockRoles);
  });
});

describe("createAdminRole", () => {
  it("创建角色成功", async () => {
    const mockRecord = {
      id: "r-new",
      name: "新角色",
      slug: "new_role",
      permissions: ["news:read"],
      description: null,
    };
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([mockRecord]),
      })),
    });

    const result = await createAdminRole({
      name: "新角色",
      slug: "new_role",
      permissions: ["news:read"],
    });
    expect(result.id).toBe("r-new");
    expect(result.name).toBe("新角色");
    expect(result.slug).toBe("new_role");
  });
});

describe("updateAdminRole", () => {
  it("部分更新角色名称", async () => {
    const mockRecord = {
      id: "r-1",
      name: "超级管理员",
      slug: "admin",
      permissions: ["**"],
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await updateAdminRole("r-1", { name: "超级管理员" });
    expect(result?.name).toBe("超级管理员");
  });

  it("部分更新角色权限", async () => {
    const mockRecord = {
      id: "r-1",
      name: "管理员",
      slug: "admin",
      permissions: ["**", "news:write"],
    };
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([mockRecord]),
        })),
      })),
    });

    const result = await updateAdminRole("r-1", {
      permissions: ["**", "news:write"],
    });
    expect(result?.permissions).toEqual(["**", "news:write"]);
  });
});

describe("deleteAdminRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("角色不存在时返回 false", async () => {
    mockRows.mockResolvedValue([]);

    const result = await deleteAdminRole("不存在的ID");
    expect(result).toBe(false);
  });

  it("删除成功返回 true", async () => {
    mockRows.mockResolvedValue([
      {
        id: "r-1",
        name: "旧角色",
        slug: "old_role",
      },
    ]);

    const result = await deleteAdminRole("r-1");
    expect(result).toBe(true);
  });
});
