/**
 * Top 页面面板：PageView 事件页面排行，柱状图 + 表格双视图切换
 */
import { Card, Empty, Table, Tabs, Tag } from "antd";
import { AnalyticsChart } from "#/components/admin/analytics";
import type { TopPageItem } from "#/services/track/track.types";
import { ANALYTICS_SERIES_COLORS } from "./analytics.shared";

interface AnalyticsTopPagesProps {
  topPages: TopPageItem[];
}

const COLUMN_HEIGHT = 320;

export function AnalyticsTopPages({ topPages }: AnalyticsTopPagesProps) {
  if (!topPages.length) {
    return (
      <Card title="Top 页面 (PageView)" size="small">
        <Empty description="暂无页面数据" />
      </Card>
    );
  }

  const columnConfig = {
    data: topPages.map((p) => ({ page: p.pageName, value: p.count })),
    xField: "page",
    yField: "value",
    height: COLUMN_HEIGHT,
    autoFit: true,
    color: [ANALYTICS_SERIES_COLORS[0]],
    axis: {
      x: {
        title: false,
        labelAutoRotate: true,
        labelAutoHide: true,
      },
      y: { title: false },
    },
  };

  const tableColumns = [
    {
      title: "页面",
      dataIndex: "pageName",
      key: "pageName",
      render: (v: string) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: "浏览次数",
      dataIndex: "count",
      key: "count",
      align: "right" as const,
      render: (v: number) => v.toLocaleString("zh-CN"),
    },
  ];

  return (
    <Card title="Top 页面 (PageView)" size="small">
      <Tabs
        size="small"
        items={[
          {
            key: "chart",
            label: "柱状图",
            children: <AnalyticsChart kind="column" config={columnConfig} height={COLUMN_HEIGHT} />,
          },
          {
            key: "table",
            label: "表格",
            children: (
              <Table<TopPageItem>
                rowKey="pageName"
                columns={tableColumns}
                dataSource={topPages}
                size="small"
                pagination={false}
                scroll={{ y: 300 }}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
