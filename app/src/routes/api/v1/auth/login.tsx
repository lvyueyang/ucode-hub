/** 外部客户端登录 hub：用户名 + 密码换取 Bearer 令牌 */
import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { decodeJwt } from "jose";
import type { ZodError } from "zod";
import { adminLogin } from "#/services/admin-auth/admin-auth.server";
import { clientLogin } from "#/services/client-auth/client-auth.server";
import { deviceLoginSchema } from "#/services/device/device.schemas";
import { isRateLimited, LOGIN_RATE_LIMIT } from "#/services/rate-limit/rate-limit";
import { logger } from "#/shared-services/logger";
import type { UserType } from "#/types/user";

/** 登录失败与限流的响应文案（对外接口不用封套，失败只给 `{ error }`） */
const UNAUTHORIZED_MESSAGE = "未认证或凭证无效";
const RATE_LIMITED_MESSAGE = "操作过于频繁，请稍后再试";

const jsonError = (error: string, status: number): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** 校验失败回 400：zod 默认文案是英文，只挑出出错字段，不往外吐英文 */
const invalidParamMessage = (error: ZodError): string => {
  const field = error.issues[0]?.path.join(".");
  return field ? `参数 ${field} 不合法` : "请求参数不合法";
};

/** 令牌过期时间：有效期由 jwt 模块决定，这里读令牌自身的 exp，不在路由里重复声明时长 */
const tokenExpiresAt = (token: string): string => {
  const { exp } = decodeJwt(token);
  if (!exp) throw new Error("签发的令牌缺少过期时间");
  return new Date(exp * 1000).toISOString();
};

/**
 * 依次认管理端与客户端账号：两表同名时以管理端为准（顺序固定，不要颠倒）。
 * 密码校验复用各自的登录逻辑（含 bcrypt 比对与最近登录时间落库），这里不另写比对。
 */
const loginAsAnyAccount = async (
  username: string,
  password: string,
): Promise<{ token: string; id: string; username: string; type: UserType } | null> => {
  const admin = await adminLogin(username, password);
  if (admin.success && admin.token && admin.user) {
    return { token: admin.token, id: admin.user.id, username: admin.user.username, type: "admin" };
  }

  const client = await clientLogin(username, password);
  if (client.success && client.token && client.user) {
    return {
      token: client.token,
      id: client.user.id,
      username: client.user.username,
      type: "client",
    };
  }

  return null;
};

export const Route = createFileRoute("/api/v1/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => undefined);
        const parsed = deviceLoginSchema.safeParse(body);
        if (!parsed.success) return jsonError(invalidParamMessage(parsed.error), 400);

        const { username, password } = parsed.data;
        const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";

        // IP 与用户名各限一份：同一 IP 撞库、同一账号被反复试密码都会各自撞到阈值
        const limitedByIp = isRateLimited(`login:ip:${ip}`, LOGIN_RATE_LIMIT);
        const limitedByUser = isRateLimited(`login:user:${username}`, LOGIN_RATE_LIMIT);
        if (limitedByIp || limitedByUser) {
          logger.warn({ ip, username }, "外部客户端登录请求被限流");
          return jsonError(RATE_LIMITED_MESSAGE, 429);
        }

        const account = await loginAsAnyAccount(username, password);
        if (!account) {
          logger.debug({ ip, username }, "外部客户端登录失败");
          return jsonError(UNAUTHORIZED_MESSAGE, 401);
        }

        return Response.json({
          token: account.token,
          expiresAt: tokenExpiresAt(account.token),
          user: { id: account.id, username: account.username, type: account.type },
        });
      },
    },
  },
});
