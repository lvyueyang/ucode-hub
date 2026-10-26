/**
 * 日志查询模块测试：委托 lib 层 + 序列化转换
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../log-reader", () => ({
  queryLogs: vi.fn(),
  getLogDates: vi.fn(),
}));

import { searchLogs } from "#/services/logs/logs.server";
// 动态导入 log-reader mock 引用
import { queryLogs } from "../log-reader";

describe("searchLogs", () => {
  beforeEach(() => vi.clearAllMocks());
  it("委托 queryLogs 并序列化", async () => {
    const mockQueryLogs = vi.mocked(queryLogs);
    mockQueryLogs.mockResolvedValue({
      entries: [{ level: "info", message: "test", timestamp: "2026-01-01" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const result = await searchLogs({ keyword: "test" });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].level).toBe("info");
    expect(result.entries[0].message).toBe("test");
    expect(result.total).toBe(1);
    expect(mockQueryLogs).toHaveBeenCalledWith({ keyword: "test" });
  });
  it("空参数委托传递", async () => {
    const mockQueryLogs = vi.mocked(queryLogs);
    mockQueryLogs.mockResolvedValue({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    await searchLogs();
    expect(mockQueryLogs).toHaveBeenCalledWith({});
  });
});
