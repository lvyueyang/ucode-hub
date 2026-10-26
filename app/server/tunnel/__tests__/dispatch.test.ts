/**
 * 帧分发的收敛：首帧响应、响应块、结束、错误、abort 与协议违规。
 */
import {
  type ControlFrame,
  DATA_FRAME_KINDS,
  type DataFrame,
  MAX_CONCURRENT_STREAMS,
} from "@ucode/hub-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStreamDispatcher, type StreamFailure, type StreamSink } from "../dispatch";

type Harness = {
  dispatcher: ReturnType<typeof createStreamDispatcher>;
  controlFrames: ControlFrame[];
  bodyFrames: DataFrame[];
};

const createHarness = (maxStreams?: number): Harness => {
  const controlFrames: ControlFrame[] = [];
  const bodyFrames: DataFrame[] = [];
  const dispatcher = createStreamDispatcher({
    transport: {
      sendControlFrame: (frame) => controlFrames.push(frame),
      sendRequestBodyFrame: async (streamId, chunk) => {
        bodyFrames.push({ kind: DATA_FRAME_KINDS.requestBody, streamId, payload: chunk });
      },
    },
    allocateStreamId: (() => {
      let last = 0;
      return () => (last += 1);
    })(),
    maxStreams,
  });
  return { dispatcher, controlFrames, bodyFrames };
};

const createSink = () => ({
  onResponse: vi.fn(),
  onBody: vi.fn(),
  onEnd: vi.fn(),
  onError: vi.fn(),
  onClose: vi.fn(),
});

const openStream = (harness: Harness, sink: StreamSink, path = "/api/v1/health"): number | null =>
  harness.dispatcher.openStream(
    { method: "GET", path, headers: { accept: "application/json" }, hasBody: false },
    sink,
  );

const responseBodyFrame = (streamId: number, text: string): DataFrame => ({
  kind: DATA_FRAME_KINDS.responseBody,
  streamId,
  payload: new TextEncoder().encode(text),
});

const textOf = (payload: Uint8Array): string => new TextDecoder().decode(payload);

describe("openStream", () => {
  it("分配流号并发 request 帧，登记为在飞", () => {
    const harness = createHarness();
    const sink = createSink();
    const streamId = openStream(harness, sink);

    expect(streamId).toBe(1);
    expect(harness.controlFrames).toEqual([
      {
        t: "request",
        id: 1,
        method: "GET",
        path: "/api/v1/health",
        headers: { accept: "application/json" },
        hasBody: false,
      },
    ]);
    expect(harness.dispatcher.pendingStreamCount()).toBe(1);
  });

  it("到并发上限返回 null（ingress 据此回 429）", () => {
    const harness = createHarness(2);
    expect(openStream(harness, createSink())).toBe(1);
    expect(openStream(harness, createSink())).toBe(2);
    expect(openStream(harness, createSink())).toBeNull();
  });

  it("默认上限取协议常量", () => {
    const harness = createHarness();
    for (let index = 0; index < MAX_CONCURRENT_STREAMS; index += 1) {
      expect(openStream(harness, createSink())).toBe(index + 1);
    }
    expect(openStream(harness, createSink())).toBeNull();
  });
});

describe("sendRequestBody / endRequest", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("请求体逐块走 transport，送完发 requestEnd", async () => {
    const streamId = openStream(harness, createSink());
    expect(streamId).not.toBeNull();
    if (streamId === null) return;

    await expect(
      harness.dispatcher.sendRequestBody(streamId, new TextEncoder().encode("hello")),
    ).resolves.toBe(true);
    harness.dispatcher.endRequest(streamId);

    expect(harness.bodyFrames.map((frame) => textOf(frame.payload))).toEqual(["hello"]);
    expect(harness.controlFrames.at(-1)).toEqual({ t: "requestEnd", id: streamId });
  });

  it("对端早回包后不再推请求体，但 requestEnd 照发（客户端据此收尾）", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink, "/api/v1/upload");
    if (streamId === null) return;

    await harness.dispatcher.handleControlFrame({
      t: "response",
      id: streamId,
      status: 413,
      headers: {},
    });
    await expect(
      harness.dispatcher.sendRequestBody(streamId, new TextEncoder().encode("rest")),
    ).resolves.toBe(false);
    harness.dispatcher.endRequest(streamId);

    expect(harness.bodyFrames).toEqual([]);
    expect(harness.controlFrames.at(-1)).toEqual({ t: "requestEnd", id: streamId });
  });

  it("流已收尾后不再送请求体，并让调用方停下", async () => {
    const streamId = openStream(harness, createSink());
    if (streamId === null) return;

    harness.dispatcher.abortStream(streamId, "公网侧断开");
    await expect(
      harness.dispatcher.sendRequestBody(streamId, new TextEncoder().encode("late")),
    ).resolves.toBe(false);

    expect(harness.bodyFrames).toEqual([]);
    expect(harness.controlFrames.at(-1)).toEqual({
      t: "abort",
      id: streamId,
      reason: "公网侧断开",
    });
  });
});

describe("handleControlFrame 与 handleDataFrame", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("首帧响应 → 响应块 → 结束：逐条回调 sink 并清掉在飞", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink);
    if (streamId === null) return;

    await harness.dispatcher.handleControlFrame({
      t: "response",
      id: streamId,
      status: 201,
      headers: { "content-type": "text/plain" },
    });
    await harness.dispatcher.handleDataFrame(responseBodyFrame(streamId, "ab"));
    await harness.dispatcher.handleDataFrame(responseBodyFrame(streamId, "cd"));
    await harness.dispatcher.handleControlFrame({ t: "responseEnd", id: streamId });

    expect(sink.onResponse).toHaveBeenCalledWith(201, { "content-type": "text/plain" });
    expect(sink.onBody.mock.calls.map(([chunk]) => textOf(chunk))).toEqual(["ab", "cd"]);
    expect(sink.onEnd).toHaveBeenCalledTimes(1);
    expect(sink.onError).not.toHaveBeenCalled();
    expect(harness.dispatcher.pendingStreamCount()).toBe(0);
  });

  it("error 帧把该流转成失败收尾", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink);
    if (streamId === null) return;

    await harness.dispatcher.handleControlFrame({
      t: "error",
      id: streamId,
      code: "upstream_failed",
      message: "本机服务不可用",
    });

    expect(sink.onError).toHaveBeenCalledWith({
      code: "upstream_failed",
      message: "本机服务不可用",
    });
    expect(harness.dispatcher.pendingStreamCount()).toBe(0);
  });

  it("对端发 abort 按失败收尾（防御性：正常方向是 hub → 客户端）", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink);
    if (streamId === null) return;

    await harness.dispatcher.handleControlFrame({ t: "abort", id: streamId });
    expect(sink.onError).toHaveBeenCalledWith({ code: "aborted", message: expect.any(String) });
  });

  it("首帧响应之前的响应体属违规：整条流失败", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink);
    if (streamId === null) return;

    await harness.dispatcher.handleDataFrame(responseBodyFrame(streamId, "too early"));
    expect(sink.onBody).not.toHaveBeenCalled();
    expect(sink.onError).toHaveBeenCalledWith({
      code: "protocol_error",
      message: expect.stringContaining("响应首帧之前"),
    });
  });

  it("重复的首帧响应与未开始就结束都按协议错误收尾", async () => {
    const first = createSink();
    const firstId = openStream(harness, first);
    if (firstId === null) return;
    await harness.dispatcher.handleControlFrame({
      t: "response",
      id: firstId,
      status: 200,
      headers: {},
    });
    await harness.dispatcher.handleControlFrame({
      t: "response",
      id: firstId,
      status: 500,
      headers: {},
    });
    expect(first.onError).toHaveBeenCalledWith({
      code: "protocol_error",
      message: expect.stringContaining("重复的响应首帧"),
    });
    expect(first.onEnd).not.toHaveBeenCalled();

    const second = createSink();
    const secondId = openStream(harness, second);
    if (secondId === null) return;
    await harness.dispatcher.handleControlFrame({ t: "responseEnd", id: secondId });
    expect(second.onError).toHaveBeenCalledWith({
      code: "protocol_error",
      message: expect.stringContaining("未开始"),
    });
  });

  it("客户端发请求体帧属违规", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink);
    if (streamId === null) return;

    await harness.dispatcher.handleDataFrame({
      kind: DATA_FRAME_KINDS.requestBody,
      streamId,
      payload: new Uint8Array([1]),
    });
    expect(sink.onError).toHaveBeenCalledWith({
      code: "protocol_error",
      message: expect.stringContaining("请求体帧"),
    });
  });

  it("未知流号、连接级控制帧一律忽略", async () => {
    const sink = createSink();
    openStream(harness, sink);

    await harness.dispatcher.handleDataFrame(responseBodyFrame(99, "ghost"));
    await harness.dispatcher.handleControlFrame({ t: "pong" });
    await harness.dispatcher.handleControlFrame({ t: "hello", protocol: 1 });

    expect(sink.onBody).not.toHaveBeenCalled();
    expect(sink.onError).not.toHaveBeenCalled();
    expect(harness.dispatcher.pendingStreamCount()).toBe(1);
  });

  it("handleDataFrame 等 sink 落地（响应流的背压由此传导）", async () => {
    const sink = createSink();
    const streamId = openStream(harness, sink);
    if (streamId === null) return;
    await harness.dispatcher.handleControlFrame({
      t: "response",
      id: streamId,
      status: 200,
      headers: {},
    });

    let released = false;
    sink.onBody.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          released = true;
          resolve();
        }),
    );
    await harness.dispatcher.handleDataFrame(responseBodyFrame(streamId, "chunk"));
    expect(released).toBe(true);
  });
});

describe("failAllStreams", () => {
  it("连接级收尾：所有在飞流逐条失败并清空", async () => {
    const harness = createHarness();
    const first = createSink();
    const second = createSink();
    openStream(harness, first);
    openStream(harness, second);

    const failure: StreamFailure = { code: "device_offline", message: "连接已关闭" };
    harness.dispatcher.failAllStreams(failure);

    expect(first.onError).toHaveBeenCalledWith(failure);
    expect(second.onError).toHaveBeenCalledWith(failure);
    expect(harness.dispatcher.pendingStreamCount()).toBe(0);
    expect(harness.controlFrames.some((frame) => frame.t === "error")).toBe(false);
  });
});

describe("升级流（WebSocket）", () => {
  const openUpgrade = (harness: Harness, sink: StreamSink): number =>
    harness.dispatcher.openStream(
      {
        method: "GET",
        path: "/api/v1/terminal/stream?ticket=x",
        headers: {},
        hasBody: false,
        upgrade: true,
      },
      sink,
    ) as number;

  it("开流时 request 帧带 upgrade，上行不等 101", async () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openUpgrade(harness, sink);

    expect(harness.controlFrames[0]).toEqual({
      t: "request",
      id,
      method: "GET",
      path: "/api/v1/terminal/stream?ticket=x",
      headers: {},
      hasBody: false,
      upgrade: true,
    });

    // 浏览器在设备侧建好本机连接之前就可能发数据：不因「还没回包」而拒绝
    await expect(
      harness.dispatcher.sendRequestBody(id, new TextEncoder().encode("hi")),
    ).resolves.toBe(true);
    expect(harness.bodyFrames).toHaveLength(1);
  });

  it("101 之后双向仍通，close 把关闭码交回 sink", async () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openUpgrade(harness, sink);

    await harness.dispatcher.handleControlFrame({ t: "response", id, status: 101, headers: {} });
    expect(sink.onResponse).toHaveBeenCalledWith(101, {});

    await expect(harness.dispatcher.sendRequestBody(id, new Uint8Array([1]))).resolves.toBe(true);
    await harness.dispatcher.handleDataFrame(responseBodyFrame(id, "out"));
    expect(textOf(sink.onBody.mock.calls[0][0] as Uint8Array)).toBe("out");

    await harness.dispatcher.handleControlFrame({ t: "close", id, code: 4426, reason: "exit:0" });
    expect(sink.onClose).toHaveBeenCalledWith(4426, "exit:0");
    expect(harness.dispatcher.pendingStreamCount()).toBe(0);
  });

  it("升级流的应答不是 101 就按协议错误收尾", async () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openUpgrade(harness, sink);

    await harness.dispatcher.handleControlFrame({ t: "response", id, status: 200, headers: {} });
    expect(sink.onResponse).not.toHaveBeenCalled();
    expect(sink.onError.mock.calls[0][0]).toMatchObject({ code: "protocol_error" });
  });

  it("升级流不得以 responseEnd 结束", async () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openUpgrade(harness, sink);

    await harness.dispatcher.handleControlFrame({ t: "response", id, status: 101, headers: {} });
    await harness.dispatcher.handleControlFrame({ t: "responseEnd", id });
    expect(sink.onEnd).not.toHaveBeenCalled();
    expect(sink.onError.mock.calls[0][0]).toMatchObject({ code: "protocol_error" });
  });

  it("closeStream 发 close 帧并从登记表移除，不再回调 sink", () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openUpgrade(harness, sink);

    harness.dispatcher.closeStream(id, 1000, "closed");
    expect(harness.controlFrames.at(-1)).toEqual({ t: "close", id, code: 1000, reason: "closed" });
    expect(sink.onClose).not.toHaveBeenCalled();
    expect(harness.dispatcher.pendingStreamCount()).toBe(0);
  });

  it("升级流没有「请求体发完」这个边界", () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openUpgrade(harness, sink);

    harness.dispatcher.endRequest(id);
    expect(harness.controlFrames.some((frame) => frame.t === "requestEnd")).toBe(false);
  });

  it("普通流收到 close 帧按协议错误收尾", async () => {
    const harness = createHarness();
    const sink = createSink();
    const id = openStream(harness, sink) as number;

    await harness.dispatcher.handleControlFrame({ t: "close", id, code: 1000 });
    expect(sink.onClose).not.toHaveBeenCalled();
    expect(sink.onError.mock.calls[0][0]).toMatchObject({ code: "protocol_error" });
  });
});
