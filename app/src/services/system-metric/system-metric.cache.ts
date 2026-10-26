/**
 * 系统监控缓存实例
 * 归属：storageUsageCache / databaseSizeCache 仅由 system-metric.inspect.server 操作；
 * latestSampleCache 仅由 system-metric.server 操作
 *
 * 注意：Nitro 入口（采样任务）与 SSR bundle（Server Function）会分别打包本模块，
 * 模块级单例会分裂（入口写入、SSR 读取互不可见），故统一挂载 globalThis 共享实例
 */
import { MemoryCache } from "@ucode/hub-lib/cache";
import type { DatabaseSizes, StorageUsage, SystemMetricSample } from "./system-metric.types";

/** 全局共享状态键：跨 bundle 复用同一组缓存实例 */
const CACHE_KEY = "__APP_SYSTEM_METRIC_CACHE__";

/** 系统监控缓存集合 */
interface SystemMetricCaches {
  storageUsage: MemoryCache<StorageUsage>;
  databaseSize: MemoryCache<DatabaseSizes>;
  latestSample: MemoryCache<SystemMetricSample>;
}

/** 惰性获取全局缓存集合（首次加载时创建，之后跨 bundle 复用） */
function getCaches(): SystemMetricCaches {
  const global = globalThis as typeof globalThis & {
    [CACHE_KEY]?: SystemMetricCaches;
  };
  const caches = global[CACHE_KEY] ?? {
    storageUsage: new MemoryCache<StorageUsage>({}),
    databaseSize: new MemoryCache<DatabaseSizes>({}),
    latestSample: new MemoryCache<SystemMetricSample>({}),
  };
  global[CACHE_KEY] = caches;
  return caches;
}

/** 存储目录占用缓存（按需统计结果，带 TTL） */
export const storageUsageCache = getCaches().storageUsage;

/** 数据库占用缓存（按需统计结果，带 TTL） */
export const databaseSizeCache = getCaches().databaseSize;

/** 最近一次采样缓存（供实时快照读取依赖健康等慢指标，避免轮询触发探测） */
export const latestSampleCache = getCaches().latestSample;
