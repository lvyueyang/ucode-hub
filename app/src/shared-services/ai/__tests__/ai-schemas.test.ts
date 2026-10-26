/**
 * AI 厂商配置 Schema 验证测试：SFn validator 的拒绝路径
 */
import { describe, expect, it } from "vitest";
import { aiProviderConfigSchema, saveAiProvidersSchema } from "#/shared-services/ai/ai.schemas";
import { fetchProviderModelsInputSchema } from "#/shared-services/ai/ai-providers.functions";

const validProvider = {
  name: "OpenAI 兼容",
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  models: { "gpt-4o": { name: "GPT-4o", reasoning: false } },
};

describe("aiProviderConfigSchema", () => {
  it("完整配置通过", () => {
    expect(aiProviderConfigSchema.safeParse(validProvider).success).toBe(true);
  });

  it("缺少 apiKey 失败", () => {
    const { apiKey: _apiKey, ...rest } = validProvider;
    expect(aiProviderConfigSchema.safeParse(rest).success).toBe(false);
  });

  it("空 baseUrl 失败", () => {
    expect(aiProviderConfigSchema.safeParse({ ...validProvider, baseUrl: "" }).success).toBe(false);
  });

  it("非法模态枚举失败", () => {
    expect(
      aiProviderConfigSchema.safeParse({
        ...validProvider,
        models: { m: { input: ["audio"] } },
      }).success,
    ).toBe(false);
  });
});

describe("saveAiProvidersSchema", () => {
  it("以厂商 id 为键的对象通过", () => {
    expect(saveAiProvidersSchema.safeParse({ providers: { openai: validProvider } }).success).toBe(
      true,
    );
  });

  it("缺少 providers 失败", () => {
    expect(saveAiProvidersSchema.safeParse({}).success).toBe(false);
  });

  it("厂商 id 为空字符串失败", () => {
    expect(saveAiProvidersSchema.safeParse({ providers: { "": validProvider } }).success).toBe(
      false,
    );
  });
});

describe("fetchProviderModelsInputSchema", () => {
  it("完整入参通过", () => {
    expect(
      fetchProviderModelsInputSchema.safeParse({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
      }).success,
    ).toBe(true);
  });

  it("缺少 apiKey 失败", () => {
    expect(
      fetchProviderModelsInputSchema.safeParse({
        baseUrl: "https://api.example.com/v1",
      }).success,
    ).toBe(false);
  });

  it("空 baseUrl 失败", () => {
    expect(
      fetchProviderModelsInputSchema.safeParse({
        baseUrl: "",
        apiKey: "sk-test",
      }).success,
    ).toBe(false);
  });
});
