/**
 * 中继模型端点：`POST /v1/chat/completions`（OpenAI 兼容，支持 `stream: true`）。
 *
 * 鉴权认设备令牌或 hub 会话 JWT（身份解析见 `../../../model-endpoint/auth`），身份决定用量记到哪个账号。
 * 上游按请求里的 `model` 找厂商（没命中则用默认厂商），请求改写后转发，响应逐块回传
 * （SSE 逐帧、首帧即到、不整包缓冲）；流式注入 `stream_options.include_usage`，据末尾帧的 usage 记 token。
 * 上游失败透传状态码与 `{ error }` 并记一行失败用量；用量未配厂商时回 503。
 * 鉴权通过后按调用方身份限流（见 `../../../model-endpoint/rate-limit`），超限 429 且不读请求体、不计用量。
 */
import { defineEventHandler, readRawBody } from "nitro/h3";

import { readProviders } from "#/shared-services/ai/ai.provider";
import { logger } from "#/shared-services/logger";

import { resolveModelEndpointCaller } from "../../../model-endpoint/auth";
import { modelEndpointAuthDeps } from "../../../model-endpoint/deps";
import { forwardChatCompletion } from "../../../model-endpoint/forward";
import {
  openAiErrorResponse,
  parseChatCompletionRequest,
  resolveCompletionTarget,
} from "../../../model-endpoint/protocol";
import { COMPLETIONS_RATE_LIMIT, enforceRateLimit } from "../../../model-endpoint/rate-limit";
import { recordCompletionUsage } from "../../../model-endpoint/usage";

/** 请求体上限（字节）：对话含多模态 base64 时体量可观，留 8MB；再大应由客户端自行裁剪 */
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

/** 读出请求体 JSON；失败时返回可直接回给客户端的 Response */
const readRequestJson = async (
  event: Parameters<typeof readRawBody>[0],
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> => {
  const declared = Number(event.req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return { ok: false, response: openAiErrorResponse(413, "请求体过大") };
  }
  const text = await readRawBody(event, "utf8");
  if (!text) return { ok: false, response: openAiErrorResponse(400, "请求体为空") };
  if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) {
    return { ok: false, response: openAiErrorResponse(413, "请求体过大") };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: openAiErrorResponse(400, "请求体不是合法 JSON") };
  }
};

export default defineEventHandler(async (event) => {
  const caller = await resolveModelEndpointCaller(
    event.req.headers.get("authorization"),
    modelEndpointAuthDeps,
  );
  if (!caller) {
    return openAiErrorResponse(401, "未认证：请用设备令牌或 hub 会话令牌调用", "invalid_api_key");
  }

  // 限流放在读请求体之前：超额的调用方不该让我们先吞下 8MB 的 body
  const limited = enforceRateLimit(caller, COMPLETIONS_RATE_LIMIT);
  if (limited) return limited;

  const parsed = await readRequestJson(event);
  if (!parsed.ok) return parsed.response;
  const request = parseChatCompletionRequest(parsed.body);
  if (!request) return openAiErrorResponse(400, "messages 必须为非空数组");

  const target = resolveCompletionTarget(await readProviders(), request.model);
  if (!target) {
    return openAiErrorResponse(
      503,
      "未配置可用的 AI 厂商，请在后台「AI 厂商管理」中补充",
      "upstream_error",
    );
  }

  const requestFields = {
    accountType: caller.accountType,
    accountId: caller.accountId,
    deviceId: caller.deviceId,
    providerId: target.provider.id,
    model: target.model,
    stream: request.stream,
  };
  logger.debug(requestFields, "模型端点收到对话请求");

  return forwardChatCompletion({
    request,
    target,
    clientSignal: event.req.signal,
    onChunk: (byteLength) => logger.debug({ ...requestFields, byteLength }, "模型端点回传分块"),
    onSettled: (outcome) => {
      logger.debug(
        { ...requestFields, status: outcome.status, latencyMs: outcome.latencyMs },
        "模型端点请求结束",
      );
      recordCompletionUsage(caller, target, outcome);
    },
  });
});
