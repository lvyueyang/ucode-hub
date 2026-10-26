/**
 * 运行日志分析页：筛选区 + KPI + 级别趋势 + 级别分布 + 错误消息聚类
 */

import { createFileRoute } from "@tanstack/react-router";
import { Alert, Card, Col, Empty, Row, Spin } from "antd";
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
import { LEVEL_COLORS } from "#/constants";
import type { LogAnalyticsResult } from "#/services/logs/log-analytics.server";
import { callSfn } from "#/utils/sfn-error";
import { LogAnalyticsFilter, type LogAnalyticsFilterState } from "./-mods/LogAnalyticsFilter";
import { buildLogTrendConfig } from "./-mods/log-analytics.config";
import { getLogAnalyticsSFn, type LogAnalyticsParams } from "./-mods/log-analytics.functions";

/** 级别中文名 */
const LEVEL_LABELS: Record<string, string> = {
  trace: "追踪",
  debug: "调试",
  info: "信息",
  warn: "警告",
  error: "错误",
  fatal: "致命",
};

/** 默认筛选：近 7 天、按天、全部级别 */
function defaultFilter(): LogAnalyticsFilterState {
  return {
    dateRange: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")],
    granularity: "day",
    level: "",
    keyword: undefined,
  };
}

/** 由未提交筛选生成查询参数（空值归一为 undefined） */
function toQueryParams(filter: LogAnalyticsFilterState): LogAnalyticsParams {
  return {
    startDate: filter.dateRange[0].format("YYYY-MM-DD"),
    endDate: filter.dateRange[1].format("YYYY-MM-DD"),
    granularity: filter.granularity,
    level: filter.level || undefined,
    keyword: filter.keyword || undefined,
  };
}

export const Route = createFileRoute("/admin/_admin/logs/analytics")({
  component: LogAnalyticsPage,
});

function LogAnalyticsPage() {
  const [filter, setFilter] = useState<LogAnalyticsFilterState>(defaultFilter);
  const [submitted, setSubmitted] = useState<LogAnalyticsParams>(() =>
    toQueryParams(defaultFilter()),
  );
  const [data, setData] = useState<LogAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchAnalytics = useCallback(async (params: LogAnalyticsParams) => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await callSfn(getLogAnalyticsSFn({ data: params }), {
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

  const trendConfig = data ? buildLogTrendConfig(data.timeSeries) : null;

  const kpiItems: AnalyticsKpiItem[] = data
    ? [
        { title: "日志总量", value: data.total },
        { title: "错误数", value: data.errorCount },
        {
          title: "错误率",
          value: data.errorRate * 100,
          precision: 2,
          suffix: "%",
        },
        { title: "扫描文件数", value: data.scannedFiles },
      ]
    : [];

  const levelItems: AnalyticsRankingItem[] = (data?.levelCounts ?? []).map((item) => ({
    name: LEVEL_LABELS[item.level] ?? item.level,
    count: item.count,
    ratio: data && data.total > 0 ? item.count / data.total : 0,
    tag: {
      text: item.level.toUpperCase(),
      color: LEVEL_COLORS[item.level] ?? "default",
    },
  }));

  const errorItems: AnalyticsRankingItem[] = (data?.topErrors ?? []).map((item) => ({
    name: item.message,
    count: item.count,
    ratio: data && data.errorCount > 0 ? item.count / data.errorCount : 0,
  }));

  return (
    <AdminPageContent
      title="运行日志分析"
      description="查看日志级别分布、错误率趋势与高频错误聚类"
      titleTrailing={
        <LogAnalyticsFilter
          filter={filter}
          onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
          onQuery={handleQuery}
          onReset={handleReset}
        />
      }
    >
      <Spin spinning={loading}>
        {data?.truncated && (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            message="日志扫描已达上限，结果仅覆盖部分日志，请缩小时间范围后重试"
          />
        )}

        {data && (
          <>
            {/* 概览 KPI */}
            <div className="mb-4">
              <AnalyticsKpiCards items={kpiItems} />
            </div>

            {/* 级别趋势 */}
            <Card title="级别趋势" size="small" className="mb-4">
              {trendConfig ? (
                <AnalyticsChart kind="line" config={trendConfig} height={320} />
              ) : (
                <div className="flex h-[320px] items-center justify-center">
                  <Empty description="暂无趋势数据" />
                </div>
              )}
            </Card>

            {/* 级别分布 + 错误聚类 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card title="级别分布" size="small">
                  <AnalyticsRanking
                    items={levelItems}
                    nameTitle="级别"
                    countTitle="条数"
                    emptyText="暂无日志"
                    height={320}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="高频错误聚类 Top 20" size="small">
                  <AnalyticsRanking
                    items={errorItems}
                    nameTitle="错误消息"
                    countTitle="次数"
                    emptyText="暂无错误日志"
                    height={320}
                  />
                </Card>
              </Col>
            </Row>
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
