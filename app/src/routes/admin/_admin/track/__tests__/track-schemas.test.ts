/**
 * 埋点事件 Schema 验证测试
 */
import { describe, expect, it } from "vitest";
import { analyticsQuerySchema } from "#/routes/admin/_admin/track/analytics/-mods/analytics.functions";
import { trackEventSchema } from "#/services/track/track.functions";
import { trackEventListSchema } from "#/services/track/track-query.schemas";

describe("trackEventSchema", () => {
  it("最小有效参数应通过校验", () => {
    const result = trackEventSchema.safeParse({
      time: 1700000000000,
      sessionId: "abc123",
      name: "PageView",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({});
    }
  });

  it("传入 userId 和 properties 应通过校验", () => {
    const result = trackEventSchema.safeParse({
      time: 1700000000000,
      userId: "user-1",
      sessionId: "abc123",
      name: "Click",
      properties: { page: "/home", button: "login" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({
        page: "/home",
        button: "login",
      });
    }
  });

  it("sessionId 为空字符串应校验失败", () => {
    const result = trackEventSchema.safeParse({
      time: 1700000000000,
      sessionId: "",
      name: "PageView",
    });
    expect(result.success).toBe(false);
  });

  it("event 为空字符串应校验失败", () => {
    const result = trackEventSchema.safeParse({
      time: 1700000000000,
      sessionId: "abc123",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("event 超过 100 个字符应校验失败", () => {
    const result = trackEventSchema.safeParse({
      time: 1700000000000,
      sessionId: "abc123",
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("不传 properties 应默认为空对象", () => {
    const result = trackEventSchema.safeParse({
      time: 1700000000000,
      sessionId: "abc123",
      name: "PageView",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({});
    }
  });
});

describe("trackEventListSchema", () => {
  it("空参数应通过校验", () => {
    const result = trackEventListSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("所有参数同时传入应通过校验", () => {
    const result = trackEventListSchema.safeParse({
      name: "PageView",
      userId: "user-1",
      sessionId: "abc123",
      keyword: "login",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      page: 1,
      pageSize: 50,
      sortField: "createdAt",
      sortOrder: "ascend",
    });
    expect(result.success).toBe(true);
  });

  it("每页条数应原样透传（前端分页控件依赖）", () => {
    const result = trackEventListSchema.safeParse({ pageSize: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("sortOrder 传入非法值应校验失败", () => {
    const result = trackEventListSchema.safeParse({ sortOrder: "invalid" });
    expect(result.success).toBe(false);
  });

  it("日期格式非 YYYY-MM-DD 应校验失败", () => {
    const result = trackEventListSchema.safeParse({
      startDate: "2024/01/01",
      endDate: "2024-12-31T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("不存在的日历日期应校验失败", () => {
    const result = trackEventListSchema.safeParse({
      startDate: "2024-02-31",
      endDate: "2024-12-31",
    });
    expect(result.success).toBe(false);
  });
});

describe("analyticsQuerySchema", () => {
  it("有效参数应通过校验", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("传入 granularity 应通过校验", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      granularity: "day",
    });
    expect(result.success).toBe(true);
  });

  it("缺少 startDate 应校验失败", () => {
    const result = analyticsQuerySchema.safeParse({
      endDate: "2024-12-31",
    });
    expect(result.success).toBe(false);
  });

  it("granularity 传入 week 应通过校验", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      granularity: "week",
    });
    expect(result.success).toBe(true);
  });

  it("granularity 传入非法值应校验失败", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      granularity: "month",
    });
    expect(result.success).toBe(false);
  });

  it("分析扩展参数（事件/指标/维度/周期对比）应通过校验", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      eventNames: ["PageView", "Login"],
      metric: "users",
      breakdown: "$device_type",
      compare: "previous",
    });
    expect(result.success).toBe(true);
  });

  it("metric / compare 传入非法值应校验失败", () => {
    expect(
      analyticsQuerySchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        metric: "sessions",
      }).success,
    ).toBe(false);
    expect(
      analyticsQuerySchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        compare: "yoy",
      }).success,
    ).toBe(false);
  });

  it("日期格式非 YYYY-MM-DD 应校验失败", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024/01/01",
      endDate: "2024-12-31T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("不存在的日历日期应校验失败", () => {
    const result = analyticsQuerySchema.safeParse({
      startDate: "2024-02-31",
      endDate: "2024-12-31",
    });
    expect(result.success).toBe(false);
  });
});
