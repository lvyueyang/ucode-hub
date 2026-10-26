/**
 * 中继模型端点：`GET /v1/models` —— 已配置厂商的模型清单，供客户端发现可用模型。
 * 鉴权与对话端点同口径（设备令牌或 hub 会话令牌）；只读清单，不记用量。
 * 同样按调用方身份限流，阈值比对话端点宽（见 `../../model-endpoint/rate-limit`）。
 */
import { defineEventHandler } from "nitro/h3";

import { readProviders } from "#/shared-services/ai/ai.provider";
import { logger } from "#/shared-services/logger";

import { resolveModelEndpointCaller } from "../../model-endpoint/auth";
import { modelEndpointAuthDeps } from "../../model-endpoint/deps";
import { openAiErrorResponse, toModelList } from "../../model-endpoint/protocol";
import { enforceRateLimit, MODELS_RATE_LIMIT } from "../../model-endpoint/rate-limit";

export default defineEventHandler(async (event) => {
  const caller = await resolveModelEndpointCaller(
    event.req.headers.get("authorization"),
    modelEndpointAuthDeps,
  );
  if (!caller) {
    return openAiErrorResponse(401, "未认证：请用设备令牌或 hub 会话令牌调用", "invalid_api_key");
  }

  const limited = enforceRateLimit(caller, MODELS_RATE_LIMIT);
  if (limited) return limited;

  const data = toModelList(await readProviders());
  logger.debug(
    { accountId: caller.accountId, kind: caller.kind, count: data.length },
    "模型端点返回模型清单",
  );

  return new Response(JSON.stringify({ object: "list", data }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
});
