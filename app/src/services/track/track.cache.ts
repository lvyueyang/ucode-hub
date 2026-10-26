/**
 * 埋点元数据缓存实例：trackEventMetaCache + trackPropertyMetaCache
 * 生命周期（加载 / 失效 / 重置）归 track.meta.ts，track.server.ts 只做只读判断
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** 元事件缓存：key = 事件名，value = true，无过期（随元数据变更主动失效） */
export const trackEventMetaCache = new MemoryCache<boolean>({});

/** 元属性缓存：key = 属性键，value = dataType，无过期（随元数据变更主动失效） */
export const trackPropertyMetaCache = new MemoryCache<string>({});
