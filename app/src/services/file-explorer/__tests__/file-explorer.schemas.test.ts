/**
 * 资源管理器 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { renameSchema, subPathAndNameSchema, subPathSchema } from "../file-explorer.schemas";

describe("subPathSchema", () => {
  it("空参数默认 subPath 为空字符串", () => {
    const result = subPathSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subPath).toBe("");
    }
  });

  it("显式传入 subPath 通过校验", () => {
    expect(subPathSchema.safeParse({ subPath: "uploads/2024" }).success).toBe(true);
  });

  it("subPath 非字符串校验失败", () => {
    expect(subPathSchema.safeParse({ subPath: 123 }).success).toBe(false);
  });
});

describe("subPathAndNameSchema", () => {
  it("合法参数通过校验", () => {
    expect(subPathAndNameSchema.safeParse({ subPath: "uploads", name: "新建目录" }).success).toBe(
      true,
    );
  });

  it("缺少 name 校验失败", () => {
    expect(subPathAndNameSchema.safeParse({}).success).toBe(false);
  });

  it("name 为空校验失败", () => {
    expect(subPathAndNameSchema.safeParse({ subPath: "", name: "" }).success).toBe(false);
  });
});

describe("renameSchema", () => {
  it("合法参数通过校验", () => {
    expect(renameSchema.safeParse({ subPath: "old.txt", newName: "new.txt" }).success).toBe(true);
  });

  it("缺少 subPath 校验失败", () => {
    expect(renameSchema.safeParse({ newName: "new.txt" }).success).toBe(false);
  });

  it("newName 为空校验失败", () => {
    expect(renameSchema.safeParse({ subPath: "a.txt", newName: "" }).success).toBe(false);
  });
});
