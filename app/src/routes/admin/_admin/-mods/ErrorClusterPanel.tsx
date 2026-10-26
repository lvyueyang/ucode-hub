/**
 * 仪表盘高频错误面板：近段窗口错误数 / 错误率与错误消息聚类
 */
import { Alert, Card, Empty, Spin, Statistic } from "antd";
import { AnalyticsRanking } from "#/components/admin/analytics";
import type { DashboardErrorSummary } from "#/services/dashboard/dashboard.types";

interface ErrorClusterPanelProps {
  /** 未加载完成时为 null */
  summary: DashboardErrorSummary | null;
  loading: boolean;
  /** 是否具备日志查看权限（决定空态文案） */
  allowed: boolean;
}

export function ErrorClusterPanel({ summary, loading, allowed }: ErrorClusterPanelProps) {
  // total 为 0 表示窗口内没匹配到日志数据（日志文件按启动日命名且不轮转，窗口可能落空），
  // 与「有日志但零错误」区分展示，避免显示成虚假的 0 / 0.00%
  const hasData = summary !== null && summary.total > 0;
  const windowLabel = hasData
    ? summary.windowDays === 1
      ? "今日"
      : `近 ${summary.windowDays} 日`
    : undefined;

  return (
    <Card
      size="small"
      title="高频错误"
      style={{ height: "100%" }}
      extra={windowLabel && <span className="text-xs text-muted-foreground">{windowLabel}</span>}
    >
      <Spin spinning={loading}>
        {hasData ? (
          <>
            {summary.truncated && (
              <Alert
                type="warning"
                showIcon
                className="mb-3"
                message="日志扫描已达上限，结果为部分统计"
              />
            )}
            <div className="mb-3 flex gap-6">
              <Statistic title="错误数" value={summary.errorCount} />
              <Statistic title="错误率" value={summary.errorRate * 100} precision={2} suffix="%" />
            </div>
            <AnalyticsRanking
              items={summary.topErrors.map((item) => ({
                name: item.message,
                count: item.count,
                ratio: summary.errorCount > 0 ? item.count / summary.errorCount : 0,
              }))}
              nameTitle="错误消息"
              countTitle="次数"
              emptyText="暂无错误日志"
              height={220}
            />
          </>
        ) : (
          <div className="flex h-[280px] items-center justify-center">
            <Empty description={allowed ? "窗口内暂无日志数据" : "暂无日志查看权限"} />
          </div>
        )}
      </Spin>
    </Card>
  );
}
