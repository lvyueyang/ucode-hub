/**
 * e2e 前置脚本：确保隔离数据库存在 → 重置 schema → 迁移建表 → 种子账号（幂等）
 * 在 webServer 启动前执行，随后服务启动时 bootstrap 自动补齐预置配置/字典/翻译
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { closePool, seedBaseData } from "../helpers/db";
import { APP_DIR, E2E_DB_NAME, getE2eDbUrl, getMaintenanceDbUrl } from "../helpers/env";

/** 确保隔离库存在，缺失时创建 */
export async function ensureE2eDb(): Promise<void> {
  const client = new Client({ connectionString: getMaintenanceDbUrl() });
  await client.connect();
  try {
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [E2E_DB_NAME]);
    if ((res.rowCount ?? 0) === 0) {
      try {
        await client.query(`CREATE DATABASE "${E2E_DB_NAME}"`);
        console.log(`[e2e] 数据库 ${E2E_DB_NAME} 已创建`);
      } catch (err) {
        throw new Error(
          `创建 e2e 数据库 ${E2E_DB_NAME} 失败：请确认数据库用户拥有 CREATEDB 权限（可用 "ALTER USER <user> CREATEDB" 授权）`,
          { cause: err },
        );
      }
    }
  } finally {
    await client.end();
  }
}

/** 丢弃并重建 public / drizzle schema，彻底重置全部表数据与迁移记录 */
export async function resetE2eSchema(): Promise<void> {
  const client = new Client({ connectionString: getE2eDbUrl() });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    // drizzle schema 存放 Drizzle 迁移记录，须一并清空，避免残留哈希导致迁移被跳过
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    console.log("[e2e] 已重置 public / drizzle schema");
  } finally {
    await client.end();
  }
}

/**
 * 直接应用 drizzle/ 下的迁移 SQL（与 drizzle migrate 的 sha256 哈希语义一致，
 * 记录进 __drizzle_migrations 后服务启动时 bootstrap 的 runMigrations 会视为已完成）
 */
export async function migrateE2eDb(): Promise<void> {
  const folder = join(APP_DIR, "drizzle");
  const migrations = readdirSync(folder)
    .map((subdir) => ({
      name: subdir,
      path: join(folder, subdir, "migration.sql"),
    }))
    .filter((m) => existsSync(m.path))
    .sort((a, b) => a.name.localeCompare(b.name));

  const client = new Client({ connectionString: getE2eDbUrl() });
  await client.connect();
  try {
    // 迁移记录表须落在 drizzle schema（Drizzle migrator 的默认 migrationsSchema），
    // 否则服务启动时 bootstrap 的 runMigrations 会读不到已应用记录而重跑全部迁移
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`
			CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
				id serial PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text
			)
		`);
    for (const migration of migrations) {
      const sql = readFileSync(migration.path, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1",
        [hash],
      );
      if ((existing.rowCount ?? 0) > 0) continue;
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name) VALUES ($1, $2, $3)`,
          [hash, Date.now(), migration.name],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      console.log(`[e2e] 已应用迁移 ${migration.name}`);
    }
  } finally {
    await client.end();
  }
}

/** 完整数据准备流程 */
export async function prepareE2eData(): Promise<void> {
  await ensureE2eDb();
  await resetE2eSchema();
  await migrateE2eDb();
  await seedBaseData();
}

// 直接以脚本方式运行时执行（被其他模块 import 时不触发）
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  prepareE2eData()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("[e2e] 数据准备失败:", err);
      process.exit(1);
    });
}
