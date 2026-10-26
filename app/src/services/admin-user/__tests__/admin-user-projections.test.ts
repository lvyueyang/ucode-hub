/**
 * 管理端用户对外字段投影测试：列表 / 详情 / 新建 / 更新四条路径均不得带出内部列（passwordHash 等）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect, mockReturning, mockRows } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockReturning: vi.fn(),
  mockRows: { value: [] as unknown[] },
}));

vi.mock("#/db/index", () => {
  /** 构造可链式调用且可 await 的查询对象（from/where/orderBy/limit/offset 均返回自身） */
  const createChain = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      returning: (...args: unknown[]) => {
        mockReturning(...args);
        return Promise.resolve(mockRows.value);
      },
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(mockRows.value).then(resolve),
    };
    return chain;
  };

  return {
    db: {
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return createChain();
      },
      insert: () => ({ values: () => createChain() }),
      update: () => ({ set: () => createChain() }),
      $count: () => Promise.resolve(0),
    },
  };
});

import {
  createAdminUser,
  getAdminUser,
  getAdminUserList,
  updateAdminUser,
} from "#/services/admin-user/admin-user.server";

/** 断言投影对象（drizzle 列映射）不含内部列 */
function expectNoInternalColumns(projection: unknown) {
  expect(projection).toBeDefined();
  const keys = Object.keys(projection as Record<string, unknown>);
  expect(keys).not.toContain("passwordHash");
  expect(keys).not.toContain("deletedAt");
}

describe("管理端用户字段投影", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.value = [];
  });

  it("getAdminUserList 列表投影不含 passwordHash 与 deletedAt", async () => {
    await getAdminUserList({ page: 1, pageSize: 20 });

    expectNoInternalColumns(mockSelect.mock.calls[0][0]);
  });

  it("getAdminUser 详情投影不含 passwordHash 与 deletedAt", async () => {
    await getAdminUser("admin-1");

    expectNoInternalColumns(mockSelect.mock.calls[0][0]);
  });

  it("createAdminUser 新建返回不含 passwordHash", async () => {
    await createAdminUser({
      username: "newadmin",
      email: "new@test.com",
      password: "secret123",
      adminRoleIds: [],
    });

    expectNoInternalColumns(mockReturning.mock.calls[0][0]);
  });

  it("updateAdminUser 更新返回不含 passwordHash", async () => {
    await updateAdminUser("admin-1", { username: "renamed" });

    expectNoInternalColumns(mockReturning.mock.calls[0][0]);
  });
});
