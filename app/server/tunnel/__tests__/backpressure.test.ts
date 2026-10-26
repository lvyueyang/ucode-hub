/**
 * 出站背压：写队列串行、超水位线等 drain、连接关闭时放行等待者。
 */
import { describe, expect, it, vi } from "vitest";

import {
  createDrainWaiter,
  createFrameWriter,
  HIGH_WATERMARK_BYTES,
  LOW_WATERMARK_BYTES,
} from "../backpressure";

/** 可控缓冲的假对端：`bufferedAmount` 由用例推高 / 压低 */
const createPeer = (bufferedAmount = 0) => {
  const peer = { bufferedAmount };
  return {
    peer,
    congest(amount: number) {
      peer.bufferedAmount = amount;
    },
    drain() {
      peer.bufferedAmount = 0;
    },
  };
};

describe("createFrameWriter", () => {
  it("串行发帧，帧序与排入顺序一致", async () => {
    const { peer } = createPeer();
    const sent: string[] = [];
    const writer = createFrameWriter({
      peer,
      waiter: createDrainWaiter(),
      send: (frame) => {
        sent.push(typeof frame === "string" ? frame : "binary");
      },
    });

    await Promise.all([writer.write("a"), writer.write("b"), writer.write("c")]);
    expect(sent).toEqual(["a", "b", "c"]);
  });

  it("缓冲超水位线时挂住，drain 钩子放行后继续", async () => {
    const harness = createPeer(HIGH_WATERMARK_BYTES + 1);
    const waiter = createDrainWaiter();
    const sent: string[] = [];
    const writer = createFrameWriter({
      peer: harness.peer,
      waiter,
      send: (frame) => sent.push(String(frame)),
    });

    const pending = writer.write("first");
    await Promise.resolve();
    expect(sent).toEqual([]);

    harness.drain();
    waiter.notifyDrain();
    await pending;
    expect(sent).toEqual(["first"]);
  });

  it("适配器不给 drain 信号时靠轮询看到缓冲降下来", async () => {
    vi.useFakeTimers();
    try {
      const harness = createPeer(HIGH_WATERMARK_BYTES + 1);
      const sent: string[] = [];
      const writer = createFrameWriter({
        peer: harness.peer,
        waiter: createDrainWaiter(),
        send: (frame) => sent.push(String(frame)),
      });

      const pending = writer.write("slow");
      await vi.advanceTimersByTimeAsync(10);
      expect(sent).toEqual([]);

      harness.congest(LOW_WATERMARK_BYTES);
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(sent).toEqual(["slow"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("连接关闭（release）放行等待的写，不让队列挂在死连接上", async () => {
    const harness = createPeer(HIGH_WATERMARK_BYTES + 1);
    const waiter = createDrainWaiter();
    const sent: string[] = [];
    const writer = createFrameWriter({
      peer: harness.peer,
      waiter,
      send: (frame) => sent.push(String(frame)),
    });

    const pending = writer.write("last");
    await Promise.resolve();
    waiter.release();
    await pending;
    expect(sent).toEqual(["last"]);
  });

  it("单帧发送抛错不阻断后续帧", async () => {
    const { peer } = createPeer();
    const sent: string[] = [];
    const writer = createFrameWriter({
      peer,
      waiter: createDrainWaiter(),
      send: (frame) => {
        const text = String(frame);
        if (text === "boom") throw new Error("连接已断");
        sent.push(text);
      },
    });

    await expect(writer.write("boom")).rejects.toThrow("连接已断");
    await writer.write("after");
    expect(sent).toEqual(["after"]);
  });
});
