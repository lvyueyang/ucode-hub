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
  /** 令牌版本：与 JWT 载荷比对，不一致即表示旧令牌（已改密 / 被重置 / 已登出） */
  tokenVersion: number;
  status: string;
}

/** 管理员用户缓存：key = userId，TTL 5 分钟避免频繁查库 */
export const adminUserCache = new MemoryCache<CachedAdminUser>({
  defaultTTL: 5 * 60 * 1000,
});
