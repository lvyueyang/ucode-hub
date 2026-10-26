/**
 * 验证三的 WebSocket 部分：同一个端口上 WS 升级与 HTTP 路由共存。
 *
 * 只做回声：证明升级被 Nitro 接住、帧能双向流动、关闭能被观测。真正的隧道协议在阶段 4 才写。
 */
import { defineWebSocketHandler } from "nitro/h3";

import { isSpikeEnabled, spikeState } from "../../spike/shared";

export default defineWebSocketHandler({
  upgrade() {
    // 未开启验证时拒绝升级（返回 Response 即拒绝握手）
    if (!isSpikeEnabled()) return new Response("验证路由未开启", { status: 404 });
    return undefined;
  },
  open(peer) {
    spikeState.wsOpened += 1;
    peer.send(JSON.stringify({ type: "welcome", at: Date.now() }));
  },
  message(peer, message) {
    peer.send(message.text());
  },
  close() {
    spikeState.wsClosed += 1;
  },
});
