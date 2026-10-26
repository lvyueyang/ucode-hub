/**
 * 布尔值解析工具：系统配置等以字符串存储的布尔值统一转布尔
 */

/**
 * 解析布尔值：兼容 "true"/"false"/"1"/"0"/数字 1/空值，空值视为 false
 * 系统配置 value 以 text 存储，读取时经此转换用于 Switch 状态与展示
 */
export function toBool(value: string | number | undefined): boolean {
  if (typeof value === "number") return value === 1;
  return value === "true" || value === "1";
}
