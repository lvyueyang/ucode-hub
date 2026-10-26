/**
 * 系统初始化 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { initSchema } from "#/routes/admin/init/-mods/init.functions";

describe("initSchema（系统初始化）", () => {
  it("合法基础输入校验通过（含默认 siteName）", () => {
    const result = initSchema.safeParse({
      username: "admin",
      password: "123456",
      confirmPassword: "123456",
      email: "admin@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.siteName).toBe("HUB");
    }
  });

  it("两次密码不一致失败", () => {
    const result = initSchema.safeParse({
      username: "admin",
      password: "123456",
      confirmPassword: "654321",
      email: "admin@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("邮箱格式错误失败", () => {
    expect(
      initSchema.safeParse({
        username: "admin",
        password: "123456",
        confirmPassword: "123456",
        email: "invalid",
      }).success,
    ).toBe(false);
  });

  it("密码不足 6 位失败", () => {
    expect(
      initSchema.safeParse({
        username: "admin",
        password: "12345",
        confirmPassword: "12345",
        email: "admin@example.com",
      }).success,
    ).toBe(false);
  });

  it("包含 AI 配置字段合法通过", () => {
    const result = initSchema.safeParse({
      username: "admin",
      password: "123456",
      confirmPassword: "123456",
      email: "admin@example.com",
      aiBaseUrl: "https://api.openai.com/v1",
      aiApiKey: "sk-xxx",
      aiModel: "gpt-4o",
    });
    expect(result.success).toBe(true);
  });

  it("AI 配置字段均为可选", () => {
    const result = initSchema.safeParse({
      username: "admin",
      password: "123456",
      confirmPassword: "123456",
      email: "admin@example.com",
    });
    expect(result.success).toBe(true);
  });
});
