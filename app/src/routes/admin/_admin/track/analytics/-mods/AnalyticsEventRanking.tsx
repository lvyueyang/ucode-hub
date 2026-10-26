/**
 * 事件明细排行表：事件名 / 次数 / 用户数 / 占比，点击行可下钻趋势图
 */
import type { TableProps } from "antd";
import { Empty, Progress, Table, Tag } from "antd";
import type { EventRankingItem, TrackEventMetaRecord } from "#/services/track/track.types";
import { formatPercent } from "./analytics.shared";

interface AnalyticsEventRankingProps {
  items: EventRankingItem[];
  eventMetas: TrackEventMetaRecord[];
  /** 点击事件行后下钻选中的事件 */
  onDrill?: (name: string) => void;
}

const DRILL_COLOR = "var(--s-primary)";

export function AnalyticsEventRanking({ items, eventMetas, onDrill }: AnalyticsEventRankingProps) {
  const labelMap = new Map(
    eventMetas.map((m) => [m.name, { label: m.label, category: m.category }]),
  );

  const columns: TableProps<EventRankingItem>["columns"] = [
    {
      title: "事件",
      dataIndex: "name",
      key: "name",
      render: (name: string) => {
        const meta = labelMap.get(name);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{meta?.label ?? name}</span>
            {meta && (
              <Tag color="blue" className="w-fit leading-4">
                {meta.category}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "次数",
      dataIndex: "count",
      key: "count",
      align: "right",
      render: (v: number) => v.toLocaleString("zh-CN"),
    },
    {
      title: "用户数",
      dataIndex: "users",
      key: "users",
      align: "right",
      render: (v: number) => v.toLocaleString("zh-CN"),
    },
    {
      title: "占比",
      dataIndex: "ratio",
      key: "ratio",
      width: 220,
      render: (ratio: number) => (
        <div className="flex items-center gap-2">
          <Progress
            percent={ratio * 100}
            size="small"
            strokeColor={DRILL_COLOR}
            format={() => formatPercent(ratio)}
            className="flex-1"
          />
        </div>
      ),
    },
  ];

  if (!items.length) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <Empty description="暂无事件数据" />
      </div>
    );
  }

  return (
    <Table<EventRankingItem>
      rowKey="name"
      columns={columns}
      dataSource={items}
      size="small"
      pagination={false}
      scroll={{ y: 320 }}
      onRow={(record) => ({
        onClick: () => onDrill?.(record.name),
        style: { cursor: onDrill ? "pointer" : "default" },
      })}
    />
  );
}
