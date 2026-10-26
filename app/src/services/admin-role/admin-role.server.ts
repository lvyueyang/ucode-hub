/**
 * 管理端角色管理：CRUD 操作
 */
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/db/index";
import { adminRole } from "#/db/schema";
import {
  buildSortClause,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type {
  adminRoleCreateSchema,
  adminRoleListSchema,
  adminRoleUpdateSchema,
} from "./admin-role.schemas";

export type AdminRoleRecord = typeof adminRole.$inferSelect;

/** 新建角色入参（schema 单一来源） */
export type CreateAdminRoleInput = z.infer<typeof adminRoleCreateSchema>;

/** 更新角色入参（不含 id，id 由服务层独立参数传递） */
export type UpdateAdminRoleInput = Omit<z.infer<typeof adminRoleUpdateSchema>, "id">;

/** 角色列表查询参数（分页、关键词、排序） */
export type AdminRoleListParams = z.infer<typeof adminRoleListSchema>;

/** 角色关键词搜索条件（名称 / 标识模糊匹配） */
function keywordCondition(keyword?: string) {
  return keyword
    ? or(ilike(adminRole.name, `%${keyword}%`), ilike(adminRole.slug, `%${keyword}%`))
    : undefined;
}

/** 获取角色列表（支持关键词搜索、分页与排序） */
export async function getAdminRoleList(params?: AdminRoleListParams) {
  const { keyword, page = 1, pageSize = 20, sortField, sortOrder } = params ?? {};
  const offset = paginationOffset(page, pageSize);

  const whereCondition = and(notDeleted(adminRole.deletedAt), keywordCondition(keyword));

  // 排序字段安全映射，仅允许已知列
  const sortFieldMap = {
    name: adminRole.name,
    slug: adminRole.slug,
    createdAt: adminRole.createdAt,
    updatedAt: adminRole.updatedAt,
  };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "createdAt");

  return executePaginatedQuery(
    db
      .select()
      .from(adminRole)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(adminRole).where(whereCondition)),
    page,
    pageSize,
  );
}

/** 获取全部角色（不分页，供表单角色下拉使用） */
export async function getAllAdminRoles() {
  return db
    .select()
    .from(adminRole)
    .where(notDeleted(adminRole.deletedAt))
    .orderBy(adminRole.createdAt);
}

/** 获取单个角色（仅内部使用） */
async function getAdminRole(id: string) {
  const [record] = await db
    .select()
    .from(adminRole)
    .where(and(eq(adminRole.id, id), isNull(adminRole.deletedAt)))
    .limit(1);
  return record;
}

export async function createAdminRole(input: CreateAdminRoleInput) {
  const [record] = await db
    .insert(adminRole)
    .values({
      name: input.name,
      slug: input.slug,
      permissions: input.permissions,
      description: input.description ?? null,
    })
    .returning();
  return record;
}

export async function updateAdminRole(id: string, input: UpdateAdminRoleInput) {
  const [record] = await db
    .update(adminRole)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.permissions !== undefined && {
        permissions: input.permissions,
      }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(adminRole.id, id), isNull(adminRole.deletedAt)))
    .returning();
  return record;
}

/** 删除角色（软删除） */
export async function deleteAdminRole(id: string): Promise<boolean> {
  const existing = await getAdminRole(id);
  if (!existing) return false;
  await db.update(adminRole).set({ deletedAt: new Date() }).where(eq(adminRole.id, id));
  return true;
}
