/**
 * 通用按 key 限流：定长窗口内的请求计数。
 *
 * 计数放进程内存（`MemoryCache`）即成立——hub 是单实例部署（见 `AGENTS.md`），
 * 多实例部署时这里要换成共享存储，否则每个实例各限一份，实际额度翻倍。
 * key 由调用方自带场景前缀（如 `login:ip:1.2.3.4`），不同场景互不干扰。
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** 限流规则：窗口时长与窗口内允许次数 */
export type RateLimitRule = {
  /** 窗口时长（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大次数，超出即限流 */
  max: number;
};

/** 外部客户端登录：同一 IP / 同一用户名 5 分钟最多 10 次（密码校验开销大，阈值压得较紧） */
export const LOGIN_RATE_LIMIT: RateLimitRule = { windowMs: 5 * 60_000, max: 10 };

/** 设备登记：同一用户 1 分钟最多 5 次（登记会轮换令牌，正常客户端不会频繁调用） */
export const DEVICE_REGISTER_RATE_LIMIT: RateLimitRule = { windowMs: 60_000, max: 5 };

/** 单个 key 的窗口状态：计数与窗口起点（缓存条目过期即窗口结束，两者对齐） */
type RateWindow = {
  count: number;
  startedAt: number;
};

/** 计数缓存按规则分片：同一规则（时长 + 阈值一致）共享一份计数 */
const counters = new Map<string, MemoryCache<RateWindow>>();

/** 单份计数的条目上限：超过就先清一次过期条目，避免伪造 IP 这类随机 key 把内存撑大 */
const CLEANUP_THRESHOLD = 10_000;

const countersOf = (rule: RateLimitRule): MemoryCache<RateWindow> => {
  const signature = `${rule.windowMs}:${rule.max}`;
  let counter = counters.get(signature);
  if (!counter) {
    counter = new MemoryCache<RateWindow>();
    counters.set(signature, counter);
  }
  return counter;
};

/**
 * 判断 key 在规则下是否已超限，未超限则把本次计入窗口并返回 false。
 *
 * 每次写入都带上「距窗口结束还剩多久」的 TTL：缓存的默认 TTL 为 0（永不过期），
 * 续期式的写法又会让持续请求无限推迟窗口结束，只有固定窗口起点才算得出正确剩余时长。
 */
export const isRateLimited = (key: string, rule: RateLimitRule): boolean => {
  const counter = countersOf(rule);
  if (counter.size >= CLEANUP_THRESHOLD) counter.cleanup();

  const now = Date.now();
  const current = counter.get(key);
  const window = current && now - current.startedAt < rule.windowMs ? current : undefined;

  if (!window) {
    counter.set(key, { count: 1, startedAt: now }, rule.windowMs);
    return false;
  }
  if (window.count >= rule.max) return true;

  counter.set(
    key,
    { count: window.count + 1, startedAt: window.startedAt },
    window.startedAt + rule.windowMs - now,
  );
  return false;
};

/** 清除限流计数：传 key 只清该 key，不传清全部（测试与运维排查用） */
export const resetRateLimit = (key?: string): void => {
  for (const counter of counters.values()) {
    if (key === undefined) counter.clear();
    else counter.delete(key);
  }
};
