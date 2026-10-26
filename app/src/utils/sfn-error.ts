/**
 * 客户端 SFn 统一错误处理：提示器注册中心（DI）+ 错误标记 + 调用 helper + 全局兜底
 * 本模块是前端工具（非 app 级 service），UI 无关：不 import 任何 UI 包，
 * 展示能力由管理端 / 前台入口经 registerSfnNotifier 注入
 */

import {
  CLIENT_ERROR_FALLBACK_MESSAGE,
  getErrorMessage,
  parseSfnErrorMeta,
} from "#/utils/error-utils";

/** 系统错误对用户的统一可读标题（具体技术细节收进可展开详情） */
const SYSTEM_ERROR_TITLE = "系统错误，请稍后重试";

/** 网络/传输失败文案（请求未到达服务端） */
const NETWORK_ERROR_MESSAGE = "网络异常，请检查网络后重试";

/** 错误缺失消息时的兜底文案 */
const FALLBACK_ERROR_MESSAGE = "操作失败，请稍后重试";

/** 相同标题去重窗口（毫秒）：避免并发失败刷屏 */
const DEDUPE_WINDOW = 2000;

/** 可展开的诊断详情（仅含非敏感信息） */
export interface SfnErrorDetails {
  /** 请求关联 ID，便于用户反馈时按请求号排查 */
  requestId?: string;
  /** SFn 可读方法名 */
  sfnName?: string;
  /** 原始错误消息（仅开发环境携带，生产环境不传输，避免泄露内部细节） */
  rawMessage?: string;
}

/** 面向用户的错误提示：正面为可读标题，详情可展开 */
export interface SfnErrorInfo {
  /** 面向用户的短消息（安全、可读） */
  title: string;
  /** 可展开诊断详情，无则不展示展开入口 */
  details?: SfnErrorDetails;
}

/** 错误提示器：当前端的错误出口（管理端注入 antd message.error，前台注入 sonner toast.error） */
export type SfnErrorNotifier = (info: SfnErrorInfo) => void;

/** SFn 错误元数据：由客户端 function 中间件写入，helper / 兜底读取 */
interface SfnErrorMeta {
  /** 触发错误的 SFn id（服务端未携带方法名时兜底诊断） */
  functionId?: string;
  /** 是否已被提示处理（防重复） */
  handled: boolean;
}

const sfnErrorMeta = new WeakMap<Error, SfnErrorMeta>();

let notifier: SfnErrorNotifier | null = null;

let lastErrorTitle = "";
let lastErrorAt = 0;

/** 注册当前端错误提示器，返回注销函数（供 useEffect cleanup） */
export function registerSfnNotifier(next: SfnErrorNotifier): () => void {
  notifier = next;
  return () => {
    if (notifier === next) notifier = null;
  };
}

/** 标记错误来自 SFn 调用（由客户端中间件调用，仅接受 Error 实例） */
export function markSfnError(error: unknown, functionId?: string): void {
  if (!(error instanceof Error)) return;
  const meta = sfnErrorMeta.get(error) ?? { handled: false };
  if (functionId) meta.functionId = functionId;
  sfnErrorMeta.set(error, meta);
}

/** 是否 SFn 错误（已被客户端中间件标记） */
export function isSfnError(value: unknown): value is Error {
  return value instanceof Error && sfnErrorMeta.has(value);
}

/** 读取触发错误的 SFn id（不透明，仅诊断兜底用） */
export function getSfnFunctionId(error: unknown): string | undefined {
  return error instanceof Error ? sfnErrorMeta.get(error)?.functionId : undefined;
}

/** 标记错误已被处理（helper 提示后立即标记，避免全局兜底重复提示） */
export function markErrorHandled(error: unknown): void {
  if (!(error instanceof Error)) return;
  const meta = sfnErrorMeta.get(error);
  if (meta) meta.handled = true;
  else sfnErrorMeta.set(error, { handled: true });
}

export function isErrorHandled(error: unknown): boolean {
  return error instanceof Error && (sfnErrorMeta.get(error)?.handled ?? false);
}

/** SFn 调用选项 */
export interface SfnCallOptions {
  /** 失败提示：覆盖统一的分类标题 */
  error?: string;
  /** 静默失败：不提示（仍标记已处理），保留 console.warn 诊断 */
  silent?: boolean;
}

/** 调用结果元组：[data, null] 成功 / [null, error] 失败 */
export type SfnResult<T> = readonly [T, null] | readonly [null, unknown];

/** 组装详情：仅收集存在且安全的字段（SFn 方法名仅开发环境展示，生产以请求号查日志定位） */
function buildDetails(requestId?: string, sfnName?: string): SfnErrorDetails | undefined {
  const details: SfnErrorDetails = {};
  if (requestId) details.requestId = requestId;
  if (sfnName && process.env.NODE_ENV !== "production") {
    details.sfnName = sfnName;
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * 生成面向用户的提示信息：
 * - 显式 error 覆盖标题（仍带出请求号 / SFn 详情）
 * - 传输失败（TypeError）→ 网络异常标题（无服务端元信息）
 * - 系统错误（服务端携带请求号 / 生产兜底文案）→ 统一「系统错误」标题，技术细节收进详情
 * - 业务 / 校验 / 鉴权 → 直接展示服务端归一化文案
 * @param error 原始错误
 * @param options 调用选项
 */
function toSfnErrorInfo(error: unknown, options?: SfnCallOptions): SfnErrorInfo {
  const raw = getErrorMessage(error, FALLBACK_ERROR_MESSAGE);
  const { message: stripped, kind, requestId, sfnName } = parseSfnErrorMeta(raw);

  if (options?.error) {
    return { title: options.error, details: buildDetails(requestId, sfnName) };
  }

  if (error instanceof TypeError) {
    return { title: NETWORK_ERROR_MESSAGE };
  }

  // 优先用服务端显式类型；缺失（如旧响应）时退回生产兜底文案判定
  const isSystemError =
    kind === "internal" || (!kind && stripped === CLIENT_ERROR_FALLBACK_MESSAGE);
  if (isSystemError) {
    const details = buildDetails(requestId, sfnName) ?? {};
    // 原始技术信息仅非生产环境透出，避免泄露内部细节
    if (process.env.NODE_ENV !== "production" && stripped !== CLIENT_ERROR_FALLBACK_MESSAGE) {
      details.rawMessage = stripped;
    }
    return {
      title: SYSTEM_ERROR_TITLE,
      details: Object.keys(details).length > 0 ? details : undefined,
    };
  }

  return { title: stripped, details: buildDetails(requestId, sfnName) };
}

/** 输出错误提示（未注册提示器时降级 console.error） */
export function notifySfnError(info: SfnErrorInfo): void {
  const now = Date.now();
  if (info.title === lastErrorTitle && now - lastErrorAt < DEDUPE_WINDOW) return;
  lastErrorTitle = info.title;
  lastErrorAt = now;

  if (!notifier) {
    console.error("[SFn]", info.title, info.details ?? "");
    return;
  }
  try {
    notifier(info);
  } catch (error) {
    // antd-static 未挂载等场景：降级 console，避免提示失败掩盖原始错误
    console.error("[SFn]", info.title, error);
  }
}

/** 诊断标识：优先可读方法名；生产环境不输出框架不透明 id（排查以请求号为准） */
function resolveDiagnosticSfn(error: unknown): string {
  const { sfnName } = parseSfnErrorMeta(getErrorMessage(error, FALLBACK_ERROR_MESSAGE));
  if (sfnName) return sfnName;
  return process.env.NODE_ENV === "production" ? "" : (getSfnFunctionId(error) ?? "");
}

/** 诊断消息：剥离元信息后缀，附请求号便于排查 */
function buildDiagnosticMessage(error: unknown): string {
  const { message, requestId } = parseSfnErrorMeta(getErrorMessage(error, FALLBACK_ERROR_MESSAGE));
  return requestId ? `${message}（请求号：${requestId}）` : message;
}

/** 诊断日志：网络错误 error 级，其余 warn 级，均带 SFn 与消息 */
function logSfnErrorDiagnostics(error: unknown): void {
  const sfn = resolveDiagnosticSfn(error);
  const detail = buildDiagnosticMessage(error);
  if (error instanceof TypeError) {
    console.error("[SFn]", sfn, "network", detail);
  } else {
    console.warn("[SFn]", sfn, detail);
  }
}

/** 统一失败处理：标记已处理；静默只留诊断日志，否则提示 */
function handleSfnError(error: unknown, options: SfnCallOptions): void {
  markErrorHandled(error);
  if (options.silent) {
    console.warn("[SFn] 已静默处理", resolveDiagnosticSfn(error), buildDiagnosticMessage(error));
    return;
  }
  logSfnErrorDiagnostics(error);
  notifySfnError(toSfnErrorInfo(error, options));
}

/** 调用 SFn：失败经统一提示后继续抛出，供需要中断流程的调用方使用 */
export async function callSfn<T>(
  promise: PromiseLike<T>,
  options: SfnCallOptions = {},
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    handleSfnError(error, options);
    throw error;
  }
}

/** 调用 SFn：失败经统一提示后返回元组，调用方无需 try/catch */
export async function sfnUnwrap<T>(
  promise: PromiseLike<T>,
  options: SfnCallOptions = {},
): Promise<SfnResult<T>> {
  try {
    return [await promise, null] as const;
  } catch (error) {
    handleSfnError(error, options);
    return [null, error] as const;
  }
}

/**
 * 安装全局兜底：捕获未被任何调用点处理的 SFn 错误并友好提示。
 * 仅处理被客户端中间件标记且未标记 handled 的错误；返回卸载函数。
 */
export function installSfnErrorFallback(): () => void {
  if (typeof window === "undefined") return () => {};

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    if (!isSfnError(reason) || isErrorHandled(reason)) return;
    markErrorHandled(reason);
    logSfnErrorDiagnostics(reason);
    notifySfnError(toSfnErrorInfo(reason));
  };

  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
