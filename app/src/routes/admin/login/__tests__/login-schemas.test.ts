/**
 * 管理员登录 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { loginSchema } from "#/routes/admin/login/-mods/login.functions";

describe("loginSchema（管理员登录）", () => {
  it("合法输入校验通过", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "pw" }).success).toBe(true);
  });

  it("空用户名失败", () => {
    expect(loginSchema.safeParse({ username: "", password: "pw" }).success).toBe(false);
  });

  it("空密码失败", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "" }).success).toBe(false);
  });

  it("超长用户名（51 字符）失败", () => {
    expect(loginSchema.safeParse({ username: "a".repeat(51), password: "pw" }).success).toBe(false);
  });
});
