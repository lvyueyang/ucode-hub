/**
 * 系统配置 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  configImportSchema,
  createConfigSchema,
  deleteConfigSchema,
  updateConfigSchema,
} from "#/shared-services/config/config.schemas";

describe("createConfigSchema", () => {
  it("合法输入通过", () => {
    expect(createConfigSchema.safeParse({ key: "site_name", value: "MyCMS" }).success).toBe(true);
  });

  it("空 value 失败", () => {
    expect(createConfigSchema.safeParse({ key: "k", value: "" }).success).toBe(false);
  });

  it("可选字段 clientVisible / valueType / groupName 通过", () => {
    expect(
      createConfigSchema.safeParse({
        key: "site_name",
        value: "MyCMS",
        clientVisible: true,
        valueType: "text",
        groupName: "basic",
      }).success,
    ).toBe(true);
  });
});

describe("updateConfigSchema", () => {
  it("合法更新通过", () => {
    expect(
      updateConfigSchema.safeParse({
        id: "c-1",
        value: "new value",
        description: "desc",
      }).success,
    ).toBe(true);
  });

  it("仅更新 description 通过", () => {
    expect(
      updateConfigSchema.safeParse({
        id: "c-1",
        description: "desc",
      }).success,
    ).toBe(true);
  });

  it("缺少 id 失败", () => {
    expect(updateConfigSchema.safeParse({ value: "v" }).success).toBe(false);
  });

  it("可选字段 clientVisible / valueType / groupName 通过", () => {
    expect(
      updateConfigSchema.safeParse({
        id: "c-1",
        clientVisible: false,
        valueType: "richtext",
        groupName: "email",
      }).success,
    ).toBe(true);
  });
});

describe("deleteConfigSchema", () => {
  it("合法输入通过", () => {
    expect(deleteConfigSchema.safeParse({ id: "c-1" }).success).toBe(true);
  });

  it("空 id 失败", () => {
    expect(deleteConfigSchema.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("configImportSchema", () => {
  it("合法数组通过", () => {
    expect(
      configImportSchema.safeParse({
        configs: [
          { key: "k1", value: "v1" },
          { key: "k2", value: "v2" },
        ],
      }).success,
    ).toBe(true);
  });

  it("空数组通过", () => {
    expect(configImportSchema.safeParse({ configs: [] }).success).toBe(true);
  });

  it("缺少 key 失败", () => {
    expect(
      configImportSchema.safeParse({
        configs: [{ value: "v1" }],
      }).success,
    ).toBe(false);
  });
});
