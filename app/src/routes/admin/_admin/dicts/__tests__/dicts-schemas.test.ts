/**
 * 字典 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  createDictSchema,
  createItemSchema,
  dictImportSchema,
  dictListSchema,
  idSchema,
  updateDictSchema,
  updateItemSchema,
} from "#/shared-services/dict/dict.schemas";

describe("dictListSchema", () => {
  it("含分页 / 排序参数的查询通过", () => {
    expect(
      dictListSchema.safeParse({
        dictSlug: "d-1",
        page: 1,
        pageSize: 50,
        sortField: "sortOrder",
        sortOrder: "ascend",
      }).success,
    ).toBe(true);
  });

  it("空 slug 失败", () => {
    expect(dictListSchema.safeParse({ dictSlug: "" }).success).toBe(false);
  });
});

describe("idSchema", () => {
  it("有效 id 通过", () => {
    expect(idSchema.safeParse({ id: "d-1" }).success).toBe(true);
  });

  it("空 id 失败", () => {
    expect(idSchema.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("createDictSchema", () => {
  it("合法输入通过", () => {
    const result = createDictSchema.safeParse({
      name: "测试字典",
      slug: "test_dict",
    });
    expect(result.success).toBe(true);
  });

  it("空 name 失败", () => {
    expect(createDictSchema.safeParse({ name: "", slug: "s" }).success).toBe(false);
  });
});

describe("updateDictSchema", () => {
  it("全字段更新通过", () => {
    expect(
      updateDictSchema.safeParse({
        id: "d-1",
        name: "新名称",
        slug: "new_slug",
        description: "新描述",
      }).success,
    ).toBe(true);
  });

  it("仅更新 description 通过", () => {
    expect(updateDictSchema.safeParse({ id: "d-1", description: "新描述" }).success).toBe(true);
  });

  it("缺少 id 失败", () => {
    expect(updateDictSchema.safeParse({ name: "x" }).success).toBe(false);
  });
});

describe("createItemSchema", () => {
  it("最小字段创建通过，sortOrder 默认为 0", () => {
    const result = createItemSchema.safeParse({
      dictSlug: "d-1",
      label: "标签",
      value: "val",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sortOrder).toBe(0);
  });

  it("空 label 失败", () => {
    expect(
      createItemSchema.safeParse({
        dictSlug: "d-1",
        label: "",
        value: "val",
      }).success,
    ).toBe(false);
  });

  it("缺少 dictSlug 失败", () => {
    expect(
      createItemSchema.safeParse({
        label: "标签",
        value: "val",
      }).success,
    ).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("部分字段更新通过", () => {
    expect(
      updateItemSchema.safeParse({
        id: "di-1",
        label: "新标签",
        sortOrder: 10,
      }).success,
    ).toBe(true);
  });

  it("缺少 id 失败", () => {
    expect(updateItemSchema.safeParse({ label: "x" }).success).toBe(false);
  });
});

describe("dictImportSchema", () => {
  it("合法树形结构通过", () => {
    expect(
      dictImportSchema.safeParse({
        dicts: [
          {
            name: "分类1",
            slug: "cat1",
            children: [
              { label: "标签A", value: "a" },
              { label: "标签B", value: "b" },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("空 dicts 数组通过", () => {
    expect(dictImportSchema.safeParse({ dicts: [] }).success).toBe(true);
  });

  it("缺少 name 失败", () => {
    expect(
      dictImportSchema.safeParse({
        dicts: [{ slug: "cat1" }],
      }).success,
    ).toBe(false);
  });
});
