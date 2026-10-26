/**
 * 仪表盘图表配置组装：纯函数（可单测）
 */
import type { LineConfig } from "@ant-design/charts";
import { ANALYTICS_SERIES_COLORS } from "#/components/admin/analytics/palette";
import type { DashboardResourceMetric } from "#/services/dashboard/dashboard.types";
import type {
  SystemMetricHistoryMetric,
  SystemMetricHistoryPoint,
} from "#/services/system-metric/system-metric.types";
import type { TimeSeriesPoint } from "#/services/track/track.types";

/** 仪表盘趋势可切换指标：pv 来自埋点，其余复用服务端可选系统指标集合 */
export type DashboardTrendMetric = "pv" | DashboardResourceMetric;

/** 趋势指标选项 */
export interface TrendMetricOption {
  label: string;
  value: DashboardTrendMetric;
  /** 数据来源：埋点序列 / 系统采样序列 */
  source: "track" | "system";
  /** 系统采样指标键（source=system 时必填，受服务端可选指标集合约束） */
  metric?: DashboardResourceMetric;
  /** 展示单位 */
  unit?: string;
}

/** 趋势指标选项：顺序即切换器展示顺序 */
export const TREND_METRIC_OPTIONS: TrendMetricOption[] = [
  { label: "PV", value: "pv", source: "track" },
  {
    label: "请求数",
    value: "httpRequests",
    source: "system",
    metric: "httpRequests",
    unit: "次",
  },
  {
    label: "CPU",
    value: "cpuPercent",
    source: "system",
    metric: "cpuPercent",
    unit: "%",
  },
  { label: "内存", value: "rss", source: "system", metric: "rss", unit: "MB" },
  {
    label: "延迟",
    value: "eventLoopLag",
    source: "system",
    metric: "eventLoopLag",
    unit: "ms",
  },
];

/** 系统指标原始值 → 展示值换算（仅内存需从字节转 MB，其余原样） */
const RESOURCE_SCALE: Partial<Record<SystemMetricHistoryMetric, number>> = {
  rss: 1 / 1024 / 1024,
};

/**
 * 组装页面浏览趋势折线：本期实线、上期虚线。
 * 对比窗口点位按桶序号对齐到本期日期，保证两线共享 x 轴
 */
export function buildTrafficTrendConfig(points: TimeSeriesPoint[]): LineConfig | null {
  if (!points.length) return null;

  const current = points.filter(
    (point) => point.compare === "current" || point.compare === undefined,
  );
  const previous = points.filter((point) => point.compare === "previous");
  const data = [
    ...current.map((point) => ({
      date: point.date,
      value: point.value,
      series: "本期",
      dashed: false,
    })),
    ...previous.map((point, index) => ({
      date: current[index]?.date ?? point.date,
      value: point.value,
      series: "上期",
      dashed: true,
    })),
  ];

  return {
    data,
    xField: "date",
    yField: "value",
    colorField: "series",
    height: 320,
    autoFit: true,
    // 顶部预留图例空间，避免图例与靠上的数据点重叠
    insetTop: 32,
    color: ANALYTICS_SERIES_COLORS,
    axis: {
      x: { title: false, labelAutoRotate: true },
      y: { title: false },
    },
    legend: { color: { position: "top" } },
    point: { size: 3 },
    // 上期用虚线区分，避免与本期实线混淆
    lineStyle: (datum: Record<string, unknown>) => ({
      lineWidth: 2,
      ...(datum.dashed ? { lineDash: [4, 4] } : {}),
    }),
  };
}

/** 组装系统资源趋势折线：单序列无图例，按指标取对应采样点并换算单位 */
export function buildResourceTrendConfig(
  points: SystemMetricHistoryPoint[],
  metric: SystemMetricHistoryMetric,
): LineConfig | null {
  const scale = RESOURCE_SCALE[metric] ?? 1;
  const data = points
    .filter((point) => point.metric === metric)
    .map((point) => ({ date: point.date, value: point.value * scale }));
  if (!data.length) return null;

  return {
    data,
    xField: "date",
    yField: "value",
    height: 320,
    autoFit: true,
    color: ANALYTICS_SERIES_COLORS[0],
    axis: {
      x: { title: false, labelAutoRotate: true },
      y: { title: false },
    },
    point: { size: 3 },
    lineStyle: { lineWidth: 2 },
  };
}
