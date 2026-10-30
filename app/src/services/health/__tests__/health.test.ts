/**
 * 健康检查模块测试：数据库与存储探测、状态聚合、错误处理
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  // sqlite 驱动用 db.all(sql) 取行，结果直接是行数组（不再有 { rows } 包装）
  mockDb: { all: vi.fn() },
}));
vi.mock("#/db", () => ({ db: mockDb }));

const { mockStat, mockAccess } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockAccess: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ access: mockAccess, stat: mockStat }));

import { checkHealth } from "../health.server";

describe("checkHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("数据库与存储均可用时报告 ok 并携带元信息", async () => {
    mockDb.all.mockResolvedValue([{ "?column?": 1 }]);
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockAccess.mockResolvedValue(undefined);

    const report = await checkHealth();

    expect(report.status).toBe("ok");
    expect(report.checks.database).toMatchObject({ status: "up" });
    expect(report.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.checks.storage).toEqual({ status: "up" });
    expect(report.uptime).toBeTypeOf("number");
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
    expect(report.version).toBe("0.0.0-test");
    expect(mockDb.all).toHaveBeenCalledTimes(1);
    expect(mockStat).toHaveBeenCalledTimes(1);
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it("数据库不可用时整体报告 down 且数据库项带错误描述", async () => {
    mockDb.all.mockRejectedValue(new Error("连接被拒绝"));
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockAccess.mockResolvedValue(undefined);

    const report = await checkHealth();

    expect(report.status).toBe("down");
    expect(report.checks.database).toEqual({
      status: "down",
      error: "连接被拒绝",
    });
    expect(report.checks.storage).toEqual({ status: "up" });
  });

  it("数据库不可用时 down 项不含耗时字段", async () => {
    mockDb.all.mockRejectedValue(new Error("连接超时"));
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockAccess.mockResolvedValue(undefined);

    const report = await checkHealth();

    expect(report.checks.database).not.toHaveProperty("latencyMs");
  });

  it("存储目录不可用时整体报告 down 且存储项带错误描述", async () => {
    mockDb.all.mockResolvedValue([{ "?column?": 1 }]);
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockAccess.mockRejectedValue(new Error("权限不足"));

    const report = await checkHealth();

    expect(report.status).toBe("down");
    expect(report.checks.database).toMatchObject({ status: "up" });
    expect(report.checks.storage).toEqual({
      status: "down",
      error: "权限不足",
    });
  });

  it("存储路径指向文件而非目录时报告 down", async () => {
    mockDb.all.mockResolvedValue([{ "?column?": 1 }]);
    mockStat.mockResolvedValue({ isDirectory: () => false });

    const report = await checkHealth();

    expect(report.status).toBe("down");
    expect(report.checks.storage).toMatchObject({
      status: "down",
      error: expect.stringContaining("不是目录") as string,
    });
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it("非 Error 类型的异常也能提取描述", async () => {
    mockDb.all.mockRejectedValue("boom");
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockAccess.mockResolvedValue(undefined);

    const report = await checkHealth();

    expect(report.status).toBe("down");
    expect(report.checks.database.error).toBe("boom");
  });
});
