/**
 * 仪表盘高风险操作面板：高风险操作量、活跃操作人与高风险动作排行
 */
import { Card, Empty, Statistic } from "antd";
import { AnalyticsRanking } from "#/components/admin/analytics";
import { ACTION_LABELS } from "#/constants/operation-log-meta";
import type { DashboardRiskOps } from "#/services/dashboard/dashboard.types";

interface RiskOpsPanelProps {
  /** 未授权时为 null */
  riskOps: DashboardRiskOps | null;
}

export function RiskOpsPanel({ riskOps }: RiskOpsPanelProps) {
  if (!riskOps) {
    return (
      <Card size="small" title="高风险操作" style={{ height: "100%" }}>
        <div className="flex h-[280px] items-center justify-center">
          <Empty description="暂无操作日志查看权限" />
        </div>
      </Card>
    );
  }

  return (
    <Card size="small" title="高风险操作" style={{ height: "100%" }}>
      <div className="mb-3 flex gap-6">
        <Statistic title="高风险操作" value={riskOps.highRiskTotal} />
        <Statistic title="活跃操作人" value={riskOps.activeOperators} />
      </div>
      <AnalyticsRanking
        items={riskOps.highRiskActions}
        nameTitle="动作"
        countTitle="次数"
        labelMap={ACTION_LABELS}
        emptyText="暂无高风险操作"
        height={220}
      />
    </Card>
  );
}
