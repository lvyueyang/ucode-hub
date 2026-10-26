/**
 * 仪表盘快捷入口：跳转各分析页，按当前权限过滤
 */
import {
  AuditOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  LineChartOutlined,
} from "@ant-design/icons";
import { Link } from "@tanstack/react-router";
import { Button, Card, Space } from "antd";
import { type ReactNode, useMemo } from "react";
import type { DashboardSections } from "#/services/dashboard/dashboard.types";

/** 快捷入口项：to 为具体路由字面量，便于路由类型校验 */
interface QuickLink {
  key: string;
  to:
    | "/admin/track/analytics"
    | "/admin/logs/analytics"
    | "/admin/operation-logs/analytics"
    | "/admin/system/monitor";
  label: string;
  icon: ReactNode;
}

interface QuickLinksPanelProps {
  sections: DashboardSections;
}

export function QuickLinksPanel({ sections }: QuickLinksPanelProps) {
  const links = useMemo<QuickLink[]>(() => {
    const next: QuickLink[] = [];
    if (sections.traffic) {
      next.push({
        key: "track",
        to: "/admin/track/analytics",
        label: "事件分析",
        icon: <LineChartOutlined />,
      });
    }
    if (sections.logs) {
      next.push(
        {
          key: "logs",
          to: "/admin/logs/analytics",
          label: "运行日志分析",
          icon: <FileSearchOutlined />,
        },
        {
          key: "operations",
          to: "/admin/operation-logs/analytics",
          label: "操作日志分析",
          icon: <AuditOutlined />,
        },
      );
    }
    if (sections.system) {
      next.push({
        key: "system",
        to: "/admin/system/monitor",
        label: "系统监控",
        icon: <DashboardOutlined />,
      });
    }
    return next;
  }, [sections.traffic, sections.logs, sections.system]);

  if (!links.length) return null;

  return (
    <Card size="small" title="快捷入口">
      <Space size={12} wrap>
        {links.map((link) => (
          <Link key={link.key} to={link.to}>
            <Button icon={link.icon}>{link.label}</Button>
          </Link>
        ))}
      </Space>
    </Card>
  );
}
