/**
 * 数据库迁移 CLI 入口：供 pnpm db:migrate 调用
 * drizzle-kit v1.0.0-rc.4 的 migrate 命令存在 CREATE SCHEMA 断连 bug（ECONNRESET），
 * 改走程序化 migrate，与生产 bootstrap 的 runMigrations 路径完全一致
 */
import { config } from "dotenv";
import { runMigrations } from "./migrate";

config({ path: [".env.local", ".env"] });

await runMigrations();
