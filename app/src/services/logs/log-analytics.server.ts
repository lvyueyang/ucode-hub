/**
 * 运行日志分析模块：级别分布、错误率趋势、错误消息聚类
 * 基于日志文件流式扫描聚合，受扫描行数上限约束，避免大范围全量扫描
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_TASK_TIME_ZONE } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import { iterateLogLines, normalizeLogLevel, normalizeMessage } from "./log-parse";
import { getLogDir, listLogFiles } from "./log-reader";

/** 分析时间粒度 */
export type LogAnalyticsGranularity = "hour" | "day";

/** 单次扫描的最大行数（跨文件累计），超出即截断 */
export const MAX_SCAN_LINES = 200_000;

/** 错误级别集合（错误率与错误聚类口径） */
const ERROR_LEVELS = new Set(["error", "fatal"]);

/** 运行日志分析查询参数 */
export interface LogAnalyticsQuery {
  startDate: string;
  endDate: string;
  granularity?: LogAnalyticsGranularity;
  level?: string;
  keyword?: string;
}

/** 级别计数项 */
export interface LogLevelCount {
  level: string;
  count: number;
}

/** 趋势点：series 为日志级别 */
export interface LogTrendPoint {
  date: string;
  value: number;
  series: string;
}

/** 错误聚类项 */
export interface LogClusterItem {
  message: string;
  count: number;
}

/** 运行日志分析结果 */
export interface LogAnalyticsResult {
  total: number;
  levelCounts: LogLevelCount[];
  errorCount: number;
  /** 错误率（0-1） */
  errorRate: number;
  timeSeries: LogTrendPoint[];
  topErrors: LogClusterItem[];
  /** 是否因触达扫描行数上限而截断 */
  truncated: boolean;
  scannedFiles: number;
}

/** 扫描累加器：跨文件累计各级别 / 时间桶 / 错误聚类计数 */
export interface LogAggregationAccumulator {
  scanned: number;
  total: number;
  errorCount: number;
  levelCounts: Map<string, number>;
  /** key = `${bucket}\u0000${level}` */
  bucketCounts: Map<string, number>;
  clusterCounts: Map<string, number>;
  truncated: boolean;
}

/** 创建空累加器 */
export function createAccumulator(): LogAggregationAccumulator {
  return {
    scanned: 0,
    total: 0,
    errorCount: 0,
    levelCounts: new Map(),
    bucketCounts: new Map(),
    clusterCounts: new Map(),
    truncated: false,
  };
}

/** 解析日志条目的时间字段（pino time 为 epoch 毫秒，兼容 ISO 字符串） */
export function parseEntryTime(entry: Record<string, unknown>): Date | null {
  const raw = entry.time ?? entry.timestamp;
  if (typeof raw === "number") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof raw === "string") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** 按粒度在东八区格式化时间桶标签 */
function formatBucket(date: Date, granularity: LogAnalyticsGranularity): string {
  const local = dayjs(date).tz(DEFAULT_TASK_TIME_ZONE);
  return granularity === "hour" ? local.format("YYYY-MM-DD HH:00") : local.format("YYYY-MM-DD");
}

/** 解析 pino JSON 日志行，非对象（含非 JSON）行兜底为 error 级别 */
function parseLine(line: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { level: "error", msg: line };
  } catch {
    return { level: "error", msg: line };
  }
}

/**
 * 累加单个日志行序列（导出以便单测覆盖扫描上限与计数逻辑）
 * 触达 maxLines 时置 truncated 并提前结束
 */
export async function accumulateLogStream(
  stream: AsyncIterable<string>,
  options: {
    granularity: LogAnalyticsGranularity;
    level?: string;
    keyword?: string;
    maxLines: number;
  },
  acc: LogAggregationAccumulator,
): Promise<void> {
  const keywordLower = options.keyword?.toLowerCase();
  for await (const line of stream) {
    if (acc.scanned >= options.maxLines) {
      acc.truncated = true;
      break;
    }
    acc.scanned++;

    const entry = parseLine(line);
    const level = normalizeLogLevel(entry.level);
    if (options.level && level !== options.level) continue;
    if (keywordLower && !line.toLowerCase().includes(keywordLower)) continue;

    acc.total++;
    acc.levelCounts.set(level, (acc.levelCounts.get(level) ?? 0) + 1);

    const isError = ERROR_LEVELS.has(level);
    if (isError) acc.errorCount++;

    const time = parseEntryTime(entry);
    if (time) {
      const bucket = formatBucket(time, options.granularity);
      const key = `${bucket}\u0000${level}`;
      acc.bucketCounts.set(key, (acc.bucketCounts.get(key) ?? 0) + 1);
    }

    if (isError) {
      const message =
        typeof entry.msg === "string"
          ? entry.msg
          : typeof entry.message === "string"
            ? entry.message
            : line;
      const skeleton = normalizeMessage(message);
      acc.clusterCounts.set(skeleton, (acc.clusterCounts.get(skeleton) ?? 0) + 1);
    }
  }
}

/** 将累加器整理为分析结果 */
function buildResult(acc: LogAggregationAccumulator, scannedFiles: number): LogAnalyticsResult {
  const levelCounts = [...acc.levelCounts.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count);

  const timeSeries = [...acc.bucketCounts.entries()]
    .map(([key, value]) => {
      const [date, series] = key.split("\u0000");
      return { date, value, series };
    })
    .sort((a, b) =>
      a.date === b.date ? a.series.localeCompare(b.series) : a.date.localeCompare(b.date),
    );

  const topErrors = [...acc.clusterCounts.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    total: acc.total,
    levelCounts,
    errorCount: acc.errorCount,
    errorRate: acc.total > 0 ? acc.errorCount / acc.total : 0,
    timeSeries,
    topErrors,
    truncated: acc.truncated,
    scannedFiles,
  };
}

/** 执行运行日志分析：流式扫描日期范围内的日志文件并聚合 */
export async function getLogAnalytics(query: LogAnalyticsQuery): Promise<LogAnalyticsResult> {
  const { startDate, endDate, granularity = "day", level, keyword } = query;

  const files = listLogFiles(startDate, endDate);
  const acc = createAccumulator();

  for (const file of files) {
    if (acc.truncated) break;
    const filePath = resolve(getLogDir(), file);
    if (!existsSync(filePath)) continue;
    await accumulateLogStream(
      iterateLogLines(filePath),
      { granularity, level, keyword, maxLines: MAX_SCAN_LINES },
      acc,
    );
  }

  return buildResult(acc, files.length);
}
