/**
 * 埋点事件服务层测试：事件上报校验链路、频控、时间钳制、查询、分析、元数据管理、预置数据
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockTrackEventMetaCache, mockTrackPropertyMetaCache } = vi.hoisted(() => {
  const eventStore = new Map<string, boolean>();
  const propertyStore = new Map<string, string>();
  return {
    mockTrackEventMetaCache: {
      clear: vi.fn(() => eventStore.clear()),
      set: vi.fn((k: string, v: boolean) => eventStore.set(k, v)),
      get: vi.fn((k: string) => eventStore.get(k)),
      has: vi.fn((k: string) => eventStore.has(k)),
    },
    mockTrackPropertyMetaCache: {
      clear: vi.fn(() => propertyStore.clear()),
      set: vi.fn((k: string, v: string) => propertyStore.set(k, v)),
      get: vi.fn((k: string) => propertyStore.get(k)),
      has: vi.fn((k: string) => propertyStore.has(k)),
    },
  };
});

vi.mock("#/services/track/track.cache", () => ({
  trackEventMetaCache: mockTrackEventMetaCache,
  trackPropertyMetaCache: mockTrackPropertyMetaCache,
}));

const { mockDb } = vi.hoisted(() => {
  const q = () => ({ findFirst: vi.fn(), findMany: vi.fn() });
  return {
    mockDb: {
      query: {
        trackEvent: q(),
        trackEventMeta: q(),
        trackPropertyMeta: q(),
        adminUser: q(),
        clientUser: q(),
        adminRole: q(),
        clientRole: q(),
        news: q(),
        dict: q(),
        dictItem: q(),
        file: q(),
        systemConfig: q(),
        captchaCode: q(),
        contentTranslation: q(),
      },
      $count: vi.fn(),
      select: vi.fn(() => ({})),
      selectDistinct: vi.fn(() => ({
        from: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })),
        })),
      })),
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
    },
  };
});

vi.mock("#/db", () => ({ db: mockDb }));

// 所有 mock 之后导入被测模块
import {
  clearTrackRateLimit,
  createTrackEventMeta,
  createTrackPropertyMeta,
  deleteTrackEventMeta,
  deleteTrackPropertyMeta,
  ensurePresetEvents,
  ensurePresetProperties,
  flushTrackEvents,
  getTrackAnalytics,
  getTrackEventMeta,
  getTrackEventMetaList,
  getTrackEventNames,
  getTrackPropertyMeta,
  getTrackPropertyMetaList,
  loadTrackMetaCache,
  resetTrackMetaCacheForTest,
  searchTrackEvents,
  TRACK_RATE_LIMIT,
  trackEvent,
  trackServerEvent,
  updateTrackEventMeta,
  updateTrackPropertyMeta,
} from "../track.server";

/** 会话频控上限（每分钟） */
const TRACK_LIMIT = TRACK_RATE_LIMIT.MAX_PER_SESSION;

/** 构造 select 链：from → where → limit，供元数据查询使用 */
const selectFromWhereLimit = (rows: unknown[]) => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(rows)) })),
  })),
});

/** 默认 select 链：from → where → orderBy → limit → offset */
const defaultSelectChain = () => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn(() => Promise.resolve([])),
        })),
      })),
      groupBy: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  })),
});

beforeEach(async () => {
  vi.clearAllMocks();
  resetTrackMetaCacheForTest();
  // 恢复 select 默认链，避免用例间 mock 实现残留
  mockDb.select.mockImplementation(defaultSelectChain);
  // 清空事件缓冲，避免测试间残留
  await flushTrackEvents();
});

describe("loadTrackMetaCache", () => {
  it("从数据库加载元事件与元属性到缓存", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => Promise.resolve([{ name: "PageView" }])),
    } as any);
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() =>
        Promise.resolve([
          { key: "$ip", dataType: "string" },
          { key: "page_name", dataType: "string" },
        ]),
      ),
    } as any);

    await loadTrackMetaCache();

    expect(mockTrackEventMetaCache.has("PageView")).toBe(true);
    expect(mockTrackPropertyMetaCache.get("$ip")).toBe("string");
  });

  it("缓存加载完成后重复调用不重复查库", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn(() => Promise.resolve([])),
    } as any);
    await loadTrackMetaCache();
    mockDb.select.mockClear();

    await loadTrackMetaCache();

    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("trackEvent（缓存未就绪兜底）", () => {
  it("缓存未就绪时事件直接入缓冲，不校验", async () => {
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    trackEvent({
      time: Date.now(),
      sessionId: "session-boot",
      name: "UnknownEvent",
      properties: {},
    });

    await flushTrackEvents();

    expect(valuesMock).toHaveBeenCalledTimes(1);
  });
});

describe("trackEvent（缓存就绪校验链路）", () => {
  beforeEach(async () => {
    // 模拟缓存已加载完成（select 返回空元数据，仅置 loaded 标志）
    mockDb.select.mockReturnValue({
      from: vi.fn(() => Promise.resolve([])),
    });
    await loadTrackMetaCache();
    // 预置元数据缓存：注册事件与属性
    mockTrackEventMetaCache.set("PageView", true);
    mockTrackPropertyMetaCache.set("page_name", "string");
  });

  it("合法事件进入缓冲并写入数据库", async () => {
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    trackEvent({
      time: Date.now(),
      sessionId: "s",
      name: "PageView",
      properties: { page_name: "/home" },
    });
    await flushTrackEvents();

    expect(valuesMock).toHaveBeenCalledTimes(1);
    const batch = valuesMock.mock.calls[0][0] as {
      name: string;
      sessionId: string;
      userId: null;
      properties: Record<string, unknown>;
    }[];
    expect(batch[0]).toMatchObject({
      name: "PageView",
      sessionId: "s",
      userId: null,
      properties: { page_name: "/home" },
    });
  });

  it("事件名未注册时丢弃，不写入缓冲", async () => {
    trackEvent({
      time: Date.now(),
      sessionId: "s",
      name: "Ghost",
      properties: {},
    });
    await flushTrackEvents();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("属性键未注册时丢弃事件", async () => {
    trackEvent({
      time: Date.now(),
      sessionId: "s",
      name: "PageView",
      properties: { ghost_key: "x" },
    });
    await flushTrackEvents();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("系统属性键未注册时丢弃事件", async () => {
    trackEvent({
      time: Date.now(),
      sessionId: "s",
      name: "PageView",
      properties: { $ghost: "x" },
    });
    await flushTrackEvents();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("属性值类型与声明不符时丢弃事件", async () => {
    trackEvent({
      time: Date.now(),
      sessionId: "s",
      name: "PageView",
      properties: { page_name: 123 },
    });
    await flushTrackEvents();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("同一会话超过频控上限后丢弃事件", async () => {
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    // 连续上报 60 条合法事件
    for (let i = 0; i < TRACK_LIMIT; i++) {
      trackEvent({
        time: Date.now(),
        sessionId: "session-rate",
        name: "PageView",
        properties: {},
      });
    }
    // 第 61 条超限被丢弃
    trackEvent({
      time: Date.now(),
      sessionId: "session-rate",
      name: "PageView",
      properties: {},
    });
    await flushTrackEvents();

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(valuesMock.mock.calls[0][0]).toHaveLength(TRACK_LIMIT);
  });

  it("时间超出合理区间时改用服务端时间", async () => {
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    const futureTime = Date.now() + 10 * 365 * 24 * 3600 * 1000;
    trackEvent({
      time: futureTime,
      sessionId: "s-time",
      name: "PageView",
      properties: {},
    });
    await flushTrackEvents();

    const batch = valuesMock.mock.calls[0][0] as { time: Date }[];
    expect(Math.abs(batch[0].time.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("清空频控计数后可继续上报", async () => {
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    for (let i = 0; i < TRACK_LIMIT; i++) {
      trackEvent({
        time: Date.now(),
        sessionId: "s-clear",
        name: "PageView",
        properties: {},
      });
    }
    clearTrackRateLimit();
    trackEvent({
      time: Date.now(),
      sessionId: "s-clear",
      name: "PageView",
      properties: {},
    });
    await flushTrackEvents();

    expect(valuesMock.mock.calls[0][0]).toHaveLength(TRACK_LIMIT + 1);
  });
});

describe("trackServerEvent（服务端可信入口）", () => {
  beforeEach(async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn(() => Promise.resolve([])),
    });
    await loadTrackMetaCache();
    mockTrackEventMetaCache.set("Register", true);
    mockTrackPropertyMetaCache.set("form_name", "string");
  });

  it("跳过 per-session 频控：超过匿名上限仍写入缓冲", async () => {
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    for (let i = 0; i < TRACK_LIMIT + 1; i++) {
      trackServerEvent({
        time: Date.now(),
        userId: "u-1",
        sessionId: "srv-u-1",
        name: "Register",
        properties: { form_name: "clientRegister" },
      });
    }
    await flushTrackEvents();

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(valuesMock.mock.calls[0][0]).toHaveLength(TRACK_LIMIT + 1);
  });

  it("仍执行事件名校验：未注册事件丢弃", async () => {
    trackServerEvent({
      time: Date.now(),
      sessionId: "srv-ghost",
      name: "Ghost",
      properties: {},
    });
    await flushTrackEvents();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("searchTrackEvents", () => {
  it("返回分页结果", async () => {
    const record = {
      id: "e1",
      time: new Date(),
      userId: null,
      sessionId: "s",
      name: "PageView",
      properties: { page_name: "/" },
      createdAt: new Date(),
    };
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([record])),
            })),
          })),
        })),
      })),
    } as any);
    mockDb.$count.mockResolvedValue(1);

    const result = await searchTrackEvents({});

    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("无结果时返回空数组与总数 0", async () => {
    mockDb.$count.mockResolvedValue(0);

    const result = await searchTrackEvents({});

    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("带筛选条件时正常执行查询", async () => {
    mockDb.$count.mockResolvedValue(2);

    const result = await searchTrackEvents({
      name: "PageView",
      userId: "u-1",
      keyword: "home",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      page: 2,
      pageSize: 50,
      sortField: "time",
      sortOrder: "descend",
    });

    expect(result.page).toBe(2);
    expect(mockDb.$count).toHaveBeenCalled();
  });

  it("日期范围筛选时 where 收到起止边界条件", async () => {
    const whereFn = vi.fn((_cond: unknown) => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn(() => Promise.resolve([])),
        })),
      })),
    }));
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({ where: whereFn })),
    } as any);
    mockDb.$count.mockResolvedValue(0);

    await searchTrackEvents({
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

describe("getTrackAnalytics", () => {
  const baseQuery = { startDate: "2024-01-01", endDate: "2024-01-31" };

  it("聚合返回趋势、排行、维度与 KPI", async () => {
    // 所有聚合查询统一返回同一行，覆盖各子查询所需字段
    mockDb.execute.mockResolvedValue({
      rows: [
        {
          date: "2024-01-01",
          series: null,
          value: 3,
          name: "PageView",
          count: 3,
          users: 1,
          total: 5,
          dim_value: "Desktop",
          page_name: "/home",
        },
      ],
    } as any);

    const result = await getTrackAnalytics(baseQuery);

    expect(result.totalEvents).toBe(5);
    expect(result.uniqueUsers).toBe(1);
    expect(result.timeSeries).toEqual([
      { date: "2024-01-01", value: 3, series: undefined, compare: "current" },
    ]);
    expect(result.eventRanking).toEqual([{ name: "PageView", count: 3, users: 1, ratio: 3 / 5 }]);
    expect(result.topPages).toEqual([{ pageName: "/home", count: 3 }]);
    // 四个固定维度均返回同一分布
    expect(result.dimensionDistributions.$device_type).toEqual([
      { name: "Desktop", count: 3, ratio: 3 / 5 },
    ]);
  });

  it("无数据时返回空结构", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] } as any);

    const result = await getTrackAnalytics(baseQuery);

    expect(result.timeSeries).toEqual([]);
    expect(result.eventRanking).toEqual([]);
    expect(result.topPages).toEqual([]);
    expect(result.uniqueUsers).toBe(0);
    expect(result.totalEvents).toBe(0);
  });

  it("带拆解维度时先经元属性白名单校验", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] } as any);
    const limit = vi.fn(() => Promise.resolve([{ key: "$device_type" }]));
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
    } as any);

    await getTrackAnalytics({ ...baseQuery, breakdown: "$device_type" });

    expect(mockDb.select).toHaveBeenCalled();
    expect(limit).toHaveBeenCalled();
  });

  it("compare=year 合并同比窗口并给出 deltas（闰日不报错）", async () => {
    mockDb.execute.mockResolvedValue({
      rows: [
        {
          date: "2024-02-29",
          value: 4,
          total: 4,
          users: 2,
          name: "PageView",
          count: 4,
          dim_value: "Desktop",
          page_name: "/home",
        },
      ],
    } as any);

    const result = await getTrackAnalytics({
      startDate: "2024-02-29",
      endDate: "2024-02-29",
      compare: "year",
    });

    expect(result.deltas).toBeDefined();
    expect(result.totalEvents).toBe(4);
  });
});

describe("getTrackEventNames", () => {
  it("返回事件名称列表", async () => {
    mockDb.selectDistinct.mockReturnValue({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve([{ name: "PageView" }, { name: "Click" }])),
      })),
    } as any);

    const names = await getTrackEventNames();
    expect(names).toEqual(["PageView", "Click"]);
  });

  it("无事件时返回空数组", async () => {
    mockDb.selectDistinct.mockReturnValue({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve([])),
      })),
    } as any);

    const names = await getTrackEventNames();
    expect(names).toEqual([]);
  });
});

describe("元事件管理", () => {
  describe("getTrackEventMetaList", () => {
    it("返回元事件列表", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.resolve([{ name: "PageView", label: "页面浏览", category: "页面交互" }]),
          ),
        })),
      } as any);

      const list = await getTrackEventMetaList();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("PageView");
    });
  });

  describe("getTrackEventMeta", () => {
    it("按名称获取元事件", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          { name: "PageView", label: "页面浏览", category: "页面交互" },
        ]) as any,
      );

      const event = await getTrackEventMeta("PageView");
      expect(event).not.toBeNull();
      expect(event!.name).toBe("PageView");
    });

    it("不存在的名称返回 null", async () => {
      mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);

      const event = await getTrackEventMeta("NotFound");
      expect(event).toBeNull();
    });
  });

  describe("createTrackEventMeta", () => {
    it("创建元事件并返回记录", async () => {
      const returningMock = vi.fn(() =>
        Promise.resolve([{ name: "Custom", label: "自定义", category: "自定义类别" }]),
      );
      mockDb.insert.mockReturnValue({
        values: vi.fn(() => ({ returning: returningMock })),
      } as any);

      const result = await createTrackEventMeta("Custom", {
        label: "自定义",
        category: "自定义类别",
      });

      expect(result.name).toBe("Custom");
    });
  });

  describe("updateTrackEventMeta", () => {
    it("更新已存在的元事件成功", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          { name: "PageView", label: "旧", category: "c", isPreset: false },
        ]) as any,
      );
      const returningMock = vi.fn(() =>
        Promise.resolve([{ name: "PageView", label: "新", category: "c" }]),
      );
      mockDb.update.mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: returningMock })),
        })),
      } as any);

      const result = await updateTrackEventMeta("PageView", { label: "新" });
      expect(result).not.toBeNull();
      expect(result!.label).toBe("新");
    });

    it("更新不存在的元事件返回 null", async () => {
      mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);

      const result = await updateTrackEventMeta("NotFound", {
        label: "新名称",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteTrackEventMeta", () => {
    it("删除非预置事件返回 true", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          { name: "Custom", label: "自定义", category: "c", isPreset: false },
        ]) as any,
      );

      const result = await deleteTrackEventMeta("Custom");
      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("预置事件不可删除返回 false", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          {
            name: "PageView",
            label: "页面浏览",
            category: "页面交互",
            isPreset: true,
          },
        ]) as any,
      );

      const result = await deleteTrackEventMeta("PageView");
      expect(result).toBe(false);
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("不存在的元事件删除返回 false", async () => {
      mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);

      const result = await deleteTrackEventMeta("NotFound");
      expect(result).toBe(false);
    });
  });
});

describe("元属性管理", () => {
  describe("getTrackPropertyMetaList", () => {
    it("返回元属性列表", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.resolve([{ key: "$ip", label: "IP 地址", dataType: "string" }]),
          ),
        })),
      } as any);

      const list = await getTrackPropertyMetaList();
      expect(list).toHaveLength(1);
      expect(list[0].key).toBe("$ip");
    });
  });

  describe("getTrackPropertyMeta", () => {
    it("按 key 获取元属性", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([{ key: "$ip", label: "IP 地址", dataType: "string" }]) as any,
      );

      const prop = await getTrackPropertyMeta("$ip");
      expect(prop).not.toBeNull();
    });

    it("不存在的 key 返回 null", async () => {
      mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);

      const prop = await getTrackPropertyMeta("$notfound");
      expect(prop).toBeNull();
    });
  });

  describe("createTrackPropertyMeta", () => {
    it("创建元属性，默认 dataType 为 string", async () => {
      const returningMock = vi.fn(() =>
        Promise.resolve([{ key: "custom_key", label: "自定义属性", dataType: "string" }]),
      );
      mockDb.insert.mockReturnValue({
        values: vi.fn(() => ({ returning: returningMock })),
      } as any);

      const result = await createTrackPropertyMeta("custom_key", {
        label: "自定义属性",
      });
      expect(result.key).toBe("custom_key");
    });
  });

  describe("updateTrackPropertyMeta", () => {
    it("更新已存在的元属性成功", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          {
            key: "custom_key",
            label: "旧",
            dataType: "string",
            isPreset: false,
          },
        ]) as any,
      );
      const returningMock = vi.fn(() =>
        Promise.resolve([{ key: "custom_key", label: "新", dataType: "string" }]),
      );
      mockDb.update.mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: returningMock })),
        })),
      } as any);

      const result = await updateTrackPropertyMeta("custom_key", {
        label: "新",
      });
      expect(result).not.toBeNull();
      expect(result!.label).toBe("新");
    });

    it("更新不存在的元属性返回 null", async () => {
      mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);

      const result = await updateTrackPropertyMeta("notfound", {
        label: "新名称",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteTrackPropertyMeta", () => {
    it("删除非预置属性返回 true", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          {
            key: "custom_key",
            label: "自定义",
            dataType: "string",
            isPreset: false,
          },
        ]) as any,
      );

      const result = await deleteTrackPropertyMeta("custom_key");
      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("预置属性不可删除返回 false", async () => {
      mockDb.select.mockReturnValue(
        selectFromWhereLimit([
          { key: "$ip", label: "IP 地址", dataType: "string", isPreset: true },
        ]) as any,
      );

      const result = await deleteTrackPropertyMeta("$ip");
      expect(result).toBe(false);
    });
  });
});

describe("ensurePresetEvents", () => {
  it("插入缺失的预置事件并清理裁剪出预置清单的事件", async () => {
    mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    await ensurePresetEvents();

    // 5 个预置事件全部缺失 → 各插入一次
    expect(valuesMock).toHaveBeenCalledTimes(5);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });

  it("已存在的预置事件不重复插入", async () => {
    // 第 1 个查询返回已存在的 PageView，其余返回不存在
    let queryCount = 0;
    mockDb.select.mockImplementation(() => {
      queryCount += 1;
      return selectFromWhereLimit(
        queryCount === 1 ? [{ name: "PageView", label: "页面浏览", category: "页面交互" }] : [],
      ) as any;
    });
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    await ensurePresetEvents();

    // PageView 已存在，其余 4 个插入
    expect(valuesMock).toHaveBeenCalledTimes(4);
  });
});

describe("ensurePresetProperties", () => {
  it("插入缺失的预置属性并清理裁剪出预置清单的属性", async () => {
    mockDb.select.mockReturnValue(selectFromWhereLimit([]) as any);
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    await ensurePresetProperties();

    expect(valuesMock).toHaveBeenCalledTimes(11);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
  });

  it("已存在的预置属性不重复插入", async () => {
    // 第 1 个查询返回已存在的 $ip，其余返回不存在
    let queryCount = 0;
    mockDb.select.mockImplementation(() => {
      queryCount += 1;
      return selectFromWhereLimit(
        queryCount === 1 ? [{ key: "$ip", label: "IP 地址", dataType: "string" }] : [],
      ) as any;
    });
    const valuesMock = vi.fn((_data: unknown) => Promise.resolve());
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);

    await ensurePresetProperties();

    // $ip 已存在，其余 10 个插入
    expect(valuesMock).toHaveBeenCalledTimes(10);
  });
});

describe("flushTrackEvents", () => {
  it("强制刷新完成不抛出异常", async () => {
    await expect(flushTrackEvents()).resolves.toBeUndefined();
  });
});
