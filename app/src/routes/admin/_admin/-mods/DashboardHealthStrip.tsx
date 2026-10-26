/**
 * 仪表盘健康条：依赖可用性、进程运行时长与最近采样时间
 */

import { formatDateTimeValue } from "@ucode/hub-ui-spa/table";
import { Card, Space, Tag } from "antd";
import type { SystemOverview } from "#/services/system-metric/system-metric.types";
import { formatUptime } from "./dashboard.formatters";

interface DashboardHealthStripProps {
  system: SystemOverview;
}

/** 健康状态圆点：正常绿色、异常红色 */
function StatusDot({ healthy }: { healthy: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${healthy ? "bg-success" : "bg-danger"}`} />
  );
}

export function DashboardHealthStrip({ system }: DashboardHealthStripProps) {
  const sample = system.lastSample;
  // 尚未落盘采样时依赖健康未知，按正常展示避免误报
  const dbUp = sample?.dbUp ?? true;
  const storageUp = sample?.storageUp ?? true;
  const healthy = dbUp && storageUp;

  return (
    <Card size="small">
      <Space size={24} wrap>
        <span className="flex items-center gap-2 font-medium text-foreground">
          <StatusDot healthy={healthy} />
          系统运行{healthy ? "正常" : "异常"}
        </span>
        <span className="flex items-center gap-1 text-sm">
          数据库
          <Tag color={dbUp ? "green" : "red"}>{dbUp ? "可用" : "不可用"}</Tag>
          {sample?.dbLatencyMs !== null && sample?.dbLatencyMs !== undefined && (
            <span className="text-xs text-muted-foreground">{sample.dbLatencyMs} ms</span>
          )}
        </span>
        <span className="flex items-center gap-1 text-sm">
          存储目录
          <Tag color={storageUp ? "green" : "red"}>{storageUp ? "可用" : "不可用"}</Tag>
        </span>
        <span className="text-xs text-muted-foreground">
          运行时长 {formatUptime(system.uptime)}
        </span>
        {sample && (
          <span className="text-xs text-muted-foreground">
            最近采样 {formatDateTimeValue(sample.time)}
          </span>
        )}
      </Space>
    </Card>
  );
}
