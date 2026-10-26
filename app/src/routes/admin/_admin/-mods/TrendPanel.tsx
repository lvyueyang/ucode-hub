/**
 * 仪表盘趋势面板：访问量（埋点）与系统资源指标可切换的单张折线图
 */
import { Card, Empty, Segmented, Space } from "antd";
import { useMemo, useState } from "react";
import { AnalyticsChart } from "#/components/admin/analytics";
import type {
  DashboardRange,
  DashboardSections,
  DashboardTraffic,
} from "#/services/dashboard/dashboard.types";
import type { SystemMetricHistory } from "#/services/system-metric/system-metric.types";
import {
  buildResourceTrendConfig,
  buildTrafficTrendConfig,
  type DashboardTrendMetric,
  TREND_METRIC_OPTIONS,
} from "./dashboard.charts";

interface TrendPanelProps {
  range: DashboardRange;
  traffic: DashboardTraffic | null;
  resourceTrend: SystemMetricHistory | null;
  sections: DashboardSections;
}

export function TrendPanel({ range, traffic, resourceTrend, sections }: TrendPanelProps) {
  // 按权限过滤可切换指标，避免展示无法取数的选项
  const available = useMemo(
    () =>
      TREND_METRIC_OPTIONS.filter((option) =>
        option.source === "track" ? sections.traffic : sections.system,
      ),
    [sections.traffic, sections.system],
  );
  const [metric, setMetric] = useState<DashboardTrendMetric>("pv");
  // 选中的指标在切换权限/选项后可能失效，回退到首个可用项
  const active = available.find((option) => option.value === metric) ?? available[0];

  const config = useMemo(() => {
    if (!active) return null;
    if (active.source === "track") {
      return traffic ? buildTrafficTrendConfig(traffic.timeSeries) : null;
    }
    if (!resourceTrend || !active.metric) return null;
    return buildResourceTrendConfig(resourceTrend.points, active.metric);
  }, [active, traffic, resourceTrend]);

  const hints = useMemo(() => {
    if (!active) return [];
    if (active.source === "track") {
      return [traffic?.granularity === "hour" ? "按小时" : "按天"];
    }
    return [
      active.unit ? `单位 ${active.unit}` : "",
      // 系统采样仅保留 7 天，近 30 日范围下需明确实际口径
      range === "30d" ? "系统指标保留 7 天" : "",
    ].filter(Boolean);
  }, [active, traffic, range]);

  const emptyText = !active
    ? "暂无趋势查看权限"
    : active.source === "track"
      ? "暂无访问数据"
      : "暂无采样数据";

  return (
    <Card
      size="small"
      title="趋势"
      style={{ height: "100%" }}
      extra={
        <Space size={12}>
          <span className="text-xs text-muted-foreground">{hints.join(" · ")}</span>
          <Segmented
            size="small"
            value={active?.value}
            options={available.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            onChange={(value) => setMetric(value as DashboardTrendMetric)}
          />
        </Space>
      }
    >
      {config ? (
        <AnalyticsChart kind="line" config={config} height={320} />
      ) : (
        <div className="flex h-[320px] items-center justify-center">
          <Empty description={emptyText} />
        </div>
      )}
    </Card>
  );
}
