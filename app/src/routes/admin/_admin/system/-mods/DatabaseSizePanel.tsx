/**
 * 数据库表面板：库总量与各表（数据 / 索引 / 合计 / 占比）占用明细
 */
import { ReloadOutlined } from "@ant-design/icons";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { formatDateTimeValue } from "@ucode/hub-ui-spa/table";
import type { TableProps } from "antd";
import { Button, Card, Progress, Space, Table, Tooltip } from "antd";
import type { DatabaseSizes, TableSizeEntry } from "#/services/system-metric/system-metric.types";

interface DatabaseSizePanelProps {
  data: DatabaseSizes | null;
  loading: boolean;
  /** 手动刷新（force 绕过缓存重算） */
  onRefresh: () => void;
}

export function DatabaseSizePanel({ data, loading, onRefresh }: DatabaseSizePanelProps) {
  const totalBytes = data?.databaseBytes ?? 0;
  const tables = data?.tables ?? [];

  const columns: TableProps<TableSizeEntry>["columns"] = [
    {
      title: "表名",
      dataIndex: "tableName",
      key: "tableName",
      ellipsis: true,
    },
    {
      title: "数据",
      dataIndex: "tableBytes",
      key: "tableBytes",
      align: "right",
      width: 90,
      render: (value: number) => formatBytes(value),
    },
    {
      title: "索引",
      dataIndex: "indexBytes",
      key: "indexBytes",
      align: "right",
      width: 90,
      render: (value: number) => formatBytes(value),
    },
    {
      title: "合计",
      dataIndex: "totalBytes",
      key: "totalBytes",
      align: "right",
      width: 100,
      render: (value: number) => formatBytes(value),
    },
    {
      title: "占比",
      key: "ratio",
      width: 150,
      render: (_, record) => (
        <Progress
          percent={totalBytes > 0 ? Number(((record.totalBytes / totalBytes) * 100).toFixed(1)) : 0}
          size="small"
          format={(percent) => `${percent ?? 0}%`}
        />
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={`数据库占用（库总量 ${formatBytes(totalBytes)}）`}
      extra={
        <Space size={8}>
          {data && (
            <span className="text-xs text-muted-foreground">
              统计于 {formatDateTimeValue(data.capturedAt)}
            </span>
          )}
          <Tooltip title="重新统计（绕过缓存）">
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh} />
          </Tooltip>
        </Space>
      }
    >
      <Table<TableSizeEntry>
        rowKey="tableName"
        size="small"
        columns={columns}
        dataSource={tables}
        pagination={false}
        scroll={{ y: 360 }}
      />
    </Card>
  );
}
