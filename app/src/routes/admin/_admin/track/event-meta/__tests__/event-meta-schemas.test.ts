/**
 * 预设事件 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  eventMetaCreateSchema,
  eventMetaDeleteSchema,
  eventMetaUpdateSchema,
} from "#/services/track/event-meta.schemas";

describe("eventMetaCreateSchema", () => {
  it("有效参数应通过校验", () => {
    const result = eventMetaCreateSchema.safeParse({
      name: "PageView",
      label: "页面浏览",
      category: "交互",
    });
    expect(result.success).toBe(true);
  });

  it("缺少 label 应校验失败", () => {
    const result = eventMetaCreateSchema.safeParse({
      name: "PageView",
      category: "交互",
    });
    expect(result.success).toBe(false);
  });

  it("缺少 category 应校验失败", () => {
    const result = eventMetaCreateSchema.safeParse({
      name: "PageView",
      label: "页面浏览",
    });
    expect(result.success).toBe(false);
  });

  it("name 超过 100 个字符应校验失败", () => {
    const result = eventMetaCreateSchema.safeParse({
      name: "a".repeat(101),
      label: "页面浏览",
      category: "交互",
    });
    expect(result.success).toBe(false);
  });
});

describe("eventMetaUpdateSchema", () => {
  it("仅更新 label 应通过校验", () => {
    const result = eventMetaUpdateSchema.safeParse({
      name: "PageView",
      label: "页面访问",
    });
    expect(result.success).toBe(true);
  });

  it("缺少 name 应校验失败", () => {
    const result = eventMetaUpdateSchema.safeParse({
      label: "页面访问",
    });
    expect(result.success).toBe(false);
  });
});

describe("eventMetaDeleteSchema", () => {
  it("有效参数应通过校验", () => {
    const result = eventMetaDeleteSchema.safeParse({ name: "PageView" });
    expect(result.success).toBe(true);
  });

  it("name 为空应校验失败", () => {
    const result = eventMetaDeleteSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
