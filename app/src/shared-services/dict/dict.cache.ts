/**
 * 字典缓存实例：key = dictSlug，value = { itemValue: { label, color } }
 * 仅允许 src/shared-services/dict/dict.server.ts 直接操作
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** 字典条目缓存信息 */
export interface DictItemCache {
  label: string;
  color?: string | null;
}

/** 字典缓存实例 */
export const dictCache = new MemoryCache<Record<string, DictItemCache>>({});
