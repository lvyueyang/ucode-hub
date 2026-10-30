/**
 * 操作日志分析模块：KPI、操作趋势、动作/模块/操作人分布聚合
 * 与明细查询（operation-log.server）分离，独立承担分析类只读聚合
 */

import { toDayRange } from "@ucode/hub-lib/date-format";
import { and, eq, gte, inArray, like, lt, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { operationLog } from "#/db/schema";

/** 分析时间粒度 */
export type OperationAnalyticsGranularity = "hour" | "day" | "week";

/** 趋势分组维度 */
export type OperationAnalyticsBreakdown = "action" | "module";

/** 高风险动作白名单：删除、重置密码、状态变更类操作 */
export const HIGH_RISK_ACTIONS = ["delete", "reset_pwd", "change_status", "set_published"];

/** 指标变化率（上期无数据时为 null） */
export interface OperationAnalyticsDelta {
  value: number | null;
}

/** 趋势点 */
export interface OperationTrendPoint {
  date: string;
  value: number;
  series: string;
}

/** 分布/排行项 */
export interface OperationRankItem {
  name: string;
  count: number;
  ratio: number;
}

/** 操作日志分析查询参数 */
export interface OperationLogAnalyticsQuery {
  startDate: string;
  endDate: string;
  granularity?: OperationAnalyticsGranularity;
  /** 趋势分组维度，默认按动作 */
  breakdown?: OperationAnalyticsBreakdown;
  module?: string;
  action?: string;
  operatorName?: string;
  compare?: "none" | "previous";
}

/** 操作日志分析结果 */
export interface OperationLogAnalyticsResult {
  totalOperations: number;
  activeOperators: number;
  highRiskOperations: number;
  moduleCount: number;
  timeSeries: OperationTrendPoint[];
  actionDistribution: OperationRankItem[];
  moduleDistribution: OperationRankItem[];
  topOperators: OperationRankItem[];
  deltas?: {
    totalOperations: OperationAnalyticsDelta;
    activeOperators: OperationAnalyticsDelta;
  };
}

/**
 * 时间桶表达式：毫秒时间戳按秒换算后加 8 小时转东八区，再按粒度格式化（与埋点分析同口径）。
 * 周粒度取所在 ISO 周的周一（对齐 pg 的 DATE_TRUNC('week')）：
 * `weekday 0` 前进到周日（当天是周日则不动）、再回退 6 天；
 * 直接用 `weekday 1` 会让周一自身退到上一周，故不采用。
 */
function timeBucketExpr(granularity: OperationAnalyticsGranularity): SQL {
  const seconds = sql`${operationLog.createdAt} / 1000`;
  if (granularity === "hour") {
    return sql`strftime('%Y-%m-%d %H:00', ${seconds}, 'unixepoch', '+8 hours')`;
  }
  if (granularity === "week") {
    return sql`date(${seconds}, 'unixepoch', '+8 hours', 'weekday 0', '-6 days')`;
  }
  return sql`strftime('%Y-%m-%d', ${seconds}, 'unixepoch', '+8 hours')`;
}

/** 通用筛选条件：时间窗口 + 可选模块/动作/操作人（操作人模糊匹配） */
function buildFilter(start: Date, end: Date, query: OperationLogAnalyticsQuery): SQL {
  const conditions: (SQLWrapper | undefined)[] = [
    gte(operationLog.createdAt, start),
    lt(operationLog.createdAt, end),
  ];
  if (query.module) conditions.push(eq(operationLog.module, query.module));
  if (query.action) conditions.push(eq(operationLog.action, query.action));
  if (query.operatorName) {
    conditions.push(like(operationLog.operatorName, `%${query.operatorName}%`));
  }
  return and(...conditions) ?? sql`TRUE`;
}

/** 计算变化率（上期为 0 时返回 null） */
function calcDelta(current: number, previous: number): OperationAnalyticsDelta {
  if (previous === 0) return { value: null };
  return { value: (current - previous) / previous };
}

/** 为分布项补占比（分母为 0 时占比为 0） */
function withRatio(items: { name: string; count: number }[], total: number): OperationRankItem[] {
  return items.map((item) => ({
    ...item,
    ratio: total > 0 ? item.count / total : 0,
  }));
}

/** 概览指标：总量 / 活跃操作人 / 高风险操作数 / 覆盖模块数 */
async function getKpis(
  start: Date,
  end: Date,
  query: OperationLogAnalyticsQuery,
): Promise<{
  total: number;
  operators: number;
  highRisk: number;
  moduleCount: number;
}> {
  const filter = buildFilter(start, end, query);
  const row = (
    await db.all<{
      total: number;
      operators: number;
      high_risk: number;
      modules: number;
    }>(sql`
		SELECT COUNT(*) AS total,
		       COUNT(DISTINCT COALESCE(${operationLog.operatorId}, ${operationLog.operatorName})) AS operators,
		       COUNT(*) FILTER (WHERE ${inArray(operationLog.action, HIGH_RISK_ACTIONS)}) AS high_risk,
		       COUNT(DISTINCT ${operationLog.module}) AS modules
		  FROM ${operationLog}
		 WHERE ${filter}
	`)
  )[0];
  return {
    total: Number(row?.total ?? 0),
    operators: Number(row?.operators ?? 0),
    highRisk: Number(row?.high_risk ?? 0),
    moduleCount: Number(row?.modules ?? 0),
  };
}

/** 操作趋势：时间桶 × 分组维度（动作或模块） */
async function getTrend(
  start: Date,
  end: Date,
  query: OperationLogAnalyticsQuery,
): Promise<OperationTrendPoint[]> {
  const filter = buildFilter(start, end, query);
  const bucket = timeBucketExpr(query.granularity ?? "day");
  const series =
    query.breakdown === "module" ? sql`${operationLog.module}` : sql`${operationLog.action}`;
  const result = await db.all<{ bucket: string; series: string; value: number }>(sql`
		SELECT ${bucket} AS bucket, ${series} AS series, COUNT(*) AS value
		  FROM ${operationLog}
		 WHERE ${filter}
		 GROUP BY bucket, series
		 ORDER BY bucket, series
	`);
  return result.map((row) => ({
    date: row.bucket,
    value: Number(row.value ?? 0),
    series: row.series,
  }));
}

/** 按列聚合分布：动作 / 模块的 TopN */
async function getDistribution(
  start: Date,
  end: Date,
  query: OperationLogAnalyticsQuery,
  column: "action" | "module",
): Promise<{ name: string; count: number }[]> {
  const filter = buildFilter(start, end, query);
  const col = column === "action" ? operationLog.action : operationLog.module;
  const result = await db.all<{ name: string; count: number }>(sql`
		SELECT ${col} AS name, COUNT(*) AS count
		  FROM ${operationLog}
		 WHERE ${filter}
		 GROUP BY ${col}
		 ORDER BY count DESC
		 LIMIT 20
	`);
  return result.map((row) => ({
    name: row.name,
    count: Number(row.count ?? 0),
  }));
}

/** 活跃操作人 TopN */
async function getTopOperators(
  start: Date,
  end: Date,
  query: OperationLogAnalyticsQuery,
): Promise<{ name: string; count: number }[]> {
  const filter = buildFilter(start, end, query);
  const result = await db.all<{ name: string; count: number }>(sql`
		SELECT ${operationLog.operatorName} AS name, COUNT(*) AS count
		  FROM ${operationLog}
		 WHERE ${filter}
		 GROUP BY ${operationLog.operatorName}
		 ORDER BY count DESC
		 LIMIT 10
	`);
  return result.map((row) => ({
    name: row.name,
    count: Number(row.count ?? 0),
  }));
}

/**
 * 按指定动作集合聚合次数（不受分布 TopN 截断）
 * 供高风险动作等「小而关键」的集合排行使用，时间窗口按业务时区解析；
 * 仅返回计数、不返回占比，占比由调用方按总操作数（如 KPI 的 totalOperations）自行计算
 */
export async function getOperationActionCounts(
  startDate: string,
  endDate: string,
  actions: string[],
): Promise<{ name: string; count: number }[]> {
  if (!actions.length) return [];

  const start = toDayRange(startDate).start;
  const end = toDayRange(endDate).end;
  const result = await db.all<{ name: string; count: number }>(sql`
		SELECT ${operationLog.action} AS name, COUNT(*) AS count
		  FROM ${operationLog}
		 WHERE ${operationLog.createdAt} >= ${start.getTime()}
		   AND ${operationLog.createdAt} < ${end.getTime()}
		   AND ${inArray(operationLog.action, actions)}
		 GROUP BY ${operationLog.action}
		 ORDER BY count DESC
	`);
  return result.map((row) => ({
    name: row.name,
    count: Number(row.count ?? 0),
  }));
}

/** 执行操作日志分析：KPI / 趋势 / 分布 / 操作人排行，可选环比 */
export async function getOperationLogAnalytics(
  query: OperationLogAnalyticsQuery,
): Promise<OperationLogAnalyticsResult> {
  const { startDate, endDate, compare = "none" } = query;
  const start = toDayRange(startDate).start;
  const end = toDayRange(endDate).end;

  const [kpis, timeSeries, actionItems, moduleItems, operatorItems] = await Promise.all([
    getKpis(start, end, query),
    getTrend(start, end, query),
    getDistribution(start, end, query, "action"),
    getDistribution(start, end, query, "module"),
    getTopOperators(start, end, query),
  ]);

  let deltas: OperationLogAnalyticsResult["deltas"];
  if (compare === "previous") {
    const length = end.getTime() - start.getTime();
    const previous = await getKpis(new Date(start.getTime() - length), start, query);
    deltas = {
      totalOperations: calcDelta(kpis.total, previous.total),
      activeOperators: calcDelta(kpis.operators, previous.operators),
    };
  }

  return {
    totalOperations: kpis.total,
    activeOperators: kpis.operators,
    highRiskOperations: kpis.highRisk,
    moduleCount: kpis.moduleCount,
    timeSeries,
    actionDistribution: withRatio(actionItems, kpis.total),
    moduleDistribution: withRatio(moduleItems, kpis.total),
    topOperators: withRatio(operatorItems, kpis.total),
    deltas,
  };
}
