/**
 * 验证一：请求体能否边收边转（不被整包读进内存）。
 *
 * 逐块读 h3 给的请求体流，记录**首块延迟**与读取期间的 RSS：若框架先把整包读完才交给处理函数，
 * 首块延迟会等于整个上传耗时、RSS 也会一次性涨到与体积同量级。返回统计供脚本判定。
 */
import { defineEventHandler, getBodyStream } from "nitro/h3";

import { assertSpike } from "../../spike/shared";

export default defineEventHandler(async (event) => {
  assertSpike();

  const startedAt = Date.now();
  const rssBefore = process.memoryUsage().rss;

  let bytes = 0;
  let chunks = 0;
  let maxChunk = 0;
  let firstChunkMs = -1;
  let rssAtFirstChunk = 0;

  const reader = getBodyStream(event)?.getReader();
  if (!reader) throw new Error("请求没有正文");

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstChunkMs < 0) {
      firstChunkMs = Date.now() - startedAt;
      rssAtFirstChunk = process.memoryUsage().rss;
    }
    bytes += value.byteLength;
    chunks += 1;
    maxChunk = Math.max(maxChunk, value.byteLength);
  }

  return {
    bytes,
    chunks,
    maxChunk,
    firstChunkMs,
    rssBefore,
    rssAtFirstChunk,
    rssAfter: process.memoryUsage().rss,
    ms: Date.now() - startedAt,
  };
});
