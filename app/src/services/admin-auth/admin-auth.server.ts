/**
 * 管理员登录与当前管理员查询核心逻辑（纯函数）
 */

import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "#/db/index";
import { adminRole, adminUser } from "#/db/schema";
import type { AdminLoginResult, AdminUser } from "#/services/admin-auth/admin-auth.types";
import { adminUserCache, type CachedAdminUser } from "#/services/admin-auth/admin-user.cache";
import { type JwtPayload, jwt } from "#/shared-services/jwt";
import { logger } from "#/shared-services/logger";

/** 合并多个角色的权限并去重（未分配角色时返回空数组） */
async function getAdminRolePermissions(adminRoleIds: string[]): Promise<string[]> {
  if (adminRoleIds.length === 0) return [];
  const roles = await db
    .select()
    .from(adminRole)
    .where(and(inArray(adminRole.id, adminRoleIds), isNull(adminRole.deletedAt)));
  return [...new Set(roles.flatMap((r) => (r.permissions as string[]) ?? []))];
}

/**
 * 管理员登录逻辑：验证用户名密码，签发 JWT
 * 调用方（路由 SF）负责设置 Cookie
 */
export async function adminLogin(username: string, password: string): Promise<AdminLoginResult> {
  const [user] = await db.select().from(adminUser).where(eq(adminUser.username, username)).limit(1);

  if (!user || user.deletedAt || user.status !== "active") {
    return { success: false, message: "用户名或密码错误" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { success: false, message: "用户名或密码错误" };
  }

  await db.update(adminUser).set({ lastLoginAt: new Date() }).where(eq(adminUser.id, user.id));

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    userType: "admin",
  };
  const token = await jwt.signToken(payload);

  logger.info({ username: user.username }, "管理员登录成功");
  return {
    success: true,
    user: { id: user.id, username: user.username, email: user.email },
    token,
  };
}

/**
 * 从管理端 JWT token 获取当前登录管理员信息
 * 返回 null 表示未登录或 token 无效
 */
export async function getCurrentAdmin(token: string | undefined): Promise<AdminUser | null> {
  if (!token) return null;

  const jwtPayload = await jwt.verifyToken(token);
  if (jwtPayload?.userType !== "admin") return null;

  const [user] = await db
    .select()
    .from(adminUser)
    .where(and(eq(adminUser.id, jwtPayload.userId), isNull(adminUser.deletedAt)))
    .limit(1);
  if (!user || user.deletedAt || user.status !== "active") return null;

  let roleNames: string[] = [];
  let rolePermissions: string[] = ["**"];
  if (!user.isRoot) {
    // 一次查询同时取角色名与权限码：避免为权限再查一遍 roles
    // 过滤软删除角色，与鉴权路径的 getAdminRolePermissions 保持同一语义
    const roles = await db
      .select()
      .from(adminRole)
      .where(and(inArray(adminRole.id, user.adminRoleIds), isNull(adminRole.deletedAt)));
    roleNames = roles.map((r) => r.name);
    rolePermissions = [...new Set(roles.flatMap((r) => (r.permissions as string[]) ?? []))];
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    isRoot: user.isRoot,
    roleNames,
    rolePermissions,
    userType: "admin",
  };
}

/**
 * 获取管理员鉴权上下文（登录 + 权限），供鉴权中间件使用
 * 带内存缓存（5 分钟 TTL），isRoot 用户自动拥有全部权限
 */
export async function getAdminUserForAuth(userId: string): Promise<
  | {
      success: true;
      id: string;
      username: string;
      email: string;
      isRoot: boolean;
      rolePermissions: string[];
    }
  | { success: false; reason: "not_found" | "disabled" }
> {
  const cached = adminUserCache.get(userId);
  if (cached) {
    if (cached.status !== "active") {
      return { success: false, reason: "disabled" };
    }
    if (cached.isRoot) {
      return {
        success: true,
        id: cached.id,
        username: cached.username,
        email: cached.email,
        isRoot: true,
        rolePermissions: ["**"],
      };
    }
    const permissions = await getAdminRolePermissions(cached.adminRoleIds);
    return {
      success: true,
      id: cached.id,
      username: cached.username,
      email: cached.email,
      isRoot: false,
      rolePermissions: permissions,
    };
  }

  const [user] = await db
    .select()
    .from(adminUser)
    .where(and(eq(adminUser.id, userId), isNull(adminUser.deletedAt)))
    .limit(1);
  if (!user) return { success: false, reason: "not_found" };

  const cacheEntry: CachedAdminUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    isRoot: user.isRoot,
    adminRoleIds: user.adminRoleIds,
    status: user.status,
  };
  adminUserCache.set(userId, cacheEntry);

  if (user.status !== "active") return { success: false, reason: "disabled" };

  let rolePermissions: string[] = [];
  if (user.isRoot) {
    rolePermissions = ["**"];
  } else {
    rolePermissions = await getAdminRolePermissions(user.adminRoleIds);
  }

  return {
    success: true,
    id: user.id,
    username: user.username,
    email: user.email,
    isRoot: user.isRoot,
    rolePermissions,
  };
}

/** 使管理员用户缓存失效（更新/删除/重置密码后调用） */
export function clearAdminUserCache(userId: string): void {
  adminUserCache.delete(userId);
}
