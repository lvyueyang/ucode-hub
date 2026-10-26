/**
 * 请求 ID 中间件：为每个请求透传或生成关联 ID（requestId）
 * 写入 ALS 上下文并回写响应头 x-request-id，供日志与操作审计链路追踪
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { runWithRequestContext } from "#/shared-services/request-context";

/** 请求关联 ID 的请求/响应头名称 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * requestId 最大长度，与 operation_log.request_id 列长度（varchar(100)）保持一致
 * 上游透传的 x-request-id 为不可信输入，超长会导致审计表 BatchWriter 整批写入失败
 */
export const MAX_REQUEST_ID_LENGTH = 100;

/**
 * 上游 requestId 合法字符集：仅接受可见 ASCII（0x21-0x7E，不含空格）
 * x-request-id 为不可信输入：控制字符（CR/LF/NUL）或非 ASCII 值一旦原样透传，
 * 就会进入响应头、日志与 operation_log.request_id，构成头部注入面并污染链路标识
 */
const REQUEST_ID_PATTERN = /^[!-~]+$/;

/**
 * 解析本次请求生效的 requestId：上游值合法则截断后沿用，否则回退为新生成 UUID
 * 非法值（含控制字符 / 超长外不可信内容）不做事后清洗，直接整体丢弃——
 * 残留的可疑字符会被当作可信链路 ID 写入日志与审计表
 *
 * UUID 取 Web Crypto 全局实现而非 `node:crypto`：本模块经 start.ts 同时进入客户端模块图，
 * 一旦此处出现对 node 内置模块的可见引用，浏览器侧会因 Vite 外部化而报错并使整个客户端崩白屏
 * @param raw 上游 x-request-id 原始值，不可信输入
 */
export function resolveRequestId(raw: string | undefined): string {
  if (!raw || !REQUEST_ID_PATTERN.test(raw)) return crypto.randomUUID();
  return raw.slice(0, MAX_REQUEST_ID_LENGTH);
}

/**
 * 全局请求 ID 中间件：优先透传上游 x-request-id（支持跨服务追踪），否则生成 UUID
 * 透传值经 resolveRequestId 做长度截断与字符校验
 * 注册在 start.ts requestMiddleware 首位，确保下游鉴权中间件合并上下文时保留 requestId
 */
export const requestIdMiddleware = createMiddleware().server(async ({ next }) => {
  const requestId = resolveRequestId(getRequestHeader(REQUEST_ID_HEADER));
  setResponseHeader(REQUEST_ID_HEADER, requestId);
  return runWithRequestContext({ requestId }, () => next());
});
