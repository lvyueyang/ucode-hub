/**
 * 协议包的自测：帧编解码的边界、控制帧校验、切块。
 * 这些是两端行为对称的保证，任一侧改协议都必须让这里先红。
 */
import { describe, expect, it } from "vitest";

import {
  CONTROL_STREAM_ID,
  chunkPayload,
  decodeControlFrame,
  decodeDataFrame,
  encodeControlFrame,
  encodeDataFrame,
  FRAME_HEADER_BYTES,
  MAX_FRAME_PAYLOAD,
  PROTOCOL_VERSION,
} from "../index";

describe("数据帧编解码", () => {
  it("往返一致（含空载荷）", () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const frame = decodeDataFrame(encodeDataFrame({ kind: 0, streamId: 7, payload }));
    expect(frame?.kind).toBe(0);
    expect(frame?.streamId).toBe(7);
    expect(Array.from(frame?.payload ?? [])).toEqual([1, 2, 3, 4]);

    const empty = decodeDataFrame(
      encodeDataFrame({ kind: 1, streamId: 1, payload: new Uint8Array() }),
    );
    expect(empty?.payload.byteLength).toBe(0);
  });

  it("头部固定 9 字节", () => {
    expect(encodeDataFrame({ kind: 0, streamId: 1, payload: new Uint8Array([9]) }).byteLength).toBe(
      FRAME_HEADER_BYTES + 1,
    );
    expect(CONTROL_STREAM_ID).toBe(0);
  });

  it("拒收头部不足、流号 0、类型未知与截断的帧", () => {
    expect(decodeDataFrame(new Uint8Array([0, 0]))).toBeNull();

    const zeroStream = encodeDataFrame({ kind: 0, streamId: 1, payload: new Uint8Array([1]) });
    new DataView(zeroStream.buffer).setUint32(1, 0);
    expect(decodeDataFrame(zeroStream)).toBeNull();

    const unknownKind = encodeDataFrame({ kind: 0, streamId: 1, payload: new Uint8Array([1]) });
    unknownKind[0] = 9;
    expect(decodeDataFrame(unknownKind)).toBeNull();

    const truncated = encodeDataFrame({ kind: 0, streamId: 1, payload: new Uint8Array([1, 2, 3]) });
    expect(decodeDataFrame(truncated.subarray(0, FRAME_HEADER_BYTES + 1))).toBeNull();
  });

  it("超过上限的载荷在编码时就被拦下", () => {
    expect(() =>
      encodeDataFrame({ kind: 0, streamId: 1, payload: new Uint8Array(MAX_FRAME_PAYLOAD + 1) }),
    ).toThrow(/切块/);
  });

  it("切块：空载荷不产生块，边界正好整除时不多发空块", () => {
    expect(chunkPayload(new Uint8Array())).toHaveLength(0);
    expect(chunkPayload(new Uint8Array(10), 4).map((chunk) => chunk.byteLength)).toEqual([4, 4, 2]);
    expect(chunkPayload(new Uint8Array(8), 4).map((chunk) => chunk.byteLength)).toEqual([4, 4]);
  });
});

describe("控制帧", () => {
  it("握手与请求帧往返一致", () => {
    const hello = decodeControlFrame(
      encodeControlFrame({ t: "hello", protocol: PROTOCOL_VERSION, clientVersion: "0.3.0" }),
    );
    expect(hello).toEqual({ t: "hello", protocol: PROTOCOL_VERSION, clientVersion: "0.3.0" });

    const request = decodeControlFrame(
      encodeControlFrame({
        t: "request",
        id: 3,
        method: "POST",
        path: "/api/v1/messages/prompt?x=1",
        headers: { "content-type": "application/json" },
        hasBody: true,
      }),
    );
    expect(request?.t === "request" && request.id).toBe(3);
  });

  it("升级请求带 upgrade，普通请求不带", () => {
    const upgraded = decodeControlFrame(
      encodeControlFrame({
        t: "request",
        id: 4,
        method: "GET",
        path: "/api/v1/terminal/stream?ticket=x",
        headers: {},
        hasBody: false,
        upgrade: true,
      }),
    );
    expect(upgraded?.t === "request" && upgraded.upgrade).toBe(true);
  });

  it("close 帧带 WebSocket 关闭码，越界与缺失一律拒收", () => {
    const closed = decodeControlFrame(
      encodeControlFrame({ t: "close", id: 5, code: 4426, reason: "exit:0" }),
    );
    expect(closed).toEqual({ t: "close", id: 5, code: 4426, reason: "exit:0" });

    expect(decodeControlFrame(JSON.stringify({ t: "close", id: 5, code: 999 }))).toBeNull();
    expect(decodeControlFrame(JSON.stringify({ t: "close", id: 5, code: 5000 }))).toBeNull();
    expect(decodeControlFrame(JSON.stringify({ t: "close", id: 5 }))).toBeNull();
  });

  it("认不出的一律返回 null", () => {
    expect(decodeControlFrame("not json")).toBeNull();
    expect(decodeControlFrame(JSON.stringify({ t: "unknown" }))).toBeNull();
    expect(decodeControlFrame(JSON.stringify({ t: "request", id: 0 }))).toBeNull();
    expect(decodeControlFrame(JSON.stringify({ t: "error", id: 2, code: "x" }))).toBeNull();
  });
});
