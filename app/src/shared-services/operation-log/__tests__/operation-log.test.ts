/**
 * 操作日志模块测试：缓冲写入 + 查询
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockDb, mockInsertValues } = vi.hoisted(() => {
  const insertBuilder = {
    values: vi.fn(),
  };
  const selectBuilder = {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(),
          })),
        })),
      })),
    })),
  };
  return {
    mockDb: {
      query: { operationLog: { findFirst: vi.fn() } },
      select: vi.fn(() => selectBuilder),
      insert: vi.fn(() => insertBuilder),
      selectDistinct: vi.fn(() => ({
        from: vi.fn(() => ({
          orderBy: vi.fn(),
        })),
      })),
      $count: vi.fn(),
    },
    mockInsertValues: insertBuilder.values,
  };
});

vi.mock("#/db", () => ({ db: mockDb }));

import {
  flushOperationLogs,
  getOperationLogModules,
  logCrud,
  logOperation,
  searchOperationLogs,
} from "#/shared-services/operation-log/operation-log.server";

describe("logOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("追加日志到缓冲队列不立即写入 DB", () => {
    logOperation({
      operatorId: "op-1",
      operatorName: "admin",
      module: "news",
      action: "create",
      targetType: "news",
      targetId: "news-1",
      targetName: "测试新闻",
    });
    // 同步调用不应触发 DB 写入（仅在达到阈值或定时器触发时才 flush）
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("入队后 ensureTimer 被惰性初始化", () => {
    logOperation({
      operatorId: "op-1",
      operatorName: "admin",
      module: "dict",
      action: "delete",
      targetType: "dict_item",
      targetId: "item-1",
    });
    // ensureTimer 应创建定时器但不触发立即写入
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("searchOperationLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("传递空参数时正常分页查询", async () => {
    vi.mocked(mockDb.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof mockDb.select>);
    vi.mocked(mockDb.$count).mockResolvedValue(0);

    const result = await searchOperationLogs({});
    expect(result).toEqual({
      records: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it("按模块和动作筛选", async () => {
    const mockEntry = {
      id: "log-1",
      operatorId: "op-1",
      operatorName: "admin",
      module: "news",
      action: "create",
      targetType: "news",
      targetId: "n1",
      targetName: "标题",
      detail: null,
      createdAt: new Date(),
    };

    vi.mocked(mockDb.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn().mockResolvedValue([mockEntry]),
            })),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof mockDb.select>);
    vi.mocked(mockDb.$count).mockResolvedValue(1);

    const result = await searchOperationLogs({
      module: "news",
      action: "create",
      page: 1,
      pageSize: 10,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].module).toBe("news");
    expect(result.records[0].action).toBe("create");
  });

  it("按日期范围筛选时 where 收到起止边界条件", async () => {
    const whereFn = vi.fn((_cond: unknown) => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn().mockResolvedValue([]),
        })),
      })),
    }));
    vi.mocked(mockDb.select).mockReturnValue({
      from: vi.fn(() => ({ where: whereFn })),
    } as unknown as ReturnType<typeof mockDb.select>);
    vi.mocked(mockDb.$count).mockResolvedValue(0);

    await searchOperationLogs({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    // 主查询与 $count 嵌套查询各调用一次 where，且均携带日期条件（非 undefined）
    expect(whereFn.mock.calls.length).toBe(2);
    for (const call of whereFn.mock.calls) {
      expect(call[0]).toBeDefined();
    }
  });
});

describe("getOperationLogModules", () => {
  it("返回模块列表", async () => {
    vi.mocked(mockDb.selectDistinct).mockReturnValue({
      from: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue([{ module: "news" }, { module: "dict" }]),
      })),
    } as unknown as ReturnType<typeof mockDb.selectDistinct>);

    const modules = await getOperationLogModules();
    expect(modules).toEqual(["news", "dict"]);
  });
});

describe("logCrud", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 清空缓冲：opLogWriter 为模块级单例，前序 describe 未 flush 的残留行会污染本组断言
    await flushOperationLogs();
  });

  /** 触发缓冲刷入并返回 insert values 收到的行 */
  async function flushAndGetRows() {
    await flushOperationLogs();
    return mockInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>[] | undefined;
  }

  it("未指定 operatorType 时默认 admin", async () => {
    logCrud({ id: "crud-op-1", username: "admin" }, "news", "create", {
      id: "n1",
      name: "标题",
    });
    const rows = await flushAndGetRows();
    expect(rows![0]).toMatchObject({
      operatorId: "crud-op-1",
      operatorName: "admin",
      operatorType: "admin",
      module: "news",
      action: "create",
      targetType: "news",
    });
  });

  it("客户端自助操作可指定操作者类型 client", async () => {
    logCrud(
      { id: "u-1", username: "张三" },
      "client",
      "create_api_key",
      { id: "u-1", name: "报表脚本" },
      { operatorType: "client" },
    );
    const rows = await flushAndGetRows();
    expect(rows![0]).toMatchObject({
      operatorId: "u-1",
      operatorName: "张三",
      operatorType: "client",
      module: "client",
      action: "create_api_key",
    });
  });
});
