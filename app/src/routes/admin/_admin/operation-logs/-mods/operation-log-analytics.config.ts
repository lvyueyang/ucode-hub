/**
 * 操作日志分析图表配置组装：趋势折线、分布柱状
 * 纯函数（可单测）：聚合结果 → @ant-design/charts 配置
 */

import type { ColumnConfig, LineConfig } from "@ant-design/charts";
import { ANALYTICS_SERIES_COLORS } from "#/components/admin/analytics";
import type {
  OperationRankItem,
  OperationTrendPoint,
} from "#/shared-services/operation-log/operation-log.analytics";

/** 组装操作趋势折线配置：按分组维度（动作/模块）多系列着色 */
export function buildOperationTrendConfig(points: OperationTrendPoint[]): LineConfig | null {
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

/** 组装分布柱状配置：名称经中文映射后展示，单色填充 */
export function buildOperationDistributionConfig(
  items: OperationRankItem[],
  labelMap: Record<string, string>,
): ColumnConfig | null {
  if (!items.length) return null;
  return {
    data: items.map((item) => ({
      name: labelMap[item.name] ?? item.name,
      value: item.count,
    })),
    xField: "name",
    yField: "value",
    height: 280,
    autoFit: true,
    color: ANALYTICS_SERIES_COLORS[0],
    axis: {
      x: { title: false, labelAutoRotate: true },
      y: { title: false },
    },
    legend: false,
  };
}
