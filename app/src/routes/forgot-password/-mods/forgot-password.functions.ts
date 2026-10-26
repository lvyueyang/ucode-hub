/**
 * 客户端忘记密码 Server Functions
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resetClientPasswordByEmail } from "#/services/client-user/client-user.server";

export const forgotPasswordSchema = z
  .object({
    email: z.string().email("邮箱格式不正确"),
    captcha: z.string().length(6, "验证码为 6 位"),
    password: z.string().min(6, "密码至少 6 位").max(100),
    confirmPassword: z.string().min(1, "请确认密码"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export const resetPwdSFn = createServerFn({ method: "POST" })
  .validator(forgotPasswordSchema)
  .handler(async ({ data: { email, captcha, password } }) => {
    return resetClientPasswordByEmail(email, captcha, password);
  });
