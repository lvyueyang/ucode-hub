/**
 * 「我的用量」时间段：入参 schema、区间换算与数值格式化
 */
import { describe, expect, it } from "vitest";
import { resolveUsageDateRange } from "#/routes/usage/-mods/usage.functions";
import {
  DEFAULT_USAGE_RANGE,
  formatCount,
  USAGE_RANGES,
  usageRangeSchema,
} from "#/routes/usage/-mods/usage.shared";

describe("usageRangeSchema（我的用量入参）", () => {
  it("四个时间段均可通过", () => {
    for (const range of USAGE_RANGES) {
      expect(usageRangeSchema.safeParse({ range }).success).toBe(true);
    }
  });

  it("未知时间段失败", () => {
    expect(usageRangeSchema.safeParse({ range: "last365" }).success).toBe(false);
  });

  it("缺少时间段失败", () => {
    expect(usageRangeSchema.safeParse({}).success).toBe(false);
  });

  it("归属不接受客户端传入：多余字段被丢弃", () => {
    const parsed = usageRangeSchema.safeParse({ range: "today", accountId: "other-user" });
    expect(parsed.success && parsed.data).toEqual({ range: "today" });
  });
});

describe("resolveUsageDateRange（时间段 → 查询区间）", () => {
  // 固定时刻：UTC 2026-03-10T02:00Z 即北京时间 2026-03-10 10:00
  const now = new Date("2026-03-10T02:00:00Z");

  it("今天只含当日", () => {
    expect(resolveUsageDateRange("today", now)).toEqual({
      startDate: "2026-03-10",
      endDate: "2026-03-10",
    });
  });

  it("近 7 天含当日共 7 天", () => {
    expect(resolveUsageDateRange("last7", now)).toEqual({
      startDate: "2026-03-04",
      endDate: "2026-03-10",
    });
  });

  it("近 30 天含当日共 30 天（跨月回退）", () => {
    expect(resolveUsageDateRange("last30", now)).toEqual({
      startDate: "2026-02-09",
      endDate: "2026-03-10",
    });
  });

  it("全部不带边界", () => {
    expect(resolveUsageDateRange("all", now)).toEqual({});
  });

  it("按业务时区取当天：UTC 已跨日时仍是北京时间当天", () => {
    expect(resolveUsageDateRange("today", new Date("2026-03-09T17:30:00Z"))).toEqual({
      startDate: "2026-03-10",
      endDate: "2026-03-10",
    });
  });

  it("跨月回退不受本地时区影响", () => {
    expect(resolveUsageDateRange("last7", new Date("2026-03-03T02:00:00Z"))).toEqual({
      startDate: "2026-02-25",
      endDate: "2026-03-03",
    });
  });
});

describe("formatCount（计数展示）", () => {
  it("千分位分组", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("零与小数原样展示", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12.5)).toBe("12.5");
  });
});

describe("DEFAULT_USAGE_RANGE（首屏时间段）", () => {
  it("落在可选集合内", () => {
    expect(USAGE_RANGES).toContain(DEFAULT_USAGE_RANGE);
  });
});
