/**
 * 事件趋势折线图配置组装：处理多事件/维度拆解分组与周期对比对齐
 * 纯函数（可单测）：时间序列长表 → @ant-design/charts LineConfig
 */
import type { LineConfig } from "@ant-design/charts";
import type { TimeSeriesPoint } from "#/services/track/track.types";
import { ANALYTICS_SERIES_COLORS, compareLabel } from "./analytics.shared";

/** 趋势筛选条件（用于确定分组与周期对比） */
export interface TrendChartFilter {
  breakdown?: string;
  eventNames?: string[];
  compare: "none" | "previous" | "year";
}

/** 趋势图构建结果 */
export interface TrendChartResult {
  config: LineConfig | null;
  /** 是否含系列分组（图例显示依据） */
  seriesField: string | null;
}

/** 按日期升序（ISO 同粒度直接 localeCompare 即可） */
function sortByDate(items: TimeSeriesPoint[]): TimeSeriesPoint[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 组装趋势折线配置。
 * 规则：维度拆解 > 多事件 作为分组；仅当无分组时周期对比才作为系列（本期实线、上期/同期虚线）。
 * 周期对比时对比序列按桶序号对齐到当前窗口的日期，保证两条线共享 x 轴。
 */
export function buildTrendConfig(
  data: TimeSeriesPoint[],
  filter: TrendChartFilter,
): TrendChartResult {
  if (!data.length) return { config: null, seriesField: null };

  const hasBreakdown = Boolean(filter.breakdown);
  const multiEvent = (filter.eventNames?.length ?? 0) > 1;
  const hasCompare = filter.compare !== "none";
  // 分组优先级：维度拆解 > 多事件；周期对比只在无分组时作为系列
  const useSeries = hasBreakdown || multiEvent;
  const useCompareAsSeries = !useSeries && hasCompare;

  // 拆出当前窗口与对比窗口序列
  const current = data.filter((d) => d.compare === "current" || d.compare === undefined);
  const compareItems = data.filter((d) => d.compare !== undefined && d.compare !== "current");

  let chartData: Record<string, string | number | boolean>[];
  let seriesField: string | null;

  if (useSeries) {
    // 维度拆解/多事件：只取当前窗口序列（忽略周期对比），以 series 分组着色
    const currentOnly = data.filter((d) => d.compare === "current" || d.compare === undefined);
    chartData = currentOnly.map((d) => ({
      date: d.date,
      value: d.value,
      series: d.series ?? "全部",
    }));
    seriesField = "series";
  } else if (useCompareAsSeries && compareItems.length) {
    // 周期对比：本期与上期/同期对齐到同一日期桶（桶序号匹配）
    const cur = sortByDate(current);
    const cmp = sortByDate(compareItems);
    const label = compareLabel(filter.compare);
    chartData = [
      ...cur.map((d) => ({ date: d.date, value: d.value, series: "本期" })),
      ...cmp.map((d, i) => ({
        date: cur[i]?.date ?? d.date,
        value: d.value,
        series: label,
        dashed: true,
      })),
    ];
    seriesField = "series";
  } else {
    // 单序列：简化为 {date, value}，不显示图例
    chartData = data.map((d) => ({ date: d.date, value: d.value }));
    seriesField = null;
  }

  const config: LineConfig = {
    data: chartData,
    xField: "date",
    yField: "value",
    height: 320,
    autoFit: true,
    color: ANALYTICS_SERIES_COLORS,
    axis: {
      x: { title: false, labelAutoRotate: true },
      y: { title: false },
    },
    legend: seriesField ? { color: { position: "top" } } : undefined,
    point: { size: 3 },
    // 周期对比用虚线区分上期/同期
    lineStyle: useCompareAsSeries
      ? (datum: Record<string, unknown>) => ({
          lineWidth: 2,
          ...(datum.dashed ? { lineDash: [4, 4] } : {}),
        })
      : { lineWidth: 2 },
    ...(seriesField ? { colorField: seriesField } : {}),
  };

  return { config, seriesField };
}
