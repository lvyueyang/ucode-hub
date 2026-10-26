/**
 * 管理员用户 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  adminUserCreateSchema,
  adminUserListSchema,
  adminUserUpdateSchema,
  idSchema,
  resetPwdSchema,
} from "#/services/admin-user/admin-user.schemas";

describe("adminUserListSchema", () => {
  it("空参数通过", () => {
    expect(adminUserListSchema.safeParse({}).success).toBe(true);
  });

  it("全部参数通过", () => {
    expect(
      adminUserListSchema.safeParse({
        page: 1,
        pageSize: 10,
        keyword: "admin",
        sortField: "createdAt",
        sortOrder: "descend",
      }).success,
    ).toBe(true);
  });

  it("分页参数全链路透传", () => {
    const result = adminUserListSchema.safeParse({ page: 3, pageSize: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
    }
  });
});

describe("adminUserCreateSchema", () => {
  it("合法输入通过（多角色数组）", () => {
    expect(
      adminUserCreateSchema.safeParse({
        username: "admin",
        email: "admin@example.com",
        password: "123456",
        adminRoleIds: ["r-1", "r-2"],
      }).success,
    ).toBe(true);
  });

  it("缺少 adminRoleIds 失败", () => {
    expect(
      adminUserCreateSchema.safeParse({
        username: "admin",
        email: "admin@example.com",
        password: "123456",
      }).success,
    ).toBe(false);
  });

  it("空角色数组失败", () => {
    expect(
      adminUserCreateSchema.safeParse({
        username: "admin",
        email: "admin@example.com",
        password: "123456",
        adminRoleIds: [],
      }).success,
    ).toBe(false);
  });

  it("非法邮箱格式失败", () => {
    expect(
      adminUserCreateSchema.safeParse({
        username: "admin",
        email: "bad",
        password: "123456",
        adminRoleIds: ["r-1"],
      }).success,
    ).toBe(false);
  });
});

describe("adminUserUpdateSchema", () => {
  it("部分字段更新通过（仅 status）", () => {
    expect(
      adminUserUpdateSchema.safeParse({
        id: "u-1",
        status: "disabled",
      }).success,
    ).toBe(true);
  });

  it("角色数组更新通过", () => {
    expect(
      adminUserUpdateSchema.safeParse({
        id: "u-1",
        adminRoleIds: ["r-1", "r-2"],
      }).success,
    ).toBe(true);
  });

  it("更新时空角色数组失败", () => {
    expect(
      adminUserUpdateSchema.safeParse({
        id: "u-1",
        adminRoleIds: [],
      }).success,
    ).toBe(false);
  });

  it("缺少 id 失败", () => {
    expect(adminUserUpdateSchema.safeParse({ username: "x" }).success).toBe(false);
  });
});

describe("idSchema", () => {
  it("有效 id 通过", () => {
    expect(idSchema.safeParse({ id: "u-1" }).success).toBe(true);
  });

  it("空 id 失败", () => {
    expect(idSchema.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("resetPwdSchema", () => {
  it("合法输入通过", () => {
    expect(resetPwdSchema.safeParse({ id: "u-1", password: "newpwd1" }).success).toBe(true);
  });

  it("密码不足 6 位失败", () => {
    expect(resetPwdSchema.safeParse({ id: "u-1", password: "12345" }).success).toBe(false);
  });

  it("缺少 id 失败", () => {
    expect(resetPwdSchema.safeParse({ password: "123456" }).success).toBe(false);
  });
});
