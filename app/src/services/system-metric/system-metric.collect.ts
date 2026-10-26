/**
 * 系统监控进程采集：CPU / 内存 / 事件循环延迟 / 活跃资源 / 请求计数 / 依赖健康
 * 全部基于 Node 内置 API，无第三方依赖；本模块仅被 system-metric.server 使用
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { checkHealth } from "#/services/health/health.server";
import { httpRequestsTotal, serverFunctionRequestsTotal } from "#/shared-services/metrics";

/**
 * 事件循环延迟直方图类型
 * `@types/node` 对该类型的命名随版本变动（24.19 起由 `IntervalHistogram` 改为 `ELDHistogram`），
 * 改由函数返回类型衍生，避免类型名变更再次打断类型检查
 */
type IntervalHistogram = ReturnType<typeof monitorEventLoopDelay>;

/** 纳秒 → 毫秒换算 */
const NS_PER_MS = 1_000_000;

/**
 * 事件循环延迟直方图（globalThis 共享，惰性创建并启用）
 * Nitro 入口与 SSR bundle 会分别打包本模块，模块级单例会分裂，
 * 导致入口侧的 reset 与 SSR 侧的窥视作用于不同直方图
 */
const LAG_HISTOGRAM_KEY = "__APP_SYSTEM_METRIC_LAG_HISTOGRAM__";

/** 获取事件循环延迟直方图（首次访问时创建并启用） */
function getLagHistogram(): IntervalHistogram {
  const global = globalThis as typeof globalThis & {
    [LAG_HISTOGRAM_KEY]?: IntervalHistogram;
  };
  if (!global[LAG_HISTOGRAM_KEY]) {
    const histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
    global[LAG_HISTOGRAM_KEY] = histogram;
  }
  return global[LAG_HISTOGRAM_KEY];
}

/**
 * 读取事件循环延迟
 * @param reset 读取后是否重置窗口（采样任务传 true 取区间值，实时快照传 false 仅窥视）
 */
export function readEventLoopDelay(reset = false): {
  meanMs: number;
  maxMs: number;
} {
  const histogram = getLagHistogram();
  const meanMs = histogram.mean / NS_PER_MS;
  const maxMs = histogram.max / NS_PER_MS;
  if (reset) histogram.reset();
  return {
    meanMs: Number.isFinite(meanMs) ? meanMs : 0,
    maxMs: Number.isFinite(maxMs) ? maxMs : 0,
  };
}

/** 当前活跃资源数（TCP 句柄、定时器等，反映进程持有量） */
export function getActiveResourceCount(): number {
  return process.getActiveResourcesInfo().length;
}

/** 累计请求计数（进程启动至今，供实时快照与区间增量共用） */
export interface RequestTotals {
  http: number;
  sf: number;
  sfErrors: number;
}

/** 读取累计请求计数 */
export function getRequestTotals(): RequestTotals {
  return {
    http: httpRequestsTotal.total(),
    sf: serverFunctionRequestsTotal.total(),
    sfErrors: serverFunctionRequestsTotal.value({ result: "error" }),
  };
}

/** 依赖健康探测结果 */
export interface DependencyHealth {
  dbUp: boolean;
  dbLatencyMs: number | null;
  storageUp: boolean;
}

/** 探测数据库与存储目录健康状态（复用健康检查模块的探测逻辑） */
export async function collectDependencies(): Promise<DependencyHealth> {
  const report = await checkHealth();
  return {
    dbUp: report.checks.database.status === "up",
    dbLatencyMs: report.checks.database.latencyMs ?? null,
    storageUp: report.checks.storage.status === "up",
  };
}
