/**
 * 消息模块 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import {
  adminMessageListSchema,
  messageIdSchema,
  messageListSchema,
  notifyChannelsSchema,
  searchRecipientsSchema,
  sendMessageSchema,
} from "../message.schemas";

describe("messageListSchema", () => {
  it("空参数通过校验", () => {
    expect(messageListSchema.safeParse({}).success).toBe(true);
  });

  it("合法 status 通过校验", () => {
    expect(messageListSchema.safeParse({ status: "unread" }).success).toBe(true);
  });

  it("非法 status 校验失败", () => {
    expect(messageListSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("分页 / 排序参数走通用列表基座，通过校验", () => {
    expect(
      messageListSchema.safeParse({
        page: 1,
        pageSize: 50,
        sortField: "createdAt",
        sortOrder: "descend",
      }).success,
    ).toBe(true);
  });
});

describe("messageIdSchema", () => {
  it("合法 id 通过校验", () => {
    expect(messageIdSchema.safeParse({ id: "m-1" }).success).toBe(true);
  });

  it("空 id 校验失败", () => {
    expect(messageIdSchema.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("adminMessageListSchema", () => {
  it("空参数通过校验", () => {
    expect(adminMessageListSchema.safeParse({}).success).toBe(true);
  });

  it("非法 userType 校验失败", () => {
    expect(adminMessageListSchema.safeParse({ userType: "system" }).success).toBe(false);
  });

  it("keyword 超过 100 字符校验失败", () => {
    expect(adminMessageListSchema.safeParse({ keyword: "a".repeat(101) }).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  const base = {
    userType: "client",
    userIds: ["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"],
    title: "通知标题",
  };

  it("合法参数通过校验", () => {
    expect(sendMessageSchema.safeParse(base).success).toBe(true);
  });

  it("userIds 非 uuid 校验失败", () => {
    expect(sendMessageSchema.safeParse({ ...base, userIds: ["abc"] }).success).toBe(false);
  });

  it("userIds 为空数组校验失败", () => {
    expect(sendMessageSchema.safeParse({ ...base, userIds: [] }).success).toBe(false);
  });

  it("title 为空校验失败", () => {
    expect(sendMessageSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });
});

describe("searchRecipientsSchema", () => {
  it("合法参数通过校验", () => {
    expect(searchRecipientsSchema.safeParse({ userType: "admin" }).success).toBe(true);
  });

  it("缺少 userType 校验失败", () => {
    expect(searchRecipientsSchema.safeParse({}).success).toBe(false);
  });
});

describe("notifyChannelsSchema", () => {
  it("空配置通过校验", () => {
    expect(notifyChannelsSchema.safeParse({}).success).toBe(true);
  });

  it("合法渠道配置通过校验", () => {
    expect(
      notifyChannelsSchema.safeParse({
        email: { enabled: true, value: "a@b.com" },
        feishu: { enabled: true, value: "https://open.feishu.cn/hook/x" },
      }).success,
    ).toBe(true);
  });

  it("渠道缺少 enabled 时按停用兜底通过校验", () => {
    expect(notifyChannelsSchema.safeParse({ email: { value: "a@b.com" } }).success).toBe(true);
  });
});
