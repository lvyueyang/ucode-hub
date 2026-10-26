/**
 * 仪表盘缓存实例
 * 归属：dashboardTrafficCache / dashboardResourceTrendCache / dashboardRiskOpsCache 仅由
 *   dashboard.overview.server 操作；dashboardErrorSummaryCache 仅由 dashboard.logs.server 操作
 *
 * 说明：缓存内容均为全局聚合数据，与访问者身份无关，故权限门控在缓存读取之外进行，
 * 缓存键仅取时间范围，不含权限维度
 */
import { MemoryCache } from "@ucode/hub-lib/cache";
import type { SystemMetricHistory } from "#/services/system-metric/system-metric.types";
import type { DashboardErrorSummary, DashboardRiskOps, DashboardTraffic } from "./dashboard.types";

/** 常规聚合缓存 TTL：1 分钟，平衡新鲜度与查询成本 */
const DEFAULT_TTL_MS = 60_000;

/** 日志摘要缓存 TTL：5 分钟，日志分析需扫描文件，成本最高 */
const ERROR_SUMMARY_TTL_MS = 5 * 60_000;

/** 访问流量摘要缓存 */
export const dashboardTrafficCache = new MemoryCache<DashboardTraffic>({
  defaultTTL: DEFAULT_TTL_MS,
});

/** 系统资源历史趋势缓存 */
export const dashboardResourceTrendCache = new MemoryCache<SystemMetricHistory>({
  defaultTTL: DEFAULT_TTL_MS,
});

/** 高风险操作摘要缓存 */
export const dashboardRiskOpsCache = new MemoryCache<DashboardRiskOps>({
  defaultTTL: DEFAULT_TTL_MS,
});

/** 运行日志错误摘要缓存 */
export const dashboardErrorSummaryCache = new MemoryCache<DashboardErrorSummary>({
  defaultTTL: ERROR_SUMMARY_TTL_MS,
});
