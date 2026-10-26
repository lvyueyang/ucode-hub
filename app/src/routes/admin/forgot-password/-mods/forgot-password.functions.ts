/**
 * 管理员忘记密码 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resetAdminPasswordByEmail } from "#/services/admin-user/admin-user.server";

export const resetPwdSchema = z
  .object({
    email: z.string().email("请输入有效的邮箱地址"),
    captcha: z.string().length(6, "验证码为 6 位数字"),
    password: z.string().min(6, "密码至少 6 位").max(100),
    confirmPassword: z.string().min(1, "请确认密码"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export const resetPwdSFn = createServerFn({ method: "POST" })
  .validator(resetPwdSchema)
  .handler(async ({ data: { email, captcha, password } }) => {
    return resetAdminPasswordByEmail(email, captcha, password);
  });
