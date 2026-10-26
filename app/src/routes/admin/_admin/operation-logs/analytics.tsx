/**
 * 操作日志分析页：筛选区 + KPI + 操作趋势 + 动作/模块分布 + 活跃操作人排行
 */

import { createFileRoute } from "@tanstack/react-router";
import { Card, Col, Empty, Row, Spin } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { AdminPageContent } from "#/components/admin";
import {
  AnalyticsChart,
  AnalyticsKpiCards,
  type AnalyticsKpiItem,
  AnalyticsRanking,
  type AnalyticsRankingItem,
} from "#/components/admin/analytics";
import { ACTION_LABELS, MODULE_LABELS } from "#/constants/operation-log-meta";
import type { OperationLogAnalyticsResult } from "#/shared-services/operation-log/operation-log.analytics";
import { callSfn } from "#/utils/sfn-error";
import {
  OperationLogAnalyticsFilter,
  type OperationLogAnalyticsFilterState,
} from "./-mods/OperationLogAnalyticsFilter";
import {
  buildOperationDistributionConfig,
  buildOperationTrendConfig,
} from "./-mods/operation-log-analytics.config";
import { getOperationLogModulesSFn } from "./-mods/operation-logs.functions";
import {
  getOperationLogAnalyticsSFn,
  type OperationLogAnalyticsParams,
} from "./-mods/operation-logs-analytics.functions";

/** 默认筛选：近 7 天、按天、按动作分组、不对比 */
function defaultFilter(): OperationLogAnalyticsFilterState {
  return {
    dateRange: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")],
    granularity: "day",
    breakdown: "action",
    module: "",
    action: "",
    operatorName: undefined,
    compare: "none",
  };
}

/** 由未提交筛选生成查询参数（空值归一为 undefined） */
function toQueryParams(filter: OperationLogAnalyticsFilterState): OperationLogAnalyticsParams {
  return {
    startDate: filter.dateRange[0].format("YYYY-MM-DD"),
    endDate: filter.dateRange[1].format("YYYY-MM-DD"),
    granularity: filter.granularity,
    breakdown: filter.breakdown,
    module: filter.module || undefined,
    action: filter.action || undefined,
    operatorName: filter.operatorName || undefined,
    compare: filter.compare,
  };
}

export const Route = createFileRoute("/admin/_admin/operation-logs/analytics")({
  component: OperationLogAnalyticsPage,
  loader: async () => {
    const modules = await getOperationLogModulesSFn();
    return { modules };
  },
});

function OperationLogAnalyticsPage() {
  const { modules } = Route.useLoaderData();
  const [filter, setFilter] = useState<OperationLogAnalyticsFilterState>(defaultFilter);
  const [submitted, setSubmitted] = useState<OperationLogAnalyticsParams>(() =>
    toQueryParams(defaultFilter()),
  );
  const [data, setData] = useState<OperationLogAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchAnalytics = useCallback(async (params: OperationLogAnalyticsParams) => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await callSfn(getOperationLogAnalyticsSFn({ data: params }), {
        error: "分析查询失败，请稍后重试",
      });
      setData(result);
    } catch {
      // callSfn 已提示
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // 已提交参数变化时自动查询（含首次挂载）
  useEffect(() => {
    void fetchAnalytics(submitted);
  }, [fetchAnalytics, submitted]);

  const handleQuery = () => setSubmitted(toQueryParams(filter));
  const handleReset = () => {
    const next = defaultFilter();
    setFilter(next);
    setSubmitted(toQueryParams(next));
  };

  /** 趋势折线与动作分布配置（无数据时为 null） */
  const trendConfig = data ? buildOperationTrendConfig(data.timeSeries) : null;
  const actionConfig = data
    ? buildOperationDistributionConfig(data.actionDistribution, ACTION_LABELS)
    : null;

  const kpiItems: AnalyticsKpiItem[] = data
    ? [
        {
          title: "操作总数",
          value: data.totalOperations,
          delta: data.deltas?.totalOperations.value ?? null,
        },
        {
          title: "活跃操作人",
          value: data.activeOperators,
          delta: data.deltas?.activeOperators.value ?? null,
        },
        { title: "高风险操作", value: data.highRiskOperations },
        { title: "覆盖模块数", value: data.moduleCount },
      ]
    : [];

  const moduleItems: AnalyticsRankingItem[] = (data?.moduleDistribution ?? []).map((item) => ({
    name: item.name,
    count: item.count,
    ratio: item.ratio,
  }));
  const operatorItems: AnalyticsRankingItem[] = (data?.topOperators ?? []).map((item) => ({
    name: item.name,
    count: item.count,
    ratio: item.ratio,
  }));

  return (
    <AdminPageContent
      title="操作日志分析"
      description="查看操作量趋势、动作/模块分布与活跃操作人"
      titleTrailing={
        <OperationLogAnalyticsFilter
          filter={filter}
          onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
          onQuery={handleQuery}
          onReset={handleReset}
          modules={modules}
        />
      }
    >
      <Spin spinning={loading}>
        {data && (
          <>
            {/* 概览 KPI */}
            <div className="mb-4">
              <AnalyticsKpiCards items={kpiItems} />
            </div>

            {/* 操作趋势 */}
            <Card title="操作趋势" size="small" className="mb-4">
              {trendConfig ? (
                <AnalyticsChart kind="line" config={trendConfig} height={320} />
              ) : (
                <div className="flex h-[320px] items-center justify-center">
                  <Empty description="暂无趋势数据" />
                </div>
              )}
            </Card>

            {/* 动作分布 + 模块分布 */}
            <Row gutter={[16, 16]} className="mb-4">
              <Col xs={24} lg={12}>
                <Card title="动作分布" size="small">
                  {actionConfig ? (
                    <AnalyticsChart kind="column" config={actionConfig} height={280} />
                  ) : (
                    <div className="flex h-[280px] items-center justify-center">
                      <Empty description="暂无数据" />
                    </div>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="模块分布" size="small">
                  <AnalyticsRanking
                    items={moduleItems}
                    nameTitle="模块"
                    countTitle="操作数"
                    labelMap={MODULE_LABELS}
                    emptyText="暂无数据"
                    height={280}
                  />
                </Card>
              </Col>
            </Row>

            {/* 活跃操作人 */}
            <Card title="活跃操作人 Top 10" size="small">
              <AnalyticsRanking
                items={operatorItems}
                nameTitle="操作人"
                countTitle="操作数"
                emptyText="暂无数据"
                height={280}
              />
            </Card>
          </>
        )}

        {!data && !loading && (
          <div className="flex h-[400px] items-center justify-center">
            <Empty description={failed ? "查询失败，请调整筛选条件后重试" : "暂无数据"} />
          </div>
        )}
      </Spin>
    </AdminPageContent>
  );
}
