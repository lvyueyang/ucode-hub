/**
 * 操作日志分析模块测试：KPI / 趋势 / 分布聚合与环比
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: { execute: vi.fn() },
}));

vi.mock("#/db", () => ({ db: mockDb }));

import { getOperationActionCounts, getOperationLogAnalytics } from "../operation-log.analytics";

/** 依次为 5 个子查询排队返回结果（KPI / 趋势 / 动作 / 模块 / 操作人） */
function queueAggregates(rows: {
  kpi: unknown;
  trend: unknown[];
  action: unknown[];
  module: unknown[];
  operator: unknown[];
}) {
  mockDb.execute
    .mockResolvedValueOnce({ rows: [rows.kpi] })
    .mockResolvedValueOnce({ rows: rows.trend })
    .mockResolvedValueOnce({ rows: rows.action })
    .mockResolvedValueOnce({ rows: rows.module })
    .mockResolvedValueOnce({ rows: rows.operator });
}

describe("getOperationLogAnalytics", () => {
  beforeEach(() => {
    mockDb.execute.mockReset();
  });

  it("聚合返回 KPI、趋势、分布与操作人排行", async () => {
    queueAggregates({
      kpi: { total: 10, operators: 3, high_risk: 2, modules: 4 },
      trend: [{ bucket: "2024-01-01", series: "create", value: 5 }],
      action: [{ name: "create", count: 5 }],
      module: [{ name: "news", count: 5 }],
      operator: [{ name: "admin", count: 5 }],
    });

    const result = await getOperationLogAnalytics({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(result.totalOperations).toBe(10);
    expect(result.activeOperators).toBe(3);
    expect(result.highRiskOperations).toBe(2);
    expect(result.moduleCount).toBe(4);
    expect(result.timeSeries).toEqual([{ date: "2024-01-01", value: 5, series: "create" }]);
    expect(result.actionDistribution).toEqual([{ name: "create", count: 5, ratio: 0.5 }]);
    expect(result.moduleDistribution).toEqual([{ name: "news", count: 5, ratio: 0.5 }]);
    expect(result.topOperators).toEqual([{ name: "admin", count: 5, ratio: 0.5 }]);
    expect(result.deltas).toBeUndefined();
  });

  it("无数据时返回零值与空数组", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });

    const result = await getOperationLogAnalytics({
      startDate: "2024-01-01",
      endDate: "2024-01-01",
    });

    expect(result.totalOperations).toBe(0);
    expect(result.activeOperators).toBe(0);
    expect(result.highRiskOperations).toBe(0);
    expect(result.moduleCount).toBe(0);
    expect(result.timeSeries).toEqual([]);
    expect(result.actionDistribution).toEqual([]);
  });

  it("compare=previous 计算环比涨跌", async () => {
    queueAggregates({
      kpi: { total: 10, operators: 4, high_risk: 0, modules: 1 },
      trend: [],
      action: [],
      module: [],
      operator: [],
    });
    // 第 6 次调用：上一等长窗口的 KPI
    mockDb.execute.mockResolvedValueOnce({
      rows: [{ total: 5, operators: 0, high_risk: 0, modules: 1 }],
    });

    const result = await getOperationLogAnalytics({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      compare: "previous",
    });

    expect(result.deltas).toEqual({
      totalOperations: { value: 1 },
      // 上期活跃操作人为 0，变化率无定义
      activeOperators: { value: null },
    });
  });

  it("compare=none 时不额外查询对比窗口", async () => {
    queueAggregates({
      kpi: { total: 1, operators: 1, high_risk: 0, modules: 1 },
      trend: [],
      action: [],
      module: [],
      operator: [],
    });

    await getOperationLogAnalytics({
      startDate: "2024-01-01",
      endDate: "2024-01-01",
      compare: "none",
    });

    expect(mockDb.execute).toHaveBeenCalledTimes(5);
  });
});

describe("getOperationActionCounts", () => {
  beforeEach(() => {
    mockDb.execute.mockReset();
  });

  it("按指定动作集合聚合次数", async () => {
    mockDb.execute.mockResolvedValue({
      rows: [
        { name: "delete", count: 5 },
        { name: "reset_pwd", count: 2 },
      ],
    });

    const result = await getOperationActionCounts("2024-01-01", "2024-01-31", [
      "delete",
      "reset_pwd",
    ]);

    expect(result).toEqual([
      { name: "delete", count: 5 },
      { name: "reset_pwd", count: 2 },
    ]);
  });

  it("动作集合为空时不查询数据库", async () => {
    const result = await getOperationActionCounts("2024-01-01", "2024-01-31", []);

    expect(result).toEqual([]);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });
});
