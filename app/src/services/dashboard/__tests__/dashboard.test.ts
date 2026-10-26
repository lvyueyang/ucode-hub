/**
 * 仪表盘统计测试：客户端用户规模
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCount, mockSelect } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockSelect: vi.fn(),
}));
vi.mock("#/db", () => ({ db: { $count: mockCount, select: mockSelect } }));

import { getClientUserTotal } from "#/services/dashboard/dashboard.server";

describe("getClientUserTotal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // $count 的入参只做链路构造，查询链返回自身即可
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn(() => ({})) })),
    });
  });

  it("返回未删除客户端用户数", async () => {
    mockCount.mockResolvedValue(20);
    expect(await getClientUserTotal()).toBe(20);
  });

  it("无用户时返回 0", async () => {
    mockCount.mockResolvedValue(0);
    expect(await getClientUserTotal()).toBe(0);
  });
});
