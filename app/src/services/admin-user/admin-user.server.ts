/**
 * 管理端用户（admin_user）管理：CRUD 操作
 */
import { matchPermission } from "@ucode/hub-lib/match-permission";
import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/db/index";
import { adminRole, adminUser } from "#/db/schema";
import {
  bumpAdminTokenVersion,
  clearAdminUserCache,
} from "#/services/admin-auth/admin-auth.server";
import { verifyCaptcha } from "#/services/captcha/captcha.server";
import { logger } from "#/shared-services/logger";
import { logOperation } from "#/shared-services/operation-log/operation-log.server";
import {
  buildSortClause,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type {
  adminUserCreateSchema,
  adminUserListSchema,
  adminUserUpdateSchema,
} from "./admin-user.schemas";

/**
 * 管理员记录（对外形态）
 * 排除 passwordHash（仅服务端校验用）、tokenVersion（会话版本，仅服务端比对）与 deletedAt（由查询条件表达），供服务层对外返回
 */
export type AdminUserRecord = Omit<
  typeof adminUser.$inferSelect,
  "passwordHash" | "tokenVersion" | "deletedAt"
>;

/** 管理员列表项（含角色名称数组） */
export interface AdminUserListItem extends AdminUserRecord {
  roleNames: string[];
}

/**
 * 可出服务端的字段投影
 * 服务层所有对外返回的记录（列表 / 详情 / 新建 / 更新）统一经此投影，避免内部列泄漏
 */
const adminUserSafeCols = {
  id: adminUser.id,
  username: adminUser.username,
  email: adminUser.email,
  emailVerified: adminUser.emailVerified,
  avatar: adminUser.avatar,
  adminRoleIds: adminUser.adminRoleIds,
  isRoot: adminUser.isRoot,
  status: adminUser.status,
  lastLoginAt: adminUser.lastLoginAt,
  createdAt: adminUser.createdAt,
  updatedAt: adminUser.updatedAt,
};

/** 新建管理员入参（schema 单一来源） */
export type CreateAdminUserInput = z.infer<typeof adminUserCreateSchema>;

/** 更新管理员入参（不含 id，id 由服务层独立参数传递） */
export type UpdateAdminUserInput = Omit<z.infer<typeof adminUserUpdateSchema>, "id">;

/** 管理员列表查询参数 */
export type AdminUserListParams = z.infer<typeof adminUserListSchema>;

/** 批量查询角色 id 到名称的映射 */
async function getRoleNameMap(roleIds: string[]): Promise<Map<string, string>> {
  const roles = await db
    .select()
    .from(adminRole)
    .where(and(inArray(adminRole.id, roleIds), isNull(adminRole.deletedAt)));
  return new Map(roles.map((r) => [r.id, r.name]));
}

/** 校验角色 id 均存在且未软删除，防止写入失效角色 */
async function assertAdminRolesExist(roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const roles = await db
    .select()
    .from(adminRole)
    .where(and(inArray(adminRole.id, roleIds), isNull(adminRole.deletedAt)));
  const found = new Set(roles.map((r) => r.id));
  const invalid = roleIds.filter((id) => !found.has(id));
  if (invalid.length > 0) {
    throw new Error("存在无效或已删除的角色");
  }
}

/** 发起角色分配的人（只取判定需要的字段） */
export type AdminActor = {
  id: string;
  isRoot: boolean;
  /** 当前账号自己的权限码集合（root 为 `**`） */
  rolePermissions: string[];
};

/**
 * 角色分配不得越级：非 root 只能授出「自己权限集覆盖得住」的角色。
 * `**` 也当作一个权限码参与判定，所以含超级管理员权限的角色只有 root 能授出——
 * 不拦的话，「编辑管理员」权限就等于自己给自己提权。
 */
export async function assertAdminRoleAssignmentAllowed(
  actor: AdminActor,
  roleIds: string[],
): Promise<void> {
  if (actor.isRoot || roleIds.length === 0) return;
  const roles = await db
    .select()
    .from(adminRole)
    .where(and(inArray(adminRole.id, roleIds), isNull(adminRole.deletedAt)));
  for (const role of roles) {
    const permissions = (role.permissions as string[]) ?? [];
    if (permissions.some((code) => !matchPermission(actor.rolePermissions, code))) {
      throw new Error(`不能分配超出自己权限范围的角色：${role.name}`);
    }
  }
}

/** 获取管理员列表（含角色名称，支持关键词搜索和排序） */
export async function getAdminUserList(params?: AdminUserListParams) {
  const { keyword, page = 1, pageSize = 20, sortField, sortOrder } = params ?? {};
  const whereCondition = and(
    notDeleted(adminUser.deletedAt),
    keyword
      ? or(like(adminUser.username, `%${keyword}%`), like(adminUser.email, `%${keyword}%`))
      : undefined,
  );

  const offset = paginationOffset(page, pageSize);

  const sortFieldMap = {
    createdAt: adminUser.createdAt,
    updatedAt: adminUser.updatedAt,
    username: adminUser.username,
    email: adminUser.email,
    lastLoginAt: adminUser.lastLoginAt,
  };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "createdAt");

  const result = await executePaginatedQuery(
    db
      .select(adminUserSafeCols)
      .from(adminUser)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(adminUser).where(whereCondition)),
    page,
    pageSize,
  );

  const roleIds = [...new Set(result.records.flatMap((r) => r.adminRoleIds))];
  const roleNameMap = await getRoleNameMap(roleIds);

  return {
    ...result,
    records: result.records.map((r) => ({
      ...r,
      roleNames: r.adminRoleIds
        .map((id) => roleNameMap.get(id))
        .filter((name): name is string => !!name),
    })),
  };
}

/** 获取单个管理员（对外形态，不含内部字段） */
export async function getAdminUser(id: string) {
  const [record] = await db
    .select(adminUserSafeCols)
    .from(adminUser)
    .where(and(eq(adminUser.id, id), notDeleted(adminUser.deletedAt)))
    .limit(1);
  return record;
}

export async function createAdminUser(input: CreateAdminUserInput) {
  await assertAdminRolesExist(input.adminRoleIds);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [record] = await db
    .insert(adminUser)
    .values({
      username: input.username,
      email: input.email,
      passwordHash,
      adminRoleIds: input.adminRoleIds,
      status: "active",
    })
    .returning(adminUserSafeCols);
  return record;
}

export async function updateAdminUser(id: string, input: UpdateAdminUserInput) {
  // 禁止将 root 管理员设为禁用状态
  if (input.status === "disabled") {
    const existing = await getAdminUser(id);
    if (existing?.isRoot) throw new Error("不允许禁用 root 管理员");
  }
  if (input.adminRoleIds !== undefined) {
    await assertAdminRolesExist(input.adminRoleIds);
  }

  const setData: Partial<typeof adminUser.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.username !== undefined) setData.username = input.username;
  if (input.email !== undefined) setData.email = input.email;
  if (input.adminRoleIds !== undefined) {
    setData.adminRoleIds = input.adminRoleIds;
  }
  if (input.status !== undefined) setData.status = input.status;

  const [record] = await db
    .update(adminUser)
    .set(setData)
    .where(and(eq(adminUser.id, id), notDeleted(adminUser.deletedAt)))
    .returning(adminUserSafeCols);
  if (record) {
    // 角色分配变更时清除缓存，避免鉴权读到过期角色列表
    if (input.adminRoleIds !== undefined || input.status !== undefined) {
      clearAdminUserCache(id);
    }
  }
  return record;
}

/** 删除管理员（软删除，不允许删除 root 和自己） */
export async function deleteAdminUser(id: string, currentUserId: string): Promise<boolean> {
  const existing = await getAdminUser(id);
  if (!existing) return false;
  if (existing.isRoot) throw new Error("不允许删除 root 管理员");
  if (existing.id === currentUserId) throw new Error("不允许删除自己的账号");

  await db.update(adminUser).set({ deletedAt: new Date() }).where(eq(adminUser.id, id));
  // 清除缓存，避免软删除的管理员在 TTL 内仍保持登录态
  clearAdminUserCache(id);
  return true;
}

/** 管理员重置指定账号的密码：更新哈希后作废该账号已签发的全部令牌 */
export async function resetAdminPassword(id: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const [record] = await db
    .update(adminUser)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(adminUser.id, id), notDeleted(adminUser.deletedAt)))
    .returning();
  // 改密即自增令牌版本：作废该账号在其它浏览器 / 设备上的会话（替代单独清缓存）
  if (record) await bumpAdminTokenVersion(id);
  return !!record;
}

/** 管理员自助重置密码（忘记密码流程）：校验邮箱验证码后更新密码哈希并作废已签发令牌 */
export async function resetAdminPasswordByEmail(
  email: string,
  captcha: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  const captchaValid = await verifyCaptcha("email", email, captcha);
  if (!captchaValid) {
    return { success: false, message: "验证码错误或已过期" };
  }

  const [user] = await db.select().from(adminUser).where(eq(adminUser.email, email)).limit(1);

  // 未注册、已删除、已停用一律同一句：否则这个未鉴权接口就是邮箱枚举的口子。
  // 另外：未确认的邮箱不能用作恢复通道（初始化写入的邮箱视为已确认）。
  if (!user || user.deletedAt || user.status !== "active" || !user.emailVerified) {
    return { success: false, message: "该邮箱不可用于重置密码" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [record] = await db
    .update(adminUser)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(adminUser.id, user.id))
    .returning();

  if (!record) {
    return { success: false, message: "该邮箱不可用于重置密码" };
  }

  // 作废已签发令牌（内部同时清缓存）；先落状态再补审计，保证审计里的结果与库内一致
  await bumpAdminTokenVersion(user.id);

  // 密码重置属关键状态变更，补审计（operator 为被重置的管理员自身）
  logOperation({
    operatorId: user.id,
    operatorName: user.username,
    operatorType: "admin",
    module: "admin-auth",
    action: "reset_password",
    targetType: "adminUser",
    targetId: user.id,
    targetName: user.username,
  });

  logger.info({ userId: user.id }, "管理员密码已重置");
  return { success: true, message: "密码重置成功，请使用新密码登录" };
}
