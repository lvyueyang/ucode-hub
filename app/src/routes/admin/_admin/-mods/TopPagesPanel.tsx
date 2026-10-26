/**
 * 仪表盘 Top 页面面板：PageView 页面浏览排行
 */
import { Card } from "antd";
import { AnalyticsRanking } from "#/components/admin/analytics";
import type { DashboardRankItem } from "#/services/dashboard/dashboard.types";

interface TopPagesPanelProps {
  /** 未授权或无数据时为 null */
  items: DashboardRankItem[] | null;
}

export function TopPagesPanel({ items }: TopPagesPanelProps) {
  return (
    <Card size="small" title="Top 页面" style={{ height: "100%" }}>
      <AnalyticsRanking
        items={items ?? []}
        nameTitle="页面"
        countTitle="浏览量"
        emptyText={items ? "暂无访问数据" : "暂无埋点数据查看权限"}
        height={280}
      />
    </Card>
  );
}
