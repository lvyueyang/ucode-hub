/**
 * 仪表盘模块共享类型
 */

import type { LogClusterItem } from "#/services/logs/log-analytics.server";
import type {
  StorageUsage,
  SystemMetricHistory,
  SystemMetricHistoryMetric,
  SystemOverview,
} from "#/services/system-metric/system-metric.types";
import type { AnalyticsDelta, TimeSeriesPoint } from "#/services/track/track.types";

/** 仪表盘时间范围：今日 / 近 7 日 / 近 30 日 */
export const DASHBOARD_RANGES = ["today", "7d", "30d"] as const;

/** 仪表盘时间范围 */
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/**
 * 仪表盘趋势可选的系统指标
 * 服务端据此裁剪采样点，避免回传趋势切换器用不到的指标序列；前端选项受本集合约束
 */
export const DASHBOARD_RESOURCE_METRICS = [
  "httpRequests",
  "cpuPercent",
  "rss",
  "eventLoopLag",
] as const satisfies readonly SystemMetricHistoryMetric[];

/** 仪表盘趋势可选的系统指标 */
export type DashboardResourceMetric = (typeof DASHBOARD_RESOURCE_METRICS)[number];

/** 通用排行项：名称 / 次数 / 占比（0-1） */
export interface DashboardRankItem {
  name: string;
  count: number;
  ratio: number;
}

/** 访问流量摘要：埋点 PageView 口径，含环比与 Top 页面 */
export interface DashboardTraffic {
  /** 页面浏览数 */
  pageViews: number;
  /** 独立访客数（user_id 与 session_id 去重） */
  uniqueVisitors: number;
  /** 人均浏览深度（PV / UV，UV 为 0 时为 0） */
  pagesPerVisitor: number;
  /** 趋势序列（含对比窗口点位，按桶序号对齐） */
  timeSeries: TimeSeriesPoint[];
  /** 环比变化率 */
  deltas?: { pageViews: AnalyticsDelta; uniqueVisitors: AnalyticsDelta };
  /** 趋势粒度，供图表标签使用 */
  granularity: "hour" | "day";
  /** PageView 页面排行（同一次埋点聚合免费带出，占比相对总 PV） */
  topPages: DashboardRankItem[];
}

/** 高风险操作摘要：操作审计域（log:view） */
export interface DashboardRiskOps {
  /** 高风险操作总数 */
  highRiskTotal: number;
  /** 活跃操作人数 */
  activeOperators: number;
  /** 高风险动作排行 TopN */
  highRiskActions: DashboardRankItem[];
}

/** 运行日志错误摘要：独立懒加载，窗口为今日 / 近 7 日 */
export interface DashboardErrorSummary {
  total: number;
  errorCount: number;
  /** 错误率（0-1） */
  errorRate: number;
  /** 高频错误聚类 TopN */
  topErrors: LogClusterItem[];
  /** 是否因触达扫描行数上限而截断 */
  truncated: boolean;
  /** 实际统计窗口天数（日志分析上限 7 天） */
  windowDays: number;
}

/** 概览区块可用性：按当前管理员权限计算，前端据此隐藏区块 */
export interface DashboardSections {
  traffic: boolean;
  system: boolean;
  logs: boolean;
}

/** 仪表盘概览聚合结果：未授权区块恒为 null */
export interface DashboardOverview {
  /** 未删除的客户端用户总数（仅需 dashboard:view 权限） */
  clientUserTotal: number;
  traffic: DashboardTraffic | null;
  system: SystemOverview | null;
  /** STORAGE_DIR 占用统计（含磁盘容量），系统域权限门控 */
  storage: StorageUsage | null;
  /** 高风险操作摘要，操作审计域权限门控 */
  riskOps: DashboardRiskOps | null;
  /** 系统资源历史趋势（按页面范围映射到 24h / 7d），系统域权限门控 */
  resourceTrend: SystemMetricHistory | null;
  sections: DashboardSections;
}
