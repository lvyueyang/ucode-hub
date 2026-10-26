/**
 * 模型端点限流：按调用方身份（设备 id / 账号 id）在定长窗口内计数，超限回 OpenAI 形状的 429。
 *
 * 计数复用 `#/services/rate-limit` 的通用实现（进程内存、按规则分片），这里只负责「键怎么拼、
 * 阈值多少、超限怎么回」。额度衡量的是**请求速率**而不是并发：判定只在转发之前做一次，
 * 一条流跑多久都不再占额度，故并发几条长流不会把后续请求挤掉（要限并发得另做，本端点不排队）。
 */
import { isRateLimited, type RateLimitRule } from "#/services/rate-limit/rate-limit";
import { logger } from "#/shared-services/logger";

import type { ModelEndpointCaller } from "./auth";
import { openAiErrorResponse } from "./protocol";

/** 对话补全：同一调用方 1 分钟 60 次（单会话正常对话远低于此，撞上阈值的多半是脚本在刷） */
export const COMPLETIONS_RATE_LIMIT: RateLimitRule = { windowMs: 60_000, max: 60 };

/** 模型清单：只读且不转发上游，阈值给宽一倍（客户端启动与切换厂商时会连着查几次） */
export const MODELS_RATE_LIMIT: RateLimitRule = { windowMs: 60_000, max: 120 };

/** 超限文案：对外接口不带封套，与其余失败同形（`{ error: { message, type } }`） */
const RATE_LIMITED_MESSAGE = "调用过于频繁，请稍后再试";

/**
 * 限流键：设备令牌按**设备 id**（一台设备一份额度），网页会话按**账号 id**
 * （同一账号的多个标签页共用一份额度）。键带场景前缀，与登录等其它场景的计数互不干扰。
 */
export const buildRateLimitKey = (caller: ModelEndpointCaller): string =>
  caller.deviceId
    ? `model-endpoint:device:${caller.deviceId}`
    : `model-endpoint:account:${caller.accountType}:${caller.accountId}`;

/**
 * 未超限则把本次计入窗口并返回 null；已超限返回可直接回给客户端的 429。
 *
 * 限流只记 debug：被刷时这行会持续产生，用 info / warn 会把真正需要人工处理的告警淹没。
 */
export const enforceRateLimit = (
  caller: ModelEndpointCaller,
  rule: RateLimitRule,
): Response | null => {
  const key = buildRateLimitKey(caller);
  if (!isRateLimited(key, rule)) return null;

  logger.debug(
    { key, kind: caller.kind, windowMs: rule.windowMs, max: rule.max },
    "模型端点请求被限流",
  );
  return openAiErrorResponse(429, RATE_LIMITED_MESSAGE, "rate_limit_exceeded");
};
