/**
 * 分析图表懒加载渲染器：按需加载 @ant-design/charts 组件，拆分图表库 chunk
 * 供各分析页复用（日志分析、埋点分析等）；暗色模式下自动切换 G2 暗色主题
 */

import type { BarConfig, ColumnConfig, LineConfig } from "@ant-design/charts";
import { lazy, Suspense } from "react";
import { useAdminTheme } from "../admin-theme";

const Line = lazy(() => import("@ant-design/charts").then((m) => ({ default: m.Line })));
const Column = lazy(() => import("@ant-design/charts").then((m) => ({ default: m.Column })));
const Bar = lazy(() => import("@ant-design/charts").then((m) => ({ default: m.Bar })));

export type AnalyticsChartKind = "line" | "column" | "bar";
export type AnalyticsChartConfig = LineConfig | ColumnConfig | BarConfig;

interface AnalyticsChartProps {
  kind: AnalyticsChartKind;
  config: AnalyticsChartConfig;
  height: number;
}

/** 图表外壳：统一懒加载 + Suspense 兜底，避免首屏拉入全量图表库 */
export function AnalyticsChart({ kind, config, height }: AnalyticsChartProps) {
  const { isDark } = useAdminTheme();

  return (
    <div style={{ height }}>
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center text-xs text-foreground-tertiary"
            style={{ height }}
          >
            图表加载中...
          </div>
        }
      >
        {renderChart(kind, config, isDark)}
      </Suspense>
    </div>
  );
}

/**
 * 按类型分发懒加载图表组件；kind 与 config 由调用方保证匹配。
 * G2 默认亮色主题，暗色下显式切到内置 dark 主题，使坐标轴 / 图例 / 网格 / 提示文字跟随主题
 */
function renderChart(kind: AnalyticsChartKind, config: AnalyticsChartConfig, isDark: boolean) {
  const theme = isDark ? "dark" : undefined;
  switch (kind) {
    case "line":
      return <Line {...(config as LineConfig)} theme={theme} />;
    case "column":
      return <Column {...(config as ColumnConfig)} theme={theme} />;
    case "bar":
      return <Bar {...(config as BarConfig)} theme={theme} />;
    default:
      return null;
  }
}
