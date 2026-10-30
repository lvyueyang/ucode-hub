/**
 * 健康检查：聚合数据库与存储目录的依赖状态，供 /health 端点就绪探活
 */
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "#/db";
import { env } from "#/env";

/** 单个依赖的健康状态：up 可用 / down 不可用 */
export type HealthStatus = "up" | "down";

/** 单个依赖的检查结果 */
export interface HealthCheckResult {
  /** 依赖状态 */
  status: HealthStatus;
  /** 检查耗时（毫秒），仅数据库检查提供 */
  latencyMs?: number;
  /** 失败原因（简短描述，不包含连接凭据） */
  error?: string;
}

/** 健康检查报告：聚合所有依赖状态 */
export interface HealthReport {
  /** 总状态：全部依赖可用为 ok，任一不可用为 down */
  status: "ok" | "down";
  /** 进程运行时长（秒） */
  uptime: number;
  /** 检查时间（ISO 8601） */
  timestamp: string;
  /** 应用版本号 */
  version: string;
  /** 各依赖检查明细 */
  checks: {
    database: HealthCheckResult;
    storage: HealthCheckResult;
  };
}

/** 提取错误描述（不含堆栈与凭据） */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 检查数据库连通性：执行 SELECT 1 并记录耗时 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    await db.all(sql`SELECT 1`);
    return {
      status: "up",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return { status: "down", error: toErrorMessage(error) };
  }
}

/** 检查存储目录是否存在、为目录且当前进程可写 */
async function checkStorage(): Promise<HealthCheckResult> {
  const dir = resolve(env.storageDir);
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) {
      return { status: "down", error: `${dir} 不是目录` };
    }
    await access(dir, constants.W_OK);
    return { status: "up" };
  } catch (error) {
    return { status: "down", error: toErrorMessage(error) };
  }
}

/** 生成健康检查报告：并发探测各依赖，任一不可用整体为 down */
export async function checkHealth(): Promise<HealthReport> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  return {
    status: database.status === "up" && storage.status === "up" ? "ok" : "down",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: __APP_VERSION__,
    checks: { database, storage },
  };
}
