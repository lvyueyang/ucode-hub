/**
 * 仪表盘系统实时面板：进程资源水位、Server Function 错误率与磁盘容量
 */

import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { Card, Col, Progress, Row, Statistic } from "antd";
import type { StorageUsage, SystemOverview } from "#/services/system-metric/system-metric.types";

/** 字节 → 兆字节换算因子 */
const BYTES_PER_MB = 1024 * 1024;

interface SystemStatusPanelProps {
  system: SystemOverview | null;
  storage: StorageUsage | null;
}

export function SystemStatusPanel({ system, storage }: SystemStatusPanelProps) {
  if (!system) {
    return (
      <Card size="small" title="系统实时" style={{ height: "100%" }}>
        <div className="flex h-[320px] items-center justify-center text-xs text-foreground-tertiary">
          暂无系统监控查看权限
        </div>
      </Card>
    );
  }

  const errorRate =
    system.sfRequestsTotal > 0 ? (system.sfErrorsTotal / system.sfRequestsTotal) * 100 : 0;
  const filesystem = storage?.filesystem;
  const diskPercent =
    filesystem && filesystem.totalBytes > 0
      ? (filesystem.usedBytes / filesystem.totalBytes) * 100
      : 0;

  return (
    // 与趋势卡同高：根节点纵向 flex，body 占满「扣掉 header 后」的剩余高度，
    // 指标区垂直居中、磁盘容量贴底（body 若直接设 height:100% 会超出卡片 header 高度）
    <Card
      size="small"
      title="系统实时"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      styles={{
        body: {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <div className="flex flex-1 flex-col justify-center">
        <Row gutter={[12, 20]}>
          <Col span={8}>
            <Statistic title="CPU" value={system.cpuPercent} precision={2} suffix="%" />
          </Col>
          <Col span={8}>
            <Statistic
              title="常驻内存"
              value={system.memory.rss / BYTES_PER_MB}
              precision={1}
              suffix="MB"
            />
          </Col>
          <Col span={8}>
            <Statistic title="事件循环" value={system.eventLoopLag} precision={2} suffix="ms" />
          </Col>
          <Col span={8}>
            <Statistic title="累计请求" value={system.httpRequestsTotal} />
          </Col>
          <Col span={8}>
            <Statistic title="SF 错误率" value={errorRate} precision={2} suffix="%" />
          </Col>
          <Col span={8}>
            <Statistic title="活跃资源" value={system.activeResources} />
          </Col>
        </Row>
      </div>

      {filesystem && filesystem.totalBytes > 0 && (
        <div className="border-border border-t pt-4">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">磁盘容量</span>
            {/* min-w-0 让长文本真正可收缩截断，避免撑破容器 */}
            <span className="min-w-0 truncate">
              {formatBytes(filesystem.usedBytes)} / {formatBytes(filesystem.totalBytes)}
            </span>
          </div>
          <Progress percent={Number(diskPercent.toFixed(1))} size="small" />
        </div>
      )}
    </Card>
  );
}
