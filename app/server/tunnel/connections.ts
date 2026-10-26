/**
 * 隧道连接注册表：一台设备同一时刻只保留一条活连接，新的上线就接管旧的。
 *
 * 接管是刻意的单连接语义——同一设备重复上线往往意味着客户端以为旧连接已死，
 * 保留两条只会让 ingress 随机路由到一条不再被消费的连接上。接管时旧连接收到 `reject`、
 * 被关闭，它在飞的流逐条以「被接管」收尾，公网侧不会悬着。
 *
 * 注册表是**进程内事实**（隧道活在本进程里），挂 `globalThis`：dev / HMR / 产物分包下同一模块
 * 可能被求值多次，注册表必须是同一份（同 `services/device/device.online`）。
 */
import type { ControlFrame } from "@ucode/hub-protocol";

import { createStreamDispatcher, type StreamDispatcher, type StreamTransport } from "./dispatch";

/** 被新连接接管：协议包只覆盖握手与并发，这一条由 hub 自造，客户端据此可重连 */
export const TAKEN_OVER_CODE = "device_taken_over";

/** 接管时给旧连接的理由文案：对端日志要靠它区分「被顶掉」与「网络断了」 */
const TAKEN_OVER_REASON = "该设备已在新的隧道连接上上线";

export type TunnelConnection = {
  readonly deviceId: string;
  /** 连接标识：上下线登记与注销核对都用它，晚到的旧连接关不掉接管它的新连接 */
  readonly connectionId: string;
  readonly openedAt: number;
  /** 这条连接上的多路复用器：ingress 经它开流 */
  readonly dispatcher: StreamDispatcher;
  /**
   * 直发一帧连接级控制帧：不排写队列。队列可能正等 drain（对端慢），而接管通知必须在关闭之前出去，
   * 排在队列后面就发不出来了。
   */
  sendNotice(frame: ControlFrame): void;
  /** 断开底层连接（真正的 peer.close 由宿主传入） */
  close(code?: number, reason?: string): void;
};

/**
 * 流号分配器：从 1 起、只增不复用。
 * 0 留给控制帧；不复用是为了让「迟到帧」永远对不上新流，而不是错配到别的请求上。
 */
export const createStreamIdAllocator = (): (() => number) => {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
};

export const createTunnelConnection = (opts: {
  deviceId: string;
  connectionId: string;
  transport: StreamTransport;
  /** 宿主提供的直发动作（编码后立刻 peer.send，不排写队列） */
  sendNotice: (frame: ControlFrame) => void;
  /** 宿主提供的断开动作（对端会收到关闭帧） */
  close: (code?: number, reason?: string) => void;
}): TunnelConnection => ({
  deviceId: opts.deviceId,
  connectionId: opts.connectionId,
  openedAt: Date.now(),
  dispatcher: createStreamDispatcher({
    transport: opts.transport,
    allocateStreamId: createStreamIdAllocator(),
  }),
  sendNotice: (frame) => opts.sendNotice(frame),
  close: (code, reason) => opts.close(code, reason),
});

export type TunnelConnectionRegistry = {
  /** 登记新连接并接管同设备的旧连接；返回被顶替的旧连接（无则 null） */
  register(connection: TunnelConnection): TunnelConnection | null;
  get(deviceId: string): TunnelConnection | null;
  /** 注销：连接标识对不上时不生效，返回是否真的移除了 */
  release(deviceId: string, connectionId: string): boolean;
  size(): number;
  deviceIds(): string[];
};

export const createTunnelRegistry = (): TunnelConnectionRegistry => {
  const byDevice = new Map<string, TunnelConnection>();

  return {
    register(connection) {
      const existing = byDevice.get(connection.deviceId) ?? null;
      if (existing && existing.connectionId !== connection.connectionId) {
        existing.sendNotice({ t: "reject", code: TAKEN_OVER_CODE, message: TAKEN_OVER_REASON });
        // 先让在飞的流收尾再断开：断开钩子里的收尾是异步的，公网侧不能多等一个事件循环
        existing.dispatcher.failAllStreams({
          code: TAKEN_OVER_CODE,
          message: "连接已被该设备的新隧道接管",
        });
        existing.close(1000, TAKEN_OVER_REASON);
      }
      byDevice.set(connection.deviceId, connection);
      return existing;
    },
    get(deviceId) {
      return byDevice.get(deviceId) ?? null;
    },
    release(deviceId, connectionId) {
      const current = byDevice.get(deviceId);
      if (!current || current.connectionId !== connectionId) return false;
      byDevice.delete(deviceId);
      return true;
    },
    size() {
      return byDevice.size;
    },
    deviceIds() {
      return [...byDevice.keys()];
    },
  };
};

const REGISTRY_KEY = "__hubTunnelRegistry";

const globalWithRegistry = globalThis as typeof globalThis & {
  [REGISTRY_KEY]?: TunnelConnectionRegistry;
};

const existingRegistry = globalWithRegistry[REGISTRY_KEY];

/** 进程级注册表（跨 bundle 共享同一份） */
export const tunnelRegistry: TunnelConnectionRegistry = existingRegistry ?? createTunnelRegistry();
globalWithRegistry[REGISTRY_KEY] = tunnelRegistry;
