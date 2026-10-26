/**
 * 架构验证（阶段 2）共用的状态与开关。
 *
 * 这一批路由 / 中间件只服务于「单进程能否承载隧道与 ingress」的验证：开关走 `HUB_SPIKE=1`，
 * 未开启时一律 404，不让验证代码在生产环境对外暴露；验证通过后由真正的数据面替换。
 * 状态挂 `globalThis`：dev 与生产产物里这些模块可能落在不同 bundle 中，需要一处共享。
 */
import { createError } from "nitro/h3";

export type SpikeState = {
  /** 命中 Host 路由（ingress）的次数 */
  ingressHits: number;
  /** 建立过的 SSE 流数量 */
  sseStarted: number;
  /** 客户端断开或流自然结束被观测到的次数 */
  sseClosed: number;
  /** 建立过 / 已关闭的 WS 连接数 */
  wsOpened: number;
  wsClosed: number;
};

const SPIKE_STATE_KEY = "__hubSpikeState";

const globalWithState = globalThis as typeof globalThis & {
  [SPIKE_STATE_KEY]?: SpikeState;
};

const existingState = globalWithState[SPIKE_STATE_KEY];
const state: SpikeState = existingState ?? {
  ingressHits: 0,
  sseStarted: 0,
  sseClosed: 0,
  wsOpened: 0,
  wsClosed: 0,
};
globalWithState[SPIKE_STATE_KEY] = state;

export const spikeState: SpikeState = state;

export const isSpikeEnabled = (): boolean => process.env.HUB_SPIKE === "1";

/** 未开启验证时统一 404，避免验证路由被当成正式接口 */
export const assertSpike = (): void => {
  if (isSpikeEnabled()) return;
  throw createError({ statusCode: 404, statusMessage: "验证路由未开启（需 HUB_SPIKE=1）" });
};
