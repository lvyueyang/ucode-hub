/**
 * 客户端用户缓存实例：key = userId，TTL 5 分钟避免频繁查库
 * 仅允许 src/services/client-auth/client-auth.server.ts 直接操作
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** 缓存的客户端用户信息 */
export interface CachedClientUser {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  clientRoleIds: string[];
  status: string;
}

/** 客户端用户缓存实例 */
export const clientUserCache = new MemoryCache<CachedClientUser>({
  defaultTTL: 5 * 60 * 1000,
});
