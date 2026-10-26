/**
 * 验证用的观测读数：ingress / SSE / WS 的计数与当前进程内存。
 * 脚本靠它确认「客户端断开后服务端确实收到了取消」，而不只是客户端自己以为断了。
 */
import { defineEventHandler } from "nitro/h3";

import { assertSpike, spikeState } from "../../spike/shared";

export default defineEventHandler(() => {
  assertSpike();

  const memory = process.memoryUsage();
  return {
    ...spikeState,
    memory: { rss: memory.rss, heapUsed: memory.heapUsed },
    pid: process.pid,
    uptimeMs: Math.round(process.uptime() * 1000),
  };
});
