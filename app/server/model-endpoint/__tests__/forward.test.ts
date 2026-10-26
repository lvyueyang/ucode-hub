/**
 * 上游转发测试：透传请求改写、流式逐块回传与 usage 采集、非流式整段回传、错误透传与取消
 * 上游用 fetch 替身 + 内存流，不连真网络。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/external-observability", () => ({
  logExternalRequest: vi.fn(),
  isAbortError: (error: unknown) => error instanceof Error && error.name === "AbortError",
}));

import { logExternalRequest } from "#/shared-services/external-observability";

import { type CompletionOutcome, forwardChatCompletion } from "../forward";
import type { ChatCompletionRequest, CompletionTarget } from "../protocol";

const encoder = new TextEncoder();

const target: CompletionTarget = {
  provider: {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-x",
    models: [{ id: "deepseek-chat", default: true }],
  },
  model: "deepseek-chat",
};

const request: ChatCompletionRequest = {
  raw: { messages: [{ role: "user", content: "你好" }], temperature: 0.2 },
  model: "deepseek-chat",
  stream: true,
};

/** 把给定的字符串块做成上游响应 */
const streamResponse = (chunks: string[], headers: Record<string, string> = {}) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", ...headers } },
  );

/** 记录 fetch 入参的最小替身 */
const stubFetch = (
  handler: (url: string, init: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

/** 造一个读取即出错的响应体（模拟上游中途断流） */
const erroringStream = () =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("上游断了"));
    },
  });

/** 读完一个响应体，返回各块文本 */ const readAll = async (
  response: Response,
): Promise<string[]> => {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  return chunks;
};

describe("forwardChatCompletion", () => {
  beforeEach(() => {
    vi.mocked(logExternalRequest).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("流式：改写 model、注入 include_usage，逐块回传并采集 usage", async () => {
    const usageFrame = `data: ${JSON.stringify({
      usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
    })}\n\n`;
    const fetchMock = stubFetch(async () =>
      streamResponse(['data: {"choices":[]}\n\n', usageFrame, "data: [DONE]\n\n"]),
    );
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    // 请求侧：路径与载荷都按约定改写
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: "user", content: "你好" }],
      temperature: 0.2,
      model: "deepseek-chat",
      stream: true,
      stream_options: { include_usage: true },
    });

    // 响应侧：不缓冲（SSE 头齐备），块原样回传
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await readAll(response)).toEqual([
      'data: {"choices":[]}\n\n',
      usageFrame,
      "data: [DONE]\n\n",
    ]);

    expect(settled).toEqual([
      {
        status: "ok",
        latencyMs: expect.any(Number),
        tokens: { promptTokens: 11, completionTokens: 22, totalTokens: 33 },
        errorMessage: undefined,
      },
    ]);
    expect(vi.mocked(logExternalRequest)).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        path: "/v1/chat/completions",
        system: "model-endpoint",
      }),
    );
  });

  it("流式但上游不带 usage 时只记请求与耗时（token 留空）", async () => {
    stubFetch(async () => streamResponse(['data: {"choices":[]}\n\n']));
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });
    await readAll(response);

    expect(settled[0]?.status).toBe("ok");
    expect(settled[0]?.tokens).toEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });
  });

  it("非流式：不注入 stream_options，整段回传并提取 usage", async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "你好" } }],
      usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
    });
    const fetchMock = stubFetch(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request: { ...request, stream: false },
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).stream_options).toBeUndefined();
    expect(await response.text()).toBe(body);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(settled[0]).toEqual({
      status: "ok",
      latencyMs: expect.any(Number),
      tokens: { promptTokens: 5, completionTokens: 6, totalTokens: 11 },
      upstreamStatus: 200,
    });
  });

  it("上游非 2xx：透传状态码与 { error }，并给出可落库的失败摘要", async () => {
    const upstreamError = JSON.stringify({ error: { message: "invalid api key" } });
    stubFetch(async () => new Response(upstreamError, { status: 401 }));
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(upstreamError);
    expect(settled[0]?.status).toBe("error");
    expect(settled[0]?.upstreamStatus).toBe(401);
    expect(settled[0]?.errorMessage).toContain("401");
    expect(vi.mocked(logExternalRequest)).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, status: 401 }),
    );
  });

  it("连不上上游：回 502 并报失败", async () => {
    stubFetch(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    expect(response.status).toBe(502);
    expect((await response.json()) as unknown).toMatchObject({
      error: { message: expect.stringContaining("ECONNREFUSED") },
    });
    expect(settled[0]?.status).toBe("error");
  });

  it("客户端先断开：报 cancelled 且不计外部调用结果", async () => {
    stubFetch(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const controller = new AbortController();
    controller.abort();
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: controller.signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    expect(response.status).toBe(502);
    expect(settled[0]?.status).toBe("cancelled");
    expect(vi.mocked(logExternalRequest)).not.toHaveBeenCalled();
  });

  it("流式过程中客户端取消：报 cancelled 且带上已采集的 usage", async () => {
    const usageFrame = `data: ${JSON.stringify({ usage: { total_tokens: 9 } })}\n\n`;
    stubFetch(async () => streamResponse([usageFrame, 'data: {"choices":[]}\n\n']));
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();

    expect(settled[0]?.status).toBe("cancelled");
    expect(settled[0]?.tokens.totalTokens).toBe(9);
    expect(vi.mocked(logExternalRequest)).not.toHaveBeenCalled();
  });

  it("非流式读体失败：回 502 并记失败，异常不冒到路由外", async () => {
    stubFetch(async () => new Response(erroringStream(), { status: 200 }));
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request: { ...request, stream: false },
      target,
      clientSignal: new AbortController().signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    expect(response.status).toBe(502);
    expect(settled[0]?.status).toBe("error");
    expect(settled[0]?.errorMessage).toContain("读取上游响应失败");
  });

  it("客户端已断开时上游读失败归为取消（不是上游故障）", async () => {
    stubFetch(async () => new Response(erroringStream(), { status: 200 }));
    const controller = new AbortController();
    const settled: CompletionOutcome[] = [];

    const response = await forwardChatCompletion({
      request,
      target,
      clientSignal: controller.signal,
      onSettled: (outcome) => settled.push(outcome),
    });

    controller.abort();
    await expect(readAll(response)).rejects.toThrow("上游断了");

    expect(settled[0]?.status).toBe("cancelled");
    expect(vi.mocked(logExternalRequest)).not.toHaveBeenCalled();
  });
});
