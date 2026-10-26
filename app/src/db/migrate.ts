/**
 * 数据库程序化迁移：启动时自动执行 drizzle/ 下的 SQL 迁移文件，幂等安全
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "#/env";
import { logger } from "#/shared-services/logger";

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
  // 连接串缺失由 env 抛出（启动期已拦下，这里只是运行期防线）
  const migrationDb = drizzle(env.databaseUrl);

  logger.info({ migrationsFolder }, "开始执行数据库迁移");
  await migrate(migrationDb, {
    migrationsFolder,
    migrationsTable: "__drizzle_migrations",
  });
  logger.info("数据库迁移完成");
}
