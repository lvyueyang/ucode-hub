/**
 * 系统配置缓存实例：configCache（全量配置列表）+ configTranslationCache（配置翻译）
 * 仅允许 src/shared-services/config/config.server.ts 直接操作
 * 实例挂载于 globalThis 跨 bundle 共享：Nitro 入口（bootstrap 注入 getConfig）与 SSR 渲染器
 * 分别打包本模块，模块级单例会分裂导致启动后修改的配置在另一侧读不到空值。
 * 与 metrics 同模式的 globalThis 存取样板（见 shared-services/metrics）。
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** 缓存的系统配置条目（按需扩展字段） */
export interface CachedConfig {
  id: string;
  key: string;
  value: string;
  clientVisible: boolean;
  /** 敏感配置标记：缓存内存密文，读取时解密 */
  isSecret: boolean;
}

/** 跨 bundle 共享缓存实例的 globalThis 存储键 */
const CONFIG_CACHE_KEY = "__HUB_CONFIG_CACHE__";
const CONFIG_TRANSLATION_CACHE_KEY = "__HUB_CONFIG_TRANSLATION_CACHE__";

/**
 * 从 globalThis 读取跨 bundle 共享的缓存实例，不存在则创建。
 * 避免模块级单例在 Nitro 入口与 SSR 渲染器两条 bundle 间分裂。
 */
function getSharedCache<T>(key: string, factory: () => MemoryCache<T>): MemoryCache<T> {
  const global = globalThis as typeof globalThis & Record<string, MemoryCache<T> | undefined>;
  const cached = global[key] ?? factory();
  global[key] = cached;
  return cached;
}

/** 系统配置缓存实例：全量缓存配置列表，key 固定为 "all"（跨 bundle 共享） */
export const configCache: MemoryCache<CachedConfig[]> = getSharedCache(
  CONFIG_CACHE_KEY,
  () => new MemoryCache<CachedConfig[]>({}),
);

/** 系统配置的 content_translation 翻译缓存：key = locale，value = { entityId: translatedValue }（跨 bundle 共享） */
export const configTranslationCache: MemoryCache<Record<string, string>> = getSharedCache(
  CONFIG_TRANSLATION_CACHE_KEY,
  () => new MemoryCache<Record<string, string>>({}),
);
