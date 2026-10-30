/**
 * 数据库程序化迁移：启动时自动执行 drizzle/ 下的 SQL 迁移文件，幂等安全
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { env } from "#/env";
import { logger } from "#/shared-services/logger";

/** 从 DATABASE_URL 提取数据库文件路径（去除可选的 file: 前缀） */
function getDbPath(): string {
  const url = process.env.DATABASE_URL || "./data/data.db";
  return url.replace(/^file:/, "");
}

export async function runMigrations() {
  const migrationsFolder = resolve(process.cwd(), "drizzle");
  if (!existsSync(migrationsFolder)) {
    // 生产环境迁移目录缺失 = 部署产物不完整，必须 fail-fast：
    // 静默跳过会让应用在 schema 与代码不一致的状态下运行
    if (env.isProduction) {
      throw new Error(`迁移目录不存在，无法执行数据库迁移：${migrationsFolder}`);
    }
    // 开发/测试下允许缺失（如仅跑单测、未生成迁移目录），显式告警以免掩盖问题
    logger.warn({ migrationsFolder }, "迁移目录不存在，跳过数据库迁移（非生产环境）");
    return;
  }

  const dbPath = getDbPath();
  // node:sqlite 不会自动创建父目录，先确保数据目录存在（:memory: 无目录跳过）
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new DatabaseSync(dbPath);
  // WAL 提升并发读性能；foreign_keys 由 node:sqlite 默认开启
  sqlite.exec("PRAGMA journal_mode = WAL");
  const migrationDb = drizzle({ client: sqlite });

  logger.info({ migrationsFolder }, "开始执行数据库迁移");
  // node-sqlite/migrator 的 migrate() 是同步方法，await 无害
  await migrate(migrationDb, {
    migrationsFolder,
    migrationsTable: "__drizzle_migrations",
  });
  logger.info("数据库迁移完成");
}
