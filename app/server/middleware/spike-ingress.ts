/**
 * 验证三的 Host 路由部分（ingress）：命中 `<device>.spike.local` 的请求在数据面直接回包，
 * 不进入 TanStack 的路由匹配。
 *
 * 生产形态是 `<deviceId>.<baseDomain>` 的子域路由，这里用固定后缀 `.spike.local` 复现同一件事；
 * 未开启验证（`HUB_SPIKE=1`）或 Host 不匹配时返回 undefined，请求照常交给后面的路由。
 */
import { defineEventHandler, getRequestHost } from "nitro/h3";

import { isSpikeEnabled, spikeState } from "../spike/shared";

/** 子域取出设备标识；生产按 `<deviceId>.<baseDomain>` 解析，同一条正则的位置 */
const DEVICE_HOST = /^([a-z0-9][a-z0-9-]*)\.spike\.local$/i;

export default defineEventHandler((event) => {
  if (!isSpikeEnabled()) return;

  const host = getRequestHost(event).split(":")[0] ?? "";
  const matched = DEVICE_HOST.exec(host);
  if (!matched) return;

  spikeState.ingressHits += 1;
  return {
    device: matched[1],
    host,
    path: event.url.pathname,
    via: "ingress",
    at: Date.now(),
  };
});
