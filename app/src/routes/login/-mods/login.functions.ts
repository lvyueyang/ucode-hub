/**
 * 客户端登录 Server Functions
 */
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { clientLogin } from "#/services/client-auth/client-auth.server";
import { isCookieSecure } from "#/utils/cookie-secure";

export const loginSchema = z.object({
  username: z.string().min(1, "用户名不能为空").max(50),
  password: z.string().min(1, "密码不能为空").max(100),
});

export const clientLoginSFn = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data: { username, password } }) => {
    const result = await clientLogin(username, password);
    if (result.success && result.token) {
      setCookie(COOKIE_NAMES.CLIENT_TOKEN, result.token, {
        httpOnly: true,
        secure: isCookieSecure(),
        sameSite: "lax",
        path: "/",
        // 与 JWT 24 小时有效期对齐；提前失效靠令牌版本自增（改密 / 被重置 / 登出）
        maxAge: 24 * 3600,
      });
    }
    return result;
  });
