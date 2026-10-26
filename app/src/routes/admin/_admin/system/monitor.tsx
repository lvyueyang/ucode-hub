/**
 * 系统监控页：实时运行快照 + 资源趋势 + 存储占用 + 数据库表占用
 */

import { createFileRoute } from "@tanstack/react-router";
import { formatDateTimeValue } from "@ucode/hub-ui-spa/table";
import { Alert, Card, Col, Empty, Row, Select, Space, Spin, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import { AdminPageContent } from "#/components/admin";
import {
  AnalyticsChart,
  AnalyticsKpiCards,
  type AnalyticsKpiItem,
} from "#/components/admin/analytics";
import type {
  DatabaseSizes,
  StorageUsage,
  SystemMetricHistory,
  SystemMetricHistoryMetric,
  SystemMetricRange,
  SystemOverview,
} from "#/services/system-metric/system-metric.types";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";
import { DatabaseSizePanel } from "./-mods/DatabaseSizePanel";
import { StorageUsagePanel } from "./-mods/StorageUsagePanel";
import { buildHistoryConfig, HISTORY_METRIC_OPTIONS } from "./-mods/system-monitor.config";
import {
  getDatabaseSizesSFn,
  getStorageUsageSFn,
  getSystemMetricHistorySFn,
  getSystemOverviewSFn,
} from "./-mods/system-monitor.functions";

/** 实时快照轮询间隔（毫秒） */
const OVERVIEW_POLL_INTERVAL = 5000;

/** 字节 → 兆字节换算因子 */
const BYTES_PER_MB = 1024 * 1024;

/** 历史范围选项 */
const RANGE_OPTIONS: { label: string; value: SystemMetricRange }[] = [
  { label: "最近 1 小时", value: "1h" },
  { label: "最近 24 小时", value: "24h" },
  { label: "最近 7 天", value: "7d" },
];

export const Route = createFileRoute("/admin/_admin/system/monitor")({
  component: SystemMonitorPage,
});

function SystemMonitorPage() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [history, setHistory] = useState<SystemMetricHistory | null>(null);
  const [range, setRange] = useState<SystemMetricRange>("24h");
  const [metric, setMetric] = useState<SystemMetricHistoryMetric>("rss");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [dbSizes, setDbSizes] = useState<DatabaseSizes | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  /** 实时快照：仅进程内在指标，轮询失败静默（保留 console 诊断） */
  const refreshOverview = useCallback(async () => {
    const [data] = await sfnUnwrap(getSystemOverviewSFn(), { silent: true });
    if (data) setOverview(data);
  }, []);

  useEffect(() => {
    void refreshOverview();
    const timer = setInterval(() => void refreshOverview(), OVERVIEW_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [refreshOverview]);

  /** 历史趋势：仅范围切换时读取采样文件 */
  const fetchHistory = useCallback(async (next: SystemMetricRange) => {
    setHistoryLoading(true);
    try {
      const data = await callSfn(getSystemMetricHistorySFn({ data: { range: next } }), {
        error: "历史趋势加载失败，请稍后重试",
      });
      setHistory(data);
    } catch {
      // callSfn 已提示
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory(range);
  }, [fetchHistory, range]);

  /** 存储占用：页面加载调一次（命中缓存），手动刷新强制重算 */
  const fetchStorage = useCallback(async (force: boolean) => {
    setStorageLoading(true);
    try {
      const data = await callSfn(getStorageUsageSFn({ data: { force } }), {
        error: "存储占用查询失败，请稍后重试",
      });
      setStorage(data);
    } catch {
      // callSfn 已提示
    } finally {
      setStorageLoading(false);
    }
  }, []);

  /** 数据库占用：页面加载调一次（命中缓存），手动刷新强制重算 */
  const fetchDbSizes = useCallback(async (force: boolean) => {
    setDbLoading(true);
    try {
      const data = await callSfn(getDatabaseSizesSFn({ data: { force } }), {
        error: "数据库占用查询失败，请稍后重试",
      });
      setDbSizes(data);
    } catch {
      // callSfn 已提示
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStorage(false);
    void fetchDbSizes(false);
  }, [fetchStorage, fetchDbSizes]);

  const lastSample = overview?.lastSample ?? null;

  const kpiItems: AnalyticsKpiItem[] = overview
    ? [
        {
          title: "进程 CPU",
          value: overview.cpuPercent,
          precision: 2,
          suffix: "%",
        },
        {
          title: "常驻内存",
          value: overview.memory.rss / BYTES_PER_MB,
          precision: 1,
          suffix: "MB",
        },
        {
          title: "已用堆内存",
          value: overview.memory.heapUsed / BYTES_PER_MB,
          precision: 1,
          suffix: "MB",
        },
        {
          title: "事件循环延迟",
          value: overview.eventLoopLag,
          precision: 2,
          suffix: "ms",
        },
        { title: "累计请求数", value: overview.httpRequestsTotal },
        {
          title: "运行时长",
          value: overview.uptime / 3600,
          precision: 1,
          suffix: "小时",
        },
      ]
    : [];

  const historyConfig = history ? buildHistoryConfig(history.points, metric) : null;

  return (
    <AdminPageContent
      title="系统监控"
      description="查看进程资源占用、依赖健康与存储 / 数据库占用（实时快照 5 秒刷新）"
    >
      {/* 实时快照 KPI */}
      <div className="mb-4">
        <AnalyticsKpiCards items={kpiItems} columns={6} />
      </div>

      {/* 依赖健康 */}
      <Card size="small" title="依赖健康" className="mb-4">
        {lastSample ? (
          <Space size={24} wrap>
            <span>
              数据库：
              <Tag color={lastSample.dbUp ? "green" : "red"}>
                {lastSample.dbUp ? "可用" : "不可用"}
              </Tag>
              {lastSample.dbLatencyMs !== null && (
                <span className="text-xs text-muted-foreground">{lastSample.dbLatencyMs} ms</span>
              )}
            </span>
            <span>
              存储目录：
              <Tag color={lastSample.storageUp ? "green" : "red"}>
                {lastSample.storageUp ? "可用" : "不可用"}
              </Tag>
            </span>
            <span className="text-xs text-muted-foreground">
              最近采样：{formatDateTimeValue(lastSample.time)}
            </span>
          </Space>
        ) : (
          <span className="text-xs text-muted-foreground">等待首次采样…</span>
        )}
      </Card>

      {/* 资源趋势 */}
      <Card
        size="small"
        title="资源趋势"
        className="mb-4"
        extra={
          <Space size={8}>
            <Select<SystemMetricHistoryMetric>
              size="small"
              style={{ width: 140 }}
              value={metric}
              options={HISTORY_METRIC_OPTIONS}
              onChange={setMetric}
            />
            <Select<SystemMetricRange>
              size="small"
              style={{ width: 120 }}
              value={range}
              options={RANGE_OPTIONS}
              onChange={setRange}
            />
          </Space>
        }
      >
        {history?.truncated && (
          <Alert
            type="warning"
            showIcon
            className="mb-3"
            message="采样数据量已达扫描上限，趋势仅覆盖部分范围"
          />
        )}
        <Spin spinning={historyLoading}>
          {historyConfig ? (
            <AnalyticsChart kind="line" config={historyConfig} height={320} />
          ) : (
            <div className="flex h-[320px] items-center justify-center">
              <Empty description="暂无趋势数据" />
            </div>
          )}
        </Spin>
      </Card>

      {/* 存储 / 数据库占用（按需查询） */}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <StorageUsagePanel
            data={storage}
            loading={storageLoading}
            onRefresh={() => void fetchStorage(true)}
          />
        </Col>
        <Col xs={24} xl={12}>
          <DatabaseSizePanel
            data={dbSizes}
            loading={dbLoading}
            onRefresh={() => void fetchDbSizes(true)}
          />
        </Col>
      </Row>
    </AdminPageContent>
  );
}
