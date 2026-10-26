/**
 * 用户属性/来源分布面板：设备类型 / 来源 / 操作系统 / 浏览器 横向条形排行
 */
import { Card, Col, Empty, Row } from "antd";
import { AnalyticsChart } from "#/components/admin/analytics";
import type {
  DimensionDistributionItem,
  TrackPropertyMetaRecord,
} from "#/services/track/track.types";
import { ANALYTICS_DIMENSION_CARDS, ANALYTICS_SERIES_COLORS } from "./analytics.shared";

interface AnalyticsDimensionPanelProps {
  dimensions: Record<string, DimensionDistributionItem[]>;
  propertyMetas: TrackPropertyMetaRecord[];
}

const BAR_HEIGHT = 210;

export function AnalyticsDimensionPanel({
  dimensions,
  propertyMetas,
}: AnalyticsDimensionPanelProps) {
  const labelMap = new Map(propertyMetas.map((p) => [p.key, p.label]));

  const cards = ANALYTICS_DIMENSION_CARDS.filter((card) => (dimensions[card.key]?.length ?? 0) > 0);

  if (!cards.length) {
    return (
      <Card title="用户属性与来源" size="small">
        <Empty description="暂无维度分布数据" />
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => {
        const label = labelMap.get(card.key) ?? card.label;
        const items = dimensions[card.key] ?? [];
        const data = items.map((d) => ({
          name: truncateName(d.name),
          value: d.count,
        }));
        return (
          <Col xs={24} md={12} key={card.key}>
            <Card title={label} size="small">
              <AnalyticsChart
                kind="bar"
                config={{
                  data,
                  xField: "value",
                  yField: "name",
                  height: BAR_HEIGHT,
                  autoFit: true,
                  color: [ANALYTICS_SERIES_COLORS[1]],
                  axis: {
                    x: { title: false },
                    y: { title: false },
                  },
                  label: {
                    text: "value",
                    position: "right",
                    style: { fontSize: 11 },
                  },
                }}
                height={BAR_HEIGHT}
              />
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}

/** 维度值可能为 URL 等长文本，展示时截断防止 y 轴标签溢出 */
function truncateName(name: string): string {
  return name.length > 10 ? `${name.slice(0, 10)}…` : name;
}
