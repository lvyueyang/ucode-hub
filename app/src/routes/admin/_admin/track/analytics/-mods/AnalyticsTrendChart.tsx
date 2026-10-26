/**
 * 事件趋势图容器：读取分析数据与筛选条件，组装折线配置并懒加载渲染
 */
import { Empty } from "antd";
import { AnalyticsChart } from "#/components/admin/analytics";
import type { TimeSeriesPoint } from "#/services/track/track.types";
import { buildTrendConfig, type TrendChartFilter } from "./analytics.trend-config";

interface AnalyticsTrendChartProps {
  data: TimeSeriesPoint[];
  filter: TrendChartFilter;
}

const TREND_HEIGHT = 320;

export function AnalyticsTrendChart({ data, filter }: AnalyticsTrendChartProps) {
  const { config } = buildTrendConfig(data, filter);
  if (!config) {
    return (
      <div className="flex h-[320px] items-center justify-center">
        <Empty description="暂无趋势数据" />
      </div>
    );
  }
  return <AnalyticsChart kind="line" config={config} height={TREND_HEIGHT} />;
}
