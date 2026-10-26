/**
 * 仪表盘概览聚合测试：时间窗口解析、权限分块、审计摘要与缓存
 */

import { DEFAULT_TASK_TIME_ZONE } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetClientUserTotal,
  mockGetTrackAnalytics,
  mockGetSystemOverview,
  mockGetStorageUsage,
  mockGetSystemMetricHistory,
  mockGetOperationLogAnalytics,
  mockGetOperationActionCounts,
} = vi.hoisted(() => ({
  mockGetClientUserTotal: vi.fn(),
  mockGetTrackAnalytics: vi.fn(),
  mockGetSystemOverview: vi.fn(),
  mockGetStorageUsage: vi.fn(),
  mockGetSystemMetricHistory: vi.fn(),
  mockGetOperationLogAnalytics: vi.fn(),
  mockGetOperationActionCounts: vi.fn(),
}));

vi.mock("#/services/dashboard/dashboard.server", () => ({
  getClientUserTotal: mockGetClientUserTotal,
}));
vi.mock("#/services/track/track.analytics", () => ({
  getTrackAnalytics: mockGetTrackAnalytics,
}));
vi.mock("#/services/system-metric/system-metric.server", () => ({
  getSystemOverview: mockGetSystemOverview,
  getStorageUsage: mockGetStorageUsage,
  getSystemMetricHistory: mockGetSystemMetricHistory,
}));
vi.mock("#/shared-services/operation-log/operation-log.analytics", () => ({
  HIGH_RISK_ACTIONS: ["delete", "reset_pwd", "change_status", "set_published"],
  getOperationLogAnalytics: mockGetOperationLogAnalytics,
  getOperationActionCounts: mockGetOperationActionCounts,
}));

import {
  dashboardResourceTrendCache,
  dashboardRiskOpsCache,
  dashboardTrafficCache,
} from "#/services/dashboard/dashboard.cache";
import {
  getDashboardOverview,
  resolveDashboardWindow,
} from "#/services/dashboard/dashboard.overview.server";

/** 固定客户端用户总数 */
const CLIENT_USER_TOTAL = 20;

/** 构造埋点分析返回值 */
function trackResult(overrides: Record<string, unknown> = {}) {
  return {
    totalEvents: 100,
    uniqueUsers: 40,
    timeSeries: [],
    eventRanking: [],
    dimensionDistributions: {},
    topPages: [{ pageName: "/home", count: 50 }],
    ...overrides,
  };
}

/** 构造操作日志分析返回值 */
function operationResult(overrides: Record<string, unknown> = {}) {
  return {
    totalOperations: 200,
    activeOperators: 3,
    highRiskOperations: 7,
    moduleCount: 4,
    timeSeries: [],
    actionDistribution: [
      { name: "delete", count: 5, ratio: 0.025 },
      { name: "update", count: 100, ratio: 0.5 },
      { name: "reset_pwd", count: 2, ratio: 0.01 },
    ],
    moduleDistribution: [],
    topOperators: [],
    ...overrides,
  };
}

describe("resolveDashboardWindow", () => {
  it("今日按小时且起止同日", () => {
    const window = resolveDashboardWindow("today");
    const today = dayjs().tz(DEFAULT_TASK_TIME_ZONE).format("YYYY-MM-DD");
    expect(window.startDate).toBe(today);
    expect(window.endDate).toBe(today);
    expect(window.granularity).toBe("hour");
  });

  it("近 7 日按天并回溯 6 天", () => {
    const window = resolveDashboardWindow("7d");
    const expectedStart = dayjs()
      .tz(DEFAULT_TASK_TIME_ZONE)
      .subtract(6, "day")
      .format("YYYY-MM-DD");
    expect(window.startDate).toBe(expectedStart);
    expect(window.granularity).toBe("day");
  });

  it("近 30 日按天并回溯 29 天", () => {
    const window = resolveDashboardWindow("30d");
    const expectedStart = dayjs()
      .tz(DEFAULT_TASK_TIME_ZONE)
      .subtract(29, "day")
      .format("YYYY-MM-DD");
    expect(window.startDate).toBe(expectedStart);
  });
});

describe("getDashboardOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardTrafficCache.clear();
    dashboardResourceTrendCache.clear();
    dashboardRiskOpsCache.clear();
    mockGetClientUserTotal.mockResolvedValue(CLIENT_USER_TOTAL);
    mockGetTrackAnalytics.mockResolvedValue(trackResult());
    mockGetSystemOverview.mockResolvedValue({});
    mockGetStorageUsage.mockResolvedValue({});
    mockGetSystemMetricHistory.mockResolvedValue({
      points: [],
      bucketMs: 0,
      truncated: false,
    });
    mockGetOperationLogAnalytics.mockResolvedValue(operationResult());
    mockGetOperationActionCounts.mockResolvedValue([
      { name: "delete", count: 5 },
      { name: "reset_pwd", count: 2 },
    ]);
  });

  it("全权限返回全部区块并计算人均浏览与 Top 页面占比", async () => {
    const result = await getDashboardOverview({
      range: "7d",
      canViewTraffic: true,
      canViewSystem: true,
      canViewLogs: true,
    });

    expect(result.clientUserTotal).toBe(CLIENT_USER_TOTAL);
    expect(result.traffic?.pageViews).toBe(100);
    expect(result.traffic?.uniqueVisitors).toBe(40);
    expect(result.traffic?.pagesPerVisitor).toBe(2.5);
    expect(result.traffic?.topPages[0]).toEqual({
      name: "/home",
      count: 50,
      ratio: 0.5,
    });
    expect(result.sections).toEqual({
      traffic: true,
      system: true,
      logs: true,
    });
    expect(mockGetTrackAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: "day",
        eventNames: ["PageView"],
        compare: "previous",
      }),
    );
  });

  it("高风险动作取独立聚合并按总操作数计算占比，不受分布 TopN 截断", async () => {
    const result = await getDashboardOverview({
      range: "7d",
      canViewTraffic: false,
      canViewSystem: false,
      canViewLogs: true,
    });

    expect(result.riskOps?.highRiskTotal).toBe(7);
    expect(result.riskOps?.activeOperators).toBe(3);
    expect(result.riskOps?.highRiskActions).toEqual([
      { name: "delete", count: 5, ratio: 0.025 },
      { name: "reset_pwd", count: 2, ratio: 0.01 },
    ]);
    expect(mockGetOperationActionCounts).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      ["delete", "reset_pwd", "change_status", "set_published"],
    );
  });

  it("资源趋势裁剪掉趋势切换器不可选的系统指标", async () => {
    mockGetSystemMetricHistory.mockResolvedValue({
      points: [
        { date: "2026-09-13 10:00", metric: "rss", value: 1 },
        { date: "2026-09-13 10:00", metric: "heapUsed", value: 2 },
      ],
      bucketMs: 60_000,
      truncated: false,
    });

    const result = await getDashboardOverview({
      range: "today",
      canViewTraffic: false,
      canViewSystem: true,
      canViewLogs: false,
    });

    expect(result.resourceTrend?.points).toEqual([
      { date: "2026-09-13 10:00", metric: "rss", value: 1 },
    ]);
  });

  it("近 30 日的系统资源范围收敛为 7d，今日映射为 24h", async () => {
    await getDashboardOverview({
      range: "30d",
      canViewTraffic: false,
      canViewSystem: true,
      canViewLogs: false,
    });
    await getDashboardOverview({
      range: "today",
      canViewTraffic: false,
      canViewSystem: true,
      canViewLogs: false,
    });

    expect(mockGetSystemMetricHistory).toHaveBeenNthCalledWith(1, "7d");
    expect(mockGetSystemMetricHistory).toHaveBeenNthCalledWith(2, "24h");
  });

  it("无流量权限时不查询埋点且区块不可用", async () => {
    const result = await getDashboardOverview({
      range: "7d",
      canViewTraffic: false,
      canViewSystem: true,
      canViewLogs: true,
    });

    expect(result.traffic).toBeNull();
    expect(result.sections.traffic).toBe(false);
    expect(mockGetTrackAnalytics).not.toHaveBeenCalled();
  });

  it("无系统权限时不查询系统、存储与资源趋势", async () => {
    const result = await getDashboardOverview({
      range: "7d",
      canViewTraffic: true,
      canViewSystem: false,
      canViewLogs: true,
    });

    expect(result.system).toBeNull();
    expect(result.storage).toBeNull();
    expect(result.resourceTrend).toBeNull();
    expect(result.sections.system).toBe(false);
    expect(mockGetSystemOverview).not.toHaveBeenCalled();
    expect(mockGetStorageUsage).not.toHaveBeenCalled();
    expect(mockGetSystemMetricHistory).not.toHaveBeenCalled();
  });

  it("无日志权限时不查询操作审计且区块不可用", async () => {
    const result = await getDashboardOverview({
      range: "7d",
      canViewTraffic: true,
      canViewSystem: true,
      canViewLogs: false,
    });

    expect(result.riskOps).toBeNull();
    expect(result.sections.logs).toBe(false);
    expect(mockGetOperationLogAnalytics).not.toHaveBeenCalled();
  });

  it("各域摘要均在缓存有效期内仅查询一次", async () => {
    const params = {
      range: "7d" as const,
      canViewTraffic: true,
      canViewSystem: true,
      canViewLogs: true,
    };
    await getDashboardOverview(params);
    await getDashboardOverview(params);

    expect(mockGetTrackAnalytics).toHaveBeenCalledTimes(1);
    expect(mockGetOperationLogAnalytics).toHaveBeenCalledTimes(1);
    expect(mockGetOperationActionCounts).toHaveBeenCalledTimes(1);
    expect(mockGetSystemMetricHistory).toHaveBeenCalledTimes(1);
  });

  it("无访客时人均浏览为 0", async () => {
    mockGetTrackAnalytics.mockResolvedValue(
      trackResult({ totalEvents: 0, uniqueUsers: 0, topPages: [] }),
    );
    const result = await getDashboardOverview({
      range: "today",
      canViewTraffic: true,
      canViewSystem: false,
      canViewLogs: false,
    });

    expect(result.traffic?.pagesPerVisitor).toBe(0);
    expect(result.traffic?.topPages).toEqual([]);
  });
});
