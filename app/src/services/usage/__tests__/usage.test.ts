/**
 * 用量服务层测试：落库、筛选条件构造、列表补名、汇总口径（均不连 DB）
 * 查询链桩记录 where / orderBy 入参，用 PgDialect 反解成 SQL 后断言筛选条件。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, state } = vi.hoisted(() => {
  const state = {
    /** 每条 select 查询按序返回的行 */
    queue: [] as unknown[][],
    whereArgs: [] as unknown[],
    orderByArgs: [] as unknown[],
    inserted: [] as Record<string, unknown>[],
    count: 0,
    executeRows: [] as unknown[],
    /** 每次 db.execute 的入参（整段聚合 SQL），供断言筛选条件 */
    executed: [] as unknown[],
  };

  const nextRows = (): unknown[] => state.queue.shift() ?? [];

  /** 查询链桩：任意环节可续接，`offset()` 与 `await` 两种收尾都返回行数组 */
  const node = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    self.from = () => self;
    self.where = (condition?: unknown) => {
      state.whereArgs.push(condition);
      return self;
    };
    self.orderBy = (clause?: unknown) => {
      state.orderByArgs.push(clause);
      return self;
    };
    self.limit = () => self;
    self.offset = () => Promise.resolve(nextRows());
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(nextRows()).then(resolve);
    return self;
  };

  const mockDb = {
    select: vi.fn(() => node()),
    $count: vi.fn(async () => state.count),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.inserted.push(values);
      }),
    })),
    execute: vi.fn(async (...args: unknown[]) => {
      state.executed.push(args[0]);
      return { rows: state.executeRows };
    }),
  };

  return { mockDb, state };
});

vi.mock("#/db", () => ({ db: mockDb }));

import { PgDialect } from "drizzle-orm/pg-core";

import {
  listUsageForAdmin,
  recordUsage,
  usageTotalsForAdmin,
  usageTotalsForOwner,
} from "../usage.server";

const dialect = new PgDialect();

/** 反解一条 where / orderBy 子句为 SQL 与参数，用于断言筛选条件确实进了 SQL */
const toSql = (clause: unknown): { sql: string; params: unknown[] } =>
  dialect.sqlToQuery(clause as never) as { sql: string; params: unknown[] };

/** 账号与设备名的补齐查询所返回的行 */
const accountRows = { admin: [{ id: "acc-1", username: "运营" }], client: [] };
const deviceRows = [{ id: "dev-1", name: "我的 Mac" }];

/** 一条用量记录（列表查询返回） */
const usageRow = {
  id: "u-1",
  accountType: "admin" as const,
  accountId: "acc-1",
  deviceId: "dev-1",
  model: "deepseek-chat",
  providerId: "deepseek",
  promptTokens: 10,
  completionTokens: 20,
  totalTokens: 30,
  latencyMs: 1234,
  status: "ok" as const,
  errorMessage: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};

describe("recordUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.inserted.length = 0;
  });

  it("按入参落库一行（含设备与 token）", async () => {
    await recordUsage({
      accountType: "client",
      accountId: "acc-2",
      deviceId: "dev-2",
      model: "deepseek-chat",
      providerId: "deepseek",
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      latencyMs: 120,
      status: "ok",
    });

    expect(state.inserted[0]).toEqual({
      accountType: "client",
      accountId: "acc-2",
      deviceId: "dev-2",
      model: "deepseek-chat",
      providerId: "deepseek",
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      latencyMs: 120,
      status: "ok",
      errorMessage: null,
    });
  });

  it("网页会话调用 deviceId 落 null，拿不到 usage 时三个 token 保持 null", async () => {
    await recordUsage({
      accountType: "admin",
      accountId: "acc-1",
      model: "m",
      providerId: "p",
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      latencyMs: 5,
      status: "error",
      errorMessage: "   ",
    });

    expect(state.inserted[0]?.deviceId).toBeNull();
    expect(state.inserted[0]?.promptTokens).toBeNull();
    expect(state.inserted[0]?.completionTokens).toBeNull();
    expect(state.inserted[0]?.totalTokens).toBeNull();
    // 全空白的错误摘要按「没有摘要」处理，不落一串空格
    expect(state.inserted[0]?.errorMessage).toBeNull();
  });

  it("失败摘要与模型名按列宽截断，避免超长直接插入失败", async () => {
    await recordUsage({
      accountType: "admin",
      accountId: "acc-1",
      model: "m".repeat(200),
      providerId: "p".repeat(100),
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      latencyMs: 5,
      status: "error",
      errorMessage: "e".repeat(600),
    });

    expect(String(state.inserted[0]?.model)).toHaveLength(120);
    expect(String(state.inserted[0]?.providerId)).toHaveLength(64);
    expect(String(state.inserted[0]?.errorMessage)).toHaveLength(500);
  });
});

describe("listUsageForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.queue.length = 0;
    state.whereArgs.length = 0;
    state.orderByArgs.length = 0;
    state.count = 0;
  });

  it("补齐账号名与设备名，默认按创建时间排、默认分页", async () => {
    // 账号名与设备名是三段并发查询：主查询 → 管理员表 → 设备表 → 客户端用户表
    state.queue.push([usageRow], accountRows.admin, deviceRows, accountRows.client);
    state.count = 1;

    const result = await listUsageForAdmin({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
    expect(result.records[0]?.accountName).toBe("运营");
    expect(result.records[0]?.deviceName).toBe("我的 Mac");
    expect(toSql(state.orderByArgs[0]).sql).toContain("created_at");
  });

  it("账号 / 设备 / 模型 / 状态 / 时间段筛选都进 SQL", async () => {
    state.queue.push([], [], [], []);

    await listUsageForAdmin({
      accountType: "client",
      accountId: "acc-2",
      deviceId: "dev-2",
      model: "deepseek",
      status: "error",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
    });

    // 数据查询与计数查询共用同一份条件，两处都必须带上
    expect(state.whereArgs).toHaveLength(2);
    for (const clause of state.whereArgs) {
      const { sql: text, params } = toSql(clause);
      expect(text).toContain("account_type");
      expect(text).toContain("account_id");
      expect(text).toContain("device_id");
      expect(text).toContain("model");
      expect(text).toContain("status");
      expect(text).toContain("created_at");
      // 模型走模糊匹配，别退化成精确相等
      expect(params).toContain("%deepseek%");
      expect(params).toContain("client");
      expect(params).toContain("error");
      // 日期按业务时区解析成绝对时刻：起点 2026-10-01 00:00 +08:00，排他上界为次日 00:00
      expect(params).toContain("2026-09-30T16:00:00.000Z");
      expect(params).toContain("2026-10-02T16:00:00.000Z");
    }
  });

  it("无筛选时不带 where（全量按时间倒序）", async () => {
    state.queue.push([], [], []);

    await listUsageForAdmin({});

    for (const clause of state.whereArgs) expect(clause).toBeUndefined();
  });

  it("排序字段走白名单：非法字段回落创建时间，合法字段按其列排", async () => {
    state.queue.push([], [], []);
    await listUsageForAdmin({ sortField: "drop table", sortOrder: "ascend" });
    expect(toSql(state.orderByArgs[0]).sql).toContain("created_at");
    expect(toSql(state.orderByArgs[0]).sql).toContain("asc");

    state.queue.push([], [], []);
    await listUsageForAdmin({ sortField: "totalTokens", sortOrder: "descend" });
    expect(toSql(state.orderByArgs[1]).sql).toContain("total_tokens");
    expect(toSql(state.orderByArgs[1]).sql).toContain("desc");
  });
});

describe("usageTotalsForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.whereArgs.length = 0;
    state.executeRows.length = 0;
    state.executed.length = 0;
  });

  it("驱动回的字符串合计转成数字，平均耗时取整", async () => {
    state.executeRows.push({
      requests: 3,
      error_requests: 1,
      prompt_tokens: "100",
      completion_tokens: "200",
      total_tokens: "300",
      avg_latency_ms: "1234.56",
    });

    const totals = await usageTotalsForAdmin({ accountId: "acc-1" });

    expect(totals).toEqual({
      requests: 3,
      errorRequests: 1,
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      avgLatencyMs: 1235,
    });
  });

  it("无数据时返回全零", async () => {
    expect(await usageTotalsForAdmin({})).toEqual({
      requests: 0,
      errorRequests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      avgLatencyMs: 0,
    });
  });
});

describe("usageTotalsForOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.whereArgs.length = 0;
    state.executeRows.length = 0;
    state.executed.length = 0;
  });

  it("账号条件由入参身份固定，调用方给不了别人的账号", async () => {
    state.executeRows.push({ requests: 0 });

    await usageTotalsForOwner(
      { type: "client", id: "mine" },
      {
        // 试图越权的字段一律被身份覆盖
        accountType: "admin",
        accountId: "someone-else",
        model: "deepseek",
      },
    );

    const { params } = toSql(state.executed[0]);
    expect(params).toContain("client");
    expect(params).toContain("mine");
    // 其它筛选照常生效，被覆盖的只有账号
    expect(params).toContain("%deepseek%");
    expect(params).not.toContain("someone-else");
    expect(params).not.toContain("admin");
  });
});
