/**
 * e2e 环境工具：从应用 env 文件推导隔离数据库文件路径
 */

import { readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** app 包目录（由本文件位置向上两级） */
export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** 加载 app/.env 与 app/.env.local（.env.local 优先级更高，与 dev 行为一致） */
function loadAppEnv(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    try {
      Object.assign(merged, dotenv.parse(readFileSync(resolve(APP_DIR, file), "utf8")));
    } catch {
      // 文件不存在时跳过
    }
  }
  return merged;
}

/** 开发库文件路径：去掉 DATABASE_URL 可选的 file: 前缀，相对路径按 app 目录解析（与 app 的取值口径一致） */
function getBaseDbPath(): string {
  const url = loadAppEnv().DATABASE_URL ?? "./data/data.db";
  return resolve(APP_DIR, url.replace(/^file:/, ""));
}

/**
 * e2e 隔离库文件路径：可经 E2E_DB_URL 覆盖，默认在基础库文件名上加 _e2e 后缀（data.db → data_e2e.db）
 *
 * 基准路径只从 env 文件推导，不读 process.env.DATABASE_URL：playwright 的 webServer 会把 e2e 路径
 * 写进 DATABASE_URL 交给整条命令（prepare.ts 也在其中），以它为准会再套一次后缀、越推越深。
 */
export function getE2eDbPath(): string {
  const override = process.env.E2E_DB_URL;
  if (override) return resolve(APP_DIR, override.replace(/^file:/, ""));
  const base = getBaseDbPath();
  const { dir, name } = parse(base);
  return join(dir, `${name}_e2e.db`);
}

/** e2e 数据库路径（名沿用 URL 语义：它就是要传给应用的 DATABASE_URL，playwright.config 依赖此名） */
export function getE2eDbUrl(): string {
  return getE2eDbPath();
}
