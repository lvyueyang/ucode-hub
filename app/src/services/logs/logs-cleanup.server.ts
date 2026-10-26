/**
 * 日志文件清理：删除超过保留期的日志文件
 */
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { toDateString } from "@ucode/hub-lib/date-format";
import { env } from "#/env";
import { logger } from "#/shared-services/logger";

/** 日志文件名日期格式 */
const LOG_DATE_RE = /^\d{4}-\d{2}-\d{2}\.log$/;

/**
 * 清理超过保留期的日志文件
 * @param retentionDays 日志保留天数，默认 30 天
 * @returns 删除的文件数量
 */
export function cleanExpiredLogs(retentionDays = 30): number {
  const logDir = resolve(env.storageDir, "logs");
  if (!existsSync(logDir)) return 0;

  // 截止日期按业务统一时区计算，与日志文件名切割基准保持一致
  const [y, m, d] = toDateString(new Date()).split("-").map(Number);
  // 用 UTC 构造日期减法避免本地时区干扰，再格式化为业务时区日期字符串
  const cutoffStr = toDateString(new Date(Date.UTC(y, m - 1, d - retentionDays)));

  const files = readdirSync(logDir).filter((f) => LOG_DATE_RE.test(f));
  let deleted = 0;
  for (const f of files) {
    const dateStr = f.replace(".log", "");
    if (dateStr < cutoffStr) {
      try {
        unlinkSync(join(logDir, f));
        deleted++;
      } catch (err) {
        logger.warn({ file: f, error: (err as Error).message }, "清理日志文件失败");
      }
    }
  }
  return deleted;
}
