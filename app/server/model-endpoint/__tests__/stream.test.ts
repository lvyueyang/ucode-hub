/**
 * 响应流测试：SSE usage 探针（含分块边界）、逐块回传与背压、三种收尾结局
 * 上游流用内存替身，不连网络。
 */
import { describe, expect, it, vi } from "vitest";

import { type CompletionStreamResult, createSseUsageProbe, pipeCompletionStream } from "../stream";

const encoder = new TextEncoder();

/** 造 SSE 帧（`data: {...}\n\n`） */
const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;

/** 造受控上游流：记录被读次数与是否被取消 */
const createUpstream = (chunks: Uint8Array[], failAt?: number) => {
  const queue = [...chunks];
  const state = { reads: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.reads += 1;
      if (failAt !== undefined && state.reads === failAt) {
        controller.error(new Error("上游断了"));
        return;
      }
      const next = queue.shift();
      if (!next) {
        controller.close();
        return;
      }
      controller.enqueue(next);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
};

describe("createSseUsageProbe", () => {
  it("末尾帧的 usage 被捕获（跨分块也认）", () => {
    const probe = createSseUsageProbe();
    const text =
      frame({ choices: [{ delta: { content: "你好" } }] }) +
      frame({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });
    const bytes = encoder.encode(text);

    // 在「你」的字节中间切一刀：多字节字符被拆到两块里
    for (let index = 0; index < bytes.length; index += 7) {
      probe.push(bytes.slice(index, index + 7));
    }

    expect(probe.tokens()).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it("多帧带 usage 时以最后一次为准", () => {
    const probe = createSseUsageProbe();
    probe.push(encoder.encode(frame({ usage: { total_tokens: 1 } })));
    probe.push(encoder.encode(frame({ usage: { total_tokens: 2 } })));
    expect(probe.tokens().totalTokens).toBe(2);
  });

  it("没有 usage 的帧、[DONE]、非 SSE 行与非 JSON 帧都不影响结果", () => {
    const probe = createSseUsageProbe();
    probe.push(encoder.encode(": keep-alive\n"));
    probe.push(encoder.encode("event: ping\n"));
    probe.push(encoder.encode("data: [DONE]\n"));
    probe.push(encoder.encode("data: {不是 JSON}\n"));
    probe.push(encoder.encode(frame({ choices: [] })));
    expect(probe.tokens()).toEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });
  });

  it("flush 处理末尾没有换行的半行", () => {
    const probe = createSseUsageProbe();
    probe.push(encoder.encode(`data: ${JSON.stringify({ usage: { total_tokens: 7 } })}`));
    expect(probe.tokens().totalTokens).toBeNull();
    probe.flush();
    expect(probe.tokens().totalTokens).toBe(7);
  });
});

describe("pipeCompletionStream", () => {
  it("逐块原样回传，块序与内容不变", async () => {
    const chunks = [encoder.encode("a"), encoder.encode("b"), encoder.encode("c")];
    const { stream } = createUpstream(chunks);
    const settled: CompletionStreamResult[] = [];
    const probe = createSseUsageProbe();

    const piped = pipeCompletionStream({
      body: stream,
      probe,
      onSettled: (result) => settled.push(result),
    });

    const reader = piped.getReader();
    const received: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received.push(new TextDecoder().decode(value));
    }

    expect(received).toEqual(["a", "b", "c"]);
    expect(settled).toEqual([{ status: "done", durationMs: expect.any(Number) }]);
  });

  it("下游不读就不读上游（不整块缓冲）", async () => {
    const chunks = Array.from({ length: 50 }, (_, index) => encoder.encode(`chunk-${index}`));
    const { stream, state } = createUpstream(chunks);
    const piped = pipeCompletionStream({
      body: stream,
      probe: createSseUsageProbe(),
      onSettled: vi.fn(),
    });

    const reader = piped.getReader();
    await reader.read();
    // 只消费一块时上游读次数只能是队列水位（1~2），而不是 50
    expect(state.reads).toBeLessThanOrEqual(2);

    await reader.cancel();
  });

  it("上游流出错时收尾记 error 并让下游看到流错误", async () => {
    const { stream } = createUpstream([encoder.encode("a")], 2);
    const settled: CompletionStreamResult[] = [];
    const reader = pipeCompletionStream({
      body: stream,
      probe: createSseUsageProbe(),
      onSettled: (result) => settled.push(result),
    }).getReader();

    await reader.read();
    await expect(reader.read()).rejects.toThrow("上游断了");
    expect(settled).toEqual([
      { status: "error", durationMs: expect.any(Number), errorMessage: "上游断了" },
    ]);
  });

  it("下游取消时收尾记 cancelled 并取消上游流", async () => {
    const { stream, state } = createUpstream([encoder.encode("a"), encoder.encode("b")]);
    const settled: CompletionStreamResult[] = [];
    const reader = pipeCompletionStream({
      body: stream,
      probe: createSseUsageProbe(),
      onSettled: (result) => settled.push(result),
    }).getReader();

    await reader.read();
    await reader.cancel();

    expect(state.cancelled).toBe(true);
    expect(settled).toEqual([
      {
        status: "cancelled",
        durationMs: expect.any(Number),
        errorMessage: "客户端断开，响应流被取消",
      },
    ]);
  });

  it("每块回传都会触发 onChunk（空闲超时重置与 debug 日志靠它）", async () => {
    const { stream } = createUpstream([encoder.encode("aa"), encoder.encode("bbb")]);
    const sizes: number[] = [];
    const reader = pipeCompletionStream({
      body: stream,
      probe: createSseUsageProbe(),
      onChunk: (byteLength) => sizes.push(byteLength),
      onSettled: vi.fn(),
    }).getReader();

    while (!(await reader.read()).done) {
      // 读到结束
    }
    expect(sizes).toEqual([2, 3]);
  });
});
