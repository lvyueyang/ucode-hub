/**
 * 客户端 SFn 错误标记中间件：为所有客户端 SFn 调用失败打标，
 * 供全局 unhandledrejection 兜底精确识别来源（此处不提示，避免 loader / 静默场景误报）
 */

import { createMiddleware } from "@tanstack/react-start";
import { markSfnError } from "#/utils/sfn-error";

export const sfnClientErrorTagger = createMiddleware({
  type: "function",
}).client(async ({ next, serverFnMeta }) => {
  try {
    return await next();
  } catch (error) {
    markSfnError(error, serverFnMeta?.id);
    throw error;
  }
});
