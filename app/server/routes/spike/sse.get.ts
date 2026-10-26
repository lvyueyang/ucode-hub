/**
 * 验证二与验证四：响应侧边生成边发（SSE），且客户端断开能被服务端观测到。
 *
 * 关键是**先返回流、再后台推帧**：如果在这里 `await` 完所有帧才返回，首帧就会等到最后一帧发完——
 * 这正是要验证的「有没有缓冲」。帧间隔由 `intervalMs` 给，脚本据此核对时序。
 */
import { defineEventHandler, EventStream, getQuery, setResponseHeader } from "nitro/h3";

import { assertSpike, spikeState } from "../../spike/shared";

/** 默认帧数与间隔：5 帧 × 200ms ≈ 1s，足够看出首帧是否被延迟 */
const DEFAULT_FRAMES = 5;
const DEFAULT_INTERVAL_MS = 200;

export default defineEventHandler((event) => {
  assertSpike();

  const query = getQuery(event) as { frames?: string; intervalMs?: string };
  const frames = Number(query.frames ?? DEFAULT_FRAMES);
  const intervalMs = Number(query.intervalMs ?? DEFAULT_INTERVAL_MS);

  // 明确告诉中间层别缓冲（含 nginx 的 proxy_buffering 与压缩）
  setResponseHeader(event, "cache-control", "no-cache");
  setResponseHeader(event, "x-accel-buffering", "no");

  const eventStream = new EventStream(event);
  spikeState.sseStarted += 1;
  eventStream.onClosed(() => {
    spikeState.sseClosed += 1;
  });

  // 后台推帧：处理函数立刻返回流，客户端能在第一帧发出时就收到
  void (async () => {
    try {
      for (let index = 1; index <= frames; index += 1) {
        await eventStream.push({ event: "tick", data: JSON.stringify({ index, at: Date.now() }) });
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      await eventStream.close();
    } catch {
      // 客户端断开时 push 会失败，收尾交给 onClosed 记录；这里不额外处理
    }
  })();

  return eventStream;
});
