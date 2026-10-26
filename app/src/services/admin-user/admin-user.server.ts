/**
 * 管理端用户（admin_user）管理：CRUD 操作
 */
import bcrypt from "bcryptjs";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/db/index";
import { adminRole, adminUser } from "#/db/schema";
import { clearAdminUserCache } from "#/services/admin-auth/admin-auth.server";
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
 * 排除 passwordHash（仅服务端校验用）与 deletedAt（由查询条件表达），供服务层对外返回
 */
export type AdminUserRecord = Omit<typeof adminUser.$inferSelect, "passwordHash" | "deletedAt">;

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

/** 获取管理员列表（含角色名称，支持关键词搜索和排序） */
export async function getAdminUserList(params?: AdminUserListParams) {
  const { keyword, page = 1, pageSize = 20, sortField, sortOrder } = params ?? {};
  const whereCondition = and(
    notDeleted(adminUser.deletedAt),
    keyword
      ? or(ilike(adminUser.username, `%${keyword}%`), ilike(adminUser.email, `%${keyword}%`))
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

export async function resetAdminPassword(id: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const [record] = await db
    .update(adminUser)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(adminUser.id, id), notDeleted(adminUser.deletedAt)))
    .returning();
  return !!record;
}

/** 管理员自助重置密码（忘记密码流程）：校验邮箱验证码后更新密码哈希并清缓存 */
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

  if (!user || user.deletedAt) {
    return { success: false, message: "该邮箱未注册管理员账号" };
  }

  if (user.status !== "active") {
    return { success: false, message: "该账号已被禁用，请联系超级管理员" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [record] = await db
    .update(adminUser)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(adminUser.id, user.id))
    .returning();

  if (!record) {
    return { success: false, message: "该邮箱未注册管理员账号" };
  }

  clearAdminUserCache(user.id);

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
