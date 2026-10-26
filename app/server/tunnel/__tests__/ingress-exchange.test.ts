/**
 * 响应桥：首帧/块/结束/失败的收敛、公网侧断开取消上游、队列压满后挂住入流。
 */
import { describe, expect, it, vi } from "vitest";

import { createIngressExchange } from "../ingress-exchange";

const textOf = (chunk: Uint8Array): string => new TextDecoder().decode(chunk);

/** 逐块读完响应流；遇到错误时把错误带上，便于断言「被截断」 */
const readAll = async (stream: ReadableStream<Uint8Array>): Promise<string[]> => {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(textOf(chunk));
  return chunks;
};

const encoder = new TextEncoder();

describe("createIngressExchange", () => {
  it("首帧响应定下状态码与头，响应块逐块入流，结束即关闭", async () => {
    const exchange = createIngressExchange({
      signal: new AbortController().signal,
      onAbort: () => undefined,
    });
    exchange.sink.onResponse(201, { "content-type": "text/plain" });
    await expect(exchange.waitHead()).resolves.toEqual({
      kind: "head",
      status: 201,
      headers: { "content-type": "text/plain" },
    });

    const reading = readAll(exchange.stream);
    await exchange.sink.onBody(encoder.encode("ab"));
    await exchange.sink.onBody(encoder.encode("cd"));
    exchange.sink.onEnd();

    await expect(reading).resolves.toEqual(["ab", "cd"]);
  });

  it("首帧之前的失败让 handler 拿到失败态（转 502）", async () => {
    const exchange = createIngressExchange({
      signal: new AbortController().signal,
      onAbort: () => undefined,
    });
    exchange.sink.onError({ code: "upstream_failed", message: "本机服务不可用" });

    await expect(exchange.waitHead()).resolves.toEqual({
      kind: "failure",
      failure: { code: "upstream_failed", message: "本机服务不可用" },
    });
  });

  it("首帧之后的失败中断响应体，不假装正常结束", async () => {
    const exchange = createIngressExchange({
      signal: new AbortController().signal,
      onAbort: () => undefined,
    });
    exchange.sink.onResponse(200, {});
    const reading = readAll(exchange.stream).catch((error: Error) => error.message);
    await exchange.sink.onBody(encoder.encode("partial"));
    exchange.sink.onError({ code: "tunnel_closed", message: "隧道断开" });

    await expect(reading).resolves.toContain("tunnel_closed");
  });

  it("公网请求中断开（signal）取消隧道上的流，并让 waitHead 走「已断开」这条路", async () => {
    const controller = new AbortController();
    const onAbort = vi.fn();
    const exchange = createIngressExchange({ signal: controller.signal, onAbort });

    controller.abort();
    await expect(exchange.waitHead()).resolves.toEqual({ kind: "aborted" });
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("消费端撤销同样取消上游，且只取消一次", async () => {
    const onAbort = vi.fn();
    const exchange = createIngressExchange({ signal: new AbortController().signal, onAbort });
    exchange.sink.onResponse(200, {});

    const reader = exchange.stream.getReader();
    await reader.cancel("调用方不再需要");

    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledWith("调用方不再需要");
  });

  it("队列压满高水位后入流回调挂住，消费端读走才继续", async () => {
    const exchange = createIngressExchange({
      signal: new AbortController().signal,
      onAbort: () => undefined,
    });
    exchange.sink.onResponse(200, {});
    const reader = exchange.stream.getReader();

    // 4MB 高水位：塞满之后下一块必须等消费端腾出空间
    const big = new Uint8Array(3 * 1024 * 1024);
    await exchange.sink.onBody(big);
    await exchange.sink.onBody(big);
    let thirdDone = false;
    const third = Promise.resolve(exchange.sink.onBody(encoder.encode("tail"))).then(() => {
      thirdDone = true;
    });

    await Promise.resolve();
    expect(thirdDone).toBe(false);

    await reader.read();
    await third;
    expect(thirdDone).toBe(true);

    reader.releaseLock();
    await reader.cancel().catch(() => undefined);
  });

  it("放弃的流不再往流里塞（并发超限的场景）", async () => {
    const onAbort = vi.fn();
    const exchange = createIngressExchange({ signal: new AbortController().signal, onAbort });
    exchange.discard();

    await exchange.sink.onBody(encoder.encode("late"));
    expect(onAbort).not.toHaveBeenCalled();
  });
});
