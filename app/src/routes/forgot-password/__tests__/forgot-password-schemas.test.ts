/**
 * 客户端忘记密码 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { forgotPasswordSchema } from "#/routes/forgot-password/-mods/forgot-password.functions";

describe("forgotPasswordSchema（客户端忘记密码）", () => {
  it("合法输入校验通过", () => {
    expect(
      forgotPasswordSchema.safeParse({
        email: "u@t.com",
        captcha: "123456",
        password: "123456",
        confirmPassword: "123456",
      }).success,
    ).toBe(true);
  });

  it("两次密码不一致（refine）失败", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "u@t.com",
      captcha: "123456",
      password: "123456",
      confirmPassword: "654321",
    });
    expect(result.success).toBe(false);
  });

  it("邮箱格式错误失败", () => {
    expect(
      forgotPasswordSchema.safeParse({
        email: "bad",
        captcha: "123456",
        password: "123456",
        confirmPassword: "123456",
      }).success,
    ).toBe(false);
  });

  it("密码不足 6 位失败", () => {
    expect(
      forgotPasswordSchema.safeParse({
        email: "u@t.com",
        captcha: "123456",
        password: "12345",
        confirmPassword: "12345",
      }).success,
    ).toBe(false);
  });
});
