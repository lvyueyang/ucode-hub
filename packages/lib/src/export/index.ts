/**
 * 数据导出工具：CSV / JSON 序列化
 */

/** 将值转为安全的 CSV 字段（处理逗号、双引号、换行符） */
function escapeCsvField(value: unknown): string {
  const str = value == null ? "" : String(value);
  // 如果包含逗号、双引号或换行符，需要用双引号包裹并转义内部双引号
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 将对象数组序列化为 CSV 字符串（带 UTF-8 BOM，Excel 兼容） */
export function toCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; title: string }[],
): string {
  const BOM = "\uFEFF";
  const header = columns.map((c) => escapeCsvField(c.title)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(","))
    .join("\n");
  return `${BOM}${header}\n${body}`;
}

/** 将数据格式化为 JSON 字符串 */
export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 触发浏览器下载文件 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
