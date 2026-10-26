/**
 * 字典管理测试：CRUD + 缓存操作
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// 模板的 SEED_DICTS 默认为空，此处注入样本以覆盖播种逻辑（保留 PRESET_DICTS 真实值）
vi.mock("#/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/constants")>();
  return {
    ...actual,
    SEED_DICTS: [
      {
        slug: "seed_status",
        name: "播种状态",
        description: "播种用示例字典",
        items: [
          { label: "启用", value: "on", sortOrder: 0, color: "green" },
          { label: "停用", value: "off", sortOrder: 1 },
        ],
      },
    ],
  };
});

const { mockDictCache } = vi.hoisted(() => {
  const store = new Map<string, Record<string, string>>();
  return {
    mockDictCache: {
      get: vi.fn((k: string) => store.get(k)),
      set: vi.fn((k: string, v: Record<string, string>) => {
        store.set(k, v);
      }),
      clear: vi.fn(() => store.clear()),
      keys: vi.fn(() => Array.from(store.keys())),
    },
  };
});
vi.mock("#/shared-services/dict/dict.cache", () => ({
  dictCache: mockDictCache,
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
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        const txMock = {
          select: vi.fn(() => chain),
          update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
          insert: vi.fn(() => ({ values: vi.fn() })),
          delete: vi.fn(() => ({ where: vi.fn() })),
        };
        await fn(txMock);
      }),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb, withTransaction: mockDb.transaction }));

import {
  createDict,
  deleteDict,
  ensurePresetDicts,
  ensureSeedDicts,
  getAllDictOptions,
  getDictList,
  importDicts,
} from "#/shared-services/dict/dict.server";

describe("getDictList", () => {
  it("返回字典列表", async () => {
    mockRows.mockResolvedValue([]);
    const result = await getDictList();
    expect(Array.isArray(result)).toBe(true);
  });
});
describe("createDict", () => {
  it("创建字典并更新缓存", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "d-1", slug: "test_dict", name: "测试字典" }]),
      })),
    });

    const result = await createDict({ name: "测试字典", slug: "test_dict" });
    expect(result.slug).toBe("test_dict");
    expect(mockDictCache.set).toHaveBeenCalledWith("test_dict", {});
  });
});
describe("deleteDict", () => {
  beforeEach(() => vi.clearAllMocks());
  it("删除成功返回 true", async () => {
    // findFirst 返回存在记录，loadDictCache 的两个 select 返回空
    mockRows
      .mockReset()
      .mockResolvedValueOnce([{ id: "d-1", slug: "old_dict" }])
      .mockResolvedValue([]);
    mockDictCache.set("old_dict", {});
    const result = await deleteDict("d-1");
    expect(result).toBe(true);
  });
  it("不存在的字典返回 false", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    const result = await deleteDict("不存在");
    expect(result).toBe(false);
  });
});

describe("getAllDictOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDictCache.clear();
  });

  it("按 slug 分组返回字典选项", async () => {
    // 预置缓存：user_status 两个选项 + order_status 一个选项
    mockDictCache.set("user_status", {
      active: { label: "启用", color: "green" },
      disabled: { label: "禁用", color: "red" },
    } as any);
    mockDictCache.set("order_status", {
      paid: { label: "已支付", color: "blue" },
    } as any);
    mockRows.mockResolvedValue([]);

    const result = await getAllDictOptions();

    expect(result).toEqual({
      user_status: [
        { label: "启用", value: "active", color: "green" },
        { label: "禁用", value: "disabled", color: "red" },
      ],
      order_status: [{ label: "已支付", value: "paid", color: "blue" }],
    });
  });

  it("无缓存数据时返回空对象", async () => {
    mockRows.mockResolvedValue([]);

    const result = await getAllDictOptions();

    expect(result).toEqual({});
  });
});

describe("ensurePresetDicts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("全部预置字典缺失时逐个创建并写入子项", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "d-1", slug: "user_status", name: "用户状态" }]),
      })),
    });

    await ensurePresetDicts();

    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("预置字典已存在时跳过创建", async () => {
    mockRows.mockReset().mockResolvedValue([
      {
        id: "d-1",
        slug: "user_status",
        name: "用户状态",
      },
    ]);

    await ensurePresetDicts();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("ensureSeedDicts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("字典缺失时创建字典并写入全部条目", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "d-seed", slug: "seed_status", name: "播种状态" }]),
      })),
    });

    await ensureSeedDicts();

    // 1 次建字典 + 2 次写条目
    expect(mockDb.insert).toHaveBeenCalledTimes(3);
  });

  it("字典已存在时跳过播种", async () => {
    mockRows
      .mockReset()
      .mockResolvedValue([{ id: "d-seed", slug: "seed_status", name: "播种状态" }]);

    await ensureSeedDicts();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("importDicts", () => {
  it("导入新字典类型", async () => {
    // existingDicts 查询 + dict findFirst 均返回空
    mockRows.mockReset().mockResolvedValue([]);

    const result = await importDicts({
      dicts: [{ name: "测试字典", slug: "new-dict" }],
      dictItems: [],
    });

    expect(result.dictsCreated).toBe(1);
    expect(result.dictsUpdated).toBe(0);
    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(0);
    expect(result.itemsSkipped).toBe(0);
  });

  it("更新已有字典类型", async () => {
    // existingDicts 查询空，dict findFirst 命中
    mockRows
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "d-1", slug: "dict1" }])
      .mockResolvedValue([]);

    const result = await importDicts({
      dicts: [{ name: "更新后的字典", slug: "dict1" }],
      dictItems: [],
    });

    expect(result.dictsCreated).toBe(0);
    expect(result.dictsUpdated).toBe(1);
  });

  it("导入新字典条目", async () => {
    // existingDicts 空 → dict findFirst 命中 → dictItem findFirst 空
    mockRows
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "d-1", slug: "dict1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    const result = await importDicts({
      dicts: [{ name: "字典1", slug: "dict1" }],
      dictItems: [{ dictSlug: "dict1", label: "条目1", value: "v1" }],
    });

    expect(result.dictsUpdated).toBe(1);
    expect(result.itemsCreated).toBe(1);
    expect(result.itemsUpdated).toBe(0);
  });

  it("更新已有字典条目", async () => {
    // existingDicts 空 → dict findFirst 命中 → dictItem findFirst 命中
    mockRows
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "d-1", slug: "dict1" }])
      .mockResolvedValueOnce([{ id: "di-1" }])
      .mockResolvedValue([]);

    const result = await importDicts({
      dicts: [{ name: "字典1", slug: "dict1" }],
      dictItems: [{ dictSlug: "dict1", label: "条目1", value: "v1" }],
    });

    expect(result.dictsUpdated).toBe(1);
    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(1);
  });

  it("跳过未知 dictSlug 的条目", async () => {
    // existingDicts 空 → dict findFirst 空（创建），未知条目被跳过
    mockRows.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([]);

    const result = await importDicts({
      dicts: [{ name: "字典A", slug: "a" }],
      dictItems: [{ dictSlug: "unknown", label: "孤立条目", value: "v1" }],
    });

    expect(result.dictsCreated).toBe(1);
    expect(result.itemsSkipped).toBe(1);
    expect(result.itemsCreated).toBe(0);
  });

  it("混合导入统计", async () => {
    // existingDicts 空 → dict1 空 → dict2 命中 → item1 空 → item2 命中
    mockRows
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "d-2", slug: "existing" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "di-2" }])
      .mockResolvedValue([]);

    const result = await importDicts({
      dicts: [
        { name: "新字典", slug: "new" },
        { name: "已存在字典", slug: "existing" },
      ],
      dictItems: [
        { dictSlug: "new", label: "新条目", value: "v1" },
        { dictSlug: "existing", label: "已存在条目", value: "v2" },
        { dictSlug: "unknown", label: "孤立条目", value: "v3" },
      ],
    });

    expect(result.dictsCreated).toBe(1);
    expect(result.dictsUpdated).toBe(1);
    expect(result.itemsCreated).toBe(1);
    expect(result.itemsUpdated).toBe(1);
    expect(result.itemsSkipped).toBe(1);
  });
});
