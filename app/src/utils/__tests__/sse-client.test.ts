/**
 * SSE 流消费工具测试：分块读取、事件解析与错误路径
 */
import { describe, expect, it, vi } from "vitest";
import type { BatchTranslateSseEvent } from "#/shared-services/i18n/i18n.ai.types";
import { readSSEStream } from "#/utils/sse-client";

/** 用分块内容构造流式 Response，模拟网络分片到达 */
function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

describe("readSSEStream", () => {
  it("逐个派发完整 SSE 事件", async () => {
    const events: BatchTranslateSseEvent[] = [];
    const response = streamResponse([
      'data: {"type":"progress","done":1}\n\n',
      'data: {"type":"done","done":2}\n\n',
    ]);

    await readSSEStream(response, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: "progress", done: 1 },
      { type: "done", done: 2 },
    ]);
  });

  it("事件被网络分片切开时仍能正确重组", async () => {
    const events: BatchTranslateSseEvent[] = [];
    const response = streamResponse(['data: {"type":"pro', 'gress","done":1}\n', "\n"]);

    await readSSEStream(response, (event) => {
      events.push(event);
    });

    expect(events).toEqual([{ type: "progress", done: 1 }]);
  });

  it("流结束时冲刷未以空行收尾的残留事件", async () => {
    const events: BatchTranslateSseEvent[] = [];
    const response = streamResponse(['data: {"type":"done"}']);

    await readSSEStream(response, (event) => {
      events.push(event);
    });

    expect(events).toEqual([{ type: "done" }]);
  });

  it("忽略非 data 行与非法 JSON", async () => {
    const onEvent = vi.fn();
    const response = streamResponse([
      "event: ping\n",
      "data: 不是 JSON\n\n",
      'data: {"type":"done"}\n\n',
    ]);

    await readSSEStream(response, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "done" });
  });

  it("非 2xx 响应抛出携带状态码的错误", async () => {
    await expect(readSSEStream(streamResponse([], 500), vi.fn())).rejects.toThrow("请求失败(500)");
  });

  it("回调抛错时中断消费、取消底层流并向上抛出", async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"a"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"b"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const onEvent = vi.fn(() => {
      throw new Error("回调失败");
    });

    await expect(readSSEStream(new Response(stream), onEvent)).rejects.toThrow("回调失败");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(true);
  });

  it("回调抛 SyntaxError 时同样中断消费（不被当作非法事件吞掉）", async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"a"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const onEvent = vi.fn(() => {
      // 回调内部再做一次解析是常见写法，抛出的 SyntaxError 不能被降级为「非法事件」
      throw new SyntaxError("回调内部的解析失败");
    });

    await expect(readSSEStream(new Response(stream), onEvent)).rejects.toThrow(
      "回调内部的解析失败",
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(true);
  });

  it("响应无 body 时抛错", async () => {
    await expect(readSSEStream(new Response(null, { status: 200 }), vi.fn())).rejects.toThrow(
      "请求失败(200)",
    );
  });
});
