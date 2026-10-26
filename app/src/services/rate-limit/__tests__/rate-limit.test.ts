/**
 * 按 key 限流测试：窗口计数、窗口过期、key / 规则隔离、重置
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEVICE_REGISTER_RATE_LIMIT,
  isRateLimited,
  LOGIN_RATE_LIMIT,
  type RateLimitRule,
  resetRateLimit,
} from "#/services/rate-limit/rate-limit";

/** 测试用短窗口规则：与导出的常量各用一份计数（签名不同），互不干扰 */
const RULE: RateLimitRule = { windowMs: 60_000, max: 3 };

/** 把假时钟往前推，用于跨窗口断言 */
const advance = (ms: number): void => {
  vi.setSystemTime(new Date(Date.now() + ms));
};

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("未达阈值返回 false，达阈值后返回 true", () => {
    expect(isRateLimited("k", RULE)).toBe(false);
    expect(isRateLimited("k", RULE)).toBe(false);
    expect(isRateLimited("k", RULE)).toBe(false);
    expect(isRateLimited("k", RULE)).toBe(true);
    expect(isRateLimited("k", RULE)).toBe(true);
  });

  it("窗口过期后重新开始计数", () => {
    isRateLimited("k", RULE);
    isRateLimited("k", RULE);
    isRateLimited("k", RULE);
    expect(isRateLimited("k", RULE)).toBe(true);

    advance(RULE.windowMs + 1);
    expect(isRateLimited("k", RULE)).toBe(false);
  });

  it("窗口只在首帧开始计时，不随请求续期", () => {
    isRateLimited("k", RULE);
    isRateLimited("k", RULE);

    // 50s 处用满阈值：续期写法会把窗口推到 110s，首帧写法仍在 60s 结束
    advance(50_000);
    expect(isRateLimited("k", RULE)).toBe(false);
    expect(isRateLimited("k", RULE)).toBe(true);

    advance(11_000);
    expect(isRateLimited("k", RULE)).toBe(false);
  });

  it("不同 key 各自计数", () => {
    isRateLimited("a", RULE);
    isRateLimited("a", RULE);
    isRateLimited("a", RULE);
    expect(isRateLimited("a", RULE)).toBe(true);
    expect(isRateLimited("b", RULE)).toBe(false);
  });

  it("同一 key 在不同规则下各自计数", () => {
    isRateLimited("k", RULE);
    isRateLimited("k", RULE);
    isRateLimited("k", RULE);
    expect(isRateLimited("k", RULE)).toBe(true);
    expect(isRateLimited("k", { windowMs: 60_000, max: 10 })).toBe(false);
  });
});

describe("resetRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("不传 key 清空全部计数", () => {
    isRateLimited("a", RULE);
    isRateLimited("a", RULE);
    isRateLimited("a", RULE);
    isRateLimited("b", LOGIN_RATE_LIMIT);

    resetRateLimit();
    expect(isRateLimited("a", RULE)).toBe(false);
    expect(isRateLimited("b", LOGIN_RATE_LIMIT)).toBe(false);
  });

  it("传 key 只清该 key", () => {
    isRateLimited("a", RULE);
    isRateLimited("a", RULE);
    isRateLimited("a", RULE);
    isRateLimited("b", RULE);
    isRateLimited("b", RULE);
    isRateLimited("b", RULE);

    resetRateLimit("a");
    expect(isRateLimited("a", RULE)).toBe(false);
    expect(isRateLimited("b", RULE)).toBe(true);
  });
});

describe("限流常量", () => {
  it("登录 5 分钟 10 次，设备登记 1 分钟 5 次", () => {
    expect(LOGIN_RATE_LIMIT).toEqual({ windowMs: 5 * 60_000, max: 10 });
    expect(DEVICE_REGISTER_RATE_LIMIT).toEqual({ windowMs: 60_000, max: 5 });
  });
});
