/**
 * 操作日志分析 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { operationLogAnalyticsSchema } from "../-mods/operation-logs-analytics.functions";

const validWindow = { startDate: "2024-01-01", endDate: "2024-01-31" };

describe("operationLogAnalyticsSchema", () => {
  it("仅时间窗口应通过校验", () => {
    expect(operationLogAnalyticsSchema.safeParse(validWindow).success).toBe(true);
  });

  it("所有参数同时传入应通过校验", () => {
    const result = operationLogAnalyticsSchema.safeParse({
      ...validWindow,
      granularity: "hour",
      breakdown: "module",
      module: "news",
      action: "create",
      operatorName: "admin",
      compare: "previous",
    });
    expect(result.success).toBe(true);
  });

  it("缺少时间窗口应校验失败", () => {
    expect(operationLogAnalyticsSchema.safeParse({}).success).toBe(false);
    expect(operationLogAnalyticsSchema.safeParse({ startDate: "2024-01-01" }).success).toBe(false);
  });

  it("非法日期格式或不存在的日期应校验失败", () => {
    expect(
      operationLogAnalyticsSchema.safeParse({
        startDate: "2024/01/01",
        endDate: "2024-01-31",
      }).success,
    ).toBe(false);
    expect(
      operationLogAnalyticsSchema.safeParse({
        startDate: "2024-02-31",
        endDate: "2024-01-31",
      }).success,
    ).toBe(false);
  });

  it("结束早于开始应校验失败", () => {
    expect(
      operationLogAnalyticsSchema.safeParse({
        startDate: "2024-03-01",
        endDate: "2024-01-01",
      }).success,
    ).toBe(false);
  });

  it("超过 92 天应校验失败，边界内应通过", () => {
    expect(
      operationLogAnalyticsSchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-06-01",
      }).success,
    ).toBe(false);
    // 恰好 92 天（含首尾）应通过
    expect(
      operationLogAnalyticsSchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-04-02",
      }).success,
    ).toBe(true);
  });

  it("非法的粒度/分组/对比枚举应校验失败", () => {
    expect(
      operationLogAnalyticsSchema.safeParse({
        ...validWindow,
        granularity: "month",
      }).success,
    ).toBe(false);
    expect(
      operationLogAnalyticsSchema.safeParse({
        ...validWindow,
        breakdown: "operator",
      }).success,
    ).toBe(false);
    expect(
      operationLogAnalyticsSchema.safeParse({
        ...validWindow,
        compare: "year",
      }).success,
    ).toBe(false);
  });
});
