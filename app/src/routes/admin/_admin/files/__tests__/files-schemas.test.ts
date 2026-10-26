/**
 * 文件管理 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  FILE_TAG_MAX_LENGTH,
  fileIdSchema,
  fileListSchema,
  normalizeFileTags,
  updateFileTagsSchema,
} from "#/services/file/file.schemas";

describe("fileIdSchema", () => {
  it("有效 id 通过", () => {
    expect(fileIdSchema.safeParse({ id: "f-1" }).success).toBe(true);
  });

  it("空 id 失败", () => {
    expect(fileIdSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("缺少 id 失败", () => {
    expect(fileIdSchema.safeParse({}).success).toBe(false);
  });
});

describe("fileListSchema", () => {
  it("空参数通过", () => {
    expect(fileListSchema.safeParse({}).success).toBe(true);
  });

  it("带 status 参数通过", () => {
    expect(fileListSchema.safeParse({ status: "temp" }).success).toBe(true);
  });

  it("带 mimePrefix 参数通过", () => {
    expect(fileListSchema.safeParse({ mimePrefix: "image/" }).success).toBe(true);
  });

  it("带标签搜索参数与分页参数通过", () => {
    const result = fileListSchema.safeParse({
      tag: "产品",
      keyword: "a1b2",
      page: 2,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("sortOrder 非法值失败", () => {
    expect(fileListSchema.safeParse({ sortOrder: "invalid" }).success).toBe(false);
  });
});

describe("normalizeFileTags", () => {
  it("去首尾空白并丢弃空项", () => {
    expect(normalizeFileTags(["  产品 ", "", "  ", "案例"])).toEqual(["产品", "案例"]);
  });

  it("去重且保留首次出现顺序", () => {
    expect(normalizeFileTags(["b", "a", "b", "a"])).toEqual(["b", "a"]);
  });

  it("单个标签超长时截断", () => {
    const long = "x".repeat(FILE_TAG_MAX_LENGTH + 20);
    expect(normalizeFileTags([long])[0]).toHaveLength(FILE_TAG_MAX_LENGTH);
  });
});

describe("updateFileTagsSchema", () => {
  it("归一化后再落库", () => {
    const result = updateFileTagsSchema.safeParse({
      id: "f-1",
      tags: [" 产品 ", "产品", "案例"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["产品", "案例"]);
    }
  });

  it("空数组通过（表示清空标签）", () => {
    expect(updateFileTagsSchema.safeParse({ id: "f-1", tags: [] }).success).toBe(true);
  });

  it("超过数量上限失败", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    expect(updateFileTagsSchema.safeParse({ id: "f-1", tags }).success).toBe(false);
  });
});
