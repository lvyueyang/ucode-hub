/**
 * 业务日期工具测试：时区转换、date-only 解析、天区间边界
 */
import { describe, expect, it } from "vitest";
import { DATE_ONLY_REGEX, isValidDateStr, parseDateOnly, toDateString, toDayRange } from "../index";

describe("toDateString", () => {
  it("将上海当天零点格式化为对应日期", () => {
    expect(toDateString(new Date("2023-12-31T16:00:00.000Z"))).toBe("2024-01-01");
  });

  it("UTC 时刻按上海时区转换日期", () => {
    expect(toDateString(new Date("2024-01-01T00:00:00.000Z"))).toBe("2024-01-01");
    expect(toDateString(new Date("2024-01-01T16:00:00.000Z"))).toBe("2024-01-02");
  });
});

describe("parseDateOnly", () => {
  it("解析为指定时区当日 00:00（UTC 为前一天 16:00）", () => {
    expect(parseDateOnly("2024-01-01").toISOString()).toBe("2023-12-31T16:00:00.000Z");
  });

  it("跨年与月末自动进位", () => {
    expect(parseDateOnly("2024-12-31").toISOString()).toBe("2024-12-30T16:00:00.000Z");
  });
});

describe("toDayRange", () => {
  it("返回当天排他区间 [00:00, 次日00:00)", () => {
    const { start, end } = toDayRange("2024-01-01");
    expect(start.toISOString()).toBe("2023-12-31T16:00:00.000Z");
    expect(end.toISOString()).toBe("2024-01-01T16:00:00.000Z");
  });

  it("月末最后一天 end 进位到下月", () => {
    const { start, end } = toDayRange("2024-01-31");
    expect(start.toISOString()).toBe("2024-01-30T16:00:00.000Z");
    expect(end.toISOString()).toBe("2024-01-31T16:00:00.000Z");
  });
});

describe("DATE_ONLY_REGEX", () => {
  it("匹配合法日期", () => {
    expect(DATE_ONLY_REGEX.test("2024-01-01")).toBe(true);
    expect(DATE_ONLY_REGEX.test("2024-12-31")).toBe(true);
  });

  it("拒绝非法格式", () => {
    expect(DATE_ONLY_REGEX.test("2024/01/01")).toBe(false);
    expect(DATE_ONLY_REGEX.test("2024-01-31T00:00:00.000Z")).toBe(false);
    expect(DATE_ONLY_REGEX.test("20240101")).toBe(false);
  });
});

describe("isValidDateStr", () => {
  it("真实存在的日历日期通过校验", () => {
    expect(isValidDateStr("2024-02-29")).toBe(true);
    expect(isValidDateStr("2023-02-28")).toBe(true);
    expect(isValidDateStr("2024-12-31")).toBe(true);
  });

  it("不存在的日历日期校验失败", () => {
    expect(isValidDateStr("2024-02-31")).toBe(false);
    expect(isValidDateStr("2024-13-01")).toBe(false);
    expect(isValidDateStr("2024-00-10")).toBe(false);
  });

  it("非闰年 2 月 29 日校验失败", () => {
    expect(isValidDateStr("2023-02-29")).toBe(false);
  });

  it("格式非法的字符串校验失败", () => {
    expect(isValidDateStr("2024/01/01")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
  });
});
