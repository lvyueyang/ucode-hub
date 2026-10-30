/**
 * 通用消息服务层测试：创建、查询、已读、删除、管理端全量列表/发送/收件人搜索
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// 全局总闸默认关闭（notify_enabled 为空即 false），使外发渠道分发被跳过
vi.mock("#/shared-services/config/config.server", () => ({
  getConfig: vi.fn().mockResolvedValue(""),
}));

// 用户配置批量读取默认返回空 Map
vi.mock("#/services/user-config/user-config.server", () => ({
  getNotifyChannelsMap: vi.fn().mockResolvedValue(new Map()),
  getUserConfig: vi.fn().mockResolvedValue({}),
  setUserConfig: vi.fn().mockResolvedValue(undefined),
}));

const { mockDb } = vi.hoisted(() => {
  const q = () => ({ findFirst: vi.fn(), findMany: vi.fn() });
  return {
    mockDb: {
      query: {
        message: q(),
        adminUser: q(),
        clientUser: q(),
      },
      $count: vi.fn(),
      // 默认 select 链：让 db.$count(db.select()...) 内部的 select 可正常调用
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import {
  createMessage,
  deleteMessage,
  deleteMessageById,
  getMessages,
  getUnreadCount,
  listMessages,
  markAllRead,
  markAsRead,
  searchRecipients,
  sendMessages,
} from "#/services/message/message.server";

/** 用户：客户端用户（测试默认） */
const clientUser = { type: "client" as const, id: "user-1" };
/** 用户：管理端用户 */
const adminUser = { type: "admin" as const, id: "admin-1" };

/** 构造以 offset 结尾的 select 链（分页查询用） */
function chainResolveOffset(value: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn().mockResolvedValue(value),
          })),
        })),
      })),
    })),
  };
}

/** 构造以 limit 结尾的 select 链（搜索用户用） */
function chainResolveLimit(value: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(value),
      })),
    })),
  } as unknown as ReturnType<typeof mockDb.select>;
}

/** 构造以 where 结尾的 select 链（批量解析用户名称用） */
function chainResolveWhere(value: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(value),
    })),
  } as unknown as ReturnType<typeof mockDb.select>;
}

/** 构造一条完整消息行 */
function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg-1",
    userId: "user-1",
    userType: "client",
    title: "消息1",
    content: null,
    type: "system",
    status: "unread",
    relatedLink: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMessage", () => {
  it("创建消息成功返回 ID", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "msg-001" }]),
      })),
    });

    const id = await createMessage({
      user: clientUser,
      title: "测试消息",
      content: "内容",
      type: "system",
    });

    expect(id).toBe("msg-001");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("无 content 时创建成功", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "msg-002" }]),
      })),
    });

    const id = await createMessage({
      user: adminUser,
      title: "无内容消息",
    });

    expect(id).toBe("msg-002");
  });

  it("带 relatedLink 创建成功", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "msg-003" }]),
      })),
    });

    const id = await createMessage({
      user: clientUser,
      title: "带链接消息",
      relatedLink: "/api/download/ppt-output/t1/html",
    });

    expect(id).toBe("msg-003");
  });
});

describe("getUnreadCount", () => {
  it("返回未读数", async () => {
    mockDb.$count.mockResolvedValue(5);

    const count = await getUnreadCount(clientUser);
    expect(count).toBe(5);
  });

  it("无未读消息返回 0", async () => {
    mockDb.$count.mockResolvedValue(0);

    const count = await getUnreadCount(clientUser);
    expect(count).toBe(0);
  });

  it("按管理端用户统计未读数", async () => {
    mockDb.$count.mockResolvedValue(2);

    const count = await getUnreadCount(adminUser);
    expect(count).toBe(2);
  });
});

describe("getMessages", () => {
  it("分页查询全部消息", async () => {
    const fakeRecords = [makeRecord()];
    mockDb.select.mockReturnValue(chainResolveOffset(fakeRecords));
    mockDb.$count.mockResolvedValue(1);

    const result = await getMessages({ user: clientUser });
    expect(result.records).toEqual(fakeRecords);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  it("按 status 筛选未读消息", async () => {
    mockDb.select.mockReturnValue(chainResolveOffset([]));
    mockDb.$count.mockResolvedValue(0);

    const result = await getMessages({
      user: clientUser,
      status: "unread",
    });
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("markAsRead", () => {
  it("标记为已读成功", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      })),
    });

    const ok = await markAsRead("msg-1", clientUser);
    expect(ok).toBe(true);
  });

  it("消息不存在返回 false", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      })),
    });

    const ok = await markAsRead("msg-none", clientUser);
    expect(ok).toBe(false);
  });
});

describe("markAllRead", () => {
  it("全部标记为已读", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 3 }),
      })),
    });

    const count = await markAllRead(clientUser);
    expect(count).toBe(3);
  });
});

describe("deleteMessage", () => {
  it("软删除成功", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      })),
    });

    const ok = await deleteMessage("msg-1", clientUser);
    expect(ok).toBe(true);
  });

  it("消息不存在返回 false", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      })),
    });

    const ok = await deleteMessage("msg-none", clientUser);
    expect(ok).toBe(false);
  });
});

describe("listMessages", () => {
  it("全量分页查询并解析用户名称", async () => {
    const records = [
      makeRecord({ id: "m1", userType: "admin", userId: "a1" }),
      makeRecord({ id: "m2", userType: "client", userId: "c1" }),
    ];
    mockDb.select
      .mockReturnValueOnce(chainResolveOffset(records))
      .mockReturnValueOnce(chainResolveOffset([]))
      .mockReturnValueOnce(chainResolveWhere([{ id: "a1", username: "管理员A" }]))
      .mockReturnValueOnce(chainResolveWhere([{ id: "c1", username: "客户C" }]));
    mockDb.$count.mockResolvedValue(2);

    const result = await listMessages({ page: 1, pageSize: 10 });

    expect(result.total).toBe(2);
    expect(result.records[0]).toMatchObject({
      id: "m1",
      userName: "管理员A",
    });
    expect(result.records[1]).toMatchObject({
      id: "m2",
      userName: "客户C",
    });
  });

  it("按用户类型与状态筛选", async () => {
    mockDb.select.mockReturnValue(chainResolveOffset([]));
    mockDb.$count.mockResolvedValue(0);

    const result = await listMessages({
      userType: "client",
      status: "read",
    });
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("未匹配到用户名称时兜底为未知用户", async () => {
    const records = [makeRecord({ id: "m1", userType: "admin", userId: "ghost" })];
    mockDb.select
      .mockReturnValueOnce(chainResolveOffset(records))
      .mockReturnValueOnce(chainResolveOffset([]))
      .mockReturnValueOnce(chainResolveWhere([]));
    mockDb.$count.mockResolvedValue(1);

    const result = await listMessages({});
    expect(result.records[0].userName).toBe("未知用户");
  });
});

describe("sendMessages", () => {
  it("批量发送成功返回条数", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue({ changes: 2 }),
    });

    const count = await sendMessages({
      userType: "client",
      userIds: ["u1", "u2"],
      title: "通知",
    });

    expect(count).toBe(2);
  });

  it("发送条数以驱动返回的 changes 为准（不再按输入数量兜底）", async () => {
    // node:sqlite 的 changes 是 number | bigint，返回值统一归一成 number
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue({ changes: 3n }),
    });

    const count = await sendMessages({
      userType: "admin",
      userIds: ["u1"],
      title: "通知",
    });

    expect(count).toBe(3);
  });
});

describe("deleteMessageById", () => {
  it("强制软删除成功", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      })),
    });

    const ok = await deleteMessageById("msg-1");
    expect(ok).toBe(true);
  });

  it("消息不存在返回 false", async () => {
    mockDb.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      })),
    });

    const ok = await deleteMessageById("msg-none");
    expect(ok).toBe(false);
  });
});

describe("searchRecipients", () => {
  it("按关键词搜索客户端用户", async () => {
    mockDb.select.mockReturnValue(
      chainResolveLimit([{ id: "c1", username: "张三", email: "zhangsan@test.com" }]),
    );

    const options = await searchRecipients({
      userType: "client",
      keyword: "张三",
    });

    expect(options).toEqual([{ id: "c1", label: "张三（zhangsan@test.com）" }]);
  });

  it("按关键词搜索管理端用户", async () => {
    mockDb.select.mockReturnValue(
      chainResolveLimit([{ id: "a1", username: "admin", email: "a@test.com" }]),
    );

    const options = await searchRecipients({ userType: "admin" });

    expect(options).toEqual([{ id: "a1", label: "admin（a@test.com）" }]);
  });

  it("无匹配时返回空数组", async () => {
    mockDb.select.mockReturnValue(chainResolveLimit([]));

    const options = await searchRecipients({
      userType: "client",
      keyword: "不存在",
    });

    expect(options).toEqual([]);
  });
});
