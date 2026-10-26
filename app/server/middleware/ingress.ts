/**
 * ingress：按 Host 认设备，把公网请求经隧道回灌给 UCode（`<设备 id>.<HUB_BASE_DOMAIN>`）。
 *
 * **入口鉴权是唯一门**：经中继到达 UCode 的请求等同于本机 owner 身份，所以这里必须
 * 「已登录 + 设备属于该用户」都成立才放行（管理端账号可访问任意设备）。转发时剥掉调用方的
 * 凭证与逐跳头、注入来源头；UCode 侧的本地 `serviceToken` 由它自己的中继客户端补上，
 * **hub 不持有任何 UCode 凭证**。
 *
 * 请求体与响应体都逐块转发：请求体边收边送（每块等写队列，上传速率被隧道背压拉住），
 * 响应侧先等首帧响应拿到状态码与头再返回，之后逐帧写进响应流；公网侧断开就 abort 对应的流。
 * 长连接（事件流）不给请求超时，存活判定只依赖隧道心跳。
 *
 * `env.baseDomain` 为 null（未配 HUB_BASE_DOMAIN）时子域形态不生效；单域名下的路径形态
 * （`/d/<设备 id>`）不依赖父域，两者都命中不了才让请求落回 admin / 前台路由。
 */
import {
  chunkPayload,
  MAX_FRAME_PAYLOAD,
  MAX_HEADER_BYTES,
  TUNNEL_ERROR_CODES,
} from "@ucode/hub-protocol";
import { defineEventHandler, getRequestHost, type H3Event } from "nitro/h3";

import { env } from "#/env";
import { logger } from "#/shared-services/logger";

import type { TunnelConnection } from "../tunnel/connections";
import type { StreamDispatcher, StreamRequest } from "../tunnel/dispatch";
import { admitIngress, isIngressDenial } from "../tunnel/ingress-auth";
import { createIngressExchange } from "../tunnel/ingress-exchange";
import {
  buildIngressRequestHeaders,
  buildIngressResponseHeaders,
  isUpgradeRequest,
  MAX_INGRESS_PATH_LENGTH,
  parseDeviceHost,
  parseDevicePath,
} from "../tunnel/ingress-request";

/** 客户端断开后无人接收响应：499 只是留下可读的服务端记录（与 nginx 同口径） */
const CLIENT_CLOSED_STATUS = 499;

/** 失败响应统一 `{ error, code? }`：code 取协议错误码，调用方据此分流（见 docs/deployment-ops.md） */
const failure = (status: number, error: string, code?: string): Response =>
  new Response(JSON.stringify(code ? { error, code } : { error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 请求体逐块转发：每块等写队列（背压），流已收尾就不再继续读——不整包缓冲 */
const pumpRequestBody = async (
  body: ReadableStream<Uint8Array>,
  dispatcher: StreamDispatcher,
  streamId: number,
): Promise<void> => {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const chunk of chunkPayload(value, MAX_FRAME_PAYLOAD)) {
        const alive = await dispatcher.sendRequestBody(streamId, chunk);
        if (alive) continue;
        // 对端已回包或该流已收尾：不再接着读上传，让公网侧的上传失败得早一点
        await cancelReader(reader);
        return;
      }
    }
    dispatcher.endRequest(streamId);
  } catch (error) {
    logger.debug(
      { streamId, error: error instanceof Error ? error.message : String(error) },
      "请求体转发中断，取消该流",
    );
    dispatcher.abortStream(streamId, "请求体转发中断");
    await cancelReader(reader);
  }
};

/** 不再读上传时的收尾：取消读锁，让运行时把公网侧的上传流收掉（已出错或已结束就忽略） */
const cancelReader = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> => {
  try {
    await reader.cancel();
  } catch {
    // 流已经出错 / 已结束，没有可取消的东西
  }
};

type IngressContext = {
  event: H3Event;
  deviceId: string;
  userId: string;
  /** 页面挂载前缀（路径寻址才非空）：告诉 UCode 把 `<base href>` 指到哪里 */
  basePath: string | null;
  /** 剥掉前缀后要转发给 UCode 的路径（含查询串） */
  path: string;
  connection: TunnelConnection;
};

/**
 * 认设备：子域形态（配了父域时按 Host）优先，其次是单域名下的路径形态 `/d/<设备 id>`。
 * 两者都不匹配就返回 null，请求照常落 admin / 前台路由。
 */
const resolveIngressTarget = (
  event: H3Event,
): { deviceId: string; basePath: string | null; restPath: string | null } | null => {
  const baseDomain = env.baseDomain;
  if (baseDomain) {
    const deviceId = parseDeviceHost(getRequestHost(event), baseDomain);
    if (deviceId) return { deviceId, basePath: null, restPath: null };
  }

  const match = parseDevicePath(event.url.pathname);
  if (!match) return null;
  return { deviceId: match.deviceId, basePath: match.basePath, restPath: match.rest };
};

/** 转发一条请求：开流 → 送请求体 → 等首帧响应 → 把响应流交给公网侧 */
const forwardToTunnel = async (ctx: IngressContext): Promise<Response> => {
  const { event, deviceId, userId, basePath, path, connection } = ctx;
  const request = event.req;

  if (isUpgradeRequest(request.headers)) return failure(501, "经中继暂不支持 WebSocket 升级");

  if (path.length > MAX_INGRESS_PATH_LENGTH) return failure(414, "请求路径过长");

  const headers = buildIngressRequestHeaders(request.headers, { deviceId, userId, basePath });
  if (Buffer.byteLength(JSON.stringify(headers)) > MAX_HEADER_BYTES) {
    return failure(431, "请求头过大");
  }

  let streamId: number | null = null;
  const exchange = createIngressExchange({
    signal: request.signal,
    onAbort: (reason) => {
      if (streamId !== null) connection.dispatcher.abortStream(streamId, reason);
    },
  });

  const streamRequest: StreamRequest = {
    method: request.method,
    path,
    headers,
    hasBody: request.body !== null,
  };
  streamId = connection.dispatcher.openStream(streamRequest, exchange.sink);
  if (streamId === null) {
    exchange.discard();
    return failure(429, "设备繁忙，请稍后再试", TUNNEL_ERROR_CODES.tunnelBusy);
  }

  if (request.body) void pumpRequestBody(request.body, connection.dispatcher, streamId);

  const head = await exchange.waitHead();
  if (head.kind === "failure") {
    logger.debug({ deviceId, path, code: head.failure.code }, "隧道请求失败，回 502");
    return failure(502, "隧道请求失败", head.failure.code);
  }
  if (head.kind === "aborted") return new Response(null, { status: CLIENT_CLOSED_STATUS });
  if (head.status < 200) return failure(502, "隧道返回了不可用的状态码", "invalid_status");

  return new Response(exchange.stream, {
    status: head.status,
    // 反代侧别缓冲：事件流要逐帧到
    headers: { ...buildIngressResponseHeaders(head.headers), "x-accel-buffering": "no" },
  });
};

export default defineEventHandler(async (event) => {
  const target = resolveIngressTarget(event);
  if (!target) return;

  // WebSocket 升级：路径形态交给 `/d/<设备 id>/...` 的专用 route（这一层升不了级），
  // 子域形态暂不支持——带 Upgrade 的请求没有普通响应体可回，只能明确拒绝
  if (isUpgradeRequest(event.req.headers)) {
    if (target.basePath) return;
    return failure(501, "子域寻址暂不支持经中继的 WebSocket 升级");
  }

  // 路径寻址不带尾斜杠时，页面里的相对资源会以 `/d/` 为基准解析，先纠正到规范地址
  if (target.basePath && event.url.pathname === target.basePath) {
    return new Response(null, {
      status: 308,
      headers: { location: `${target.basePath}/${event.url.search}` },
    });
  }

  const { deviceId, basePath } = target;
  const path = (target.restPath ?? event.url.pathname) + event.url.search;

  const startedAt = Date.now();
  const admission = await admitIngress(deviceId, event.req.headers);
  if (isIngressDenial(admission)) {
    return failure(admission.status, admission.error, admission.code);
  }

  const response = await forwardToTunnel({
    event,
    deviceId,
    userId: admission.userId,
    basePath,
    path,
    connection: admission.connection,
  });
  logger.debug(
    {
      deviceId,
      userId: admission.userId,
      operatorType: admission.userType,
      method: event.req.method,
      path,
      status: response.status,
      ms: Date.now() - startedAt,
    },
    "ingress 请求",
  );
  return response;
});
