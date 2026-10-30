/**
 * 登录失败节流：按账号累计失败次数并做锁定退避。
 *
 * 为什么不是复用通用限流：登录要的是「失败才有代价、成功即清零」，而通用限流按调用次数计数，
 * 正常登录也会占额度。计数只在进程内存里、重启即清——换来的是零写放大与足够挡爆破的效果。
 */

/** 失败次数 → 锁定时长；命中最高的一档 */
const LOCK_STEPS: readonly { failures: number; lockMs: number }[] = [
  { failures: 20, lockMs: 60 * 60 * 1000 },
  { failures: 10, lockMs: 5 * 60 * 1000 },
  { failures: 5, lockMs: 30 * 1000 },
];

/** 计数存活窗口：窗口内没有新失败就丢弃，避免偶发失败长期堆积成锁定 */
const RESET_WINDOW_MS = 60 * 60 * 1000;

type Entry = {
  /** 窗口内累计的失败次数 */
  failures: number;
  /** 锁定截止时刻（毫秒），0 表示未锁定 */
  lockedUntil: number;
  /** 最近一次失败时刻 */
  updatedAt: number;
};

const entries = new Map<string, Entry>();

const prune = (now: number): void => {
  for (const [key, entry] of entries) {
    if (entry.lockedUntil <= now && now - entry.updatedAt > RESET_WINDOW_MS) entries.delete(key);
  }
};

/** 剩余锁定时间（毫秒）；0 表示未锁定 */
export const loginLockRemainingMs = (key: string, now = Date.now()): number => {
  const remaining = (entries.get(key)?.lockedUntil ?? 0) - now;
  return remaining > 0 ? remaining : 0;
};

/** 记一次失败并按档位加锁，返回本次锁定时长（0 表示还没到阈值，不锁） */
export const recordLoginFailure = (key: string, now = Date.now()): number => {
  prune(now);
  const entry = entries.get(key) ?? { failures: 0, lockedUntil: 0, updatedAt: now };
  entry.failures += 1;
  entry.updatedAt = now;
  const step = LOCK_STEPS.find((item) => entry.failures >= item.failures);
  entry.lockedUntil = step ? now + step.lockMs : 0;
  entries.set(key, entry);
  return step?.lockMs ?? 0;
};

/** 登录成功后清零：成功一次就把额度还回去，不奖励也不惩罚 */
export const clearLoginFailures = (key: string): void => {
  entries.delete(key);
};

/** 清空全部计数（测试用） */
export const resetLoginThrottle = (): void => {
  entries.clear();
};
