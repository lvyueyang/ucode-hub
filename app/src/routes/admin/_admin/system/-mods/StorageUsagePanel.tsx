/**
 * 存储占用面板：STORAGE_DIR 总量、顶层条目分解与所在文件系统容量
 */
import { ReloadOutlined } from "@ant-design/icons";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { formatDateTimeValue } from "@ucode/hub-ui-spa/table";
import { Alert, Button, Card, Empty, Progress, Space, Statistic, Tooltip } from "antd";
import type { StorageUsage } from "#/services/system-metric/system-metric.types";

interface StorageUsagePanelProps {
  data: StorageUsage | null;
  loading: boolean;
  /** 手动刷新（force 绕过缓存重算） */
  onRefresh: () => void;
}

export function StorageUsagePanel({ data, loading, onRefresh }: StorageUsagePanelProps) {
  const entries = data?.entries ?? [];
  const maxBytes = entries[0]?.bytes ?? 0;
  const filesystemPercent =
    data && data.filesystem.totalBytes > 0
      ? (data.filesystem.usedBytes / data.filesystem.totalBytes) * 100
      : 0;

  return (
    <Card
      size="small"
      title="存储占用"
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
      {data?.truncated && (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message="文件数已达统计上限，占用结果为部分统计"
        />
      )}

      <Space size={24} className="mb-4">
        <Statistic title="STORAGE_DIR 占用" value={formatBytes(data?.totalBytes ?? 0)} />
        <Statistic title="文件数" value={data?.fileCount ?? 0} />
      </Space>

      {data && data.filesystem.totalBytes > 0 && (
        <div className="mb-4">
          <div className="mb-1 text-xs text-muted-foreground">所在文件系统</div>
          <Progress
            percent={Number(filesystemPercent.toFixed(1))}
            size="small"
            format={() =>
              `${formatBytes(data.filesystem.usedBytes)} / ${formatBytes(
                data.filesystem.totalBytes,
              )}（可用 ${formatBytes(data.filesystem.freeBytes)}）`
            }
          />
        </div>
      )}

      <div className="mb-1 text-xs text-muted-foreground">顶层条目</div>
      {entries.length === 0 ? (
        <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((entry) => (
            <div key={entry.name} className="flex items-center gap-3">
              <span className="w-28 truncate text-sm" title={entry.name}>
                {entry.name}
              </span>
              <Progress
                percent={maxBytes > 0 ? (entry.bytes / maxBytes) * 100 : 0}
                size="small"
                showInfo={false}
                className="flex-1"
              />
              <span className="w-20 text-right text-xs text-muted-foreground">
                {formatBytes(entry.bytes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
