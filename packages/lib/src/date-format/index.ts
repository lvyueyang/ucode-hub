/**
 * 业务日期工具：统一 Asia/Shanghai 时区基准（中国无夏令时，偏移固定 +08:00）
 * 定时任务调度、日志按天切割、按天查询的日期边界均以本模块为单一来源
 */
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 业务统一时区：中国标准时间（无夏令时） */
export const DEFAULT_TASK_TIME_ZONE = "Asia/Shanghai";

/** YYYY-MM-DD 日期字符串格式校验正则 */
export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 校验 YYYY-MM-DD 是否为真实存在的日历日期（拒绝如 2024-02-31）
 * 仅格式正则无法拦截不存在的日期，dayjs 非严格解析会静默进位，导致查询窗口偏移
 */
export function isValidDateStr(dateStr: string): boolean {
  if (!DATE_ONLY_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * 计算指定时区相对 UTC 的固定偏移（分钟）
 * 参考时刻取固定 UTC 零点，避免受服务器本地时区影响
 */
function getTimeZoneOffset(timeZone: string): number {
  return dayjs.tz("2000-01-01T00:00:00Z", timeZone).utcOffset();
}

/**
 * 将日期格式化为指定时区的 YYYY-MM-DD 字符串
 * @param date 任意绝对时刻
 * @param timeZone 目标时区，默认 Asia/Shanghai
 */
export function toDateString(date: Date, timeZone = DEFAULT_TASK_TIME_ZONE): string {
  return dayjs.tz(date, timeZone).format("YYYY-MM-DD");
}

/**
 * 将 YYYY-MM-DD 字符串解析为指定时区当日 00:00 的绝对时刻
 * 说明：目标时区当日 00:00 = UTC 当日 00:00 减去时区偏移分钟数，
 * 全程基于 UTC 时刻计算，与服务器本地时区无关
 * @param dateStr 形如 YYYY-MM-DD 的日期字符串
 * @param timeZone 目标时区，默认 Asia/Shanghai
 */
export function parseDateOnly(dateStr: string, timeZone = DEFAULT_TASK_TIME_ZONE): Date {
  const offset = getTimeZoneOffset(timeZone);
  return dayjs.utc(dateStr, "YYYY-MM-DD").subtract(offset, "minute").toDate();
}

/**
 * 将 YYYY-MM-DD 字符串解析为指定时区的当天排他区间 [当日00:00, 次日00:00)
 * @param dateStr 形如 YYYY-MM-DD 的日期字符串
 * @param timeZone 目标时区，默认 Asia/Shanghai
 */
export function toDayRange(
  dateStr: string,
  timeZone = DEFAULT_TASK_TIME_ZONE,
): { start: Date; end: Date } {
  const start = parseDateOnly(dateStr, timeZone);
  // UTC 模式加一天（固定 24h），避免本地时区 DST 导致偏移；Asia/Shanghai 无夏令时，次日 00:00 恒为 +1 天
  const end = dayjs.utc(start).add(1, "day").toDate();
  return { start, end };
}
