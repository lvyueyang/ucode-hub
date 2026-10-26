/**
 * 运行日志分析图表配置组装：级别趋势折线
 * 纯函数（可单测）：聚合结果 → @ant-design/charts LineConfig
 */

import type { LineConfig } from "@ant-design/charts";
import { ANALYTICS_SERIES_COLORS } from "#/components/admin/analytics";
import type { LogTrendPoint } from "#/services/logs/log-analytics.server";

/** 组装日志级别趋势折线配置：按级别多系列着色 */
export function buildLogTrendConfig(points: LogTrendPoint[]): LineConfig | null {
  if (!points.length) return null;
  return {
    data: points.map((p) => ({
      date: p.date,
      value: p.value,
      series: p.series,
    })),
    xField: "date",
    yField: "value",
    colorField: "series",
    height: 320,
    autoFit: true,
    color: ANALYTICS_SERIES_COLORS,
    axis: {
      x: { title: false, labelAutoRotate: true },
      y: { title: false },
    },
    legend: { color: { position: "top" } },
    point: { size: 3 },
    lineStyle: { lineWidth: 2 },
  };
}
