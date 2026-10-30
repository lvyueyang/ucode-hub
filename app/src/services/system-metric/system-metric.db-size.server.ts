/**
 * 数据库占用查询（SQLite 方言）：库文件总量与各表（含其索引）占用
 * 方言相关 SQL 集中于此，衍生项目切换其它库时仅需改写本文件
 */
import { sql } from "drizzle-orm";
import { db } from "#/db";
import type { TableSizeEntry } from "./system-metric.types";

/** 查询当前数据库总大小（字节）：页数 × 页大小 */
export async function getDatabaseTotalBytes(): Promise<number> {
  const [pageCount] = await db.all<{ page_count: number }>(sql`PRAGMA page_count`);
  const [pageSize] = await db.all<{ page_size: number }>(sql`PRAGMA page_size`);
  return Number(pageCount?.page_count ?? 0) * Number(pageSize?.page_size ?? 0);
}

/**
 * 查询各表占用（表数据 / 索引 / 合计，按合计降序）。
 * 依赖 SQLite 的 `dbstat` 虚拟表：它按 b-tree 页记账，索引页的名字是索引名，
 * 因此先用 `sqlite_master` 把索引页归回所属表，再按表聚合。
 */
export async function getTableSizes(): Promise<TableSizeEntry[]> {
  const rows = await db.all<{
    table_name: string;
    table_bytes: number;
    index_bytes: number;
    total_bytes: number;
  }>(sql`
    SELECT t.name AS table_name,
           SUM(CASE WHEN d.name = t.name THEN d.pgsize ELSE 0 END) AS table_bytes,
           SUM(CASE WHEN d.name <> t.name THEN d.pgsize ELSE 0 END) AS index_bytes,
           SUM(d.pgsize) AS total_bytes
      FROM dbstat d
      JOIN sqlite_master t
        ON t.type = 'table'
       AND (t.name = d.name
            OR t.name = (SELECT m.tbl_name
                           FROM sqlite_master m
                          WHERE m.type = 'index' AND m.name = d.name))
     WHERE t.name NOT LIKE 'sqlite_%'
     GROUP BY t.name
     ORDER BY total_bytes DESC
  `);

  return rows.map((row) => ({
    tableName: row.table_name,
    tableBytes: Number(row.table_bytes ?? 0),
    indexBytes: Number(row.index_bytes ?? 0),
    totalBytes: Number(row.total_bytes ?? 0),
  }));
}
