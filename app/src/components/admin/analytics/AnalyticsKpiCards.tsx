/**
 * 分析概览 KPI 卡：统一网格布局、等高卡片与周期对比涨跌展示，供各分析页复用
 */

import { Card, Statistic } from "antd";

/** 单个 KPI 项：value 支持已格式化文本；delta 为变化率（0.1 = 上涨 10%），null 表示无对比，undefined 表示不展示涨跌 */
export interface AnalyticsKpiItem {
  title: string;
  /** 展示值：数值走 Statistic 千分位，字符串（如字节可读化结果）直接展示 */
  value: number | string;
  precision?: number;
  suffix?: string;
  delta?: number | null;
  /** 值下方的补充说明，与 delta 可同时展示 */
  hint?: string;
}

/** 大屏目标列数 */
type KpiColumns = 3 | 4 | 5 | 6;

interface AnalyticsKpiCardsProps {
  items: AnalyticsKpiItem[];
  /** 大屏每行列数，默认 4 */
  columns?: KpiColumns;
}

/**
 * 断点栅格：窄屏 1 列 → 小屏 2 列 → 大屏按目标列数铺满
 * 用 CSS Grid 而非 24 栅格，因 5 列无法在 24 栅格内均分；
 * 3 / 4 / 6 列的断点与改造前保持一致，避免影响既有分析页
 */
const GRID_CLASSES: Record<KpiColumns, string> = {
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-6",
};

/** 涨跌徽标：涨 success、跌 danger、持平弱化、无对比显示占位 */
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs text-foreground-tertiary">— 无对比</span>;
  }
  const percent = `${(Math.abs(delta) * 100).toFixed(1)}%`;
  if (delta === 0) {
    return <span className="text-xs font-medium text-foreground-tertiary">持平（{percent}）</span>;
  }
  const up = delta > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
      {up ? "↑" : "↓"} {percent}
    </span>
  );
}

/** 分析概览 KPI 卡网格：同排卡片等高，补充信息贴底对齐 */
export function AnalyticsKpiCards({ items, columns = 4 }: AnalyticsKpiCardsProps) {
  return (
    <div className={`grid gap-4 ${GRID_CLASSES[columns]}`}>
      {items.map((item) => {
        const hasFooter = item.hint !== undefined || item.delta !== undefined;

        return (
          <Card
            key={item.title}
            size="small"
            styles={{
              body: {
                height: "100%",
                display: "flex",
                flexDirection: "column",
              },
            }}
          >
            <Statistic
              title={item.title}
              value={item.value}
              precision={item.precision}
              suffix={item.suffix}
            />
            {hasFooter && (
              <div className="mt-auto pt-2">
                {item.hint && <div className="text-xs text-foreground-tertiary">{item.hint}</div>}
                {item.delta !== undefined && (
                  <div className={item.hint ? "mt-1" : undefined}>
                    <DeltaBadge delta={item.delta} />
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
