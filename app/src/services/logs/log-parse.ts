/**
 * 日志解析纯函数：pino 级别归一化、消息聚类归一化、日志文件流式逐行迭代
 * 由日志查询（log-reader）与日志分析（log-analytics）共用，避免重复实现
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** pino 数字级别映射 */
export const PINO_LEVEL_MAP: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

/** 归一化日志级别：数字（pino）转级别名，字符串原样返回，缺失返回空串 */
export function normalizeLogLevel(level: unknown): string {
  if (typeof level === "number") return PINO_LEVEL_MAP[level] ?? String(level);
  if (typeof level === "string") return level;
  return "";
}

/** 聚类骨架保留的最大长度，超出截断，避免超长消息主导聚合 */
const MAX_CLUSTER_LENGTH = 200;

/** 可变片段替换规则：按「先具体后宽泛」顺序执行，避免数字规则吞掉 UUID / 路径 */
const MESSAGE_PATTERNS: [RegExp, string][] = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>"],
  [/https?:\/\/\S+/gi, "<url>"],
  [/(?:\/[\w.@-]+){2,}/g, "<path>"],
  [/\b[0-9a-f]{16,}\b/gi, "<hex>"],
  [/"[^"]*"/g, '"<str>"'],
  [/'[^']*'/g, "'<str>'"],
  [/\d+(?:\.\d+)?/g, "<n>"],
  [/\s+/g, " "],
];

/**
 * 归一化日志消息用于聚类：剥离 UUID / URL / 路径 / 引号内容 / 数字等可变片段，
 * 保留可聚合的消息骨架；骨架为空时回退原始文本，超长截断
 */
export function normalizeMessage(message: string): string {
  let normalized = message;
  for (const [pattern, replacement] of MESSAGE_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.trim();
  if (!normalized) return message.trim();
  return normalized.length > MAX_CLUSTER_LENGTH
    ? normalized.slice(0, MAX_CLUSTER_LENGTH)
    : normalized;
}

/** 流式逐行迭代日志文件（不物化整文件），跳过空行 */
export async function* iterateLogLines(filePath: string): AsyncGenerator<string> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  try {
    for await (const line of rl) {
      if (line.trim()) yield line;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
}
