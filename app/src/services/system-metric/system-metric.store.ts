/**
 * 系统监控采样文件存取：按天 NDJSON 文件追加、枚举、流式读取与过期清理
 * 沿用运行日志「按天切割 + 流式逐行」的存储模式，位于 {STORAGE_DIR}/metrics/
 */
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { toDateString } from "@ucode/hub-lib/date-format";
import { env } from "#/env";
import { iterateLogLines } from "#/services/logs/log-parse";
import type { SystemMetricSample } from "./system-metric.types";

/** 采样文件名格式：YYYY-MM-DD.ndjson */
const METRIC_FILE_RE = /^\d{4}-\d{2}-\d{2}\.ndjson$/;

export function getMetricDir(): string {
  return resolve(env.storageDir, "metrics");
}

/** 指定日期的采样文件绝对路径 */
export function getMetricFilePath(date: string): string {
  return resolve(getMetricDir(), `${date}.ndjson`);
}

/** 追加一条采样记录（按采样时刻所属业务日期写入对应文件） */
export async function appendSample(sample: SystemMetricSample): Promise<void> {
  const dir = getMetricDir();
  await mkdir(dir, { recursive: true });
  const date = toDateString(new Date(sample.time));
  await appendFile(getMetricFilePath(date), `${JSON.stringify(sample)}\n`, "utf-8");
}

/**
 * 列出日期范围内的采样文件，按日期升序
 * @param startDate 起始日期（YYYY-MM-DD，含）
 * @param endDate 结束日期（YYYY-MM-DD，含）
 */
export function listMetricFiles(startDate?: string, endDate?: string): string[] {
  if (!existsSync(getMetricDir())) return [];
  return readdirSync(getMetricDir())
    .filter((f) => METRIC_FILE_RE.test(f) && isFileInDateRange(f, startDate, endDate))
    .sort();
}

/** 判断采样文件是否落在日期范围内 */
function isFileInDateRange(filename: string, startDate?: string, endDate?: string): boolean {
  const dateStr = filename.replace(".ndjson", "");
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

/** 解析单行采样记录，非法行返回 null（跳过不完整写入） */
function parseSample(line: string): SystemMetricSample | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SystemMetricSample;
    }
    return null;
  } catch {
    return null;
  }
}

/** 流式读取多个采样文件（逐行解析，不物化整文件） */
export async function* iterateSamples(files: string[]): AsyncGenerator<SystemMetricSample> {
  for (const file of files) {
    const filePath = getMetricFilePath(file);
    if (!existsSync(filePath)) continue;
    for await (const line of iterateLogLines(filePath)) {
      const sample = parseSample(line);
      if (sample) yield sample;
    }
  }
}

/**
 * 清理超过保留期的采样文件
 * @param retentionDays 保留天数，默认 7 天
 * @returns 删除的文件数量
 */
export function cleanupSystemMetrics(retentionDays = 7): number {
  const dir = getMetricDir();
  if (!existsSync(dir)) return 0;

  // 截止日期按业务统一时区计算，与文件按天切割基准一致
  const [y, m, d] = toDateString(new Date()).split("-").map(Number);
  const cutoffStr = toDateString(new Date(Date.UTC(y, m - 1, d - retentionDays)));

  const files = readdirSync(dir).filter((f) => METRIC_FILE_RE.test(f));
  let deleted = 0;
  for (const f of files) {
    if (f.replace(".ndjson", "") < cutoffStr) {
      try {
        unlinkSync(resolve(dir, f));
        deleted++;
      } catch {
        // 单个文件删除失败不阻断整体清理
      }
    }
  }
  return deleted;
}
