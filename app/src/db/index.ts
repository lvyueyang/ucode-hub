/**
 * 数据库客户端：基于 node:sqlite + drizzle
 * 单文件库 + WAL；withTransaction 统一事务助手（回调必须同步，node:sqlite 同步提交）
 */
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";

/** 数据库实例类型（无 relations，查询一律使用 query builder） */
export type Db = NodeSQLiteDatabase;

/** 从 db.transaction 回调参数推导事务实例类型，规避与内部 SQLiteAsyncTransaction 的协变/逆变偏差 */
type TxOf<D> = D extends {
  transaction: (fn: (tx: infer T) => unknown, ...args: never[]) => unknown;
}
  ? T
  : never;

/** 事务实例类型（无 relations，查询一律使用 query builder） */
export type Tx = TxOf<Db>;

/** 从 DATABASE_URL 提取数据库文件路径（去除可选的 file: 前缀） */
function getDbPath(): string {
  const url = process.env.DATABASE_URL || "./data/data.db";
  return url.replace(/^file:/, "");
}

function createDb(): Db {
  const dbPath = getDbPath();
  // node:sqlite 不会自动创建父目录，先确保数据目录存在（:memory: 无目录跳过）
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new DatabaseSync(dbPath);
  // WAL 提升并发读性能；foreign_keys 由 node:sqlite 默认开启（enableForeignKeyConstraints 默认 true）
  sqlite.exec("PRAGMA journal_mode = WAL");
  // 库文件里只有口令哈希与业务数据：权限收紧到仅属主可读写（WAL/SHM 沿用主库文件权限）
  if (dbPath !== ":memory:") {
    try {
      chmodSync(dbPath, 0o600);
    } catch {
      // Windows 上 chmod 语义有限，拿不到就交给部署侧的文件属主约束
    }
  }
  return drizzle({ client: sqlite });
}

let _dbInstance: Db | null = null;

/** 懒加载 db 实例的 Proxy：所有属性访问触发时初始化，延迟 db 实例初始化至首次属性访问 */
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    if (!_dbInstance) {
      _dbInstance = createDb();
    }
    return (_dbInstance as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** 事务助手：统一 db.transaction 用法（同步回调，node:sqlite 事务不可 async） */
export function withTransaction<T>(fn: (tx: Tx) => T): T {
  return db.transaction(fn as never) as T;
}
