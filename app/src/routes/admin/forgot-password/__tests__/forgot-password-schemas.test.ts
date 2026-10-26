/**
 * 管理员忘记密码 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { resetPwdSchema } from "#/routes/admin/forgot-password/-mods/forgot-password.functions";

describe("resetPwdSchema（管理员忘记密码）", () => {
  it("合法输入校验通过", () => {
    expect(
      resetPwdSchema.safeParse({
        email: "admin@t.com",
        captcha: "123456",
        password: "123456",
        confirmPassword: "123456",
      }).success,
    ).toBe(true);
  });

  it("两次密码不一致（refine）失败", () => {
    const result = resetPwdSchema.safeParse({
      email: "admin@t.com",
      captcha: "123456",
      password: "123456",
      confirmPassword: "654321",
    });
    expect(result.success).toBe(false);
  });

  it("邮箱格式错误失败", () => {
    expect(
      resetPwdSchema.safeParse({
        email: "bad",
        captcha: "123456",
        password: "123456",
        confirmPassword: "123456",
      }).success,
    ).toBe(false);
  });

  it("密码不足 6 位失败", () => {
    expect(
      resetPwdSchema.safeParse({
        email: "admin@t.com",
        captcha: "123456",
        password: "12345",
        confirmPassword: "12345",
      }).success,
    ).toBe(false);
  });
});
