/**
 * 客户端鉴权中间件：登录校验 + 权限控制
 * 统一为 request middleware，同时支持 Server Function 和 Server Route
 */

import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { type ClientPermissionDef, hasClientPermission } from "#/permissions/client-permissions";
import { runWithRequestContext } from "#/shared-services/request-context";

/** 通过中间件注入 handler 的客户端用户上下文 */
export interface ClientAuthContext {
  userId: string;
  username: string;
  email: string;
  rolePermissions: string[];
}

/** 客户端鉴权错误 */
export class ClientAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ClientAuthError";
  }
}

/**
 * 客户端登录校验中间件：读取客户端 Cookie，调用 resolveClientAuthContext 校验身份
 * 适用场景：需要认证但不校验权限码的接口（如用户操作自己的消息）
 */
export const clientAuthGuard = createMiddleware().server(async ({ next }) => {
  const token = getCookie(COOKIE_NAMES.CLIENT_TOKEN);
  const { resolveClientAuthContext } = await import("#/middleware/client-auth.server");
  const ctx = await resolveClientAuthContext(token);
  return runWithRequestContext(
    {
      operator: {
        id: ctx.userId,
        username: ctx.username,
        email: ctx.email,
        type: "client",
      },
    },
    () => next({ context: ctx }),
  );
});

/**
 * 解析客户端鉴权上下文（登录校验 + 权限校验）
 * 失败抛 ClientAuthError；中间件与 Server Route 守卫共用，保证两侧鉴权口径一致
 */
async function resolveClientPermContext(required: ClientPermissionDef): Promise<ClientAuthContext> {
  const token = getCookie(COOKIE_NAMES.CLIENT_TOKEN);
  const { resolveClientAuthContext } = await import("#/middleware/client-auth.server");
  const ctx = await resolveClientAuthContext(token);
  if (!hasClientPermission(ctx.rolePermissions, required)) {
    throw new ClientAuthError("权限不足", 403);
  }
  return ctx;
}

/** 在客户端用户身份上下文中执行后续链路，供审计与日志注入操作人 */
function runWithClientOperator<T>(ctx: ClientAuthContext, run: () => T): T {
  return runWithRequestContext(
    {
      operator: {
        id: ctx.userId,
        username: ctx.username,
        email: ctx.email,
        type: "client",
      },
    },
    run,
  );
}

/**
 * 客户端权限校验中间件工厂
 * Server Function 和 Server Route 通用；鉴权失败向上抛 ClientAuthError
 */
export function clientPermGuard(required: ClientPermissionDef) {
  return createMiddleware().server(async ({ next }) => {
    const ctx = await resolveClientPermContext(required);
    return runWithClientOperator(ctx, () => next({ context: ctx }));
  });
}

/**
 * Server Route 专用客户端权限守卫
 * 捕获 ClientAuthError 转为对应 HTTP 状态码 JSON，避免中间件抛错被框架统一转 500
 *
 * 注意：鉴权必须与 try/catch 处于同一 middleware，不可写成 `.middleware([guard]).server(...)`——
 * 中间件执行顺序为「依赖在前、自身在后」，组合写法下 guard 位于外层，其抛出的错误进不了内层 catch
 *
 * 当前尚无消费方（客户端受保护 Server Route 未落地），行为正确性靠与 adminPermRouteGuard 的实现对齐；
 * 出现首个消费方时按 `e2e/specs/server-route-auth.spec.ts` 补一条状态码用例
 */
export function clientPermRouteGuard(required: ClientPermissionDef) {
  return createMiddleware().server(async ({ next }) => {
    try {
      const ctx = await resolveClientPermContext(required);
      return await runWithClientOperator(ctx, () => next({ context: ctx }));
    } catch (err) {
      if (err instanceof ClientAuthError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.statusCode,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  });
}
