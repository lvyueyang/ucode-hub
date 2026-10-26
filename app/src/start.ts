/**
 * TanStack Start 入口配置：全局请求 ID 中间件 + locale + CSRF + SF 错误日志全局中间件
 */
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { localeMiddleware } from "#/middleware/locale-middleware";
import { requestIdMiddleware } from "#/middleware/request-id";
import { sfErrorLogger } from "#/middleware/sf-error-logger";
import { sfnClientErrorTagger } from "#/middleware/sfn-client-error";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestIdMiddleware, localeMiddleware, csrfMiddleware],
  // sfErrorLogger 服务端归一化错误；sfnClientErrorTagger 客户端标记 SFn 错误供全局兜底识别
  functionMiddleware: [sfErrorLogger, sfnClientErrorTagger],
}));
