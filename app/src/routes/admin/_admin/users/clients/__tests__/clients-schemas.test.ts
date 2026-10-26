/**
 * 客户端用户 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  clientUserCreateSchema,
  clientUserListSchema,
  clientUserUpdateSchema,
  idSchema,
  resetPwdSchema,
} from "#/services/client-user/client-user.schemas";

describe("clientUserListSchema", () => {
  it("空参数通过", () => {
    expect(clientUserListSchema.safeParse({}).success).toBe(true);
  });

  it("全部参数通过", () => {
    expect(
      clientUserListSchema.safeParse({
        page: 1,
        pageSize: 10,
        keyword: "test",
        sortField: "createdAt",
        sortOrder: "ascend",
      }).success,
    ).toBe(true);
  });

  it("分页参数全链路透传", () => {
    const result = clientUserListSchema.safeParse({ page: 3, pageSize: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(50);
    }
  });
});

describe("clientUserCreateSchema", () => {
  it("合法输入通过", () => {
    expect(
      clientUserCreateSchema.safeParse({
        username: "user",
        email: "user@example.com",
        password: "123456",
      }).success,
    ).toBe(true);
  });

  it("带 clientRoleIds 通过", () => {
    expect(
      clientUserCreateSchema.safeParse({
        username: "user",
        email: "user@example.com",
        password: "123456",
        clientRoleIds: ["r-1", "r-2"],
      }).success,
    ).toBe(true);
  });

  it("密码不足 6 位失败", () => {
    expect(
      clientUserCreateSchema.safeParse({
        username: "user",
        email: "user@example.com",
        password: "12345",
      }).success,
    ).toBe(false);
  });
});

describe("clientUserUpdateSchema", () => {
  it("部分字段更新通过（emailVerified）", () => {
    expect(
      clientUserUpdateSchema.safeParse({
        id: "u-1",
        emailVerified: true,
      }).success,
    ).toBe(true);
  });

  it("角色数组更新通过", () => {
    expect(
      clientUserUpdateSchema.safeParse({
        id: "u-1",
        clientRoleIds: ["r-1"],
      }).success,
    ).toBe(true);
  });

  it("缺少 id 失败", () => {
    expect(clientUserUpdateSchema.safeParse({ username: "x" }).success).toBe(false);
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
