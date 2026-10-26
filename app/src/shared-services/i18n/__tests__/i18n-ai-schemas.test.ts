/**
 * 国际化 AI 翻译 Schema 验证测试：SFn validator 的拒绝路径
 */
import { describe, expect, it } from "vitest";
import {
  aiBatchTranslateModeSchema,
  aiBatchTranslateSchema,
  aiTranslateFieldSchema,
} from "#/shared-services/i18n/i18n.ai.schemas";

const validBatchInput = {
  entityType: "news",
  mode: "fill",
  fields: [{ name: "title", valueType: "text" }],
  records: [
    {
      id: "3f0a3f7e-6b1e-4b3c-8b1e-2f2f3a4b5c6d",
      values: { title: "标题" },
    },
  ],
  writeBack: false,
};

describe("aiTranslateFieldSchema", () => {
  const base = {
    sourceText: "标题",
    sourceLocale: "zh",
    targetLocale: "en",
  };

  it("完整入参通过", () => {
    expect(aiTranslateFieldSchema.safeParse(base).success).toBe(true);
  });

  it("空源文本失败", () => {
    expect(aiTranslateFieldSchema.safeParse({ ...base, sourceText: "" }).success).toBe(false);
  });

  it("不支持的目标语言失败", () => {
    expect(aiTranslateFieldSchema.safeParse({ ...base, targetLocale: "ja" }).success).toBe(false);
  });
});

describe("aiBatchTranslateModeSchema", () => {
  it("接受 fill / correct", () => {
    expect(aiBatchTranslateModeSchema.safeParse("fill").success).toBe(true);
    expect(aiBatchTranslateModeSchema.safeParse("correct").success).toBe(true);
  });

  it("拒绝未知模式", () => {
    expect(aiBatchTranslateModeSchema.safeParse("reset").success).toBe(false);
  });
});

describe("aiBatchTranslateSchema", () => {
  it("最小入参通过", () => {
    expect(aiBatchTranslateSchema.safeParse(validBatchInput).success).toBe(true);
  });

  it("record id 非 uuid 失败", () => {
    expect(
      aiBatchTranslateSchema.safeParse({
        ...validBatchInput,
        records: [{ id: "n-1", values: { title: "标题" } }],
      }).success,
    ).toBe(false);
  });

  it("fields 为空数组失败", () => {
    expect(aiBatchTranslateSchema.safeParse({ ...validBatchInput, fields: [] }).success).toBe(
      false,
    );
  });

  it("batchSize 超出上限失败", () => {
    expect(
      aiBatchTranslateSchema.safeParse({
        ...validBatchInput,
        batchSize: 101,
      }).success,
    ).toBe(false);
  });

  it("targetLocales 为空数组失败", () => {
    expect(
      aiBatchTranslateSchema.safeParse({
        ...validBatchInput,
        targetLocales: [],
      }).success,
    ).toBe(false);
  });

  it("缺少 writeBack 失败", () => {
    const { writeBack: _writeBack, ...rest } = validBatchInput;
    expect(aiBatchTranslateSchema.safeParse(rest).success).toBe(false);
  });
});
