/**
 * 系统初始化 buildInitData 纯函数测试
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { initSchema } from "../-mods/init.functions";
import { buildInitData } from "../-mods/init.functions";

type InitInput = z.infer<typeof initSchema>;

describe("buildInitData", () => {
  const baseInput: InitInput = {
    username: "admin",
    password: "123456",
    email: "admin@test.com",
    confirmPassword: "123456",
    siteName: "HUB",
  };

  it("最小输入（仅有 admin + siteName 默认值）", () => {
    const result = buildInitData(baseInput);

    expect(result.admin).toEqual({
      username: "admin",
      password: "123456",
      email: "admin@test.com",
    });
    expect(result.siteName).toBe("HUB");
    expect(result.smtp).toBeUndefined();
    expect(result.ai).toBeUndefined();
    expect(result.sms).toBeUndefined();
  });

  it("siteName 使用传入值", () => {
    const result = buildInitData({ ...baseInput, siteName: "MySite" });

    expect(result.siteName).toBe("MySite");
  });

  it("提供 SMTP 配置时 smtp 不为 undefined", () => {
    const result = buildInitData({
      ...baseInput,
      smtpHost: "smtp.test.com",
      smtpPort: 587,
      smtpUser: "user",
      smtpPass: "pass",
      smtpFrom: "from@test.com",
    });

    expect(result.smtp).toBeDefined();
    expect(result.smtp!.host).toBe("smtp.test.com");
    expect(result.smtp!.port).toBe(587);
    expect(result.smtp!.user).toBe("user");
    expect(result.smtp!.pass).toBe("pass");
    expect(result.smtp!.from).toBe("from@test.com");
  });

  it("SMTP 部分字段为 undefined", () => {
    const result = buildInitData({
      ...baseInput,
      smtpHost: "smtp.test.com",
    });

    expect(result.smtp).toBeDefined();
    expect(result.smtp!.host).toBe("smtp.test.com");
    expect(result.smtp!.port).toBeUndefined();
    expect(result.smtp!.user).toBeUndefined();
  });

  it("SMTP 全部字段为 undefined", () => {
    const result = buildInitData(baseInput);

    expect(result.smtp).toBeUndefined();
  });

  it("提供 AI 配置时 ai 不为 undefined", () => {
    const result = buildInitData({
      ...baseInput,
      aiBaseUrl: "https://api.test.com",
      aiApiKey: "sk-test",
      aiModel: "deepseek-chat",
    });

    expect(result.ai).toBeDefined();
    expect(result.ai!.baseUrl).toBe("https://api.test.com");
    expect(result.ai!.apiKey).toBe("sk-test");
    expect(result.ai!.model).toBe("deepseek-chat");
  });

  it("AI 全部字段为 undefined", () => {
    const result = buildInitData(baseInput);

    expect(result.ai).toBeUndefined();
  });

  it("提供 SMS 配置时 sms 不为 undefined", () => {
    const result = buildInitData({
      ...baseInput,
      smsProvider: "aliyun",
      smsAccessKeyId: "key-id",
      smsAccessKeySecret: "key-secret",
      smsSignName: "sign",
      smsTemplateCode: "code",
    });

    expect(result.sms).toBeDefined();
    expect(result.sms!.provider).toBe("aliyun");
  });

  it("SMS 全部字段为 undefined", () => {
    const result = buildInitData(baseInput);

    expect(result.sms).toBeUndefined();
  });

  it("同时提供所有配置块", () => {
    const result = buildInitData({
      ...baseInput,
      siteName: "AllConfigSite",
      smtpHost: "smtp.test.com",
      aiBaseUrl: "https://api.test.com",
      smsProvider: "aliyun",
    });

    expect(result.siteName).toBe("AllConfigSite");
    expect(result.smtp).toBeDefined();
    expect(result.ai).toBeDefined();
    expect(result.sms).toBeDefined();
  });
});
