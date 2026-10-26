/**
 * 模型端点限流测试：限流键构造、窗口内阈值判定、429 形状与两种端点规则的隔离
 * 计数在进程内存里，不连网络也不连 DB。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimit } from "#/services/rate-limit/rate-limit";

import type { ModelEndpointCaller } from "../auth";
import {
  buildRateLimitKey,
  COMPLETIONS_RATE_LIMIT,
  enforceRateLimit,
  MODELS_RATE_LIMIT,
} from "../rate-limit";

const deviceCaller: ModelEndpointCaller = {
  accountType: "client",
  accountId: "22222222-2222-2222-2222-222222222222",
  deviceId: "11111111-1111-1111-1111-111111111111",
  kind: "device",
};

const userCaller: ModelEndpointCaller = {
  accountType: "admin",
  accountId: "33333333-3333-3333-3333-333333333333",
  deviceId: null,
  kind: "user",
};

/** 连发 n 次，只关心最后一次的判定结果 */
const limitedAfter = (caller: ModelEndpointCaller, n: number): Response | null => {
  let last: Response | null = null;
  for (let i = 0; i < n; i += 1) last = enforceRateLimit(caller, COMPLETIONS_RATE_LIMIT);
  return last;
};

describe("buildRateLimitKey", () => {
  it("设备令牌按设备 id 限", () => {
    expect(buildRateLimitKey(deviceCaller)).toBe(
      `model-endpoint:device:${deviceCaller.deviceId as string}`,
    );
  });

  it("网页会话按账号 id 限，并带上账号类型", () => {
    expect(buildRateLimitKey(userCaller)).toBe(
      `model-endpoint:account:admin:${userCaller.accountId}`,
    );
  });

  it("同一账号的 admin 与 client 账号 id 相同也不共用一个键", () => {
    const id = "44444444-4444-4444-4444-444444444444";
    expect(buildRateLimitKey({ ...userCaller, accountType: "admin", accountId: id })).not.toBe(
      buildRateLimitKey({ ...userCaller, accountType: "client", accountId: id }),
    );
  });

  it("键带场景前缀，设备与账号两种身份互不相撞", () => {
    const deviceKey = buildRateLimitKey(deviceCaller);
    const accountKey = buildRateLimitKey({ ...deviceCaller, deviceId: null, kind: "user" });
    expect(deviceKey).not.toBe(accountKey);
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("窗口内未达阈值返回 null，达阈值后回 429", () => {
    expect(limitedAfter(deviceCaller, COMPLETIONS_RATE_LIMIT.max - 1)).toBeNull();
    expect(limitedAfter(deviceCaller, 1)).toBeNull();

    const limited = limitedAfter(deviceCaller, 1);
    expect(limited?.status).toBe(429);
  });

  it("429 是 OpenAI 错误体形状，带中文兜底文案", async () => {
    const limited = limitedAfter(deviceCaller, COMPLETIONS_RATE_LIMIT.max + 1);
    expect(limited?.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await limited?.json()).toEqual({
      error: { message: "调用过于频繁，请稍后再试", type: "rate_limit_exceeded" },
    });
  });

  it("超限持续到窗口结束，窗口过期后重新放行", () => {
    limitedAfter(deviceCaller, COMPLETIONS_RATE_LIMIT.max + 1);
    expect(limitedAfter(deviceCaller, 1)?.status).toBe(429);

    vi.setSystemTime(new Date(Date.now() + COMPLETIONS_RATE_LIMIT.windowMs + 1));
    expect(limitedAfter(deviceCaller, 1)).toBeNull();
  });

  it("不同调用方各自计数", () => {
    limitedAfter(deviceCaller, COMPLETIONS_RATE_LIMIT.max + 1);
    expect(limitedAfter(deviceCaller, 1)?.status).toBe(429);
    expect(limitedAfter(userCaller, 1)).toBeNull();
  });

  it("对话与模型清单各用一份额度（规则不同即分开计数）", () => {
    for (let i = 0; i < COMPLETIONS_RATE_LIMIT.max; i += 1) {
      expect(enforceRateLimit(deviceCaller, COMPLETIONS_RATE_LIMIT)).toBeNull();
    }
    expect(enforceRateLimit(deviceCaller, MODELS_RATE_LIMIT)).toBeNull();
  });
});

describe("限流常量", () => {
  it("对话补全 1 分钟 60 次，模型清单 1 分钟 120 次", () => {
    expect(COMPLETIONS_RATE_LIMIT).toEqual({ windowMs: 60_000, max: 60 });
    expect(MODELS_RATE_LIMIT).toEqual({ windowMs: 60_000, max: 120 });
  });
});
