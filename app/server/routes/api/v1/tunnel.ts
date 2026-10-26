/**
 * 隧道宿主：`TUNNEL_PATH` 上的 WebSocket 端点。
 *
 * 生命周期：HTTP 升级时先按 `Authorization: Bearer <deviceToken>` 认设备（拒绝即 401，不进 WS），
 * 升级后等客户端首帧 `hello` 协商协议版本，通过则登记上线并回 `welcome`；此后连接上跑的是多路复用
 * 的请求 / 响应帧（分发见 `../tunnel/dispatch.ts`），ingress 从注册表取连接开流。
 * 心跳（应用层 ping/pong）判死，连接关闭时注销登记并让在飞的流逐条失败——公网侧不能悬着。
 *
 * 帧序：数据面出站（request / 请求体 / requestEnd / abort）统一走 `writer`（串行 + 背压），
 * 连接级控制帧（welcome / reject / ping / pong）直发；入站串行处理，保证同一连接的帧按到达顺序生效。
 */
import { randomUUID } from "node:crypto";

import {
  type ControlFrame,
  DATA_FRAME_KINDS,
  DEVICE_AUTH_HEADER,
  decodeControlFrame,
  decodeDataFrame,
  encodeControlFrame,
  encodeDataFrame,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  TUNNEL_ERROR_CODES,
} from "@ucode/hub-protocol";
import { defineWebSocketHandler, type WebSocketMessage, type WebSocketPeer } from "nitro/h3";

import {
  markDeviceOffline,
  markDeviceOnline,
  touchDeviceActivity,
} from "#/services/device/device.online";
import { findDeviceByToken } from "#/services/device/device.server";
import { logger } from "#/shared-services/logger";

import {
  createDrainWaiter,
  createFrameWriter,
  type DrainWaiter,
  type FrameWriter,
} from "../../../tunnel/backpressure";
import {
  createTunnelConnection,
  TAKEN_OVER_CODE,
  type TunnelConnection,
  tunnelRegistry,
} from "../../../tunnel/connections";
import type { StreamTransport } from "../../../tunnel/dispatch";
import { parseBearerToken } from "../../../tunnel/ingress-request";

/** 会话挂在 `peer.context` 上：连接结束随之释放，不需要额外的 map 与清理 */
const SESSION_KEY = "hubTunnelSession";

type TunnelSession = {
  deviceId: string;
  connectionId: string;
  openedAt: number;
  peer: WebSocketPeer;
  writer: FrameWriter;
  waiter: DrainWaiter;
  /** 握手完成前不进注册表：注册表里出现即代表这条隧道可用 */
  connection: TunnelConnection;
  handshaken: boolean;
  /** 最近一次收到 pong 的时刻；握手超时也用它兜底 */
  lastPongAt: number;
  heartbeat: ReturnType<typeof setInterval> | null;
  /** 收尾只做一次 */
  closed: boolean;
  /** 入站处理链：同一连接的帧必须按到达顺序生效 */
  inbound: Promise<void>;
};

const getSession = (peer: WebSocketPeer): TunnelSession | null =>
  (peer.context[SESSION_KEY] as TunnelSession | undefined) ?? null;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 连接可能已断：发送失败只记 debug，不能让它冒泡到 WS 回调里 */
const sendRaw = (peer: WebSocketPeer, frame: string | Uint8Array): void => {
  try {
    peer.send(frame);
  } catch (error) {
    logger.debug({ error: reasonOf(error) }, "隧道帧发送失败（连接可能已关闭）");
  }
};

/** 关闭连接：真正的注销与在飞流收尾在 close 钩子里（对端也可能先断） */
const closePeer = (peer: WebSocketPeer, reason: string): void => {
  try {
    peer.close(1000, reason);
  } catch (error) {
    logger.debug({ error: reasonOf(error) }, "隧道连接关闭失败");
  }
};

/**
 * 连接级控制帧（welcome / reject / ping / pong）直发，不排写队列：
 * 它们与数据帧没有先后约束，排在等待 drain 的队列后面只会白白延迟（握手与心跳都不该被拖住）。
 */
const sendDirect = (session: TunnelSession, frame: ControlFrame): void => {
  sendRaw(session.peer, encodeControlFrame(frame));
};

/** 收尾：注销登记 + 在飞流逐条失败 + 放行写队列（等待 drain 的写不能挂在死连接上） */
const dispose = (session: TunnelSession, reason: string): void => {
  if (session.closed) return;
  session.closed = true;
  if (session.heartbeat !== null) clearInterval(session.heartbeat);
  session.waiter.release();

  const { deviceId, connectionId, connection } = session;
  const wasRegistered = tunnelRegistry.release(deviceId, connectionId);
  markDeviceOffline(deviceId, connectionId);
  connection.dispatcher.failAllStreams({
    code: TUNNEL_ERROR_CODES.deviceOffline,
    message: reason,
  });

  const detail = { deviceId, connectionId, ms: Date.now() - session.openedAt, reason };
  if (wasRegistered) logger.info(detail, "设备隧道下线");
  else logger.debug(detail, "隧道连接在接管或握手完成前关闭");
};

/** 握手：版本对不上就 reject 并关闭；通过则登记上线、回 welcome */
const handleHello = (session: TunnelSession, clientProtocol: number): void => {
  const { deviceId, connectionId } = session;
  if (clientProtocol !== PROTOCOL_VERSION) {
    logger.warn(
      { deviceId, clientProtocol, serverProtocol: PROTOCOL_VERSION },
      "隧道协议版本不匹配",
    );
    sendDirect(session, {
      t: "reject",
      code: TUNNEL_ERROR_CODES.protocolMismatch,
      message: `协议版本不匹配：服务端 ${PROTOCOL_VERSION}，客户端 ${clientProtocol}`,
    });
    closePeer(session.peer, "协议版本不匹配");
    return;
  }

  session.handshaken = true;
  session.lastPongAt = Date.now();
  markDeviceOnline(deviceId, connectionId);
  const replaced = tunnelRegistry.register(session.connection);
  if (replaced) {
    logger.info(
      { deviceId, replacedConnectionId: replaced.connectionId, code: TAKEN_OVER_CODE },
      "同一设备的新隧道接管了旧连接",
    );
  }
  logger.info({ deviceId, connectionId }, "设备隧道上线");
  sendDirect(session, {
    t: "welcome",
    protocol: PROTOCOL_VERSION,
    deviceId,
    serverTime: new Date().toISOString(),
  });
};

const rejectFirstFrame = (session: TunnelSession): void => {
  logger.warn({ deviceId: session.deviceId }, "隧道首帧不是 hello，拒绝该连接");
  sendDirect(session, {
    t: "reject",
    code: TUNNEL_ERROR_CODES.protocolMismatch,
    message: "首帧必须是 hello",
  });
  closePeer(session.peer, "首帧不是 hello");
};

const handleControl = async (session: TunnelSession, frame: ControlFrame): Promise<void> => {
  if (frame.t === "ping") {
    sendDirect(session, { t: "pong" });
    return;
  }
  if (frame.t === "pong") {
    session.lastPongAt = Date.now();
    touchDeviceActivity(session.deviceId);
    return;
  }
  if (frame.t === "hello") return;
  await session.connection.dispatcher.handleControlFrame(frame);
};

const handleInbound = async (session: TunnelSession, message: WebSocketMessage): Promise<void> => {
  const { deviceId } = session;

  if (typeof message.rawData === "string") {
    const frame = decodeControlFrame(message.rawData);
    if (!frame) {
      logger.debug({ deviceId }, "隧道收到无法解析的控制帧");
      return;
    }
    if (!session.handshaken) {
      if (frame.t === "hello") handleHello(session, frame.protocol);
      else rejectFirstFrame(session);
      return;
    }
    await handleControl(session, frame);
    return;
  }

  const frame = decodeDataFrame(message.uint8Array());
  if (!frame) {
    logger.debug({ deviceId }, "隧道收到无法解析的数据帧");
    return;
  }
  // 握手未完成的连接还没进注册表，ingress 不会往它上面开流，此刻的帧一律丢弃
  if (!session.handshaken) return;
  await session.connection.dispatcher.handleDataFrame(frame);
};

/** 心跳：到点发 ping；超过判死阈值没收到 pong 就断开（握手期同样受它保护） */
const startHeartbeat = (session: TunnelSession): void => {
  const timer = setInterval(() => {
    if (session.closed) return;
    const idleMs = Date.now() - session.lastPongAt;
    if (idleMs > HEARTBEAT_TIMEOUT_MS) {
      logger.warn(
        { deviceId: session.deviceId, idleMs, handshaken: session.handshaken },
        "隧道心跳超时，断开连接",
      );
      closePeer(session.peer, "心跳超时");
      return;
    }
    sendDirect(session, { t: "ping" });
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  session.heartbeat = timer;
};

const createSession = (
  peer: WebSocketPeer,
  deviceId: string,
  connectionId: string,
): TunnelSession => {
  const waiter = createDrainWaiter();
  const writer = createFrameWriter({
    peer,
    waiter,
    send: (frame) => sendRaw(peer, frame),
  });
  const transport: StreamTransport = {
    sendControlFrame: (frame) => void writer.write(encodeControlFrame(frame)),
    sendRequestBodyFrame: async (streamId, chunk, text) => {
      await writer.write(
        encodeDataFrame({
          kind: text ? DATA_FRAME_KINDS.requestText : DATA_FRAME_KINDS.requestBody,
          streamId,
          payload: chunk,
        }),
      );
    },
  };

  return {
    deviceId,
    connectionId,
    openedAt: Date.now(),
    peer,
    writer,
    waiter,
    connection: createTunnelConnection({
      deviceId,
      connectionId,
      transport,
      sendNotice: (frame) => sendRaw(peer, encodeControlFrame(frame)),
      close: (_code, reason) => closePeer(peer, reason ?? "连接关闭"),
    }),
    handshaken: false,
    lastPongAt: Date.now(),
    heartbeat: null,
    closed: false,
    inbound: Promise.resolve(),
  };
};

export default defineWebSocketHandler({
  /** 升级即鉴权：令牌无效 / 已吊销一律拒绝，连 WS 都不建（对端只看得到状态码） */
  async upgrade(request) {
    const token = parseBearerToken(request.headers.get(DEVICE_AUTH_HEADER));
    const device = token ? await findDeviceByToken(token) : null;
    if (device?.status !== "active") {
      logger.warn({ hasToken: token !== null }, "隧道握手被拒：设备令牌无效或已吊销");
      return new Response(
        JSON.stringify({
          error: "设备令牌无效或已吊销",
          code: TUNNEL_ERROR_CODES.deviceUnauthorized,
        }),
        { status: 401, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
    return { context: { deviceId: device.id, connectionId: randomUUID() } };
  },

  open(peer) {
    // 设备身份由 upgrade 放进 context；取不到就说明这不是走正常握手进来的连接，不留半截会话
    const deviceId = peer.context.deviceId as string | undefined;
    const connectionId = peer.context.connectionId as string | undefined;
    if (!deviceId || !connectionId) {
      logger.warn({ peerId: peer.id }, "隧道连接缺少握手信息，直接关闭");
      closePeer(peer, "缺少握手信息");
      return;
    }
    const session = createSession(peer, deviceId, connectionId);
    peer.context[SESSION_KEY] = session;
    startHeartbeat(session);
    logger.debug({ deviceId, connectionId, peerId: peer.id }, "隧道 WS 已建立，等待 hello");
  },

  message(peer, message) {
    const session = getSession(peer);
    if (!session || session.closed) return;
    session.inbound = session.inbound
      .then(() => handleInbound(session, message))
      .catch((error) => {
        logger.warn({ deviceId: session.deviceId, error: reasonOf(error) }, "隧道入站帧处理失败");
      });
  },

  /** 适配器给出 drain 信号时用它唤醒背压等待（没有该信号的适配器靠轮询兜底） */
  drain(peer) {
    getSession(peer)?.waiter.notifyDrain();
  },

  close(peer, details) {
    const session = getSession(peer);
    if (!session) return;
    dispose(session, details.reason || "连接关闭");
  },

  error(peer, error) {
    const session = getSession(peer);
    logger.warn(
      { deviceId: session?.deviceId, error: reasonOf(error) },
      "隧道连接出错，交由 close 收尾",
    );
  },
});
