/**
 * 客户端角色管理：CRUD 操作
 */
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "#/db/index";
import { clientRole } from "#/db/schema";
import {
  buildSortClause,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type {
  clientRoleCreateSchema,
  clientRoleListSchema,
  clientRoleUpdateSchema,
} from "./client-role.schemas";

export type ClientRoleRecord = typeof clientRole.$inferSelect;

/** 新建角色入参（schema 单一来源） */
export type CreateClientRoleInput = z.infer<typeof clientRoleCreateSchema>;

/** 更新角色入参（不含 id，id 由服务层独立参数传递） */
export type UpdateClientRoleInput = Omit<z.infer<typeof clientRoleUpdateSchema>, "id">;

/** 角色列表查询参数（分页、关键词、排序） */
export type ClientRoleListParams = z.infer<typeof clientRoleListSchema>;

/** 角色关键词搜索条件（名称 / 标识模糊匹配） */
function keywordCondition(keyword?: string) {
  return keyword
    ? or(ilike(clientRole.name, `%${keyword}%`), ilike(clientRole.slug, `%${keyword}%`))
    : undefined;
}

/** 获取角色列表（支持关键词搜索、分页与排序） */
export async function getClientRoleList(params?: ClientRoleListParams) {
  const { keyword, page = 1, pageSize = 20, sortField, sortOrder } = params ?? {};
  const offset = paginationOffset(page, pageSize);

  const whereCondition = and(notDeleted(clientRole.deletedAt), keywordCondition(keyword));

  // 排序字段安全映射，仅允许已知列
  const sortFieldMap = {
    name: clientRole.name,
    slug: clientRole.slug,
    createdAt: clientRole.createdAt,
    updatedAt: clientRole.updatedAt,
  };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "createdAt");

  return executePaginatedQuery(
    db
      .select()
      .from(clientRole)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(clientRole).where(whereCondition)),
    page,
    pageSize,
  );
}

/** 获取全部角色（不分页，供表单角色下拉使用） */
export async function getAllClientRoles() {
  return db
    .select()
    .from(clientRole)
    .where(notDeleted(clientRole.deletedAt))
    .orderBy(clientRole.createdAt);
}

/** 获取单个角色（仅内部使用） */
async function getClientRole(id: string) {
  const [record] = await db
    .select()
    .from(clientRole)
    .where(and(eq(clientRole.id, id), isNull(clientRole.deletedAt)))
    .limit(1);
  return record;
}

export async function createClientRole(input: CreateClientRoleInput) {
  const [record] = await db
    .insert(clientRole)
    .values({
      name: input.name,
      slug: input.slug,
      permissions: input.permissions,
      description: input.description ?? null,
    })
    .returning();
  return record;
}

export async function updateClientRole(id: string, input: UpdateClientRoleInput) {
  const [record] = await db
    .update(clientRole)
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
    .where(and(eq(clientRole.id, id), isNull(clientRole.deletedAt)))
    .returning();
  return record;
}

/** 删除角色（软删除） */
export async function deleteClientRole(id: string): Promise<boolean> {
  const existing = await getClientRole(id);
  if (!existing) return false;
  await db.update(clientRole).set({ deletedAt: new Date() }).where(eq(clientRole.id, id));
  return true;
}
