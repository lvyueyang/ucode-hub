/**
 * e2e 环境工具：从应用 env 文件推导隔离数据库连接串
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** app 包目录（由本文件位置向上两级） */
export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * e2e 专用隔离数据库名：可经 E2E_DB_NAME 覆盖，默认取开发库名 + _e2e 后缀（避免硬编码品牌库名）
 * 注意：必须在 APP_DIR 初始化之后求值（loadAppEnv 依赖 APP_DIR）
 */
export const E2E_DB_NAME =
  process.env.E2E_DB_NAME ?? `${new URL(loadAppEnv().DATABASE_URL).pathname.slice(1) || "app"}_e2e`;

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

/** 获取 e2e 数据库连接串（复用本地数据库凭据，仅替换库名） */
export function getE2eDbUrl(): string {
  const url = new URL(loadAppEnv().DATABASE_URL);
  url.pathname = `/${E2E_DB_NAME}`;
  return url.toString();
}

/** 获取建库用维护连接串（连到默认 postgres 库） */
export function getMaintenanceDbUrl(): string {
  const url = new URL(loadAppEnv().DATABASE_URL);
  url.pathname = "/postgres";
  return url.toString();
}
