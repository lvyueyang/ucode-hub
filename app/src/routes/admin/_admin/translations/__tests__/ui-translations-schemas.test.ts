/**
 * UI 翻译 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  deleteSchema,
  formSchema,
  uiTranslationListSchema,
} from "#/shared-services/i18n/i18n.ui.schemas";
import { importUITranslationsSchema } from "../-mods/ui-translations.functions";

describe("uiTranslationListSchema", () => {
  it("空参数应通过校验", () => {
    const result = uiTranslationListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("传入 locale 筛选应通过校验", () => {
    const result = uiTranslationListSchema.safeParse({ locale: "zh" });
    expect(result.success).toBe(true);
  });

  it("分页 / 每页条数 / 排序参数应通过校验", () => {
    const result = uiTranslationListSchema.safeParse({
      keyword: "首页",
      page: 2,
      pageSize: 50,
      sortField: "key",
      sortOrder: "ascend",
    });
    expect(result.success).toBe(true);
  });
});

describe("formSchema", () => {
  it("无 id 创建应通过校验", () => {
    const result = formSchema.safeParse({
      locale: "zh",
      key: "common.save",
      value: "保存",
    });
    expect(result.success).toBe(true);
  });

  it("带 id 编辑应通过校验", () => {
    const result = formSchema.safeParse({
      id: "uuid-1",
      locale: "zh",
      key: "common.save",
      value: "保存",
    });
    expect(result.success).toBe(true);
  });

  it("非法 locale 应校验失败", () => {
    const result = formSchema.safeParse({
      locale: "invalid-locale",
      key: "common.save",
      value: "保存",
    });
    expect(result.success).toBe(false);
  });

  it("key 为空应校验失败", () => {
    const result = formSchema.safeParse({
      locale: "zh",
      key: "",
      value: "保存",
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

describe("importUITranslationsSchema", () => {
  const base = {
    data: {
      translations: [{ locale: "en", key: "home.title", value: "Home" }],
    },
  };

  it("合法导入数据应通过校验", () => {
    expect(importUITranslationsSchema.safeParse(base).success).toBe(true);
  });

  it("缺少 data 字段应校验失败", () => {
    expect(importUITranslationsSchema.safeParse({}).success).toBe(false);
  });

  it("空 translations 数组应通过校验", () => {
    expect(importUITranslationsSchema.safeParse({ data: { translations: [] } }).success).toBe(true);
  });

  it("value 为空应校验失败", () => {
    expect(
      importUITranslationsSchema.safeParse({
        data: { translations: [{ locale: "en", key: "k", value: "" }] },
      }).success,
    ).toBe(false);
  });
});
