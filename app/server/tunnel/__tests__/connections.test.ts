/**
 * 隧道连接注册表与流号分配器：接管语义、注销核对、流号不复用。
 */
import {
  type ControlFrame,
  DATA_FRAME_KINDS,
  type DataFrame,
  MAX_CONCURRENT_STREAMS,
} from "@ucode/hub-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStreamIdAllocator,
  createTunnelConnection,
  createTunnelRegistry,
  TAKEN_OVER_CODE,
  type TunnelConnection,
} from "../connections";
import type { StreamTransport } from "../dispatch";

type Stub = {
  connection: TunnelConnection;
  controlFrames: ControlFrame[];
  /** 直发的连接级控制帧（与走写队列的 controlFrames 分开记） */
  notices: ControlFrame[];
  bodyFrames: DataFrame[];
  closes: string[];
  transport: StreamTransport;
  /** 模拟「公网侧还有一条在飞的流」：开一条流后不解流 */
  openStream: () => number | null;
};

const createStub = (deviceId = "device-1", connectionId = "conn-1"): Stub => {
  const controlFrames: ControlFrame[] = [];
  const notices: ControlFrame[] = [];
  const bodyFrames: DataFrame[] = [];
  const closes: string[] = [];
  const transport: StreamTransport = {
    sendControlFrame: (frame) => controlFrames.push(frame),
    sendRequestBodyFrame: async (streamId, chunk) => {
      bodyFrames.push({ kind: DATA_FRAME_KINDS.requestBody, streamId, payload: chunk });
    },
  };
  const connection = createTunnelConnection({
    deviceId,
    connectionId,
    transport,
    sendNotice: (frame) => notices.push(frame),
    close: (_code, reason) => closes.push(reason ?? ""),
  });
  return {
    connection,
    controlFrames,
    notices,
    bodyFrames,
    closes,
    transport,
    openStream: () =>
      connection.dispatcher.openStream(
        { method: "GET", path: "/api/v1/health", headers: {}, hasBody: false },
        {
          onResponse: () => undefined,
          onBody: () => undefined,
          onEnd: () => undefined,
          onError: () => undefined,
        },
      ),
  };
};

describe("createStreamIdAllocator", () => {
  it("从 1 起递增，且不复用", () => {
    const next = createStreamIdAllocator();
    expect([next(), next(), next()]).toEqual([1, 2, 3]);
    expect(next()).toBe(4);
  });

  it("每条连接各自计数", () => {
    const first = createStreamIdAllocator();
    const second = createStreamIdAllocator();
    expect(first()).toBe(1);
    expect(second()).toBe(1);
  });
});

describe("createTunnelRegistry", () => {
  let registry: ReturnType<typeof createTunnelRegistry>;

  beforeEach(() => {
    registry = createTunnelRegistry();
  });

  it("登记后可按设备取回，重复登记同一连接不接过", () => {
    const stub = createStub();
    expect(registry.register(stub.connection)).toBeNull();
    expect(registry.get("device-1")).toBe(stub.connection);
    expect(registry.register(stub.connection)).toBe(stub.connection);
    expect(stub.closes).toEqual([]);
    expect(registry.size()).toBe(1);
  });

  it("新连接接管旧连接：旧连接收到 reject、被关闭，在飞流转失败", async () => {
    const onError = vi.fn();
    const oldStub = createStub("device-1", "conn-old");
    oldStub.connection.dispatcher.openStream(
      { method: "GET", path: "/", headers: {}, hasBody: false },
      { onResponse: () => undefined, onBody: () => undefined, onEnd: () => undefined, onError },
    );
    registry.register(oldStub.connection);

    const newStub = createStub("device-1", "conn-new");
    const replaced = registry.register(newStub.connection);

    expect(replaced).toBe(oldStub.connection);
    expect(oldStub.notices).toContainEqual({
      t: "reject",
      code: TAKEN_OVER_CODE,
      message: expect.any(String),
    });
    expect(oldStub.closes).toEqual(["该设备已在新的隧道连接上上线"]);
    expect(onError).toHaveBeenCalledWith({
      code: TAKEN_OVER_CODE,
      message: expect.any(String),
    });
    expect(oldStub.connection.dispatcher.pendingStreamCount()).toBe(0);
    expect(registry.get("device-1")).toBe(newStub.connection);
  });

  it("注销要连接标识对得上：旧连接关不掉接管它的新连接", () => {
    const oldStub = createStub("device-1", "conn-old");
    registry.register(oldStub.connection);
    const newStub = createStub("device-1", "conn-new");
    registry.register(newStub.connection);

    expect(registry.release("device-1", "conn-old")).toBe(false);
    expect(registry.get("device-1")).toBe(newStub.connection);
    expect(registry.release("device-1", "conn-new")).toBe(true);
    expect(registry.get("device-1")).toBeNull();
    expect(registry.register(oldStub.connection)).toBeNull();
  });

  it("不同设备各留一条连接", () => {
    registry.register(createStub("device-1", "conn-1").connection);
    registry.register(createStub("device-2", "conn-2").connection);
    expect(registry.deviceIds().sort()).toEqual(["device-1", "device-2"]);
  });
});

describe("createTunnelConnection", () => {
  it("经 dispatcher 开流会发出 request 帧并带上流号", () => {
    const stub = createStub();
    const streamId = stub.openStream();
    expect(streamId).toBe(1);
    expect(stub.controlFrames[0]).toMatchObject({ t: "request", id: 1, method: "GET" });
  });

  it("并发上限用协议常量：到顶后不再开流", () => {
    const stub = createStub();
    for (let index = 0; index < MAX_CONCURRENT_STREAMS; index += 1) {
      expect(stub.openStream()).toBe(index + 1);
    }
    expect(stub.openStream()).toBeNull();
  });

  it("sendNotice 直发连接级控制帧（接管通知走这条路径，不排写队列）", () => {
    const stub = createStub();
    stub.connection.sendNotice({ t: "ping" });
    expect(stub.notices).toEqual([{ t: "ping" }]);
  });
});
