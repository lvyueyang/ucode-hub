/**
 * 仪表盘运行日志摘要测试：窗口解析、条数裁剪与缓存
 */

import { DEFAULT_TASK_TIME_ZONE } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetLogAnalytics } = vi.hoisted(() => ({
  mockGetLogAnalytics: vi.fn(),
}));

vi.mock("#/services/logs/log-analytics.server", () => ({
  getLogAnalytics: mockGetLogAnalytics,
}));

import { dashboardErrorSummaryCache } from "#/services/dashboard/dashboard.cache";
import {
  getDashboardErrorSummary,
  resolveLogWindow,
} from "#/services/dashboard/dashboard.logs.server";

/** 构造日志分析返回值（错误聚类给足 6 条以验证裁剪） */
function logResult(overrides: Record<string, unknown> = {}) {
  return {
    total: 1000,
    levelCounts: [],
    errorCount: 12,
    errorRate: 0.012,
    timeSeries: [],
    topErrors: [
      { message: "e1", count: 5 },
      { message: "e2", count: 3 },
      { message: "e3", count: 2 },
      { message: "e4", count: 1 },
      { message: "e5", count: 1 },
      { message: "e6", count: 1 },
    ],
    truncated: false,
    scannedFiles: 2,
    ...overrides,
  };
}

describe("resolveLogWindow", () => {
  it("今日窗口为单日", () => {
    const window = resolveLogWindow("today");
    const today = dayjs().tz(DEFAULT_TASK_TIME_ZONE).format("YYYY-MM-DD");
    expect(window.startDate).toBe(today);
    expect(window.endDate).toBe(today);
    expect(window.windowDays).toBe(1);
  });

  it("近 30 日收敛为近 7 日", () => {
    const window = resolveLogWindow("30d");
    const expectedStart = dayjs()
      .tz(DEFAULT_TASK_TIME_ZONE)
      .subtract(6, "day")
      .format("YYYY-MM-DD");
    expect(window.startDate).toBe(expectedStart);
    expect(window.windowDays).toBe(7);
  });
});

describe("getDashboardErrorSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardErrorSummaryCache.clear();
    mockGetLogAnalytics.mockResolvedValue(logResult());
  });

  it("保留错误率并裁剪错误聚类条数", async () => {
    const summary = await getDashboardErrorSummary("7d");

    expect(summary.errorCount).toBe(12);
    expect(summary.errorRate).toBe(0.012);
    expect(summary.topErrors).toHaveLength(5);
    expect(summary.windowDays).toBe(7);
    expect(mockGetLogAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: "day" }),
    );
  });

  it("今日窗口按小时粒度查询", async () => {
    const summary = await getDashboardErrorSummary("today");

    expect(summary.windowDays).toBe(1);
    expect(mockGetLogAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: "hour" }),
    );
  });

  it("缓存有效期内仅扫描一次", async () => {
    await getDashboardErrorSummary("7d");
    await getDashboardErrorSummary("7d");

    expect(mockGetLogAnalytics).toHaveBeenCalledTimes(1);
  });

  it("force 绕过缓存强制重扫", async () => {
    await getDashboardErrorSummary("7d");
    await getDashboardErrorSummary("7d", true);

    expect(mockGetLogAnalytics).toHaveBeenCalledTimes(2);
  });
});
