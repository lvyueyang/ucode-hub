/**
 * 数据库占用查询（PostgreSQL 方言）：库总量与各表（含索引）占用
 * 方言相关 SQL 集中于此，衍生项目切换 MySQL / SQLite 时仅需改写本文件
 */
import { sql } from "drizzle-orm";
import { db } from "#/db";
import { extractRows } from "#/shared-services/query/query-utils.server";
import type { TableSizeEntry } from "./system-metric.types";

/** 查询当前数据库总大小（字节，bigint 由驱动返回字符串） */
export async function getDatabaseTotalBytes(): Promise<number> {
  const result = await db.execute(sql`
		SELECT pg_database_size(current_database()) AS size
	`);
  const row = extractRows<{ size: string | number }>(result)[0];
  return Number(row?.size ?? 0);
}

/** 查询 public schema 下各表占用（表数据 / 索引 / 合计，按合计降序） */
export async function getTableSizes(): Promise<TableSizeEntry[]> {
  const result = await db.execute(sql`
		SELECT c.relname AS table_name,
		       pg_relation_size(c.oid) AS table_bytes,
		       pg_indexes_size(c.oid) AS index_bytes,
		       pg_total_relation_size(c.oid) AS total_bytes
		  FROM pg_class c
		  JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE n.nspname = 'public' AND c.relkind = 'r'
		 ORDER BY total_bytes DESC
	`);
  return extractRows<{
    table_name: string;
    table_bytes: string | number;
    index_bytes: string | number;
    total_bytes: string | number;
  }>(result).map((row) => ({
    tableName: row.table_name,
    tableBytes: Number(row.table_bytes ?? 0),
    indexBytes: Number(row.index_bytes ?? 0),
    totalBytes: Number(row.total_bytes ?? 0),
  }));
}
