/**
 * 客户端用户登录、注册与当前用户查询核心逻辑（纯函数）
 */

import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "#/db/index";
import { clientRole, clientUser } from "#/db/schema";
import { verifyCaptcha } from "#/services/captcha/captcha.server";
import type {
  ClientLoginResult,
  ClientRegisterResult,
  ClientUser,
} from "#/services/client-auth/client-auth.types";
import { type CachedClientUser, clientUserCache } from "#/services/client-auth/client-user.cache";
import { trackServerEvent } from "#/services/track/track.server";
import { type JwtPayload, jwt } from "#/shared-services/jwt";
import { logger } from "#/shared-services/logger";
import { logOperation } from "#/shared-services/operation-log/operation-log.server";

/** 合并多个客户端角色的权限并去重（未分配角色时返回空数组） */
async function getClientRolePermissions(clientRoleIds: string[]): Promise<string[]> {
  if (clientRoleIds.length === 0) return [];
  const roles = await db
    .select()
    .from(clientRole)
    .where(and(inArray(clientRole.id, clientRoleIds), isNull(clientRole.deletedAt)));
  return [...new Set(roles.flatMap((r) => (r.permissions as string[]) ?? []))];
}

/**
 * 客户端用户登录逻辑：验证用户名密码，签发 JWT
 * 调用方（路由 SF）负责设置 Cookie
 */
export async function clientLogin(username: string, password: string): Promise<ClientLoginResult> {
  const [user] = await db
    .select()
    .from(clientUser)
    .where(eq(clientUser.username, username))
    .limit(1);

  if (!user || user.deletedAt || user.status !== "active") {
    return { success: false, message: "用户名或密码错误" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { success: false, message: "用户名或密码错误" };
  }

  await db.update(clientUser).set({ lastLoginAt: new Date() }).where(eq(clientUser.id, user.id));

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    userType: "client",
  };
  const token = await jwt.signToken(payload);

  logger.info({ username: user.username }, "客户端用户登录成功");
  return {
    success: true,
    user: { id: user.id, username: user.username, email: user.email },
    token,
  };
}

/**
 * 客户端用户注册逻辑：验证码校验 + 用户名/邮箱唯一性校验
 */
export async function clientRegister(
  username: string,
  email: string,
  password: string,
  captcha: string,
): Promise<ClientRegisterResult> {
  const captchaValid = await verifyCaptcha("email", email, captcha);
  if (!captchaValid) {
    return { success: false, message: "验证码错误或已过期" };
  }

  const [existing] = await db
    .select()
    .from(clientUser)
    .where(or(eq(clientUser.username, username), eq(clientUser.email, email)))
    .limit(1);

  if (existing) {
    return { success: false, message: "用户名或邮箱已存在" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // 新注册用户分配默认普通用户角色（normal-user）
  const [normalRole] = await db
    .select()
    .from(clientRole)
    .where(eq(clientRole.slug, "normal-user"))
    .limit(1);
  const [newUser] = await db
    .insert(clientUser)
    .values({
      username,
      email,
      passwordHash,
      emailVerified: true,
      clientRoleIds: normalRole ? [normalRole.id] : [],
    })
    .returning();

  // 服务端可信埋点：注册成功（Register 为预置元事件，此前无触发点）
  if (newUser) {
    trackServerEvent({
      time: Date.now(),
      userId: newUser.id,
      // 服务端无浏览器会话，以用户标识作为会话聚合维度
      sessionId: `srv-client-${newUser.id}`,
      name: "Register",
      properties: { form_name: "clientRegister" },
    });

    // 注册审计：新用户创建属业务数据新增，operator 即新用户自身（自助操作）
    logOperation({
      operatorId: newUser.id,
      operatorName: newUser.username,
      operatorType: "client",
      module: "client-auth",
      action: "register",
      targetType: "clientUser",
      targetId: newUser.id,
      targetName: newUser.username,
    });
  }

  logger.info({ username }, "客户端用户注册成功");
  return { success: true, message: "注册成功" };
}

/**
 * 从客户端 JWT token 获取当前登录用户信息
 * 优先从缓存读取，缓存在用户信息变更时需主动清除
 * 返回 null 表示未登录或 token 无效
 */
export async function getCurrentClient(token: string | undefined): Promise<ClientUser | null> {
  if (!token) return null;

  const jwtPayload = await jwt.verifyToken(token);
  if (jwtPayload?.userType !== "client") return null;

  // 查缓存（缓存中存有 status，读取时校验是否仍为 active）
  const cached = clientUserCache.get(jwtPayload.userId);
  if (cached && cached.status === "active") {
    return {
      id: cached.id,
      username: cached.username,
      email: cached.email,
      avatar: cached.avatar,
      isRoot: false,
      userType: "client" as const,
    };
  }

  const [user] = await db
    .select()
    .from(clientUser)
    .where(and(eq(clientUser.id, jwtPayload.userId), isNull(clientUser.deletedAt)))
    .limit(1);
  if (!user || user.deletedAt || user.status !== "active") return null;

  const cacheEntry: CachedClientUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    clientRoleIds: user.clientRoleIds,
    status: user.status,
  };
  clientUserCache.set(jwtPayload.userId, cacheEntry);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    isRoot: false,
    userType: "client",
  };
}

/**
 * 获取客户端用户鉴权上下文（登录 + 权限），供客户端鉴权中间件使用
 * 带内存缓存（5 分钟 TTL）
 */
export async function getClientUserForAuth(userId: string): Promise<
  | {
      success: true;
      id: string;
      username: string;
      email: string;
      rolePermissions: string[];
    }
  | { success: false; reason: "not_found" | "disabled" }
> {
  const cached = clientUserCache.get(userId);
  if (cached) {
    if (cached.status !== "active") {
      return { success: false, reason: "disabled" };
    }
    const permissions = await getClientRolePermissions(cached.clientRoleIds);
    return {
      success: true,
      id: cached.id,
      username: cached.username,
      email: cached.email,
      rolePermissions: permissions,
    };
  }

  const [user] = await db
    .select()
    .from(clientUser)
    .where(and(eq(clientUser.id, userId), isNull(clientUser.deletedAt)))
    .limit(1);
  if (!user) return { success: false, reason: "not_found" };

  const cacheEntry: CachedClientUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    clientRoleIds: user.clientRoleIds,
    status: user.status,
  };
  clientUserCache.set(userId, cacheEntry);

  if (user.status !== "active") return { success: false, reason: "disabled" };

  const rolePermissions = await getClientRolePermissions(user.clientRoleIds);
  return {
    success: true,
    id: user.id,
    username: user.username,
    email: user.email,
    rolePermissions,
  };
}

/** 清除客户端用户缓存（用户信息/状态变更时调用） */
export function clearClientUserCache(userId: string): void {
  clientUserCache.delete(userId);
}
