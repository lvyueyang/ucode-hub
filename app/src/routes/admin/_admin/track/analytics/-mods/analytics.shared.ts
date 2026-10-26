/**
 * 事件分析共享常量与纯函数：系列配色、维度卡定义、格式化工具
 * 图表系列需多色区分，使用固定调色板（非状态语义色，不随主题令牌切换）
 */

import { ANALYTICS_DIMENSION_KEYS } from "#/services/track/track.types";

/** 系列配色：多事件/维度/周期对比统一取色（复用管理端共享调色板） */
export { ANALYTICS_SERIES_COLORS } from "#/components/admin/analytics/palette";

/** 用户属性/来源分布卡片定义（key 与顺序由后端 ANALYTICS_DIMENSION_KEYS 单一维护） */
export interface AnalyticsDimensionCard {
  key: string;
  label: string;
}

/** 维度 key → 展示名 */
const DIMENSION_LABELS: Record<string, string> = {
  $device_type: "设备类型",
  referer: "来源",
  $os: "操作系统",
  $browser: "浏览器",
};

export const ANALYTICS_DIMENSION_CARDS: AnalyticsDimensionCard[] = ANALYTICS_DIMENSION_KEYS.map(
  (key) => ({
    key,
    label: DIMENSION_LABELS[key] ?? key,
  }),
);

/** 格式化百分比（0-1 → 百分比字符串，保留 1 位小数） */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 周期对比标签 */
export function compareLabel(compare: "none" | "previous" | "year"): string {
  if (compare === "previous") return "上期";
  if (compare === "year") return "去年同期";
  return "本期";
}
