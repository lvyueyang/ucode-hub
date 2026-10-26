/**
 * 国际化 CRUD 测试：UI 翻译 / 实体翻译维护
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockCache } = vi.hoisted(() => {
  const cacheStore = new Map<string, Record<string, string>>();
  return {
    mockCache: {
      get: vi.fn((locale: string) => cacheStore.get(locale)),
      set: vi.fn((locale: string, data: Record<string, string>) => cacheStore.set(locale, data)),
      delete: vi.fn((locale: string) => {
        cacheStore.delete(locale);
        return true;
      }),
      keys: vi.fn(() => Array.from(cacheStore.keys())),
    },
  };
});

vi.mock("#/shared-services/i18n/i18n.ui.cache", () => ({
  uiTranslationCache: mockCache,
}));

const { mockDb, mockRows, insertValues, onConflictDoUpdate } = vi.hoisted(() => {
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
  const onConflictDoUpdate = vi.fn();
  // insert(...).values(batch) 返回 { onConflictDoUpdate } 供 upsert / 导入链式调用
  const insertValues = vi.fn((..._args: unknown[]) => ({
    onConflictDoUpdate,
  }));
  return {
    mockRows: rows,
    insertValues,
    onConflictDoUpdate,
    mockDb: {
      select: vi.fn(() => chain),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb, withTransaction: mockDb.transaction }));

import {
  applyTranslations,
  deleteContentTranslation,
  deleteUITranslation,
  getAllContentTranslationsForExport,
  getAllUITranslationsForExport,
  getContentTranslations,
  getExistingTranslations,
  getFieldTranslations,
  getUITranslations,
  importContentTranslations,
  importUiTranslations,
  listContentTranslations,
  listUITranslations,
  loadUITranslations,
  refreshUITranslationCache,
  translateRecord,
  translateRecords,
  upsertContentTranslation,
  upsertContentTranslations,
  upsertUITranslation,
} from "#/shared-services/i18n/i18n.server";

beforeEach(() => vi.clearAllMocks());

const uiRecord = {
  id: "u-1",
  locale: "en",
  key: "home.title",
  value: "Welcome",
  valueType: "input",
  createdAt: new Date(),
  updatedAt: new Date(),
};
const ctRecord = {
  id: "ct-1",
  entityType: "news",
  entityId: "n-1",
  fieldName: "title",
  locale: "en",
  value: "Hello World",
  valueType: "text",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("listUITranslations", () => {
  beforeEach(() => vi.clearAllMocks());
  it("无筛选条件返回分页列表", async () => {
    mockRows.mockResolvedValue([uiRecord]);
    mockDb.$count.mockResolvedValue(1);
    const result = await listUITranslations();
    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("upsertUITranslation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("新建 UI 翻译（原子 upsert，无 select 竞态）", async () => {
    const result = await upsertUITranslation({
      locale: "en",
      key: "test.key",
      value: "Value",
    });
    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
  it("更新已有 UI 翻译", async () => {
    mockRows.mockResolvedValue([uiRecord]);
    const result = await upsertUITranslation({
      id: "u-1",
      locale: "en",
      key: "home.title",
      value: "Updated",
    });
    expect(result.success).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("deleteUITranslation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("删除存在的翻译", async () => {
    mockRows.mockResolvedValue([uiRecord]);
    mockCache.keys.mockReturnValue([]);
    const result = await deleteUITranslation("u-1");
    expect(result).toBe(true);
  });
  it("不存在的翻译返回 false", async () => {
    mockRows.mockResolvedValue([]);
    const result = await deleteUITranslation("不存在");
    expect(result).toBe(false);
  });
});

describe("listContentTranslations", () => {
  beforeEach(() => vi.clearAllMocks());
  it("按 entityType 筛选", async () => {
    mockRows.mockResolvedValue([ctRecord]);
    mockDb.$count.mockResolvedValue(1);
    const result = await listContentTranslations({ entityType: "news" });
    expect(result.records).toHaveLength(1);
  });
});

describe("upsertContentTranslation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("新建实体翻译（原子 upsert，无 select 竞态）", async () => {
    const result = await upsertContentTranslation({
      entityType: "news",
      entityId: "n-1",
      fieldName: "title",
      locale: "en",
      value: "Hello",
    });
    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
  it("更新已有实体翻译", async () => {
    mockRows.mockResolvedValue([ctRecord]);
    const result = await upsertContentTranslation({
      id: "ct-1",
      entityType: "news",
      entityId: "n-1",
      fieldName: "title",
      locale: "en",
      value: "Updated",
    });
    expect(result.success).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("deleteContentTranslation", () => {
  it("删除存在的翻译", async () => {
    mockRows.mockResolvedValue([ctRecord]);
    const result = await deleteContentTranslation("ct-1");
    expect(result).toBe(true);
  });
});

describe("getFieldTranslations", () => {
  it("查询某字段的所有语言翻译", async () => {
    mockRows.mockResolvedValue([ctRecord]);
    const result = await getFieldTranslations("news", "n-1", "title");
    expect(result).toHaveProperty("en");
    expect(result.en.value).toBe("Hello World");
  });
});

describe("loadUITranslations", () => {
  it("从数据库加载指定语言并组装为键值映射", async () => {
    mockRows.mockResolvedValue([
      uiRecord,
      { ...uiRecord, id: "u-2", key: "home.sub", value: "Sub" },
    ]);

    const result = await loadUITranslations("en");

    expect(result).toEqual({ "home.title": "Welcome", "home.sub": "Sub" });
  });

  it("无翻译时返回空对象", async () => {
    mockRows.mockResolvedValue([]);

    const result = await loadUITranslations("zh");
    expect(result).toEqual({});
  });
});

describe("getUITranslations", () => {
  it("缓存命中时直接返回", async () => {
    mockCache.get.mockReturnValue({ "home.title": "Welcome" });

    const result = await getUITranslations("en");

    expect(result).toEqual({ "home.title": "Welcome" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("缓存未命中时加载并写入缓存", async () => {
    mockCache.get.mockReturnValue(undefined);
    mockRows.mockResolvedValue([uiRecord]);

    const result = await getUITranslations("en");

    expect(result).toEqual({ "home.title": "Welcome" });
    expect(mockCache.set).toHaveBeenCalledWith("en", {
      "home.title": "Welcome",
    });
  });
});

describe("refreshUITranslationCache", () => {
  it("指定语言时仅失效该语言缓存（懒加载重建）", async () => {
    await refreshUITranslationCache("en");

    expect(mockCache.delete).toHaveBeenCalledWith("en");
    expect(mockCache.set).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("不指定语言时清空全部缓存", async () => {
    mockCache.keys.mockReturnValue(["en", "zh"]);

    await refreshUITranslationCache();

    expect(mockCache.delete).toHaveBeenCalledTimes(2);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("getAllUITranslationsForExport", () => {
  it("返回排序后的全部 UI 翻译", async () => {
    mockRows.mockResolvedValue([uiRecord]);

    const result = await getAllUITranslationsForExport();

    expect(result).toEqual([
      { locale: "en", key: "home.title", value: "Welcome", valueType: "input" },
    ]);
  });
});

describe("importUiTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("批量导入：单次预查询统计新增/更新，按唯一键去重", async () => {
    // 预查询已有 (locale, key)：仅 en::home.title 存在 → 该条更新，zh::new.key 新增
    mockRows.mockReset().mockResolvedValue([uiRecord]);

    const result = await importUiTranslations({
      translations: [
        { locale: "en", key: "home.title", value: "New", valueType: "input" },
        { locale: "zh", key: "new.key", value: "新", valueType: "input" },
      ],
    });

    expect(result).toEqual({ created: 1, updated: 1 });
    // 单次批量写入 + 原子冲突更新（无逐条 select）
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toHaveLength(2);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("导入数据中含重复唯一键时按一条去重", async () => {
    mockRows.mockReset().mockResolvedValue([]);

    const result = await importUiTranslations({
      translations: [
        { locale: "en", key: "dup", value: "v1", valueType: "input" },
        { locale: "en", key: "dup", value: "v2", valueType: "input" },
      ],
    });

    expect(result).toEqual({ created: 1, updated: 0 });
    expect(insertValues.mock.calls[0][0]).toHaveLength(1);
  });

  it("非法的 valueType 回退到 input，且不污染入参", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    const input = {
      translations: [{ locale: "en", key: "k", value: "v", valueType: "bad-type" }],
    };

    await importUiTranslations(input);

    const inserted = insertValues.mock.calls[0][0] as { valueType: string }[];
    expect(inserted[0].valueType).toBe("input");
    expect(input.translations[0].valueType).toBe("bad-type");
  });
});

describe("getAllContentTranslationsForExport", () => {
  it("返回排序后的全部实体翻译", async () => {
    mockRows.mockResolvedValue([ctRecord]);

    const result = await getAllContentTranslationsForExport();

    expect(result).toEqual([
      {
        entityType: "news",
        entityId: "n-1",
        fieldName: "title",
        locale: "en",
        value: "Hello World",
        valueType: "text",
      },
    ]);
  });
});

describe("importContentTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("在事务中批量导入并统计新增/更新", async () => {
    // 预查询已有唯一键：仅 news::n-1::title::en 存在 → 该条更新，n-2 新增
    mockRows.mockReset().mockResolvedValue([ctRecord]);

    const result = await importContentTranslations({
      translations: [
        {
          entityType: "news",
          entityId: "n-1",
          fieldName: "title",
          locale: "en",
          value: "Updated",
          valueType: "text",
        },
        {
          entityType: "news",
          entityId: "n-2",
          fieldName: "title",
          locale: "zh",
          value: "标题",
          valueType: "text",
        },
      ],
    });

    expect(result).toEqual({ created: 1, updated: 1 });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toHaveLength(2);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("非法的 valueType 回退到 text，且不污染入参", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    const input = {
      translations: [
        {
          entityType: "news",
          entityId: "n-1",
          fieldName: "title",
          locale: "en",
          value: "x",
          valueType: "bad-type",
        },
      ],
    };

    await importContentTranslations(input);

    const inserted = insertValues.mock.calls[0][0] as { valueType: string }[];
    expect(inserted[0].valueType).toBe("text");
    expect(input.translations[0].valueType).toBe("bad-type");
  });
});

describe("getContentTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("单条查询：非默认语言返回字段翻译映射", async () => {
    mockRows.mockResolvedValue([
      { ...ctRecord, fieldName: "title", value: "Hello" },
      { ...ctRecord, fieldName: "summary", value: "Snippet" },
    ]);

    const result = await getContentTranslations("news", "n-1", "en");

    expect(result).toEqual({
      title: { fieldName: "title", value: "Hello", valueType: "text" },
      summary: { fieldName: "summary", value: "Snippet", valueType: "text" },
    });
  });

  it("默认语言（zh）直接返回空对象，不查库", async () => {
    const result = await getContentTranslations("news", "n-1", "zh");
    expect(result).toEqual({});
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("批量查询：按 entityId 分组返回", async () => {
    mockRows.mockResolvedValue([
      { ...ctRecord, entityId: "n-1", fieldName: "title", value: "A" },
      { ...ctRecord, entityId: "n-2", fieldName: "title", value: "B" },
    ]);

    const result = await getContentTranslations("news", ["n-1", "n-2"], "en");

    expect(result).toEqual({
      "n-1": { title: { fieldName: "title", value: "A", valueType: "text" } },
      "n-2": { title: { fieldName: "title", value: "B", valueType: "text" } },
    });
  });
});

describe("translateRecord", () => {
  beforeEach(() => vi.clearAllMocks());

  it("默认语言返回原记录，不查询翻译", async () => {
    const record = { id: "n-1", title: "原" };
    const result = await translateRecord(record, "news", "zh");
    expect(result).toEqual(record);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("非默认语言查询并覆盖字段", async () => {
    mockRows.mockResolvedValue([{ ...ctRecord, entityId: "n-1", fieldName: "title", value: "T" }]);
    const result = await translateRecord({ id: "n-1", title: "原" }, "news", "en");
    expect(result.title).toBe("T");
  });

  it("无翻译时返回原记录", async () => {
    mockRows.mockResolvedValue([]);
    const record = { id: "n-1", title: "原" };
    const result = await translateRecord(record, "news", "en");
    expect(result).toEqual(record);
  });
});

describe("translateRecords", () => {
  beforeEach(() => vi.clearAllMocks());

  it("默认语言直接返回，不查询翻译", async () => {
    const records = [{ id: "n-1", title: "a" }];
    const result = await translateRecords(records, "news", "zh");
    expect(result).toEqual(records);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("空数组直接返回", async () => {
    const result = await translateRecords([], "news", "en");
    expect(result).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("批量按 entityId 分组翻译，单次查询", async () => {
    mockRows.mockResolvedValue([
      { ...ctRecord, entityId: "n-1", fieldName: "title", value: "A" },
      { ...ctRecord, entityId: "n-2", fieldName: "title", value: "B" },
    ]);
    const records = [
      { id: "n-1", title: "a" },
      { id: "n-2", title: "b" },
    ];
    const result = await translateRecords(records, "news", "en");
    expect(result[0].title).toBe("A");
    expect(result[1].title).toBe("B");
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe("applyTranslations", () => {
  it("单条记录：将翻译覆盖到对应字段", () => {
    const record = { id: "n-1", title: "原", summary: "原摘要" };
    const translations = {
      title: { fieldName: "title", value: "T", valueType: "text" as const },
    };
    const result = applyTranslations(record, translations);
    expect(result).toEqual({ id: "n-1", title: "T", summary: "原摘要" });
  });

  it("批量记录：按 record.id 查找对应翻译并覆盖", () => {
    const records = [
      { id: "n-1", title: "原1" },
      { id: "n-2", title: "原2" },
    ];
    const translationsMap = {
      "n-1": {
        title: { fieldName: "title", value: "T1", valueType: "text" as const },
      },
    };
    const result = applyTranslations(records, translationsMap);
    expect(result).toEqual([
      { id: "n-1", title: "T1" },
      { id: "n-2", title: "原2" },
    ]);
  });

  it("不修改原记录（返回新对象）", () => {
    const record = { id: "n-1", title: "原" };
    const result = applyTranslations(record, {
      title: { fieldName: "title", value: "T", valueType: "text" as const },
    });
    expect(record.title).toBe("原");
    expect(result).not.toBe(record);
  });
});

describe("getExistingTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("按实体与语言分组返回已存在字段", async () => {
    mockRows.mockResolvedValue([
      { entityId: "n1", fieldName: "title", locale: "en" },
      { entityId: "n1", fieldName: "description", locale: "en" },
      { entityId: "n2", fieldName: "title", locale: "en" },
    ]);
    const result = await getExistingTranslations("news", ["n1", "n2"], ["en"]);
    expect(result).toEqual({
      n1: { en: ["title", "description"] },
      n2: { en: ["title"] },
    });
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("空实体/空语言直接返回空映射，不查库", async () => {
    expect(await getExistingTranslations("news", [], ["en"])).toEqual({});
    expect(await getExistingTranslations("news", ["n1"], [])).toEqual({});
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("upsertContentTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("批量原子写入，基于唯一约束冲突更新", async () => {
    const result = await upsertContentTranslations([
      {
        entityType: "news",
        entityId: "n1",
        fieldName: "title",
        locale: "en",
        value: "T",
      },
      {
        entityType: "news",
        entityId: "n1",
        fieldName: "description",
        locale: "en",
        value: "D",
        valueType: "text",
      },
    ]);
    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toHaveLength(2);
  });

  it("为空数组直接返回，不查库", async () => {
    const result = await upsertContentTranslations([]);
    expect(result.success).toBe(true);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
