/**
 * 客户端角色 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  clientRoleCreateSchema,
  clientRoleListSchema,
  clientRoleUpdateSchema,
  idSchema,
} from "../client-role.schemas";

describe("clientRoleListSchema", () => {
  it("空参数通过校验", () => {
    expect(clientRoleListSchema.safeParse({}).success).toBe(true);
  });

  it("带 keyword 通过校验", () => {
    expect(clientRoleListSchema.safeParse({ keyword: "运营" }).success).toBe(true);
  });

  it("分页参数全链路透传通过校验", () => {
    const result = clientRoleListSchema.safeParse({
      page: 2,
      pageSize: 50,
      sortField: "name",
      sortOrder: "ascend",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(50);
    }
  });
});

describe("clientRoleCreateSchema", () => {
  const base = { name: "运营", slug: "operator" };

  it("合法参数通过校验且权限默认为空数组", () => {
    const result = clientRoleCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual([]);
    }
  });

  it("带权限列表通过校验", () => {
    expect(clientRoleCreateSchema.safeParse({ ...base, permissions: ["news:view"] }).success).toBe(
      true,
    );
  });

  it("name 为空校验失败", () => {
    expect(clientRoleCreateSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("slug 为空校验失败", () => {
    expect(clientRoleCreateSchema.safeParse({ ...base, slug: "" }).success).toBe(false);
  });

  it("name 超过 50 字符校验失败", () => {
    expect(clientRoleCreateSchema.safeParse({ ...base, name: "a".repeat(51) }).success).toBe(false);
  });
});

describe("clientRoleUpdateSchema", () => {
  it("仅传 id 通过校验", () => {
    expect(clientRoleUpdateSchema.safeParse({ id: "r-1" }).success).toBe(true);
  });

  it("部分字段更新通过校验", () => {
    expect(clientRoleUpdateSchema.safeParse({ id: "r-1", name: "新名称" }).success).toBe(true);
  });

  it("缺少 id 校验失败", () => {
    expect(clientRoleUpdateSchema.safeParse({ name: "新名称" }).success).toBe(false);
  });
});

describe("idSchema", () => {
  it("合法 id 通过校验", () => {
    expect(idSchema.safeParse({ id: "r-1" }).success).toBe(true);
  });

  it("空 id 校验失败", () => {
    expect(idSchema.safeParse({ id: "" }).success).toBe(false);
  });
});
