/**
 * Server Function 全局错误日志中间件
 * 注册在 start.ts 的 functionMiddleware 中，自动覆盖所有 SF
 * 鉴权失败记 warn（审计需要），系统异常记 error
 * 同时把分类 / 请求号元信息附加到抛给客户端的错误上，供客户端统一错误提示使用
 */

import { createMiddleware } from "@tanstack/react-start";
import { env } from "#/env";
import { AdminAuthError } from "#/middleware/admin-auth";
import { ClientAuthError } from "#/middleware/client-auth";
import { logger } from "#/shared-services/logger";
import {
  serverFunctionDurationSeconds,
  serverFunctionRequestsTotal,
} from "#/shared-services/metrics";
import { getRequestId } from "#/shared-services/request-context";
import {
  appendSfnErrorMeta,
  classifyError,
  sanitizeError,
  toClientError,
} from "#/utils/error-utils";

export const sfErrorLogger = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    const startTime = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - startTime;
      serverFunctionDurationSeconds.observe(duration / 1000);
      serverFunctionRequestsTotal.inc({ result: "success" });

      // 开发环境记录成功请求耗时，生产环境静默
      if (env.nodeEnv === "development") {
        logger.debug(
          {
            duration: `${duration}ms`,
            sfn: serverFnMeta.name,
            file: serverFnMeta.filename,
          },
          "SF 执行完成",
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      serverFunctionDurationSeconds.observe(duration / 1000);
      serverFunctionRequestsTotal.inc({ result: "error" });

      // 与日志字段复用，避免下方重复读取
      const sfnMeta = {
        sfn: serverFnMeta.name,
        file: serverFnMeta.filename,
      };
      const isAuthError = error instanceof AdminAuthError || error instanceof ClientAuthError;

      if (isAuthError) {
        // 鉴权失败：warn 级别（预期行为，但需审计记录）
        logger.warn(
          {
            duration: `${duration}ms`,
            statusCode: error.statusCode,
            ...sfnMeta,
            message: error.message,
          },
          "鉴权失败",
        );
      } else {
        // 系统错误：error 级别，脱敏后记录
        logger.error(
          {
            duration: `${duration}ms`,
            ...sfnMeta,
            ...sanitizeError(error, env.nodeEnv === "development"),
          },
          "Server Function 执行异常",
        );
      }

      // 归一化后抛出：保证客户端 err.message 始终为业务文案/校验文案/兜底文案
      const isProd = env.isProduction;
      const clientError = toClientError(error, isProd);
      // 追加人类可读元信息后缀：类型 + 请求号 + SFn 方法名（均对人类可读，客户端剥离后收进
      // 可展开详情；类型用于客户端识别系统错误）
      // SFn 方法名仅开发环境传输，生产环境以请求号查服务端日志定位
      // （框架 ShallowErrorPlugin 仅序列化 Error 的 message，自定义属性无法过界）
      if (clientError instanceof Error) {
        clientError.message = appendSfnErrorMeta(clientError.message, {
          kind: isAuthError ? "auth" : classifyError(error),
          requestId: getRequestId(),
          sfnName: isProd ? undefined : serverFnMeta.name,
        });
      }
      throw clientError;
    }
  },
);
