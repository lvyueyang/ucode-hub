/**
 * 埋点事件类型与共享常量定义
 * 本模块仅含类型与纯常量（无运行期服务依赖），服务端与客户端均安全引用
 */

import type { trackEventMeta, trackPropertyMeta } from "#/db/schema";
import type { PaginatedSortParams } from "#/types/query";

/** 事件分析固定展示的用户属性/来源维度 key（服务端聚合与前端卡片共用的单一来源） */
export const ANALYTICS_DIMENSION_KEYS = ["$device_type", "referer", "$os", "$browser"] as const;

/** JSON 值类型：覆盖可安全序列化的 JSON 基本类型（递归） */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 埋点事件属性：JSON 对象 */
export type JsonProperties = Record<string, JsonValue>;

/** 追踪事件输入 */
export interface TrackEventInput {
  time: number;
  userId?: string;
  sessionId: string;
  ip?: string;
  name: string;
  properties: JsonProperties;
}

/** 事件查询条件 */
export interface TrackEventQuery extends PaginatedSortParams {
  name?: string;
  userId?: string;
  sessionId?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

/** 事件查询结果 */
export interface TrackEventQueryResult {
  records: TrackEventRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** 事件记录 */
export interface TrackEventRecord {
  id: string;
  time: Date;
  userId: string | null;
  sessionId: string;
  ip?: string;
  name: string;
  properties: JsonProperties;
  createdAt: Date;
}

/** 事件分析查询参数 */
export interface TrackAnalyticsQuery {
  startDate: string;
  endDate: string;
  /** 时间粒度：小时 / 天 / 周 */
  granularity?: "hour" | "day" | "week";
  /** 多选事件名（空=全部） */
  eventNames?: string[];
  /** 指标：次数 / 独立用户数 */
  metric?: "count" | "users";
  /** 维度拆解属性 key（取自事件属性的单个成员，来自元属性白名单） */
  breakdown?: string;
  /** 周期对比：无 / 环比 / 同比 */
  compare?: "none" | "previous" | "year";
}

/** 趋势序列数据点 */
export interface TimeSeriesPoint {
  date: string;
  value: number;
  /** 分组值：事件名或维度值（多序列时存在） */
  series?: string;
  /** 周期对比标记（compare!=none 时存在） */
  compare?: "current" | "previous" | "year";
}

/** 事件排行项 */
export interface EventRankingItem {
  name: string;
  count: number;
  users: number;
  /** 占比（count/totalEvents，0-1） */
  ratio: number;
}

/** 维度分布项 */
export interface DimensionDistributionItem {
  name: string;
  count: number;
  ratio: number;
}

/** 页面排行项 */
export interface TopPageItem {
  pageName: string;
  count: number;
}

/** 指标变化率（上期无数据时为 null） */
export interface AnalyticsDelta {
  value: number | null;
}

/** 事件分析结果 */
export interface TrackAnalyticsResult {
  totalEvents: number;
  uniqueUsers: number;
  timeSeries: TimeSeriesPoint[];
  eventRanking: EventRankingItem[];
  /** 用户属性/来源分布，key 为维度属性 key */
  dimensionDistributions: Record<string, DimensionDistributionItem[]>;
  topPages: TopPageItem[];
  /** 周期对比变化率（compare!=none 时存在） */
  deltas?: { totalEvents: AnalyticsDelta; uniqueUsers: AnalyticsDelta };
}

/** 元事件记录 */
export type TrackEventMetaRecord = typeof trackEventMeta.$inferSelect;

/** 元事件创建/更新参数 */
export interface TrackEventMetaInput {
  label: string;
  category: string;
  description?: string;
}

/** 元属性记录 */
export type TrackPropertyMetaRecord = typeof trackPropertyMeta.$inferSelect;

/** 元属性创建/更新参数 */
export interface TrackPropertyMetaInput {
  label: string;
  dataType?: string;
  description?: string;
}
