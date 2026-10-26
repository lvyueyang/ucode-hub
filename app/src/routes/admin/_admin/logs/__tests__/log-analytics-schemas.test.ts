/**
 * 运行日志分析 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { logAnalyticsSchema } from "../-mods/log-analytics.functions";

describe("logAnalyticsSchema", () => {
  it("合法时间窗口应通过校验", () => {
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-01-07",
      }).success,
    ).toBe(true);
  });

  it("所有参数同时传入应通过校验", () => {
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-01-07",
        granularity: "hour",
        level: "error",
        keyword: "失败",
      }).success,
    ).toBe(true);
  });

  it("缺少时间窗口应校验失败", () => {
    expect(logAnalyticsSchema.safeParse({}).success).toBe(false);
  });

  it("非法日期格式或不存在的日期应校验失败", () => {
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024/01/01",
        endDate: "2024-01-07",
      }).success,
    ).toBe(false);
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024-02-31",
        endDate: "2024-03-01",
      }).success,
    ).toBe(false);
  });

  it("结束早于开始应校验失败", () => {
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024-01-07",
        endDate: "2024-01-01",
      }).success,
    ).toBe(false);
  });

  it("超过 31 天应校验失败", () => {
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-03-01",
      }).success,
    ).toBe(false);
  });

  it("非法粒度应校验失败", () => {
    expect(
      logAnalyticsSchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-01-07",
        granularity: "week",
      }).success,
    ).toBe(false);
  });
});
