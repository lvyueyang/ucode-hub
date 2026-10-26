/**
 * 管理员登录 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { adminLogin } from "#/services/admin-auth/admin-auth.server";
import { isCookieSecure } from "#/utils/cookie-secure";

export const loginSchema = z.object({
  username: z.string().min(1, "用户名不能为空").max(50),
  password: z.string().min(1, "密码不能为空").max(100),
});

export const adminLoginSFn = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data: { username, password } }) => {
    const result = await adminLogin(username, password);
    if (result.success && result.token) {
      setCookie(COOKIE_NAMES.ADMIN_TOKEN, result.token, {
        httpOnly: true,
        secure: isCookieSecure(),
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 3600,
      });
    }
    return result;
  });
