/**
 * 埋点事件分析模块：趋势、事件排行、维度分布、Top 页面与 KPI 聚合
 * 与事件查询（track.events）分离，独立承担分析类聚合查询
 */
import { DEFAULT_TASK_TIME_ZONE, toDayRange } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { trackEvent as trackEventTable, trackPropertyMeta } from "#/db/schema";
import type {
  AnalyticsDelta,
  DimensionDistributionItem,
  EventRankingItem,
  TimeSeriesPoint,
  TopPageItem,
  TrackAnalyticsQuery,
  TrackAnalyticsResult,
} from "./track.types";
import { ANALYTICS_DIMENSION_KEYS } from "./track.types";

/** 指标聚合表达式：metric=users 按用户/会话去重 */
function metricAggExpr(metric: "count" | "users"): SQL {
  return metric === "users"
    ? sql`COUNT(DISTINCT COALESCE(${trackEventTable.userId}, ${trackEventTable.sessionId}))`
    : sql`COUNT(*)`;
}

/**
 * properties 的 JSON 路径：key 一律当作单个成员名处理（加引号），
 * 否则含 `.` 的 key 会被当成层级路径，与 pg 的 jsonb 取值运算符（整串当键）不等价
 */
const toJsonPath = (key: string): string =>
  `$."${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * properties 的标签取值表达式：取单个成员名并 CAST 成 TEXT。
 * SQLite 的 json_extract 保留 JSON 原生类型（数字仍是数字、布尔是 0/1），
 * 标签用途必须 CAST 成 TEXT 才能与 pg 的口径（一律返回文本）一致；
 * 代价是布尔值呈现为 1/0。
 */
const propertyLabelExpr = (key: string): SQL =>
  sql`CAST(json_extract(${trackEventTable.properties}, ${toJsonPath(key)}) AS TEXT)`;

/**
 * 时间桶表达式：毫秒时间戳按秒换算后加 8 小时转东八区，再按粒度格式化。
 * 周粒度取所在 ISO 周的周一（对齐 pg 的 DATE_TRUNC('week')）：
 * `weekday 0` 前进到周日（当天是周日则不动）、再回退 6 天；
 * 直接用 `weekday 1` 会让周一自身退到上一周，故不采用。
 */
function timeBucketExpr(granularity: "hour" | "day" | "week"): SQL {
  const seconds = sql`${trackEventTable.time} / 1000`;
  if (granularity === "hour") {
    return sql`strftime('%Y-%m-%d %H:00', ${seconds}, 'unixepoch', '+8 hours')`;
  }
  if (granularity === "week") {
    return sql`date(${seconds}, 'unixepoch', '+8 hours', 'weekday 0', '-6 days')`;
  }
  return sql`strftime('%Y-%m-%d', ${seconds}, 'unixepoch', '+8 hours')`;
}

/** 趋势分组列：有拆解维度时按属性值分组，否则按事件名 */
function seriesExpr(breakdown?: string): SQL {
  return breakdown
    ? sql`COALESCE(${propertyLabelExpr(breakdown)}, '未知')`
    : sql`${trackEventTable.name}`;
}

/** 事件过滤条件：未传事件名时不生成条件，inArray 正确展开为参数化 IN 子句 */
function eventNameFilter(names?: string[]): SQL {
  if (!names?.length) return sql``;
  return sql`AND ${inArray(trackEventTable.name, names)}`;
}

/** 东八区时区偏移（毫秒） */
const TZ_OFFSET_MS = 8 * 3600 * 1000;

/** 将时间对齐到该粒度在东八区的桶起始（用于趋势补零生成完整桶序列） */
function alignBucketStart(date: Date, granularity: "hour" | "day" | "week"): Date {
  if (granularity === "week") {
    const local = new Date(date.getTime() + TZ_OFFSET_MS);
    const dayOfWeek = (local.getUTCDay() + 6) % 7; // 周一=0
    const mondayLocal = local.getTime() - dayOfWeek * 86_400_000;
    const monday = new Date(Math.floor(mondayLocal / 86_400_000) * 86_400_000);
    return new Date(monday.getTime() - TZ_OFFSET_MS);
  }
  const local = date.getTime() + TZ_OFFSET_MS;
  const step = granularity === "hour" ? 3_600_000 : 86_400_000;
  const alignedLocal = Math.floor(local / step) * step;
  return new Date(alignedLocal - TZ_OFFSET_MS);
}

/** 桶起始递增一个粒度 */
function addBucket(date: Date, granularity: "hour" | "day" | "week"): Date {
  const step =
    granularity === "hour" ? 3_600_000 : granularity === "day" ? 86_400_000 : 7 * 86_400_000;
  return new Date(date.getTime() + step);
}

/** 东八区格式化为与 SQL 时间桶同源的时间桶标签 */
function formatBucket(date: Date, granularity: "hour" | "day" | "week"): string {
  const local = new Date(date.getTime() + TZ_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  if (granularity === "hour") return `${ymd} ${pad(local.getUTCHours())}:00`;
  return ymd;
}

/** 生成 [start, end) 内完整粒度桶标签（覆盖空桶，供单系列趋势补零） */
function generateBuckets(start: Date, end: Date, granularity: "hour" | "day" | "week"): string[] {
  const max = granularity === "hour" ? 1000 : granularity === "day" ? 500 : 200;
  const buckets: string[] = [];
  let cur = alignBucketStart(start, granularity);
  let guard = 0;
  while (cur.getTime() < end.getTime() && guard < max) {
    buckets.push(formatBucket(cur, granularity));
    cur = addBucket(cur, granularity);
    guard++;
  }
  return buckets;
}

/** 计算占比（分母为 0 时返回 0） */
function toRatio(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

/** 计算指标变化率（上期无数据时返回 null） */
function calcDelta(current: number, previous: number): AnalyticsDelta {
  if (previous === 0) return { value: null };
  return { value: (current - previous) / previous };
}

/** 按业务时区将绝对时刻平移若干年（dayjs 规约闰日，避免手工字符串解析进位） */
function shiftYears(date: Date, years: number): Date {
  return dayjs(date).tz(DEFAULT_TASK_TIME_ZONE).add(years, "year").toDate();
}

/** 计算周期对比窗口：环比取上一等长区间，同比取去年同期（业务时区对齐） */
function buildCompareWindow(
  start: Date,
  end: Date,
  compare: "previous" | "year",
): { start: Date; end: Date } {
  if (compare === "previous") {
    const length = end.getTime() - start.getTime();
    return {
      start: new Date(start.getTime() - length),
      end: new Date(start.getTime()),
    };
  }
  return { start: shiftYears(start, -1), end: shiftYears(end, -1) };
}

/** 概览指标：总事件数 + 独立用户数 */
async function getAnalyticsKpis(
  start: Date,
  end: Date,
  eventNames: string[] | undefined,
): Promise<{ totalEvents: number; uniqueUsers: number }> {
  const row = (
    await db.all<{ total: number; users: number }>(sql`
		SELECT COUNT(*) AS total,
		       COUNT(DISTINCT COALESCE(${trackEventTable.userId}, ${trackEventTable.sessionId})) AS users
		  FROM ${trackEventTable}
		 WHERE ${trackEventTable.time} >= ${start.getTime()}
		   AND ${trackEventTable.time} < ${end.getTime()}
		   ${eventNameFilter(eventNames)}
	`)
  )[0];
  return {
    totalEvents: row?.total ?? 0,
    uniqueUsers: row?.users ?? 0,
  };
}

/** 趋势序列：按时间桶 × 分组字段聚合；开启周期对比时单序列补齐空桶为 0 保证对齐 */
async function getAnalyticsTrend(
  start: Date,
  end: Date,
  granularity: "hour" | "day" | "week",
  metric: "count" | "users",
  eventNames: string[] | undefined,
  breakdown: string | undefined,
  compareTag: TimeSeriesPoint["compare"],
  fillGaps: boolean,
): Promise<TimeSeriesPoint[]> {
  const bucket = timeBucketExpr(granularity);
  const agg = metricAggExpr(metric);
  const series = seriesExpr(breakdown);
  const list = await db.all<{
    date: string;
    series: string | null;
    value: number;
  }>(sql`
		SELECT ${bucket} AS date, ${series} AS series, ${agg} AS value
		  FROM ${trackEventTable}
		 WHERE ${trackEventTable.time} >= ${start.getTime()}
		   AND ${trackEventTable.time} < ${end.getTime()}
		   ${eventNameFilter(eventNames)}
		 GROUP BY date, series
		 ORDER BY date, series
	`);
  // 单系列（无拆解维度且未多选事件）且开启周期对比时补齐空桶为 0，
  // 保证 current 与对比窗口桶数一致，前端按索引对齐不致错位
  const singleSeries = !breakdown && !(eventNames && eventNames.length > 1);
  if (singleSeries && fillGaps) {
    const buckets = generateBuckets(start, end, granularity);
    const rowMap = new Map((list ?? []).map((r) => [r.date, r.value] as const));
    return buckets.map((date) => ({
      date,
      value: rowMap.get(date) ?? 0,
      compare: compareTag,
    }));
  }
  return (list ?? []).map((r) => ({
    date: r.date,
    value: r.value ?? 0,
    series: r.series ?? undefined,
    compare: compareTag,
  }));
}

/** 事件明细排行：按事件聚合次数与用户数 */
async function getEventRanking(
  start: Date,
  end: Date,
  eventNames: string[] | undefined,
): Promise<Omit<EventRankingItem, "ratio">[]> {
  const list = await db.all<{ name: string; count: number; users: number }>(sql`
		SELECT ${trackEventTable.name} AS name,
		       COUNT(*) AS count,
		       COUNT(DISTINCT COALESCE(${trackEventTable.userId}, ${trackEventTable.sessionId})) AS users
		  FROM ${trackEventTable}
		 WHERE ${trackEventTable.time} >= ${start.getTime()}
		   AND ${trackEventTable.time} < ${end.getTime()}
		   ${eventNameFilter(eventNames)}
		 GROUP BY ${trackEventTable.name}
		 ORDER BY count DESC
		 LIMIT 30
	`);
  return (list ?? []).map((r) => ({
    name: r.name,
    count: r.count,
    users: r.users,
  }));
}

/** 用户属性/来源分布：对固定维度分别取 Top 值 */
async function getDimensionDistributions(
  start: Date,
  end: Date,
  metric: "count" | "users",
  eventNames: string[] | undefined,
): Promise<Record<string, Omit<DimensionDistributionItem, "ratio">[]>> {
  const agg = metricAggExpr(metric);
  const entries = await Promise.all(
    ANALYTICS_DIMENSION_KEYS.map(async (key) => {
      const list = await db.all<{ dim_value: string; count: number }>(sql`
				SELECT COALESCE(${propertyLabelExpr(key)}, '未知') AS dim_value,
				       ${agg} AS count
				  FROM ${trackEventTable}
				 WHERE ${trackEventTable.time} >= ${start.getTime()}
				   AND ${trackEventTable.time} < ${end.getTime()}
				   ${eventNameFilter(eventNames)}
				 GROUP BY dim_value
				 ORDER BY count DESC
				 LIMIT 10
			`);
      return [
        key,
        (list ?? []).map((r) => ({
          name: r.dim_value,
          count: r.count,
        })),
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Top 页面：PageView 事件按页面名聚合 */
async function getTopPages(start: Date, end: Date): Promise<TopPageItem[]> {
  const list = await db.all<{ page_name: string; count: number }>(sql`
		SELECT COALESCE(${propertyLabelExpr("page_name")}, '未知页面') AS page_name,
		       COUNT(*) AS count
		  FROM ${trackEventTable}
		 WHERE ${trackEventTable.name} = 'PageView'
		   AND ${trackEventTable.time} >= ${start.getTime()}
		   AND ${trackEventTable.time} < ${end.getTime()}
		 GROUP BY page_name
		 ORDER BY count DESC
		 LIMIT 20
	`);
  return (list ?? []).map((r) => ({ pageName: r.page_name, count: r.count }));
}

/** 校验拆分维度是否已注册为元属性（白名单防注入） */
async function resolveBreakdown(key: string): Promise<string | undefined> {
  const rows = await db
    .select({ key: trackPropertyMeta.key })
    .from(trackPropertyMeta)
    .where(eq(trackPropertyMeta.key, key))
    .limit(1);
  return rows.length > 0 ? key : undefined;
}

/** 执行事件分析，返回趋势、事件排行、维度分布、Top 页面与 KPI */
export async function getTrackAnalytics(query: TrackAnalyticsQuery): Promise<TrackAnalyticsResult> {
  const {
    endDate,
    startDate,
    granularity = "day",
    eventNames,
    metric = "count",
    breakdown,
    compare = "none",
  } = query;

  // 日期边界按业务统一时区解析，与下方时间桶的 '+8 hours' 换算对齐
  const start = toDayRange(startDate).start;
  const end = toDayRange(endDate).end;

  // 拆解维度走元属性白名单校验，非法则忽略拆解
  const validBreakdown = breakdown ? await resolveBreakdown(breakdown) : undefined;

  const [kpis, ranking, dimensions, topPages, trend] = await Promise.all([
    getAnalyticsKpis(start, end, eventNames),
    getEventRanking(start, end, eventNames),
    getDimensionDistributions(start, end, metric, eventNames),
    getTopPages(start, end),
    getAnalyticsTrend(
      start,
      end,
      granularity,
      metric,
      eventNames,
      validBreakdown,
      "current",
      compare !== "none",
    ),
  ]);

  // 周期对比：额外查询对比窗口的 KPI 与趋势并合并
  let timeSeries = trend;
  let deltaKpis: Awaited<ReturnType<typeof getAnalyticsKpis>> | null = null;
  if (compare !== "none") {
    const window = buildCompareWindow(start, end, compare);
    const [cmpKpis, cmpTrend] = await Promise.all([
      getAnalyticsKpis(window.start, window.end, eventNames),
      getAnalyticsTrend(
        window.start,
        window.end,
        granularity,
        metric,
        eventNames,
        validBreakdown,
        compare,
        true,
      ),
    ]);
    deltaKpis = cmpKpis;
    timeSeries = [...trend, ...cmpTrend];
  }

  const totalEvents = kpis.totalEvents;
  const eventRanking: EventRankingItem[] = ranking.map((r) => ({
    ...r,
    ratio: toRatio(r.count, totalEvents),
  }));
  const dimensionDistributions = Object.fromEntries(
    Object.entries(dimensions).map(([key, items]) => [
      key,
      items.map((d) => ({ ...d, ratio: toRatio(d.count, totalEvents) })),
    ]),
  );

  const deltas =
    compare !== "none" && deltaKpis
      ? {
          totalEvents: calcDelta(kpis.totalEvents, deltaKpis.totalEvents),
          uniqueUsers: calcDelta(kpis.uniqueUsers, deltaKpis.uniqueUsers),
        }
      : undefined;

  return {
    totalEvents,
    uniqueUsers: kpis.uniqueUsers,
    timeSeries,
    eventRanking,
    dimensionDistributions,
    topPages,
    deltas,
  };
}
