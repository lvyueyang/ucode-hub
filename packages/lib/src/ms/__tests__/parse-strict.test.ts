/**
 * parseStrict() 函数测试：类型安全包装，运行时行为与 parse 一致
 * 完整解析边界见 parse.test.ts，此处仅验证代表性行为
 */
import { describe, expect, it } from "vitest";
import { parseStrict } from "../index";

describe("parseStrict(string)", () => {
  it("与 parse 行为一致（解析为毫秒数）", () => {
    expect(parseStrict("1m")).toBe(60000);
    expect(parseStrict("100ms")).toBe(100);
    expect(parseStrict("2 days")).toBe(172800000);
    expect(parseStrict("1 month")).toBe(2629800000);
  });

  it("大小写不敏感", () => {
    expect(parseStrict("1.5H")).toBe(5400000);
  });

  it("负数支持", () => {
    expect(parseStrict("-1.5h")).toBe(-5400000);
  });

  it("非法字符串返回 NaN", () => {
    // @ts-expect-error - 运行时非法输入
    expect(Number.isNaN(parseStrict("foo"))).toBe(true);
  });

  it("非法输入抛错", () => {
    // @ts-expect-error - 运行时非法输入
    expect(() => parseStrict("")).toThrow();
    // @ts-expect-error - 运行时非法输入
    expect(() => parseStrict(undefined)).toThrow();
    // @ts-expect-error - 运行时非法输入
    expect(() => parseStrict(null)).toThrow();
  });
});
