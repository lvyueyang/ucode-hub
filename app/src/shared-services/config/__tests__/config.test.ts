/**
 * 系统配置管理测试：CRUD + 缓存
 * configCache 为全量列表缓存，getConfig / getVisibleConfigRows 均从缓存读取
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockConfigCache } = vi.hoisted(() => {
  interface CachedConfig {
    id: string;
    key: string;
    value: string;
    clientVisible: boolean;
    isSecret?: boolean;
  }
  const store = new Map<string, CachedConfig[]>();
  return {
    mockConfigCache: {
      get: vi.fn((k: string) => store.get(k)),
      set: vi.fn((k: string, v: CachedConfig[]) => {
        store.set(k, v);
      }),
      delete: vi.fn((k: string) => store.delete(k)),
      clear: vi.fn(() => store.clear()),
    },
  };
});

const { mockConfigTranslationCache } = vi.hoisted(() => {
  const translationStore = new Map<string, Record<string, string>>();
  return {
    mockConfigTranslationCache: {
      get: vi.fn((k: string) => translationStore.get(k)),
      set: vi.fn((k: string, v: Record<string, string>) => {
        translationStore.set(k, v);
      }),
      delete: vi.fn((k: string) => translationStore.delete(k)),
      clear: vi.fn(() => translationStore.clear()),
      keys: vi.fn(() => Array.from(translationStore.keys())),
    },
  };
});

vi.mock("#/shared-services/config/config.cache", () => ({
  configCache: mockConfigCache,
  configTranslationCache: mockConfigTranslationCache,
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
  createConfig,
  deleteConfig,
  ensurePresetConfigs,
  getConfig,
  getConfigList,
  getConfigTranslations,
  getVisibleConfigRows,
  importConfigs,
  loadConfigCache,
  refreshConfigTranslationCache,
  updateConfig,
  upsertConfig,
} from "#/shared-services/config/config.server";
import { encryptConfigValue } from "#/shared-services/config/config-secret.server";

describe("loadConfigCache", () => {
  it("从 DB 加载配置到缓存", async () => {
    mockRows.mockResolvedValue([
      {
        id: "c-1",
        key: "site_name",
        value: "HUB",
        clientVisible: true,
      },
    ]);
    await loadConfigCache();
    expect(mockConfigCache.set).toHaveBeenCalledWith("all", [
      { id: "c-1", key: "site_name", value: "HUB", clientVisible: true },
    ]);
  });
});

describe("ensurePresetConfigs", () => {
  it("预设配置不存在时创建", async () => {
    vi.clearAllMocks();
    mockRows.mockResolvedValue([]);
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: vi.fn() })),
    });
    await ensurePresetConfigs();
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("预置配置已存在且 valueType 一致时不更新（其他元数据不一致也不更新）", async () => {
    vi.clearAllMocks();
    // 依赖 PRESET_CONFIGS 首项为 site_name（mock 无法按 key 区分查询，命中首项即可），
    // 若调整预设顺序需同步更新本用例
    mockRows
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: "c-1",
          key: "site_name",
          value: "HUB",
          deletedAt: null,
          clientVisible: false, // 与预设 true 不一致，但不应触发更新
          valueType: "input",
          groupName: "自定义分组",
          description: "自定义描述",
        },
      ])
      .mockResolvedValue([]);
    await ensurePresetConfigs();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("预置配置已存在但 valueType 不一致时仅同步 valueType，不触碰其他字段", async () => {
    vi.clearAllMocks();
    const setMock = vi.fn(() => ({ where: vi.fn() }));
    mockDb.update.mockReturnValue({ set: setMock });
    // 依赖 PRESET_CONFIGS 首项为 site_name（mock 无法按 key 区分查询），
    // 其 valueType 与预设不一致（模拟历史遗留类型）
    mockRows
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: "c-1",
          key: "site_name",
          value: "用户自定义值",
          deletedAt: null,
          clientVisible: false,
          valueType: "text",
          groupName: "旧分组",
          description: "旧描述",
        },
      ])
      .mockResolvedValue([]);
    await ensurePresetConfigs();
    expect(mockDb.update).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ valueType: "input" }));
    // 仅同步 valueType 与 updatedAt，value / clientVisible / groupName / description 不被覆盖
    const setArgs = setMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(setArgs[0]).toEqual({
      valueType: "input",
      updatedAt: expect.any(Date),
    });
  });

  it("预设配置被软删除时恢复", async () => {
    vi.clearAllMocks();
    mockRows.mockResolvedValue([
      { id: "c-1", key: "site_name", value: "old", deletedAt: new Date() },
    ]);
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn() })),
    });
    await ensurePresetConfigs();
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
describe("getConfig", () => {
  it("从缓存获取配置值", async () => {
    mockConfigCache.set("all", [
      { id: "c-1", key: "site_name", value: "HUB", clientVisible: true },
    ]);
    const value = await getConfig("site_name");
    expect(value).toBe("HUB");
  });

  it("缓存中不存在时返回空字符串", async () => {
    const value = await getConfig("nonexistent_key");
    expect(value).toBe("");
  });
});

describe("getConfigList", () => {
  it("返回配置列表", async () => {
    const configRows = [{ id: "c-1", key: "site_name", value: "HUB" }];
    mockRows.mockResolvedValue(configRows);
    const result = await getConfigList();
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("site_name");
  });

  it("无配置时返回空数组", async () => {
    mockRows.mockResolvedValue([]);
    const result = await getConfigList();
    expect(result).toEqual([]);
  });
});

describe("敏感配置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  });

  it("创建敏感配置时加密入库", async () => {
    const inserted: Array<{ value: string }> = [];
    const valuesMock = vi.fn((values: { value: string }) => {
      inserted.push(values);
      return { returning: vi.fn().mockResolvedValue([{ id: "c-1" }]) };
    });
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);
    mockRows.mockResolvedValue([]);

    await createConfig({ key: "smtp_pass", value: "p@ss", isSecret: true });

    expect(inserted[0].value).not.toBe("p@ss");
    expect(inserted[0].value.startsWith("enc:v1:")).toBe(true);
  });

  it("读取敏感配置时解密返回明文", async () => {
    mockConfigCache.set("all", [
      {
        id: "c-1",
        key: "smtp_pass",
        value: encryptConfigValue("p@ss"),
        clientVisible: false,
        isSecret: true,
      },
    ]);
    expect(await getConfig("smtp_pass")).toBe("p@ss");
  });

  it("管理端列表中敏感值脱敏", async () => {
    mockRows.mockResolvedValue([
      { id: "c-1", key: "smtp_pass", value: "enc:v1:x", isSecret: true },
      { id: "c-2", key: "site_name", value: "HUB", isSecret: false },
    ]);
    const rows = await getConfigList();
    expect(rows[0].value).toBe("******");
    expect(rows[1].value).toBe("HUB");
  });

  it("客户端可见配置排除敏感项", async () => {
    mockConfigCache.set("all", [
      {
        id: "c-1",
        key: "smtp_pass",
        value: "enc",
        clientVisible: true,
        isSecret: true,
      },
    ]);
    expect(await getVisibleConfigRows()).toHaveLength(0);
  });

  it("导入已存在敏感配置时保留原值", async () => {
    mockRows
      .mockReset()
      .mockResolvedValueOnce([{ id: "c-1", isSecret: true }])
      .mockResolvedValue([]);
    const result = await importConfigs({
      configs: [{ key: "smtp_pass", value: "" }],
    });
    expect(result.updated).toBe(1);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("已存在且值为空的敏感预置项补上 isSecret 标记", async () => {
    const setMock = vi.fn((_data: Record<string, unknown>) => ({
      where: vi.fn(),
    }));
    mockDb.update.mockReturnValue({ set: setMock } as any);
    mockRows.mockReset().mockResolvedValue([
      {
        id: "c-1",
        key: "smtp_pass",
        value: "",
        deletedAt: null,
        clientVisible: false,
        isSecret: false,
        valueType: "input",
        groupName: "邮件设置",
        description: "SMTP 密码",
      },
    ]);

    await ensurePresetConfigs();

    expect(
      setMock.mock.calls.some(([payload]) => (payload as { isSecret?: boolean }).isSecret === true),
    ).toBe(true);
  });

  it("已存在且值为明文的预置项不自动转敏感", async () => {
    const setMock = vi.fn((_data: Record<string, unknown>) => ({
      where: vi.fn(),
    }));
    mockDb.update.mockReturnValue({ set: setMock } as any);
    mockRows.mockReset().mockResolvedValue([
      {
        id: "c-1",
        key: "smtp_pass",
        value: "plain-password",
        deletedAt: null,
        clientVisible: false,
        isSecret: false,
        valueType: "input",
        groupName: "邮件设置",
        description: "SMTP 密码",
      },
    ]);

    await ensurePresetConfigs();

    expect(
      setMock.mock.calls.some(([payload]) => (payload as { isSecret?: boolean }).isSecret === true),
    ).toBe(false);
  });

  it("导入新敏感配置时写入敏感标记", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const valuesMock = vi.fn((values: Record<string, unknown>) => {
      inserted.push(values);
      return { returning: vi.fn() };
    });
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);
    mockRows.mockReset().mockResolvedValue([]);

    await importConfigs({
      configs: [{ key: "smtp_pass", value: "", isSecret: true }],
    });

    expect(inserted[0].isSecret).toBe(true);
  });

  it("导入敏感备份时为空值的目标行补上敏感标记", async () => {
    mockRows
      .mockReset()
      .mockResolvedValueOnce([{ id: "c-1", isSecret: false, value: "" }])
      .mockResolvedValue([]);
    const setMock = vi.fn((_data: Record<string, unknown>) => ({
      where: vi.fn(),
    }));
    mockDb.update.mockReturnValue({ set: setMock } as any);

    await importConfigs({
      configs: [{ key: "smtp_pass", value: "", isSecret: true }],
    });

    const payload = setMock.mock.calls[0][0] as { isSecret?: boolean };
    expect(payload.isSecret).toBe(true);
  });
});

describe("createConfig", () => {
  it("创建配置并更新缓存", async () => {
    // mock insert
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "c-1", key: "new_key", value: "val" }]),
      })),
    });
    // mock loadConfigCache 的 select
    mockRows.mockResolvedValue([{ id: "c-1", key: "new_key", value: "val", clientVisible: false }]);
    const result = await createConfig({ key: "new_key", value: "val" });
    expect(result.key).toBe("new_key");
    expect(mockConfigCache.set).toHaveBeenCalledWith("all", [
      { id: "c-1", key: "new_key", value: "val", clientVisible: false },
    ]);
  });
});

describe("deleteConfig", () => {
  it("删除配置并刷新缓存", async () => {
    // findFirst 返回存在记录，loadConfigCache 的 select 返回空列表
    mockRows
      .mockReset()
      .mockResolvedValueOnce([{ id: "c-1", key: "old_key" }])
      .mockResolvedValue([]);
    const result = await deleteConfig("c-1");
    expect(result).toBe(true);
    expect(mockConfigCache.set).toHaveBeenCalledWith("all", []);
  });
  it("不存在的配置返回 false", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    const result = await deleteConfig("不存在");
    expect(result).toBe(false);
  });
});

describe("getVisibleConfigRows", () => {
  it("返回 clientVisible=true 的配置行", async () => {
    mockConfigCache.set("all", [
      { id: "c-1", key: "site_name", value: "HUB", clientVisible: true },
      { id: "c-2", key: "other", value: "val", clientVisible: false },
    ]);
    const rows = await getVisibleConfigRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("site_name");
  });

  it("无 clientVisible 配置时返回空数组", async () => {
    mockConfigCache.set("all", [{ id: "c-1", key: "other", value: "val", clientVisible: false }]);
    const rows = await getVisibleConfigRows();
    expect(rows).toHaveLength(0);
  });
});

describe("getConfigTranslations", () => {
  it("默认语言返回空对象", async () => {
    const result = await getConfigTranslations("zh");
    expect(result).toEqual({});
  });

  it("缓存命中直接返回", async () => {
    mockConfigTranslationCache.set("en", { "c-1": "HUB EN" });
    const result = await getConfigTranslations("en");
    expect(result).toEqual({ "c-1": "HUB EN" });
  });

  it("缓存未命中时查询 DB 并写入缓存", async () => {
    mockConfigTranslationCache.get.mockReturnValueOnce(undefined);
    mockRows.mockResolvedValue([{ entityId: "c-1", value: "HUB EN" }]);
    const result = await getConfigTranslations("en");
    expect(result).toEqual({ "c-1": "HUB EN" });
    expect(mockConfigTranslationCache.set).toHaveBeenCalledWith("en", {
      "c-1": "HUB EN",
    });
  });
});

describe("upsertConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("key 已存在时更新配置并保留未传字段", async () => {
    // findFirst 返回存在记录，loadConfigCache 的 select 返回空列表
    mockRows
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: "c-1",
          key: "site_name",
          value: "old",
          clientVisible: true,
          valueType: "input",
          groupName: "站点设置",
          description: "站点名称",
        },
      ])
      .mockResolvedValue([]);
    const setMock = vi.fn((_data: unknown) => ({ where: vi.fn() }));
    mockDb.update.mockReturnValue({ set: setMock } as any);

    await upsertConfig("site_name", "新值");

    expect(mockDb.insert).not.toHaveBeenCalled();
    // 更新 payload：仅覆盖传入字段，其余保留原值
    const payload = setMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.value).toBe("新值");
    expect(payload.clientVisible).toBe(true);
    expect(payload.valueType).toBe("input");
    expect(payload.groupName).toBe("站点设置");
  });

  it("key 不存在时插入新配置", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    const valuesMock = vi.fn();
    mockDb.insert.mockReturnValue({ values: valuesMock });

    await upsertConfig("new_key", "val");

    expect(valuesMock).toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("updateConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("更新存在的配置返回记录并刷新缓存", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "c-1", key: "k", value: "new" }]),
        })),
      })),
    });
    mockRows.mockResolvedValue([]);

    const result = await updateConfig("c-1", { value: "new" });

    expect(result).not.toBeNull();
    expect(result!.value).toBe("new");
    expect(mockConfigCache.set).toHaveBeenCalled();
  });

  it("不存在的配置返回 null 且不刷新缓存", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const result = await updateConfig("ghost", { value: "x" });

    expect(result).toBeNull();
    expect(mockConfigCache.set).not.toHaveBeenCalled();
  });

  it("value 为 undefined 时不写入 value（敏感配置留空保留原密文）", async () => {
    mockRows
      .mockReset()
      .mockResolvedValueOnce([{ isSecret: true }])
      .mockResolvedValue([]);
    const setMock = vi.fn((_data: Record<string, unknown>) => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "c-1" }]),
      })),
    }));
    mockDb.update.mockReturnValue({ set: setMock } as any);

    await updateConfig("c-1", { description: "改描述" });

    const payload = setMock.mock.calls[0][0];
    expect("value" in payload).toBe(false);
  });
});

describe("refreshConfigTranslationCache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("指定语言时删除缓存并重新加载", async () => {
    mockConfigTranslationCache.get.mockReturnValueOnce(undefined);
    mockRows.mockResolvedValue([]);

    await refreshConfigTranslationCache("en");

    expect(mockConfigTranslationCache.delete).toHaveBeenCalledWith("en");
    expect(mockConfigTranslationCache.set).toHaveBeenCalled();
  });

  it("不指定语言时清空全部缓存", async () => {
    mockConfigTranslationCache.keys.mockReturnValue(["en", "zh"]);

    await refreshConfigTranslationCache();

    expect(mockConfigTranslationCache.delete).toHaveBeenCalledTimes(2);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("importConfigs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("导入新配置", async () => {
    mockRows.mockResolvedValue([]);

    const result = await importConfigs({
      configs: [{ key: "new.key", value: "new-value" }],
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("更新已有配置", async () => {
    mockRows.mockResolvedValue([{ id: "c-1" }]);

    const result = await importConfigs({
      configs: [{ key: "existing.key", value: "updated-value" }],
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("导入后重新加载配置缓存", async () => {
    mockRows.mockResolvedValue([]);

    await importConfigs({
      configs: [{ key: "new.key", value: "new-value" }],
    });

    expect(mockConfigCache.set).toHaveBeenCalled();
  });

  it("混合导入统计", async () => {
    mockRows
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "c-2" }])
      .mockResolvedValue([]);

    const result = await importConfigs({
      configs: [
        { key: "new.key", value: "new-value" },
        { key: "existing.key", value: "updated-value" },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
  });
});
