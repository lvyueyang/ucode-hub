/**
 * 通用用户配置存取层测试：读、写、批量读取通知渠道
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  return {
    mockDb: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import { getNotifyChannelsMap, getUserConfig, setUserConfig } from "../user-config.server";

const clientUser = { type: "client" as const, id: "user-1" };

/** 构造以 limit 结尾的 select 链 */
function chainLimit(value: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(value),
      })),
    })),
  } as unknown as ReturnType<typeof mockDb.select>;
}

/** 构造以 where 结尾的 select 链（批量查询用） */
function chainWhere(value: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(value),
    })),
  } as unknown as ReturnType<typeof mockDb.select>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserConfig", () => {
  it("返回用户配置", async () => {
    const config = {
      notify_channels: { email: { enabled: true, value: "a@b.com" } },
    };
    mockDb.select.mockReturnValue(chainLimit([{ config }]));

    const result = await getUserConfig(clientUser);
    expect(result).toEqual(config);
  });

  it("无记录返回空对象", async () => {
    mockDb.select.mockReturnValue(chainLimit([]));

    const result = await getUserConfig(clientUser);
    expect(result).toEqual({});
  });
});

describe("setUserConfig", () => {
  it("已有记录时更新", async () => {
    mockDb.select.mockReturnValue(chainLimit([{ id: "cfg-1" }]));
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) }));
    mockDb.update.mockReturnValue({ set: updateSet });

    await setUserConfig(clientUser, { notify_channels: {} });
    expect(mockDb.update).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalled();
  });

  it("无记录时插入", async () => {
    mockDb.select.mockReturnValue(chainLimit([]));
    const insertValues = vi.fn().mockResolvedValue({});
    mockDb.insert.mockReturnValue({ values: insertValues });

    await setUserConfig(clientUser, { notify_channels: {} });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", userType: "client" }),
    );
  });
});

describe("getNotifyChannelsMap", () => {
  it("按类型批量查询并返回 key 化的渠道配置", async () => {
    mockDb.select.mockReturnValue(
      chainWhere([
        {
          userId: "user-1",
          config: {
            notify_channels: { email: { enabled: true, value: "a@b.com" } },
          },
        },
      ]),
    );

    const map = await getNotifyChannelsMap([clientUser]);
    expect(map.get("client:user-1")).toEqual({
      email: { enabled: true, value: "a@b.com" },
    });
  });

  it("空用户返回空 Map", async () => {
    const map = await getNotifyChannelsMap([]);
    expect(map.size).toBe(0);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
