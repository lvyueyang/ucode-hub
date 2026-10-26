/**
 * 模型端点的协议侧纯逻辑：OpenAI 兼容错误体、请求体收窄、厂商 / 模型解析、上游载荷构造、
 * usage 抽取与模型清单。不碰网络、不碰 DB：给定请求 JSON 与厂商配置就能算出「发给谁、发什么、记多少」。
 *
 * 请求体按「白名单读、其余透传」处理：OpenAI 兼容客户端会带 `temperature` / `tools` / `reasoning_effort`
 * 这类我们不关心的字段，用 zod 严格收窄会把它们剥掉，因此只取必要的几个字段，其余原样转发。
 */

import type { UsageTokens } from "#/services/usage/usage.server";
import type { AiProviderView } from "#/shared-services/ai/ai.schemas";

export const COMPLETIONS_PATH = "/v1/chat/completions";

/** 上游没回 usage 时的空值（「没拿到」与「是 0」是两回事，故为 null 而非 0） */
export const EMPTY_TOKENS: UsageTokens = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

/** OpenAI 兼容错误体：客户端按 `error.message` 读文案 */
export const openAiErrorResponse = (
  status: number,
  message: string,
  type = "invalid_request_error",
): Response =>
  new Response(JSON.stringify({ error: { message, type } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 收窄后的对话请求 */
export type ChatCompletionRequest = {
  /** 客户端原始 JSON：未知字段原样透传 */
  raw: Record<string, unknown>;
  /** 客户端指定的模型（缺省时用厂商默认模型） */
  model?: string;
  stream: boolean;
};

/**
 * 收窄请求体：只要求 `messages` 为非空数组（其余交给上游判定），
 * 非法返回 null 由调用方回 400——不做严格校验是因为「上游支持的字段」不由我们把关。
 */
export const parseChatCompletionRequest = (body: unknown): ChatCompletionRequest | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const messages = raw.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const model = typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : undefined;
  return { raw, model, stream: raw.stream === true };
};

/** 转发目标：厂商 + 实际发给上游的模型 id */
export type CompletionTarget = {
  provider: AiProviderView;
  model: string;
};

/** 可用户商：配了地址与密钥（模型清单可以为空，型号仍可由客户端指定） */
const usableProviders = (providers: AiProviderView[]): AiProviderView[] =>
  providers.filter((provider) => provider.baseUrl && provider.apiKey);

/**
 * 解析转发目标：请求模型命中某厂商的模型清单就用它；没命中则回落默认厂商并把模型原样转发
 * （厂商随时会上新模型，配置清单不必跟着追）。无可用户商返回 null（调用方回 503）。
 */
export const resolveCompletionTarget = (
  providers: AiProviderView[],
  requestedModel?: string,
): CompletionTarget | null => {
  const usable = usableProviders(providers);
  if (usable.length === 0) return null;

  if (requestedModel) {
    const hit = usable.find((provider) =>
      provider.models.some((model) => model.id === requestedModel),
    );
    if (hit) return { provider: hit, model: requestedModel };
  }

  const fallback = usable.find((provider) => provider.default) ?? usable[0];
  if (!fallback) return null;
  const model =
    requestedModel ?? fallback.models.find((m) => m.default)?.id ?? fallback.models[0]?.id;
  return model ? { provider: fallback, model } : null;
};

/** 上游对话地址：baseUrl 可能带 `/v1` 也可能不带，两种都拼得对 */
export const buildCompletionsUrl = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

/** 上游请求头：只补凭证与内容类型，客户端的头一律不转发（`Authorization` 就是 hub 的令牌） */
export const buildUpstreamHeaders = (apiKey: string): Record<string, string> => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json",
});

/**
 * 上游请求体：透传原字段、改写 `model`，流式时注入 `stream_options.include_usage`
 * （OpenAI 兼容上游据此在末尾帧带 usage，没有它就记不到 token）。
 */
export const buildUpstreamBody = (
  request: ChatCompletionRequest,
  target: CompletionTarget,
): Record<string, unknown> => {
  // stream 由收窄结果显式写回：客户端写 `"stream": 1` 这类非布尔值时，raw 里的原值不能直接透传
  const body: Record<string, unknown> = {
    ...request.raw,
    model: target.model,
    stream: request.stream,
  };
  if (!request.stream) return body;

  const current = body.stream_options;
  const merged =
    typeof current === "object" && current !== null && !Array.isArray(current) ? current : {};
  body.stream_options = { ...merged, include_usage: true };
  return body;
};

/** 从上游响应体（非流式 JSON，或 SSE 的单帧 JSON）里取 usage；没有则返回 null */
export const readUsage = (payload: unknown): UsageTokens | null => {
  if (typeof payload !== "object" || payload === null) return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;

  const fields = usage as Record<string, unknown>;
  const pick = (key: string): number | null => {
    const value = fields[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const tokens: UsageTokens = {
    promptTokens: pick("prompt_tokens"),
    completionTokens: pick("completion_tokens"),
    totalTokens: pick("total_tokens"),
  };
  return tokens.promptTokens === null &&
    tokens.completionTokens === null &&
    tokens.totalTokens === null
    ? null
    : tokens;
};

/** 模型清单条目（OpenAI `/v1/models` 的元素形态） */
export type ModelListItem = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

/**
 * 已配置厂商的模型清单，供客户端发现可用模型。
 * 多厂商配了同名模型时只报一次（转发时命中配置顺序里靠前的那个），避免清单里出现无法区分的重复项。
 */
export const toModelList = (providers: AiProviderView[], now = Date.now()): ModelListItem[] => {
  const created = Math.floor(now / 1000);
  const seen = new Set<string>();
  const items: ModelListItem[] = [];
  for (const provider of usableProviders(providers)) {
    for (const model of provider.models) {
      if (seen.has(model.id)) continue;
      seen.add(model.id);
      items.push({
        id: model.id,
        object: "model",
        created,
        owned_by: provider.name || provider.id,
      });
    }
  }
  return items;
};

/** 上游错误体的透传形态：本来就是 `{ error }` 的原样给客户端，否则包一层 */
export const normalizeErrorBody = (body: string, status: number): string => {
  const trimmed = body.trim();
  if (trimmed) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) return trimmed;
    } catch {
      // 非 JSON（如 nginx 的纯文本错误页）走下面的包装
    }
  }
  const message = trimmed || `上游返回 HTTP ${status}`;
  return JSON.stringify({ error: { message: message.slice(0, 500), type: "upstream_error" } });
};
