/**
 * 管理员用户缓存实例
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** 缓存的管理员用户信息 */
export interface CachedAdminUser {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  isRoot: boolean;
  adminRoleIds: string[];
  status: string;
}

/** 管理员用户缓存：key = userId，TTL 5 分钟避免频繁查库 */
export const adminUserCache = new MemoryCache<CachedAdminUser>({
  defaultTTL: 5 * 60 * 1000,
});
