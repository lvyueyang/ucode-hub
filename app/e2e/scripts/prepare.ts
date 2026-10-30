/**
 * e2e 前置脚本：重置隔离库文件 → 迁移建表 → 种子账号（幂等）
 * 在 webServer 启动前执行，随后服务启动时 bootstrap 自动补齐预置配置/字典/翻译
 */

import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { closeE2eDb, seedBaseData } from "../helpers/db";
import { APP_DIR, getE2eDbPath } from "../helpers/env";

/**
 * 重置隔离库：SQLite 的全部状态（表、数据、迁移记录）都在库文件里，删文件即彻底重置；
 * 库文件处于 WAL 模式，须连同 -wal / -shm 伴生文件一起删除，否则残留日志会被新库回放
 */
export function resetE2eDb(): void {
  const dbPath = getE2eDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    rmSync(file, { force: true });
  }
  console.log(`[e2e] 已重置 e2e 数据库文件 ${dbPath}`);
}

/**
 * 应用 drizzle/ 下的迁移：与服务启动时 bootstrap 的 runMigrations 走同一迁移器与迁移记录表
 * （__drizzle_migrations），服务随后再执行迁移时会读到已应用记录直接跳过
 */
export function migrateE2eDb(): void {
  const migrationsFolder = join(APP_DIR, "drizzle");
  const sqlite = new DatabaseSync(getE2eDbPath());
  try {
    // WAL 提升并发读性能；foreign_keys 由 node:sqlite 默认开启
    sqlite.exec("PRAGMA journal_mode = WAL");
    migrate(drizzle({ client: sqlite }), {
      migrationsFolder,
      migrationsTable: "__drizzle_migrations",
    });
    console.log("[e2e] 已执行数据库迁移");
  } finally {
    // 迁移连接必须在种子前关闭，避免与后续连接争库文件锁
    sqlite.close();
  }
}

/** 完整数据准备流程 */
export async function prepareE2eData(): Promise<void> {
  resetE2eDb();
  migrateE2eDb();
  await seedBaseData();
}

// 直接以脚本方式运行时执行（被其他模块 import 时不触发）
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  prepareE2eData()
    .then(() => closeE2eDb())
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("[e2e] 数据准备失败:", err);
      process.exit(1);
    });
}
