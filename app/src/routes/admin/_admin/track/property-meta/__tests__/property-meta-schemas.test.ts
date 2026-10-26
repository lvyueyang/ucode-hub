/**
 * 预设属性 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  propertyMetaCreateSchema,
  propertyMetaDeleteSchema,
  propertyMetaUpdateSchema,
} from "#/services/track/property-meta.schemas";

describe("propertyMetaCreateSchema", () => {
  it("有效参数应通过校验", () => {
    const result = propertyMetaCreateSchema.safeParse({
      key: "page_url",
      label: "页面地址",
    });
    expect(result.success).toBe(true);
  });

  it("传入 dataType 应通过校验", () => {
    const result = propertyMetaCreateSchema.safeParse({
      key: "page_url",
      label: "页面地址",
      dataType: "string",
    });
    expect(result.success).toBe(true);
  });

  it("缺少 key 应校验失败", () => {
    const result = propertyMetaCreateSchema.safeParse({
      label: "页面地址",
    });
    expect(result.success).toBe(false);
  });
});

describe("propertyMetaUpdateSchema", () => {
  it("仅更新 label 应通过校验", () => {
    const result = propertyMetaUpdateSchema.safeParse({
      key: "page_url",
      label: "页面URL",
    });
    expect(result.success).toBe(true);
  });

  it("缺少 key 应校验失败", () => {
    const result = propertyMetaUpdateSchema.safeParse({
      label: "页面URL",
    });
    expect(result.success).toBe(false);
  });
});

describe("propertyMetaDeleteSchema", () => {
  it("有效参数应通过校验", () => {
    const result = propertyMetaDeleteSchema.safeParse({ key: "page_url" });
    expect(result.success).toBe(true);
  });

  it("key 为空应校验失败", () => {
    const result = propertyMetaDeleteSchema.safeParse({ key: "" });
    expect(result.success).toBe(false);
  });
});
