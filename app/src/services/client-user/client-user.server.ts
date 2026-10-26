/**
 * 客户端用户（client_user）管理：CRUD 操作
 */
import bcrypt from "bcryptjs";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/db/index";
import { clientRole, clientUser } from "#/db/schema";
import { verifyCaptcha } from "#/services/captcha/captcha.server";
import { clearClientUserCache } from "#/services/client-auth/client-auth.server";
import { logger } from "#/shared-services/logger";
import {
  buildSortClause,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type {
  clientUserCreateSchema,
  clientUserListSchema,
  clientUserUpdateSchema,
} from "./client-user.schemas";

export type ClientUserRecord = Omit<typeof clientUser.$inferSelect, "passwordHash" | "deletedAt">;

/** 客户端用户列表项（含角色名称数组） */
export interface ClientUserListItem extends ClientUserRecord {
  roleNames: string[];
}

/** 新建客户端用户入参（schema 单一来源） */
export type CreateClientUserInput = z.infer<typeof clientUserCreateSchema>;

/** 更新客户端用户入参（不含 id，id 由服务层独立参数传递） */
export type UpdateClientUserInput = Omit<z.infer<typeof clientUserUpdateSchema>, "id">;

/** 客户端用户列表查询参数 */
export type ClientUserListParams = z.infer<typeof clientUserListSchema>;

const clientUserSafeCols = {
  id: clientUser.id,
  username: clientUser.username,
  email: clientUser.email,
  avatar: clientUser.avatar,
  clientRoleIds: clientUser.clientRoleIds,
  status: clientUser.status,
  emailVerified: clientUser.emailVerified,
  lastLoginAt: clientUser.lastLoginAt,
  createdAt: clientUser.createdAt,
  updatedAt: clientUser.updatedAt,
};

/** 批量查询客户端角色 id 到名称的映射 */
async function getRoleNameMap(roleIds: string[]): Promise<Map<string, string>> {
  const roles = await db
    .select()
    .from(clientRole)
    .where(and(inArray(clientRole.id, roleIds), isNull(clientRole.deletedAt)));
  return new Map(roles.map((r) => [r.id, r.name]));
}

/** 校验客户端角色 id 均存在且未软删除，防止写入失效角色 */
async function assertClientRolesExist(roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) return;
  const roles = await db
    .select()
    .from(clientRole)
    .where(and(inArray(clientRole.id, roleIds), isNull(clientRole.deletedAt)));
  const found = new Set(roles.map((r) => r.id));
  const invalid = roleIds.filter((id) => !found.has(id));
  if (invalid.length > 0) {
    throw new Error("存在无效或已删除的角色");
  }
}

/** 获取客户端用户列表（支持关键词搜索和排序，排除 password_hash 敏感字段） */
export async function getClientUserList(params?: ClientUserListParams) {
  const { keyword, page = 1, pageSize = 20, sortField, sortOrder } = params ?? {};
  const whereCondition = and(
    notDeleted(clientUser.deletedAt),
    keyword
      ? or(ilike(clientUser.username, `%${keyword}%`), ilike(clientUser.email, `%${keyword}%`))
      : undefined,
  );

  const offset = paginationOffset(page, pageSize);

  const sortFieldMap = {
    createdAt: clientUser.createdAt,
    updatedAt: clientUser.updatedAt,
    username: clientUser.username,
    email: clientUser.email,
  };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "createdAt");

  const result = await executePaginatedQuery(
    db
      .select(clientUserSafeCols)
      .from(clientUser)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(clientUser).where(whereCondition)),
    page,
    pageSize,
  );

  const roleIds = [...new Set(result.records.flatMap((r) => r.clientRoleIds))];
  const roleNameMap = await getRoleNameMap(roleIds);

  return {
    ...result,
    records: result.records.map((r) => ({
      ...r,
      roleNames: r.clientRoleIds
        .map((id) => roleNameMap.get(id))
        .filter((name): name is string => !!name),
    })),
  };
}

/** 获取单个客户端用户（对外形态，不含内部字段） */
export async function getClientUser(id: string) {
  const [record] = await db
    .select(clientUserSafeCols)
    .from(clientUser)
    .where(and(eq(clientUser.id, id), notDeleted(clientUser.deletedAt)))
    .limit(1);
  return record;
}

export async function createClientUser(input: CreateClientUserInput) {
  const roleIds = input.clientRoleIds ?? [];
  await assertClientRolesExist(roleIds);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [record] = await db
    .insert(clientUser)
    .values({
      username: input.username,
      email: input.email,
      passwordHash,
      status: "active",
      clientRoleIds: roleIds,
    })
    .returning(clientUserSafeCols);
  return record;
}

export async function updateClientUser(id: string, input: UpdateClientUserInput) {
  if (input.clientRoleIds !== undefined) {
    await assertClientRolesExist(input.clientRoleIds);
  }

  const setData: Partial<typeof clientUser.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.username !== undefined) setData.username = input.username;
  if (input.email !== undefined) setData.email = input.email;
  if (input.status !== undefined) setData.status = input.status;
  if (input.emailVerified !== undefined) {
    setData.emailVerified = input.emailVerified;
  }
  if (input.clientRoleIds !== undefined) {
    setData.clientRoleIds = input.clientRoleIds;
  }

  const [record] = await db
    .update(clientUser)
    .set(setData)
    .where(and(eq(clientUser.id, id), notDeleted(clientUser.deletedAt)))
    .returning(clientUserSafeCols);
  if (record) {
    // 状态或角色分配变更时清除缓存，避免返回已禁用用户或过期角色列表
    if (input.status !== undefined || input.clientRoleIds !== undefined) {
      clearClientUserCache(id);
    }
  }
  return record;
}

/** 删除客户端用户（软删除） */
export async function deleteClientUser(id: string): Promise<boolean> {
  const existing = await getClientUser(id);
  if (!existing) return false;

  await db.update(clientUser).set({ deletedAt: new Date() }).where(eq(clientUser.id, id));
  clearClientUserCache(id);
  return true;
}

export async function resetClientPassword(id: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const [record] = await db
    .update(clientUser)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(clientUser.id, id), notDeleted(clientUser.deletedAt)))
    .returning();
  return !!record;
}

/** 客户端用户自助重置密码（忘记密码流程）：校验邮箱验证码后更新密码哈希并清缓存 */
export async function resetClientPasswordByEmail(
  email: string,
  captcha: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  const captchaValid = await verifyCaptcha("email", email, captcha);
  if (!captchaValid) {
    return { success: false, message: "验证码错误或已过期" };
  }

  const [user] = await db.select().from(clientUser).where(eq(clientUser.email, email)).limit(1);

  if (!user || user.deletedAt) {
    return { success: false, message: "该邮箱未注册" };
  }

  if (user.status !== "active") {
    return { success: false, message: "该账号已被禁用" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [record] = await db
    .update(clientUser)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(clientUser.id, user.id))
    .returning();

  if (!record) {
    return { success: false, message: "该邮箱未注册" };
  }

  clearClientUserCache(user.id);

  logger.info({ userId: user.id }, "客户端用户密码已重置");
  return { success: true, message: "密码重置成功" };
}
