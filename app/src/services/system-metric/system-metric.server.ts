/**
 * 系统监控服务层：分钟级采样落盘、实时快照、历史趋势聚合
 * 存储采用按天 NDJSON 文件（{STORAGE_DIR}/metrics/），依赖健康与库总量随采样留存
 */

import { DEFAULT_TASK_TIME_ZONE, toDateString } from "@ucode/hub-lib/date-format";
import dayjs from "dayjs";
import { latestSampleCache } from "./system-metric.cache";
import {
  collectDependencies,
  getActiveResourceCount,
  getRequestTotals,
  type RequestTotals,
  readEventLoopDelay,
} from "./system-metric.collect";
import { getDatabaseTotalBytes } from "./system-metric.db-size.server";
import { appendSample, iterateSamples, listMetricFiles } from "./system-metric.store";
import {
  HISTORY_METRICS,
  type SystemMetricHistory,
  type SystemMetricHistoryMetric,
  type SystemMetricHistoryPoint,
  type SystemMetricRange,
  type SystemMetricSample,
  type SystemOverview,
} from "./system-metric.types";

export {
  getDatabaseSizes,
  getStorageUsage,
} from "./system-metric.inspect.server";
export { cleanupSystemMetrics } from "./system-metric.store";

/** 缓存单键（仅保留最新一次采样） */
const SINGLE_KEY = "current";

/** 历史范围配置：时长、时间桶粒度与桶标签格式（东八区） */
const RANGE_CONFIG: Record<
  SystemMetricRange,
  { durationMs: number; bucketMs: number; format: string }
> = {
  "1h": { durationMs: 3_600_000, bucketMs: 60_000, format: "HH:mm" },
  "24h": { durationMs: 86_400_000, bucketMs: 300_000, format: "MM-DD HH:mm" },
  "7d": {
    durationMs: 7 * 86_400_000,
    bucketMs: 3_600_000,
    format: "MM-DD HH:00",
  },
};

/** 计数类指标按求和聚合，其余（字节 / 百分比 / 毫秒）按均值聚合 */
const SUM_METRICS = new Set<string>(["httpRequests"]);

/** 历史扫描的最大采样条数（7 天约 1 万条，留足冗余） */
const MAX_SCAN_SAMPLES = 20_000;

/** 采样基线：用于把累计 CPU / 计数换算为区间增量 */
interface SampleBaseline {
  cpu: NodeJS.CpuUsage;
  at: number;
  requests: RequestTotals;
}

/** 采样任务的 CPU / 计数基线（仅本模块使用） */
let sampleBaseline: SampleBaseline | null = null;

/** 实时快照的 CPU 基线（与采样基线分离，避免高频轮询干扰分钟级增量） */
let overviewBaseline: { cpu: NodeJS.CpuUsage; at: number } | null = null;

/** 累计 CPU 微秒差值 */
function cpuDeltaMicros(prev: NodeJS.CpuUsage, curr: NodeJS.CpuUsage): number {
  return curr.user - prev.user + (curr.system - prev.system);
}

/** 保留两位小数，避免浮点噪声 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 将时间戳按粒度向下取整为时间桶起点 */
function toBucketStart(epochMs: number, bucketMs: number): number {
  return Math.floor(epochMs / bucketMs) * bucketMs;
}

/** 格式化东八区时间桶标签 */
function formatBucketLabel(bucketStartMs: number, format: string): string {
  return dayjs(bucketStartMs).tz(DEFAULT_TASK_TIME_ZONE).format(format);
}

/**
 * 采集并落盘一条采样记录（由定时任务每分钟调用）
 * 依赖健康与库总量在此采集；请求数 / CPU 为自上次采样以来的区间增量
 */
export async function sampleSystemMetric(): Promise<void> {
  const now = Date.now();
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  const requests = getRequestTotals();
  const lag = readEventLoopDelay(true);
  const deps = await collectDependencies();

  let dbTotalBytes: number | null = null;
  if (deps.dbUp) {
    dbTotalBytes = await getDatabaseTotalBytes().catch(() => null);
  }

  const baseline = sampleBaseline;
  const wallDeltaMs = baseline ? now - baseline.at : 0;
  const sample: SystemMetricSample = {
    time: new Date(now).toISOString(),
    cpuPercent:
      baseline && wallDeltaMs > 0
        ? round2((cpuDeltaMicros(baseline.cpu, cpu) / 1000 / wallDeltaMs) * 100)
        : 0,
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    eventLoopLag: round2(lag.meanMs),
    eventLoopLagMax: round2(lag.maxMs),
    uptime: Math.round(process.uptime()),
    activeResources: getActiveResourceCount(),
    httpRequests: baseline ? Math.max(0, requests.http - baseline.requests.http) : 0,
    sfRequests: baseline ? Math.max(0, requests.sf - baseline.requests.sf) : 0,
    sfErrors: baseline ? Math.max(0, requests.sfErrors - baseline.requests.sfErrors) : 0,
    dbUp: deps.dbUp,
    dbLatencyMs: deps.dbLatencyMs,
    storageUp: deps.storageUp,
    dbTotalBytes,
  };

  sampleBaseline = { cpu, at: now, requests };
  await appendSample(sample);
  latestSampleCache.set(SINGLE_KEY, sample);
}

/**
 * 实时运行快照：进程指标现读，依赖健康与库总量取最近一次采样
 * 不读历史文件、不触发数据库探测，适合前端高频轮询
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  const now = Date.now();
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  const lag = readEventLoopDelay(false);
  const totals = getRequestTotals();

  const wallDeltaMs = overviewBaseline ? now - overviewBaseline.at : 0;
  const cpuPercent =
    overviewBaseline && wallDeltaMs > 0
      ? round2((cpuDeltaMicros(overviewBaseline.cpu, cpu) / 1000 / wallDeltaMs) * 100)
      : 0;
  overviewBaseline = { cpu, at: now };

  return {
    time: new Date(now).toISOString(),
    cpuPercent,
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
    },
    eventLoopLag: round2(lag.meanMs),
    eventLoopLagMax: round2(lag.maxMs),
    uptime: Math.round(process.uptime()),
    activeResources: getActiveResourceCount(),
    httpRequestsTotal: totals.http,
    sfRequestsTotal: totals.sf,
    sfErrorsTotal: totals.sfErrors,
    lastSample: latestSampleCache.get(SINGLE_KEY) ?? null,
  };
}

/** 查询历史趋势：流式读取范围内采样文件并按时间桶聚合 */
export async function getSystemMetricHistory(
  range: SystemMetricRange,
): Promise<SystemMetricHistory> {
  const config = RANGE_CONFIG[range];
  const end = new Date();
  const startMs = end.getTime() - config.durationMs;
  const files = listMetricFiles(toDateString(new Date(startMs)), toDateString(end));

  const buckets = new Map<string, { sum: number; count: number }>();
  let scanned = 0;
  let truncated = false;

  for (const file of files) {
    if (truncated) break;
    for await (const sample of iterateSamples([file])) {
      if (scanned >= MAX_SCAN_SAMPLES) {
        truncated = true;
        break;
      }
      scanned++;

      const time = Date.parse(sample.time);
      if (Number.isNaN(time) || time < startMs) continue;

      const bucketStart = toBucketStart(time, config.bucketMs);
      for (const metric of HISTORY_METRICS) {
        const value = sample[metric];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const key = `${bucketStart}\u0000${metric}`;
        const cell = buckets.get(key) ?? { sum: 0, count: 0 };
        cell.sum += value;
        cell.count++;
        buckets.set(key, cell);
      }
    }
  }

  // 先按桶起点数值排序（避免跨午夜时 "HH:mm" 标签的字典序错乱），再格式化为展示标签
  const points: SystemMetricHistoryPoint[] = [...buckets.entries()]
    .map(([key, cell]) => {
      const [bucketStart, metric] = key.split("\u0000");
      return {
        bucketStart: Number(bucketStart),
        metric: metric as SystemMetricHistoryMetric,
        value: SUM_METRICS.has(metric) ? cell.sum : cell.sum / cell.count,
      };
    })
    .sort((a, b) =>
      a.bucketStart === b.bucketStart
        ? a.metric.localeCompare(b.metric)
        : a.bucketStart - b.bucketStart,
    )
    .map(({ bucketStart, metric, value }) => ({
      date: formatBucketLabel(bucketStart, config.format),
      metric,
      value,
    }));

  return { points, bucketMs: config.bucketMs, truncated };
}
