/**
 * 上游响应流的逐块回传：由下游读取驱动（`pull`），下游不读就不读上游，任何阶段都不整块缓冲。
 *
 * 每块随手过一遍 SSE usage 探针（`include_usage` 的 usage 只在末尾帧，探针必须贯穿整段流），
 * 块内容原样 `enqueue`：不改帧、不重编码，`reasoning_content` 这类厂商自有字段与 `[DONE]` 都保持原形。
 * 客户端断开时 `cancel` 会把上游读流一起取消，上游不会空跑。
 */

import type { UsageTokens } from "#/services/usage/usage.server";

import { EMPTY_TOKENS, readUsage } from "./protocol";

/** 单条 SSE 行的长度上限：正常帧是小 JSON，超过它说明对端发的不是 SSE，丢弃而非回积 */
const MAX_LINE_CHARS = 64 * 1024;

/** usage 探针：写入分块、流结束时收尾，随时可读当前捕获到的 usage */
export type UsageProbe = {
  push(chunk: Uint8Array): void;
  flush(): void;
  tokens(): UsageTokens;
};

/**
 * 创建 SSE usage 探针。
 * 用流式 TextDecoder 解码并对齐到整行：一次分块可能只收到半行（甚至半个多字节字符），
 * 未收尾的半行留在 `tail` 里等下一块，因此既不误判也不丢帧。
 */
export const createSseUsageProbe = (): UsageProbe => {
  const decoder = new TextDecoder();
  let tail = "";
  let tokens: UsageTokens | null = null;

  const consumeLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // 半行（下一块才补齐）或非 JSON 帧：忽略，不影响回传
      return;
    }
    const found = readUsage(parsed);
    // 只认最后一次：usage 在末尾帧，中途即便出现也不是最终账
    if (found) tokens = found;
  };

  return {
    push(chunk) {
      const lines = (tail + decoder.decode(chunk, { stream: true })).split("\n");
      tail = lines.pop() ?? "";
      if (tail.length > MAX_LINE_CHARS) tail = "";
      for (const line of lines) consumeLine(line);
    },
    flush() {
      if (!tail) return;
      consumeLine(tail);
      tail = "";
    },
    tokens: () => tokens ?? EMPTY_TOKENS,
  };
};

/** 流收尾结局：正常结束 / 上游出错 / 客户端取消 */
export type CompletionStreamResult = {
  status: "done" | "error" | "cancelled";
  durationMs: number;
  errorMessage?: string;
};

/** 把上游响应体逐块回传给客户端，并在收尾时报告结局（三种结局各报一次） */
export const pipeCompletionStream = (opts: {
  body: ReadableStream<Uint8Array>;
  probe: UsageProbe;
  /** 每块回传时的钩子（debug 日志与空闲超时计时用） */
  onChunk?: (byteLength: number) => void;
  onSettled: (result: CompletionStreamResult) => void;
}): ReadableStream<Uint8Array> => {
  const reader = opts.body.getReader();
  const startedAt = Date.now();
  let settled = false;

  const settle = (result: CompletionStreamResult): void => {
    if (settled) return;
    settled = true;
    opts.onSettled(result);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          opts.probe.flush();
          controller.close();
          settle({ status: "done", durationMs: Date.now() - startedAt });
          return;
        }
        controller.enqueue(value);
        opts.onChunk?.(value.byteLength);
        opts.probe.push(value);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        settle({ status: "error", durationMs: Date.now() - startedAt, errorMessage: message });
        // 响应头早已发出，中途断流只能让客户端看到流结束；补一个假收尾帧会骗过客户端的完整性判断
        controller.error(error instanceof Error ? error : new Error(message));
      }
    },
    async cancel(reason) {
      settle({
        status: "cancelled",
        durationMs: Date.now() - startedAt,
        errorMessage: "客户端断开，响应流被取消",
      });
      try {
        await reader.cancel(reason);
      } catch {
        // 上游可能已结束 / 已出错，取消失败无需处理
      }
    },
  });
};
