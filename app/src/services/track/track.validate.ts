/**
 * 埋点事件校验模块：属性值类型与安全校验、上报频控、服务端时间钳制
 * 纯逻辑，不依赖数据库，供 trackEvent 上报链路使用
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

const LIMITS = {
  STRING_MAX_LENGTH: 10000,
  ARRAY_MAX_ITEMS: 100,
  OBJECT_MAX_KEYS: 50,
  OBJECT_MAX_DEPTH: 5,
  NUMBER_MAX_SAFE: 1e15,
  NUMBER_MIN_SAFE: -1e15,
} as const;

/** 禁止的对象键（防原型污染） */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 校验单个属性值是否符合声明的数据类型和长度限制（track.server 经此引用） */
export function isValidPropertyValue(value: unknown, expectedType: string): boolean {
  if (value === null || value === undefined) return true;

  switch (expectedType) {
    case "string":
      if (typeof value !== "string") return false;
      return value.length <= LIMITS.STRING_MAX_LENGTH;

    case "number":
      if (typeof value !== "number") return false;
      return (
        Number.isFinite(value) && value >= LIMITS.NUMBER_MIN_SAFE && value <= LIMITS.NUMBER_MAX_SAFE
      );

    case "boolean":
      return typeof value === "boolean";

    case "date":
      // 接受 ISO 字符串或毫秒时间戳
      if (typeof value === "string") {
        const d = new Date(value);
        return !Number.isNaN(d.getTime());
      }
      if (typeof value === "number") {
        return (
          Number.isFinite(value) && value > 0 && value <= Date.now() + 365 * 24 * 3600 * 1000 // 不超过未来一年
        );
      }
      return false;

    case "array":
      if (!Array.isArray(value)) return false;
      if (value.length > LIMITS.ARRAY_MAX_ITEMS) return false;
      // 逐个元素基础类型校验，防嵌套过深
      for (const item of value) {
        if (
          typeof item !== "string" &&
          typeof item !== "number" &&
          typeof item !== "boolean" &&
          item !== null
        ) {
          return false; // 数组元素仅允许基本类型
        }
      }
      return true;

    case "object":
      return isValidPlainObject(value, 0);

    default:
      return false;
  }
}

/** 递归校验纯对象，限制嵌套深度和键数量，防原型污染 */
function isValidPlainObject(value: unknown, depth: number): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  if (depth >= LIMITS.OBJECT_MAX_DEPTH) return false;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length > LIMITS.OBJECT_MAX_KEYS) return false;

  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) return false;

    const child = obj[key];
    if (child === null || child === undefined) continue;

    if (typeof child === "object") {
      if (!isValidPlainObject(child, depth + 1)) return false;
    } else if (
      typeof child !== "string" &&
      typeof child !== "number" &&
      typeof child !== "boolean"
    ) {
      return false;
    }
  }

  return true;
}

/** 频控阈值：单会话每分钟最多上报条数 */
export const TRACK_RATE_LIMIT = {
  WINDOW_MS: 60_000,
  MAX_PER_SESSION: 60,
} as const;

/** 会话上报计数缓存：key = sessionId，value = 窗口内计数，TTL 滑动过期 */
const sessionRateCache = new MemoryCache<number>();

/** 判断会话是否超过频控阈值；未超限则累加计数 */
export function isTrackSessionRateLimited(sessionId: string): boolean {
  const count = sessionRateCache.get(sessionId) ?? 0;
  if (count >= TRACK_RATE_LIMIT.MAX_PER_SESSION) return true;
  sessionRateCache.set(sessionId, count + 1, TRACK_RATE_LIMIT.WINDOW_MS);
  return false;
}

/** 清空频控计数（测试与运维排查用） */
export function clearTrackRateLimit(): void {
  sessionRateCache.clear();
}

/** 客户端事件时间允许偏差区间：过去 1 天 ~ 未来 5 分钟 */
const TIME_CLAMP = {
  MIN_AGE_MS: 24 * 3600 * 1000,
  MAX_AHEAD_MS: 5 * 60 * 1000,
} as const;

/** 将客户端上报时间钳制到合理区间，超界则采用服务端时间 */
export function clampTrackEventTime(time: number): number {
  const now = Date.now();
  if (time >= now - TIME_CLAMP.MIN_AGE_MS && time <= now + TIME_CLAMP.MAX_AHEAD_MS) {
    return time;
  }
  return now;
}
