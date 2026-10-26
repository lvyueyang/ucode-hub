/**
 * 分析排行表：TopN 名称 / 次数 / 占比，供分布与排行类分析复用
 */

import type { TableProps } from "antd";
import { Empty, Progress, Table, Tag } from "antd";

/** 排行项：ratio 为占比（0-1），任一项存在时展示占比列 */
export interface AnalyticsRankingItem {
  name: string;
  count: number;
  ratio?: number;
  /** 名称旁的可选标签（如模块着色） */
  tag?: { text: string; color?: string };
}

interface AnalyticsRankingProps {
  items: AnalyticsRankingItem[];
  nameTitle: string;
  countTitle?: string;
  emptyText?: string;
  /** 名称中文映射：命中时覆盖展示名 */
  labelMap?: Record<string, string>;
  /** 表体滚动高度，默认 320 */
  height?: number;
}

/** 占比进度条取主题主色（图表类多色由系列调色板负责，此处为单指标语义色） */
const PROGRESS_COLOR = "var(--s-primary)";

export function AnalyticsRanking({
  items,
  nameTitle,
  countTitle = "次数",
  emptyText = "暂无数据",
  labelMap,
  height = 320,
}: AnalyticsRankingProps) {
  const hasRatio = items.some((item) => item.ratio !== undefined);

  const columns: TableProps<AnalyticsRankingItem>["columns"] = [
    {
      title: nameTitle,
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{labelMap?.[name] ?? name}</span>
          {record.tag && (
            <Tag
              color={record.tag.color ?? "default"}
              className="leading-4"
              style={{ marginInlineEnd: 0 }}
            >
              {record.tag.text}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: countTitle,
      dataIndex: "count",
      key: "count",
      align: "right",
      width: 100,
      render: (v: number) => v.toLocaleString("zh-CN"),
    },
    ...(hasRatio
      ? [
          {
            title: "占比",
            dataIndex: "ratio",
            key: "ratio",
            width: 180,
            render: (ratio: number | undefined) => (
              <Progress
                percent={(ratio ?? 0) * 100}
                size="small"
                strokeColor={PROGRESS_COLOR}
                format={() => `${((ratio ?? 0) * 100).toFixed(1)}%`}
              />
            ),
          },
        ]
      : []),
  ];

  if (!items.length) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <Empty description={emptyText} />
      </div>
    );
  }

  return (
    <Table<AnalyticsRankingItem>
      rowKey={(record, index) => `${record.name}-${index}`}
      columns={columns}
      dataSource={items}
      size="small"
      pagination={false}
      scroll={{ y: height }}
    />
  );
}
