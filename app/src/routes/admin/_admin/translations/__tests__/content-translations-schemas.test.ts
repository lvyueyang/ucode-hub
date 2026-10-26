/**
 * 实体翻译 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  contentTranslationListSchema,
  deleteSchema,
  fieldTranslationQuerySchema,
  formSchema,
} from "#/shared-services/i18n/i18n.content.schemas";
import { importContentTranslationsSchema } from "../-mods/content-translations.functions";

describe("contentTranslationListSchema", () => {
  it("空参数应通过校验", () => {
    const result = contentTranslationListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("所有参数同时传入应通过校验", () => {
    const result = contentTranslationListSchema.safeParse({
      entityType: "news",
      locale: "zh",
      keyword: "标题",
      page: 1,
      pageSize: 20,
      sortField: "createdAt",
      sortOrder: "ascend",
    });
    expect(result.success).toBe(true);
  });
});

describe("formSchema", () => {
  it("有效参数应通过校验", () => {
    const result = formSchema.safeParse({
      entityType: "news",
      entityId: "news-1",
      fieldName: "title",
      locale: "zh",
      value: "新闻标题",
    });
    expect(result.success).toBe(true);
  });

  it("缺少 entityType 应校验失败", () => {
    const result = formSchema.safeParse({
      entityId: "news-1",
      fieldName: "title",
      locale: "zh",
      value: "新闻标题",
    });
    expect(result.success).toBe(false);
  });

  it("缺少 entityId 应校验失败", () => {
    const result = formSchema.safeParse({
      entityType: "news",
      fieldName: "title",
      locale: "zh",
      value: "新闻标题",
    });
    expect(result.success).toBe(false);
  });

  it("非法 locale 应校验失败", () => {
    const result = formSchema.safeParse({
      entityType: "news",
      entityId: "news-1",
      fieldName: "title",
      locale: "invalid-locale",
      value: "新闻标题",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteSchema", () => {
  it("有效参数应通过校验", () => {
    const result = deleteSchema.safeParse({ id: "uuid-1" });
    expect(result.success).toBe(true);
  });
});

describe("fieldTranslationQuerySchema", () => {
  const base = {
    entityType: "news",
    entityId: "news-1",
    fieldName: "title",
  };

  it("完整参数通过", () => {
    expect(fieldTranslationQuerySchema.safeParse(base).success).toBe(true);
  });

  it("缺少 fieldName 应校验失败", () => {
    const { fieldName: _fieldName, ...rest } = base;
    expect(fieldTranslationQuerySchema.safeParse(rest).success).toBe(false);
  });

  it("空 entityId 应校验失败", () => {
    expect(fieldTranslationQuerySchema.safeParse({ ...base, entityId: "" }).success).toBe(false);
  });
});

describe("importContentTranslationsSchema", () => {
  const base = {
    data: {
      translations: [
        {
          entityType: "news",
          entityId: "n-1",
          fieldName: "title",
          locale: "en",
          value: "Hello",
        },
      ],
    },
  };

  it("合法导入数据应通过校验", () => {
    expect(importContentTranslationsSchema.safeParse(base).success).toBe(true);
  });

  it("缺少 entityId 应校验失败", () => {
    expect(
      importContentTranslationsSchema.safeParse({
        data: {
          translations: [
            {
              entityType: "news",
              entityId: "",
              fieldName: "title",
              locale: "en",
              value: "Hello",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("缺少 data 字段应校验失败", () => {
    expect(importContentTranslationsSchema.safeParse({}).success).toBe(false);
  });
});
