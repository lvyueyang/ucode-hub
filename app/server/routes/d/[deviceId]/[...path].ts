/**
 * 路径寻址下的 WebSocket 升级入口：`/d/<设备 id>/<该设备上的路径>`。
 *
 * 浏览器这条 WS 由 hub 终结，字节经隧道上的升级流来回：上行用请求体帧、下行用响应体帧，
 * 关闭时把 WebSocket 关闭码原样带到对端——终端靠它区分「进程结束」「终端已不存在」「凭证失效」。
 *
 * 非升级的同前缀请求不走这里（由 ingress 中间件按普通 HTTP 回灌），子域形态的升级也暂不支持
 * （中间件直接回 501）。鉴权复用 `admitIngress`：入口是唯一门，这里不另开一套判定。
 */
import { defineWebSocketHandler, type WebSocketMessage, type WebSocketPeer } from "nitro/h3";

import { logger } from "#/shared-services/logger";

import { normalizeCloseCode, truncateCloseReason } from "../../../tunnel/close-code";
import { type TunnelConnection, tunnelRegistry } from "../../../tunnel/connections";
import type { StreamSink } from "../../../tunnel/dispatch";
import { admitIngress, isIngressDenial } from "../../../tunnel/ingress-auth";
import { buildIngressRequestHeaders, parseDevicePath } from "../../../tunnel/ingress-request";

/** 会话挂在 `peer.context` 上：连接结束随之释放，不需要额外的 map 与清理 */
const SESSION_KEY = "hubIngressSocket";

type IngressSocketSession = {
  connection: TunnelConnection;
  streamId: number;
  /** 收尾只做一次：关闭回调与 sink 回调都可能先到 */
  closed: boolean;
};

/** 升级时放进 context 的东西：open 时据此开流 */
type IngressUpgradeContext = {
  deviceId: string;
  connectionId: string;
  /** 剥掉前缀后的路径（含查询串——终端的握手票在 query 里） */
  path: string;
  headers: Record<string, string>;
};

const getSession = (peer: WebSocketPeer): IngressSocketSession | null =>
  (peer.context[SESSION_KEY] as IngressSocketSession | undefined) ?? null;

/** 关闭浏览器 WS：对端可能已经走了，关闭失败只记 debug */
const closePeer = (peer: WebSocketPeer, code: number, reason?: string): void => {
  try {
    peer.close(normalizeCloseCode(code), truncateCloseReason(reason));
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "ingress WS 关闭失败（连接可能已关闭）",
    );
  }
};

const rejection = (status: number, error: string, code?: string): Response =>
  new Response(JSON.stringify(code ? { error, code } : { error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default defineWebSocketHandler({
  /** 升级时鉴权：设备不属于调用方、设备离线都在这里挡下，WS 不建 */
  async upgrade(request) {
    const url = new URL(request.url);
    const match = parseDevicePath(url.pathname);
    if (!match) return rejection(404, "设备不存在或已被删除");

    const admission = await admitIngress(match.deviceId, request.headers);
    if (isIngressDenial(admission)) {
      return rejection(admission.status, admission.error, admission.code);
    }

    const context: IngressUpgradeContext = {
      deviceId: match.deviceId,
      connectionId: admission.connection.connectionId,
      path: `${match.rest}${url.search}`,
      headers: buildIngressRequestHeaders(request.headers, {
        deviceId: match.deviceId,
        userId: admission.userId,
        basePath: match.basePath,
      }),
    };
    return { context };
  },

  open(peer) {
    const ctx = peer.context as unknown as IngressUpgradeContext | undefined;
    if (!ctx?.connectionId) {
      logger.warn({ peerId: peer.id }, "ingress WS 缺少握手信息，直接关闭");
      closePeer(peer, 1011, "missing_handshake");
      return;
    }

    // 握手到升级之间隧道可能已经换了一条：连接标识对不上就按离线处理
    const connection = tunnelRegistry.get(ctx.deviceId);
    if (!connection || connection.connectionId !== ctx.connectionId) {
      closePeer(peer, 1011, "device_offline");
      return;
    }

    const sink: StreamSink = {
      /** 浏览器侧升级已经完成，设备侧的 101 只是「本机连接已建好」的确认 */
      onResponse(status) {
        if (status !== 101) closePeer(peer, 1011, "upgrade_failed");
      },
      onBody(chunk, text) {
        try {
          // 文本帧保持文本：终端的下行按原样交给浏览器，二进制/文本的区分不能丢
          peer.send(text ? new TextDecoder().decode(chunk) : chunk);
        } catch (error) {
          logger.debug(
            {
              deviceId: ctx.deviceId,
              error: error instanceof Error ? error.message : String(error),
            },
            "ingress WS 下行发送失败（浏览器可能已断开）",
          );
        }
      },
      onEnd() {
        closePeer(peer, 1000, "closed");
      },
      onError(failure) {
        closePeer(peer, 1011, failure.code);
      },
      onClose(code, reason) {
        closePeer(peer, code, reason);
      },
    };

    const streamId = connection.dispatcher.openStream(
      { method: "GET", path: ctx.path, headers: ctx.headers, hasBody: false, upgrade: true },
      sink,
    );
    if (streamId === null) {
      closePeer(peer, 1013, "tunnel_busy");
      return;
    }
    peer.context[SESSION_KEY] = {
      connection,
      streamId,
      closed: false,
    } satisfies IngressSocketSession;
    logger.debug({ deviceId: ctx.deviceId, streamId, path: ctx.path }, "ingress WS 已开流");
  },

  message(peer, message: WebSocketMessage) {
    const session = getSession(peer);
    if (!session || session.closed) return;
    // 浏览器发的是文本帧还是二进制帧要原样带到设备侧：终端的上行约定是文本帧
    const isText = typeof message.rawData === "string";
    void session.connection.dispatcher.sendRequestBody(
      session.streamId,
      message.uint8Array(),
      isText,
    );
  },

  close(peer, details) {
    const session = getSession(peer);
    if (!session || session.closed) return;
    session.closed = true;
    // 浏览器断开：让设备侧关掉本机 WebSocket，带上它的关闭码（1005/1006 归一成正常关闭）
    session.connection.dispatcher.closeStream(
      session.streamId,
      normalizeCloseCode(details.code),
      truncateCloseReason(details.reason),
    );
  },

  error(peer, error) {
    logger.warn(
      {
        session: getSession(peer) !== null,
        error: error instanceof Error ? error.message : String(error),
      },
      "ingress WS 出错，交由 close 收尾",
    );
  },
});
