/**
 * 内置资产清单缓存实例：仅由 builtin-assets.server 操作。
 *
 * 清单是磁盘文件（内容寻址，唯一会变的是清单本身），所以缓存键里带 mtime：
 * 命中同一个键就代表文件没动过，不用再读一次盘。挂 globalThis 是因为
 * Nitro 入口与 SSR bundle 会各自打包一次本模块（与 system-metric 同一处理）。
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

import type { BuiltinManifest } from "./builtin-assets.types";

/** 全局共享状态键：跨 bundle 复用同一份缓存实例 */
const CACHE_KEY = "__APP_BUILTIN_ASSETS_CACHE__";

type BuiltinAssetsCaches = {
  /** 键为 `<清单路径>:<mtimeMs>`；单条语义，旧键由读取方清掉 */
  manifest: MemoryCache<BuiltinManifest>;
};

/** 惰性获取全局缓存集合（首次加载时创建，之后跨 bundle 复用） */
const getCaches = (): BuiltinAssetsCaches => {
  const global = globalThis as typeof globalThis & {
    [CACHE_KEY]?: BuiltinAssetsCaches;
  };
  const caches = global[CACHE_KEY] ?? { manifest: new MemoryCache<BuiltinManifest>({}) };
  global[CACHE_KEY] = caches;
  return caches;
};

/** 清单缓存：按 mtime 失效 */
export const builtinManifestCache = getCaches().manifest;
