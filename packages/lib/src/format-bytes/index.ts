/**
 * 字节数可读化工具：按 B / KB / MB / GB / TB 逐级换算
 */

/** 字节单位阶梯 */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * 字节数 → 人类可读字符串
 * @param bytes 字节数，非正数或非有限数返回 "0 B"
 * @param precision 小数位数，B 级固定 0 位
 */
export function formatBytes(bytes: number, precision = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : precision)} ${BYTE_UNITS[index]}`;
}
