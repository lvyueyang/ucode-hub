/**
 * 事件分析页面：交互式分析工作台
 * 筛选区（时间/事件/指标/维度/周期/粒度）+ KPI + 趋势 + 事件排行 + 属性分布 + Top 页面
 */

import { createFileRoute } from "@tanstack/react-router";
import { Card, Col, Empty, Row, Spin } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { AdminListPage } from "#/components/admin";
import { AnalyticsKpiCards, type AnalyticsKpiItem } from "#/components/admin/analytics";
import { getTrackEventMetaSFn, getTrackPropertyMetaSFn } from "#/services/track/track.functions";
import type {
  TrackAnalyticsResult,
  TrackEventMetaRecord,
  TrackPropertyMetaRecord,
} from "#/services/track/track.types";
import { callSfn } from "#/utils/sfn-error";
import { AnalyticsDimensionPanel } from "./-mods/AnalyticsDimensionPanel";
import { AnalyticsEventRanking } from "./-mods/AnalyticsEventRanking";
import { AnalyticsFilterBar, type AnalyticsFilterState } from "./-mods/AnalyticsFilterBar";
import { AnalyticsTopPages } from "./-mods/AnalyticsTopPages";
import { AnalyticsTrendChart } from "./-mods/AnalyticsTrendChart";
import { type AnalyticsQueryParams, getTrackAnalyticsSFn } from "./-mods/analytics.functions";

export const Route = createFileRoute("/admin/_admin/track/analytics/")({
  component: TrackAnalyticsPage,
  // 元事件/元属性为低频静态数据，随路由加载供筛选与标签补全
  loader: async () => {
    const [eventMetas, propertyMetas] = await Promise.all([
      getTrackEventMetaSFn().catch(() => [] as TrackEventMetaRecord[]),
      getTrackPropertyMetaSFn().catch(() => [] as TrackPropertyMetaRecord[]),
    ]);
    return { eventMetas, propertyMetas };
  },
});

/** 默认筛选：近 7 天按天、次数指标、无事件与维度、不对比 */
function defaultFilter(): AnalyticsFilterState {
  return {
    dateRange: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")],
    granularity: "day",
    eventNames: [],
    metric: "count",
    breakdown: undefined,
    compare: "none",
  };
}

/** 由未提交筛选生成已提交的查询参数（空事件/维度归一为 undefined） */
function toQueryParams(filter: AnalyticsFilterState): AnalyticsQueryParams {
  return {
    startDate: filter.dateRange[0].format("YYYY-MM-DD"),
    endDate: filter.dateRange[1].format("YYYY-MM-DD"),
    granularity: filter.granularity,
    eventNames: filter.eventNames.length ? filter.eventNames : undefined,
    metric: filter.metric,
    breakdown: filter.breakdown || undefined,
    compare: filter.compare,
  };
}

/** 由分析结果派生 KPI 卡数据（无数据时返回空数组） */
function buildKpiItems(data: TrackAnalyticsResult | null): AnalyticsKpiItem[] {
  if (!data) return [];
  return [
    {
      title: "总事件数",
      value: data.totalEvents,
      delta: data.deltas?.totalEvents.value ?? null,
    },
    {
      title: "独立用户数",
      value: data.uniqueUsers,
      delta: data.deltas?.uniqueUsers.value ?? null,
    },
    {
      title: "人均事件数",
      value: data.uniqueUsers > 0 ? data.totalEvents / data.uniqueUsers : 0,
      precision: 2,
    },
    { title: "事件种类数", value: data.eventRanking.length },
  ];
}

function TrackAnalyticsPage() {
  const { eventMetas, propertyMetas } = Route.useLoaderData();
  const [filter, setFilter] = useState<AnalyticsFilterState>(defaultFilter);
  const [submitted, setSubmitted] = useState<AnalyticsQueryParams>(() =>
    toQueryParams(defaultFilter()),
  );
  const [data, setData] = useState<TrackAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchAnalytics = useCallback(async (params: AnalyticsQueryParams) => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await callSfn(getTrackAnalyticsSFn({ data: params }));
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

  const handleQuery = () => {
    setSubmitted(toQueryParams(filter));
  };

  /** 重置为默认筛选并查询 */
  const handleReset = () => {
    const next = defaultFilter();
    setFilter(next);
    setSubmitted(toQueryParams(next));
  };

  /** 事件排行下钻：聚焦该事件并立即查询 */
  const handleDrill = (name: string) => {
    setFilter((f) => ({ ...f, eventNames: [name] }));
    setSubmitted((p) => ({ ...p, eventNames: [name] }));
  };

  return (
    <AdminListPage
      title="事件分析"
      description="查看埋点事件趋势、分布和 Top 页面排行"
      filters={
        <AnalyticsFilterBar
          filter={filter}
          onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
          onQuery={handleQuery}
          onReset={handleReset}
          eventMetas={eventMetas}
          propertyMetas={propertyMetas}
        />
      }
    >
      <Spin spinning={loading}>
        {data && (
          <>
            {/* 概览 KPI */}
            <div className="mb-4">
              <AnalyticsKpiCards items={buildKpiItems(data)} />
            </div>

            {/* 事件趋势（分组依据取已提交参数） */}
            <Card title="事件趋势" size="small" className="mb-4">
              <AnalyticsTrendChart
                data={data.timeSeries}
                filter={{
                  breakdown: submitted.breakdown,
                  eventNames: submitted.eventNames,
                  compare: submitted.compare ?? "none",
                }}
              />
            </Card>

            {/* 事件明细排行 + Top 页面 */}
            <Row gutter={[16, 16]} className="mb-4">
              <Col xs={24} lg={12}>
                <Card title="事件明细排行" size="small">
                  <AnalyticsEventRanking
                    items={data.eventRanking}
                    eventMetas={eventMetas}
                    onDrill={handleDrill}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <AnalyticsTopPages topPages={data.topPages} />
              </Col>
            </Row>

            {/* 用户属性与来源分布 */}
            <AnalyticsDimensionPanel
              dimensions={data.dimensionDistributions}
              propertyMetas={propertyMetas}
            />
          </>
        )}

        {!data && !loading && (
          <div className="flex h-[400px] items-center justify-center">
            <Empty description={failed ? "查询失败，请调整筛选条件后重试" : "暂无数据"} />
          </div>
        )}
      </Spin>
    </AdminListPage>
  );
}
