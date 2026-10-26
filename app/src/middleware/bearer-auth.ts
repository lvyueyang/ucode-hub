/**
 * 外部客户端的 Bearer 令牌鉴权。
 *
 * 令牌是本机登录（`routes/api/v1/auth/login`）签发的 JWT，与浏览器 Cookie 走同一套签发与校验；
 * 差别只在凭证来源是 `Authorization` 头。用户定位复用管理端 / 客户端各自的鉴权查询（内部带缓存，
 * 且已覆盖软删除与禁用态），不在这里直查用户表。
 *
 * 服务端专属依赖（jwt、两个鉴权查询模块）一律在函数内动态引入：本文件进客户端模块图，
 * 静态引入 `*.server.ts` 会被 import-protection 拦下（同 `admin-auth` / `client-auth`）。
 */
import { createMiddleware } from "@tanstack/react-start";
import { logger } from "#/shared-services/logger";
import { runWithRequestContext } from "#/shared-services/request-context";
import type { UserRef } from "#/types/user";

/** 通过中间件注入 handler 的鉴权上下文 */
export type BearerAuthContext = {
  /** 令牌对应的用户（多态引用，服务层据此限定归属） */
  user: UserRef;
  /** 用户名（审计落库与日志用，取自用户表而非令牌载荷） */
  username: string;
  /** 邮箱（日志用，取自用户表） */
  email: string | null;
};

/**
 * 令牌不可用的统一文案：缺失、格式错、签名错、用户已删除或禁用都回这一句，
 * 不区分「没带令牌」与「令牌无效」，不给探测者额外信息
 */
const UNAUTHORIZED_MESSAGE = "未认证或凭证无效";

/** Bearer 鉴权失败（对外一律 401） */
export class BearerAuthError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "BearerAuthError";
  }
}

/**
 * 从 Authorization 头里取出 Bearer 令牌（纯解析，不校验签名）
 * 缺失、方案不是 Bearer、只有方案没令牌、令牌后还有多余段，都返回 null
 */
export const parseBearerToken = (header: string | null | undefined): string | null => {
  if (!header) return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) return null;
  return token;
};

/** 校验令牌并定位用户：任一环节不成立都抛 BearerAuthError，未预料异常（如查库失败）原样抛出 */
async function authenticateBearer(request: Request): Promise<BearerAuthContext> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) throw new BearerAuthError(UNAUTHORIZED_MESSAGE);

  const [{ jwt }, { getAdminUserForAuth }, { getClientUserForAuth }] = await Promise.all([
    import("#/shared-services/jwt"),
    import("#/services/admin-auth/admin-auth.server"),
    import("#/services/client-auth/client-auth.server"),
  ]);

  const payload = await jwt.verifyToken(token);
  if (!payload) throw new BearerAuthError(UNAUTHORIZED_MESSAGE);

  const found =
    payload.userType === "admin"
      ? await getAdminUserForAuth(payload.userId)
      : await getClientUserForAuth(payload.userId);
  if (!found.success) throw new BearerAuthError(UNAUTHORIZED_MESSAGE);

  return {
    user: { type: payload.userType, id: found.id },
    username: found.username,
    email: found.email,
  };
}

/**
 * Server Route 专用鉴权守卫：校验通过则把用户注入上下文与请求上下文后继续，否则回 401 JSON。
 *
 * 鉴权必须与 try/catch 处于同一 middleware（理由见 `adminPermRouteGuard`）：守卫自身抛错会被
 * 框架统一转成 500，客户端拿不到 401。
 */
export const bearerAuthRouteGuard = createMiddleware().server(async ({ request, next }) => {
  try {
    const auth = await authenticateBearer(request);
    return await runWithRequestContext(
      {
        operator: {
          id: auth.user.id,
          username: auth.username,
          email: auth.email,
          type: auth.user.type,
        },
      },
      () => next({ context: auth }),
    );
  } catch (err) {
    if (err instanceof BearerAuthError) {
      logger.debug(
        { pathname: new URL(request.url).pathname, reason: err.message },
        "Bearer 鉴权失败",
      );
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }
});

/**
 * 解析请求里的 Bearer 用户，供不带守卫的 handler 自行取用（如一个 handler 内先看令牌再决定分支）
 * 无令牌、令牌无效、用户不可用都返回 null；查库失败等未预料异常照抛
 */
export const resolveBearerUser = async (request: Request): Promise<UserRef | null> => {
  try {
    return (await authenticateBearer(request)).user;
  } catch (err) {
    if (err instanceof BearerAuthError) return null;
    throw err;
  }
};
