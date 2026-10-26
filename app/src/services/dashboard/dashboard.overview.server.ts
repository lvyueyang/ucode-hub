/**
 * 仪表盘概览服务层：按域权限编排业务规模、访问流量、系统实时、存储占用与操作审计
 *
 * 数据来源均为既有服务（stats / track / system-metric / operation-log），本模块只做聚合与权限分块，
 * 不重复定义统计口径，保证仪表盘与各分析页数字一致
 */
import { DEFAULT_TASK_TIME_ZONE } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import {
  getStorageUsage,
  getSystemMetricHistory,
  getSystemOverview,
} from "#/services/system-metric/system-metric.server";
import type {
  SystemMetricHistory,
  SystemMetricRange,
} from "#/services/system-metric/system-metric.types";
import { getTrackAnalytics } from "#/services/track/track.analytics";
import {
  getOperationActionCounts,
  getOperationLogAnalytics,
  HIGH_RISK_ACTIONS,
} from "#/shared-services/operation-log/operation-log.analytics";
import {
  dashboardResourceTrendCache,
  dashboardRiskOpsCache,
  dashboardTrafficCache,
} from "./dashboard.cache";
import { getClientUserTotal } from "./dashboard.server";
import {
  DASHBOARD_RESOURCE_METRICS,
  type DashboardOverview,
  type DashboardRange,
  type DashboardRiskOps,
  type DashboardTraffic,
} from "./dashboard.types";

/** 各时间范围对应的回溯天数（含当天） */
const RANGE_DAYS: Record<DashboardRange, number> = {
  today: 0,
  "7d": 6,
  "30d": 29,
};

/**
 * 页面范围 → 系统采样范围。
 * 系统采样仅保留 7 天、粒度只有 1h / 24h / 7d，故「近 30 日」按「近 7 日」呈现
 */
const SYSTEM_RANGE_BY_DASHBOARD: Record<DashboardRange, SystemMetricRange> = {
  today: "24h",
  "7d": "7d",
  "30d": "7d",
};

/** 高风险动作排行展示条数 */
const HIGH_RISK_LIMIT = 5;

/** 解析时间范围对应的查询窗口（按业务时区，含当天） */
export function resolveDashboardWindow(range: DashboardRange): {
  startDate: string;
  endDate: string;
  granularity: "hour" | "day";
} {
  const now = dayjs().tz(DEFAULT_TASK_TIME_ZONE);
  const endDate = now.format("YYYY-MM-DD");
  return {
    startDate: now.subtract(RANGE_DAYS[range], "day").format("YYYY-MM-DD"),
    endDate,
    // 单日按小时观察波动，多日按天观察趋势
    granularity: range === "today" ? "hour" : "day",
  };
}

/** 访问流量摘要：命中缓存直接返回，未命中时执行埋点 PageView 聚合后写入缓存 */
async function getDashboardTraffic(range: DashboardRange): Promise<DashboardTraffic> {
  const cached = dashboardTrafficCache.get(range);
  if (cached) return cached;

  const { startDate, endDate, granularity } = resolveDashboardWindow(range);
  const result = await getTrackAnalytics({
    startDate,
    endDate,
    granularity,
    eventNames: ["PageView"],
    metric: "count",
    compare: "previous",
  });

  const pageViews = result.totalEvents;
  const traffic: DashboardTraffic = {
    pageViews,
    uniqueVisitors: result.uniqueUsers,
    pagesPerVisitor: result.uniqueUsers > 0 ? result.totalEvents / result.uniqueUsers : 0,
    timeSeries: result.timeSeries,
    // 埋点分析面向通用事件，指标命名与仪表盘的 PV/UV 语义对齐
    deltas: result.deltas
      ? {
          pageViews: result.deltas.totalEvents,
          uniqueVisitors: result.deltas.uniqueUsers,
        }
      : undefined,
    granularity,
    topPages: result.topPages.map((page) => ({
      name: page.pageName,
      count: page.count,
      ratio: pageViews > 0 ? page.count / pageViews : 0,
    })),
  };
  dashboardTrafficCache.set(range, traffic);
  return traffic;
}

/** 趋势切换器可选系统指标集合，用于裁剪采样点 */
const RESOURCE_METRIC_SET = new Set<string>(DASHBOARD_RESOURCE_METRICS);

/** 系统资源历史趋势：按范围映射后读取采样文件并裁掉不可选指标，缓存 1 分钟 */
async function getDashboardResourceTrend(range: DashboardRange) {
  const cached = dashboardResourceTrendCache.get(range);
  if (cached) return cached;

  const history = await getSystemMetricHistory(SYSTEM_RANGE_BY_DASHBOARD[range]);
  const trend: SystemMetricHistory = {
    ...history,
    points: history.points.filter((point) => RESOURCE_METRIC_SET.has(point.metric)),
  };
  dashboardResourceTrendCache.set(range, trend);
  return trend;
}

/** 高风险操作摘要：聚合 KPI 并按白名单单独统计动作次数（不受分布 TopN 截断），缓存 1 分钟 */
async function getDashboardRiskOps(range: DashboardRange): Promise<DashboardRiskOps> {
  const cached = dashboardRiskOpsCache.get(range);
  if (cached) return cached;

  const { startDate, endDate, granularity } = resolveDashboardWindow(range);
  const [result, highRiskCounts] = await Promise.all([
    getOperationLogAnalytics({ startDate, endDate, granularity }),
    getOperationActionCounts(startDate, endDate, [...HIGH_RISK_ACTIONS]),
  ]);
  const totalOperations = result.totalOperations;
  const riskOps: DashboardRiskOps = {
    highRiskTotal: result.highRiskOperations,
    activeOperators: result.activeOperators,
    highRiskActions: highRiskCounts.slice(0, HIGH_RISK_LIMIT).map((item) => ({
      name: item.name,
      count: item.count,
      ratio: totalOperations > 0 ? item.count / totalOperations : 0,
    })),
  };
  dashboardRiskOpsCache.set(range, riskOps);
  return riskOps;
}

/**
 * 获取仪表盘概览。
 * canViewTraffic / canViewSystem / canViewLogs 由调用方（Server Function）依据当前管理员权限计算，
 * 未授权的域不发起查询，避免越权取数与无谓开销
 */
export async function getDashboardOverview(params: {
  range: DashboardRange;
  canViewTraffic: boolean;
  canViewSystem: boolean;
  canViewLogs: boolean;
}): Promise<DashboardOverview> {
  const { range, canViewTraffic, canViewSystem, canViewLogs } = params;

  const [clientUserTotal, traffic, system, storage, riskOps, resourceTrend] = await Promise.all([
    getClientUserTotal(),
    canViewTraffic ? getDashboardTraffic(range) : Promise.resolve(null),
    canViewSystem ? getSystemOverview() : Promise.resolve(null),
    canViewSystem ? getStorageUsage() : Promise.resolve(null),
    canViewLogs ? getDashboardRiskOps(range) : Promise.resolve(null),
    canViewSystem ? getDashboardResourceTrend(range) : Promise.resolve(null),
  ]);

  return {
    clientUserTotal,
    traffic,
    system,
    storage,
    riskOps,
    resourceTrend,
    sections: {
      traffic: canViewTraffic,
      system: canViewSystem,
      logs: canViewLogs,
    },
  };
}
