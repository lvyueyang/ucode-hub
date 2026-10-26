/**
 * 上游转发：按目标厂商把对话请求发出去，响应原样回传（流式逐块、非流式整段）。
 *
 * 三条出口：上游非 2xx → 透传状态码与 `{ error }`；正常 → 回传响应体（流式挂 usage 探针）；
 * 连不上 / 超时 → 502。结局（成功 / 上游出错 / 客户端取消）只在一处上报，用量记账与外部调用观测
 * 都挂在 `onSettled` 上，不在各处分散。
 *
 * 超时分两段：等响应头有上限（上游不可达时客户端不能一直悬着），流式响应体不设整段超时
 * （长回答会被掐断），改用「两块之间」的空闲超时兜底。
 */

import type { UsageTokens } from "#/services/usage/usage.server";
import { isAbortError, logExternalRequest } from "#/shared-services/external-observability";

import {
  buildCompletionsUrl,
  buildUpstreamBody,
  buildUpstreamHeaders,
  type ChatCompletionRequest,
  COMPLETIONS_PATH,
  type CompletionTarget,
  EMPTY_TOKENS,
  normalizeErrorBody,
  openAiErrorResponse,
  readUsage,
} from "./protocol";
import { type CompletionStreamResult, createSseUsageProbe, pipeCompletionStream } from "./stream";

/** 等待上游响应头的上限：上游不可达时不能把客户端一直挂着 */
export const UPSTREAM_HEADERS_TIMEOUT_MS = 30_000;

/** 流式响应两块之间的空闲上限：上游中途不动了要收尾，而不是永远占着一条连接 */
export const UPSTREAM_STREAM_IDLE_TIMEOUT_MS = 120_000;

/** 上游调用结局：用量记账与外部调用观测共用同一份结论 */
export type CompletionOutcome = {
  status: "ok" | "error" | "cancelled";
  latencyMs: number;
  tokens: UsageTokens;
  /** 失败摘要或取消原因 */
  errorMessage?: string;
  /** 上游 HTTP 状态码（连不上时没有） */
  upstreamStatus?: number;
};

/** 转发入参 */
export type ForwardParams = {
  request: ChatCompletionRequest;
  target: CompletionTarget;
  /** 客户端断开信号（h3 的 `event.req.signal`）：断开即中止上游请求 */
  clientSignal: AbortSignal;
  onChunk?: (byteLength: number) => void;
  /** 结局上报：成功、上游出错、客户端取消各一次 */
  onSettled: (outcome: CompletionOutcome) => void;
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 上游请求的中止控制：客户端断开与超时都并入同一个 signal */
const createUpstreamAbort = (clientSignal: AbortSignal) => {
  const controller = new AbortController();
  const onClientAbort = (): void => controller.abort(new Error("客户端断开"));
  if (clientSignal.aborted) onClientAbort();
  else clientSignal.addEventListener("abort", onClientAbort, { once: true });

  return {
    signal: controller.signal,
    abort: (reason: string): void => controller.abort(new Error(reason)),
    release: (): void => clientSignal.removeEventListener("abort", onClientAbort),
  };
};

/** 上游非 2xx：透传状态码与 `{ error }`，并给出可落库的失败摘要 */
const respondUpstreamError = async (
  response: Response,
  startedAt: number,
): Promise<{ response: Response; outcome: CompletionOutcome }> => {
  const text = await response.text().catch(() => "");
  const detail = text.trim().slice(0, 300) || "上游未给出错误体";
  return {
    response: new Response(normalizeErrorBody(text, response.status), {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    }),
    outcome: {
      status: "error",
      latencyMs: Date.now() - startedAt,
      tokens: EMPTY_TOKENS,
      errorMessage: `HTTP ${response.status}：${detail}`,
      upstreamStatus: response.status,
    },
  };
};

/** 非流式：整段读完（一份完整 JSON），取其中的 usage 后原样回传 */
const respondNonStream = async (
  response: Response,
  startedAt: number,
): Promise<{ response: Response; outcome: CompletionOutcome }> => {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    // 已拿到响应头但体没读完（上游中途断 / 被客户端中断）：按失败收口，不能让异常冒到路由外面
    const message = `读取上游响应失败：${describe(error)}`;
    return {
      response: openAiErrorResponse(502, message, "upstream_error"),
      outcome: {
        status: "error",
        latencyMs: Date.now() - startedAt,
        tokens: EMPTY_TOKENS,
        errorMessage: message,
        upstreamStatus: response.status,
      },
    };
  }

  let tokens = EMPTY_TOKENS;
  try {
    tokens = readUsage(JSON.parse(text)) ?? EMPTY_TOKENS;
  } catch {
    // 上游回了非 JSON：照原样回传，只是记不到 token
  }
  return {
    response: new Response(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    }),
    outcome: {
      status: "ok",
      latencyMs: Date.now() - startedAt,
      tokens,
      upstreamStatus: response.status,
    },
  };
};

/** 流式：逐块回传 + usage 探针；空闲超时以「收到块」为界反复重置 */
const respondStream = (
  body: ReadableStream<Uint8Array>,
  ctx: {
    startedAt: number;
    /** 上游响应头里的内容类型：原样回传，缺省按 SSE */
    contentType: string | null;
    abort: (reason: string) => void;
    report: (outcome: CompletionOutcome) => void;
    onChunk?: (byteLength: number) => void;
  },
): Response => {
  const probe = createSseUsageProbe();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdle = (): void => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ctx.abort("上游响应流空闲超时"), UPSTREAM_STREAM_IDLE_TIMEOUT_MS);
  };
  resetIdle();

  const stream = pipeCompletionStream({
    body,
    probe,
    onChunk: (bytes) => {
      resetIdle();
      ctx.onChunk?.(bytes);
    },
    onSettled: (result: CompletionStreamResult) => {
      if (idleTimer !== null) clearTimeout(idleTimer);
      ctx.report({
        status:
          result.status === "done" ? "ok" : result.status === "cancelled" ? "cancelled" : "error",
        // 耗时统一按「发出上游请求 → 响应结束」计（含等响应头），与不流式口径一致；
        // result.durationMs 是流自身的时长（不含等响应头），只用于流模块自身的收尾
        latencyMs: Date.now() - ctx.startedAt,
        tokens: probe.tokens(),
        errorMessage: result.errorMessage,
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": ctx.contentType ?? "text/event-stream; charset=utf-8",
      // 反代与浏览器都别缓冲：SSE 要逐帧到
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
};

/** 转发一次对话请求；返回的 Response 已可交给客户端（含上游错误透传） */
export const forwardChatCompletion = async (params: ForwardParams): Promise<Response> => {
  const { request, target, clientSignal, onChunk, onSettled } = params;
  const startedAt = Date.now();
  const upstream = createUpstreamAbort(clientSignal);
  const extra = { providerId: target.provider.id, model: target.model, stream: request.stream };

  const report = (outcome: CompletionOutcome): void => {
    // 客户端已经走了的话，失败一律归为取消：上游是被我们中止的，不是上游故障
    // （断开未必触发响应流的 cancel，但一定会中止上游请求）
    const normalized: CompletionOutcome =
      clientSignal.aborted && outcome.status === "error"
        ? { ...outcome, status: "cancelled", errorMessage: "客户端断开，请求已中止" }
        : outcome;
    // 客户端取消不计外部调用结果：上游是否健康与「客户端不等了」无关
    if (normalized.status !== "cancelled") {
      logExternalRequest({
        system: "model-endpoint",
        requestType: "business",
        path: COMPLETIONS_PATH,
        method: "POST",
        duration: normalized.latencyMs,
        success: normalized.status === "ok",
        status: normalized.upstreamStatus,
        error: normalized.errorMessage,
        extra,
      });
    }
    upstream.release();
    onSettled(normalized);
  };

  const headersTimer = setTimeout(
    () => upstream.abort("等待上游响应超时"),
    UPSTREAM_HEADERS_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetch(buildCompletionsUrl(target.provider.baseUrl), {
      method: "POST",
      headers: buildUpstreamHeaders(target.provider.apiKey),
      body: JSON.stringify(buildUpstreamBody(request, target)),
      signal: upstream.signal,
    });
  } catch (error) {
    const aborted = clientSignal.aborted;
    const message = aborted
      ? "客户端断开，请求已中止"
      : `连接上游失败：${isAbortError(error) ? "等待上游响应超时" : describe(error)}`;
    report({
      status: aborted ? "cancelled" : "error",
      latencyMs: Date.now() - startedAt,
      tokens: EMPTY_TOKENS,
      errorMessage: message,
    });
    return openAiErrorResponse(502, message, "upstream_error");
  } finally {
    clearTimeout(headersTimer);
  }

  if (!response.ok) {
    const failure = await respondUpstreamError(response, startedAt);
    report(failure.outcome);
    return failure.response;
  }

  if (!request.stream) {
    const success = await respondNonStream(response, startedAt);
    report(success.outcome);
    return success.response;
  }

  if (!response.body) {
    const message = "上游没有返回响应体";
    report({
      status: "error",
      latencyMs: Date.now() - startedAt,
      tokens: EMPTY_TOKENS,
      errorMessage: message,
      upstreamStatus: response.status,
    });
    return openAiErrorResponse(502, message, "upstream_error");
  }

  return respondStream(response.body, {
    startedAt,
    contentType: response.headers.get("content-type"),
    abort: upstream.abort,
    report,
    onChunk,
  });
};
