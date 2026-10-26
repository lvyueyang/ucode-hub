/**
 * 客户端 SSE 流消费工具：读取经 Server Function（x-tss-raw）透传的原始流式 Response，
 * 解析「data: {json}\n\n」格式事件并逐事件回调。用于 AI 批量翻译流式端点。
 */

import type { BatchTranslateSseEvent } from "#/shared-services/i18n/i18n.ai.types";

/**
 * 读取并消费一个流式 `Response`（来自 SFn 流式返回，TanStack Start 已置 x-tss-raw）。
 * 非 2xx 或无 body 时抛错；解析出每个合法 SSE 事件即回调，回调抛错或读流异常时中断并向服务端取消流。
 * @param onEvent 每收到一个合法 SSE 事件即回调（逐事件处理，异常向上抛出中断消费）
 */
export async function readSSEStream(
  response: Response,
  onEvent: (event: BatchTranslateSseEvent) => void | Promise<void>,
): Promise<void> {
  if (!response.ok || !response.body) {
    throw new Error(`请求失败(${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  /** 派发单个 SSE 事件块：无 data 行或非法 JSON 忽略；回调异常原样向上抛出（中断消费） */
  const dispatch = async (chunk: string): Promise<void> => {
    const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) return;
    let event: BatchTranslateSseEvent;
    try {
      event = JSON.parse(dataLine.slice(6)) as BatchTranslateSseEvent;
    } catch {
      // 非法事件忽略：解析失败不应中断整条流
      return;
    }
    // 解析与回调分开 try：回调自身抛出的 SyntaxError 不能被当作「非法事件」吞掉
    await onEvent(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf("\n\n");
      while (idx >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (chunk.trim()) await dispatch(chunk);
        idx = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) await dispatch(buffer);
  } catch (err) {
    // 提前中断（回调抛错 / 读流失败）：取消底层流，避免服务端继续产出
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }
}
