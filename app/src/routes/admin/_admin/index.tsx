/**
 * 管理端仪表盘：系统健康、访问流量、用户规模与风险概览
 * 各域按权限分块，未授权区块不展示；系统快照 30 秒轮询，日志错误摘要独立懒加载
 */
import { ReloadOutlined } from "@ant-design/icons";
import { createFileRoute } from "@tanstack/react-router";
import { formatBytes } from "@ucode/hub-lib/format-bytes";
import { Button, Col, Empty, Row, Segmented, Space, Spin } from "antd";
import { useCallback, useEffect, useState } from "react";
import { AdminPageContent } from "#/components/admin";
import { AnalyticsKpiCards, type AnalyticsKpiItem } from "#/components/admin/analytics";
import type {
  DashboardErrorSummary,
  DashboardOverview,
  DashboardRange,
} from "#/services/dashboard/dashboard.types";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { DashboardHealthStrip } from "./-mods/DashboardHealthStrip";
import {
  getDashboardErrorSummarySFn,
  getDashboardOverviewSFn,
  getDashboardSystemSnapshotSFn,
} from "./-mods/dashboard.functions";
import { ErrorClusterPanel } from "./-mods/ErrorClusterPanel";
import { QuickLinksPanel } from "./-mods/QuickLinksPanel";
import { RiskOpsPanel } from "./-mods/RiskOpsPanel";
import { SystemStatusPanel } from "./-mods/SystemStatusPanel";
import { TopPagesPanel } from "./-mods/TopPagesPanel";
import { TrendPanel } from "./-mods/TrendPanel";

/** 默认时间范围 */
const DEFAULT_RANGE: DashboardRange = "7d";

/** 实时快照轮询间隔（毫秒） */
const OVERVIEW_POLL_INTERVAL = 30_000;

/** 时间范围选项 */
const RANGE_OPTIONS: { label: string; value: DashboardRange }[] = [
  { label: "今日", value: "today" },
  { label: "近 7 日", value: "7d" },
  { label: "近 30 日", value: "30d" },
];

export const Route = createFileRoute("/admin/_admin/")({
  component: Dashboard,
  loader: async () => {
    try {
      return await getDashboardOverviewSFn({ data: { range: DEFAULT_RANGE } });
    } catch (err) {
      console.error("[dashboard]", (err as Error).message);
      return null;
    }
  },
});

/** 组装 KPI 卡：流量域未授权时省略访问指标，系统域未授权时省略存储占用 */
function buildKpiItems(overview: DashboardOverview): AnalyticsKpiItem[] {
  const { clientUserTotal, traffic, storage } = overview;
  const items: AnalyticsKpiItem[] = [];

  if (traffic) {
    items.push(
      {
        title: "页面浏览 PV",
        value: traffic.pageViews,
        delta: traffic.deltas?.pageViews.value,
      },
      {
        title: "独立访客 UV",
        value: traffic.uniqueVisitors,
        delta: traffic.deltas?.uniqueVisitors.value,
      },
      {
        title: "人均浏览",
        value: traffic.pagesPerVisitor,
        precision: 2,
        suffix: "次/人",
      },
    );
  }

  items.push({ title: "客户端用户总数", value: clientUserTotal });

  if (storage) {
    items.push({
      title: "存储占用",
      value: formatBytes(storage.totalBytes),
      hint: `${storage.fileCount} 个文件`,
    });
  }

  return items;
}

function Dashboard() {
  const initial = Route.useLoaderData();
  const [range, setRange] = useState<DashboardRange>(DEFAULT_RANGE);
  const [overview, setOverview] = useState<DashboardOverview | null>(initial);
  const [loading, setLoading] = useState(false);
  const [errorSummary, setErrorSummary] = useState<DashboardErrorSummary | null>(null);
  const [errorLoading, setErrorLoading] = useState(false);
  // 日志摘要查询：随范围变化走缓存，手动刷新时 force 绕过缓存重扫
  const [errorQuery, setErrorQuery] = useState<{
    range: DashboardRange;
    force?: boolean;
  }>({ range: DEFAULT_RANGE });

  /** 拉取概览：silent 用于后台刷新（失败仅保留 console 诊断） */
  const refresh = useCallback(async (next: DashboardRange, silent: boolean) => {
    if (silent) {
      const [data] = await sfnUnwrap(getDashboardOverviewSFn({ data: { range: next } }), {
        silent: true,
      });
      if (data) setOverview(data);
      return;
    }
    setLoading(true);
    try {
      const data = await callSfn(getDashboardOverviewSFn({ data: { range: next } }), {
        error: "仪表盘数据加载失败，请稍后重试",
      });
      setOverview(data);
    } catch {
      // callSfn 已提示
    } finally {
      setLoading(false);
    }
  }, []);

  // 实时快照轮询：仅刷新进程实时指标，避免重复触发重量级聚合
  const systemVisible = overview?.sections.system ?? false;
  useEffect(() => {
    if (!systemVisible) return;
    const timer = setInterval(async () => {
      const [data] = await sfnUnwrap(getDashboardSystemSnapshotSFn(), {
        silent: true,
      });
      if (data) setOverview((prev) => (prev ? { ...prev, system: data } : prev));
    }, OVERVIEW_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [systemVisible]);

  // 日志错误摘要：按需加载，日志分析需扫描文件，独立于概览请求
  const logsVisible = overview?.sections.logs ?? false;
  useEffect(() => {
    if (!logsVisible) {
      setErrorSummary(null);
      setErrorLoading(false);
      return;
    }
    let cancelled = false;
    setErrorLoading(true);
    void (async () => {
      const [data] = await sfnUnwrap(getDashboardErrorSummarySFn({ data: errorQuery }), {
        silent: true,
      });
      if (cancelled) return;
      setErrorSummary(data ?? null);
      setErrorLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [logsVisible, errorQuery]);

  const handleRangeChange = (next: DashboardRange) => {
    setRange(next);
    setErrorQuery({ range: next });
    void refresh(next, false);
  };

  /** 手动刷新：概览受自身短 TTL 缓存约束，日志摘要强制重扫以拿到最新结果 */
  const handleRefresh = () => {
    setErrorQuery((prev) => ({ ...prev, range, force: true }));
    void refresh(range, false);
  };

  return (
    <AdminPageContent
      title="仪表盘"
      description="系统健康、访问流量、用户规模与风险概览"
      extra={
        <Space size={8}>
          <Segmented<DashboardRange>
            value={range}
            options={RANGE_OPTIONS}
            onChange={handleRangeChange}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={handleRefresh} />
        </Space>
      }
    >
      <Spin spinning={loading}>
        {overview ? (
          <>
            {overview.system && (
              <div className="mb-4">
                <DashboardHealthStrip system={overview.system} />
              </div>
            )}

            <div className="mb-4">
              <AnalyticsKpiCards items={buildKpiItems(overview)} columns={5} />
            </div>

            <Row gutter={[16, 16]} align="stretch" className="mb-4">
              <Col xs={24} xl={16}>
                <TrendPanel
                  range={range}
                  traffic={overview.traffic}
                  resourceTrend={overview.resourceTrend}
                  sections={overview.sections}
                />
              </Col>
              <Col xs={24} xl={8}>
                <SystemStatusPanel system={overview.system} storage={overview.storage} />
              </Col>
            </Row>

            <Row gutter={[16, 16]} align="stretch" className="mb-4">
              <Col xs={24} xl={8}>
                <TopPagesPanel items={overview.traffic?.topPages ?? null} />
              </Col>
              <Col xs={24} xl={8}>
                <ErrorClusterPanel
                  summary={errorSummary}
                  loading={errorLoading}
                  allowed={overview.sections.logs}
                />
              </Col>
              <Col xs={24} xl={8}>
                <RiskOpsPanel riskOps={overview.riskOps} />
              </Col>
            </Row>

            <QuickLinksPanel sections={overview.sections} />
          </>
        ) : (
          <div className="flex h-[400px] items-center justify-center">
            <Empty description="暂无数据" />
          </div>
        )}
      </Spin>
    </AdminPageContent>
  );
}
