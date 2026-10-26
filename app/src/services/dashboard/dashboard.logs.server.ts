/**
 * 仪表盘运行日志摘要：近段窗口的错误数与高频错误聚类
 * 日志分析需扫描日志文件，故独立于概览按需加载，并将窗口收敛到今日 / 近 7 日
 */
import { DEFAULT_TASK_TIME_ZONE } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import { getLogAnalytics } from "#/services/logs/log-analytics.server";
import { dashboardErrorSummaryCache } from "./dashboard.cache";
import type { DashboardErrorSummary, DashboardRange } from "./dashboard.types";

/** 日志分析窗口上限（天）：与运行日志分析页的时间跨度上限对齐，避免大范围文件扫描 */
const MAX_LOG_WINDOW_DAYS = 7;

/** 高频错误展示条数 */
const TOP_ERRORS_LIMIT = 5;

/** 解析时间范围对应的日志窗口：今日或近 7 日（近 30 日收敛为近 7 日） */
export function resolveLogWindow(range: DashboardRange): {
  startDate: string;
  endDate: string;
  windowDays: number;
} {
  const now = dayjs().tz(DEFAULT_TASK_TIME_ZONE);
  const windowDays = range === "today" ? 1 : MAX_LOG_WINDOW_DAYS;
  return {
    startDate: now.subtract(windowDays - 1, "day").format("YYYY-MM-DD"),
    endDate: now.format("YYYY-MM-DD"),
    windowDays,
  };
}

/** 获取运行日志错误摘要：默认命中缓存直接返回，force 强制重扫（供手动刷新） */
export async function getDashboardErrorSummary(
  range: DashboardRange,
  force = false,
): Promise<DashboardErrorSummary> {
  if (!force) {
    const cached = dashboardErrorSummaryCache.get(range);
    if (cached) return cached;
  }

  const { startDate, endDate, windowDays } = resolveLogWindow(range);
  // 注意：日志分析按「文件名日期」筛选日志文件，且日志文件按启动日命名、不随日期轮转，
  // 因此 total=0 仅代表窗口内没有匹配到日志文件，不等于该窗口零错误（前端据此区分空态）
  const result = await getLogAnalytics({
    startDate,
    endDate,
    granularity: windowDays === 1 ? "hour" : "day",
  });
  const summary: DashboardErrorSummary = {
    total: result.total,
    errorCount: result.errorCount,
    errorRate: result.errorRate,
    topErrors: result.topErrors.slice(0, TOP_ERRORS_LIMIT),
    truncated: result.truncated,
    windowDays,
  };
  dashboardErrorSummaryCache.set(range, summary);
  return summary;
}
