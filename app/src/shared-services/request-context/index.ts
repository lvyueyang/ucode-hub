/**
 * 请求级上下文容器：基于 AsyncLocalStorage 在 SFn 调用链中传递请求维度数据
 * 承载操作者身份与请求 ID（requestId），供审计日志与链路追踪使用
 * OperatorType 领域类型定义于 db/schema/operation-log（唯一来源），本模块 type-only 引用
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { OperatorType } from "#/db/schema/operation-log";

/** 请求级操作者身份 */
export interface RequestOperator {
  /** 用户 ID（system 类型时为 null） */
  id: string | null;
  /** 用户名（system 类型时为 null） */
  username: string | null;
  /** 邮箱（system 类型时为 null） */
  email: string | null;
  /** 操作者类型 */
  type: OperatorType;
}

/** 请求级上下文容器 */
export interface RequestContext {
  /** 操作者身份 */
  operator?: RequestOperator;
  /** 请求关联 ID（贯穿日志与审计表的链路标识） */
  requestId?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 在请求上下文中执行函数，供请求 ID 中间件与鉴权中间件包裹 next() 使用
 * 入参为部分上下文，与已有 store 浅合并后写入，避免后注册的中间件覆盖先写入的字段
 * 调用链中的所有异步操作均可通过 getRequestContext / getRequestOperator 读取
 */
export function runWithRequestContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  const current = requestContextStorage.getStore();
  return requestContextStorage.run({ ...current, ...ctx }, fn);
}

/**
 * 获取当前请求上下文（原始读取，无上下文时返回 undefined）
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * 获取当前请求的关联 ID（requestId），无上下文时返回 undefined
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * 获取当前请求的操作者身份（便捷访问器）
 * 无上下文（后台任务、cron 等非 SFn 链路）时兜底返回 system
 */
export function getRequestOperator(): RequestOperator {
  return (
    requestContextStorage.getStore()?.operator ?? {
      id: null,
      username: null,
      email: null,
      type: "system" as const,
    }
  );
}
