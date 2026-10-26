/**
 * 模型端点的用量落库：把转发结局折算成 `model_usage` 的一行。
 *
 * 记账失败只记 warn——响应早已回给客户端，不能因为记账失败把一次成功的调用变成失败。
 * 客户端取消按 `error` 落库（请求没有正常完成），这与「外部调用指标不计取消」的口径不同：
 * 指标衡量上游健康度，用量表衡量请求账目。
 */

import { recordUsage } from "#/services/usage/usage.server";
import { logger } from "#/shared-services/logger";

import type { ModelEndpointCaller } from "./auth";
import type { CompletionOutcome } from "./forward";
import type { CompletionTarget } from "./protocol";

/** 记一行模型用量（fire-and-forget，内部兜底失败） */
export const recordCompletionUsage = (
  caller: ModelEndpointCaller,
  target: CompletionTarget,
  outcome: CompletionOutcome,
): void => {
  void recordUsage({
    accountType: caller.accountType,
    accountId: caller.accountId,
    deviceId: caller.deviceId,
    model: target.model,
    providerId: target.provider.id,
    promptTokens: outcome.tokens.promptTokens,
    completionTokens: outcome.tokens.completionTokens,
    totalTokens: outcome.tokens.totalTokens,
    latencyMs: outcome.latencyMs,
    status: outcome.status === "ok" ? "ok" : "error",
    errorMessage: outcome.errorMessage ?? null,
  }).catch((error: unknown) => {
    logger.warn(
      {
        providerId: target.provider.id,
        model: target.model,
        error: error instanceof Error ? error.message : String(error),
      },
      "模型用量落库失败",
    );
  });
};
