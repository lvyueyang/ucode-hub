/**
 * 数据库客户端：基于 pg.Pool + drizzle
 * 连接池参数显式化，默认值与校验统一在 env 模块；withTransaction 统一事务助手
 */
import { drizzle, type NodePgDatabase, type NodePgTransaction } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "#/env";

/** 数据库实例类型（无 schema 模式，查询一律使用 query builder） */
export type Db = NodePgDatabase;

/** 事务实例类型（无 relations，传空关系表） */
export type Tx = NodePgTransaction<Record<string, never>>;

/** 创建 pg 连接池：参数由 env 提供 */
function createPool(): Pool {
  return new Pool({
    connectionString: env.databaseUrl,
    max: env.dbPoolMax,
    idleTimeoutMillis: env.dbPoolIdleTimeoutMs,
    connectionTimeoutMillis: env.dbPoolConnectionTimeoutMs,
  });
}

/** 数据库实例（单例；pg.Pool 在首次查询时才真正建立连接，无惰性代理） */
export const db: Db = drizzle({ client: createPool() });

/** 事务助手：统一 db.transaction 用法，供服务层复用 */
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
