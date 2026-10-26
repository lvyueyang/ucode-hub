/**
 * 通用查询工具函数：软删除条件、排序构建、分页执行
 */
import { type AnyColumn, asc, desc, isNull, type SQL, type SQLWrapper } from "drizzle-orm";
import type { PaginatedResult, SortOrder } from "#/types/query";

/** 默认分页值 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

/** 构建软删除条件：`isNull(table.deletedAt)` */
export function notDeleted(deletedAtColumn: SQLWrapper): SQL {
  return isNull(deletedAtColumn);
}

export function paginationOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * 从 db.execute 结果中提取行数组
 * drizzle v1 的 node-postgres 驱动返回 `{ rows }` 结构而非数组，类型声明未覆盖该形态，
 * 故在此单点收敛断言，调用方按预期行类型取值（缺 rows 时返回空数组）
 */
export function extractRows<T>(result: unknown): T[] {
  return (result as { rows?: T[] }).rows ?? [];
}

/**
 * 安全构建排序子句：通过字段映射表校验 sortField，防止非法字段注入
 * @param fieldMap 排序字段映射表（key → 列对象）
 * @param sortField 前端传入的排序字段名
 * @param sortOrder 排序方向 ("ascend" | "descend")
 * @param defaultField 无有效排序参数时的默认字段
 */
export function buildSortClause<T extends Record<string, AnyColumn | SQLWrapper>>(
  fieldMap: T,
  sortField: string | undefined,
  sortOrder: SortOrder | undefined,
  defaultField: keyof T,
): SQL {
  const col = (sortField && fieldMap[sortField]) || fieldMap[defaultField];
  return sortOrder === "ascend" ? asc(col) : desc(col);
}

/**
 * 执行分页查询：并行执行数据查询和计数查询，返回标准分页结构
 */
export async function executePaginatedQuery<T>(
  dataQuery: Promise<T[]>,
  countQuery: Promise<number>,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<T>> {
  const [records, total] = await Promise.all([dataQuery, countQuery]);
  return { records, total, page, pageSize };
}
