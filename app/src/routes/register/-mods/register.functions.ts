/**
 * 客户端注册 Server Functions
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { clientRegister } from "#/services/client-auth/client-auth.server";

export const registerSchema = z.object({
  username: z.string().min(1, "用户名不能为空").max(50),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位").max(100),
  captcha: z.string().length(6, "验证码为 6 位"),
});

export const clientRegisterSFn = createServerFn({ method: "POST" })
  .validator(registerSchema)
  .handler(async ({ data: { username, email, password, captcha } }) => {
    return clientRegister(username, email, password, captcha);
  });
