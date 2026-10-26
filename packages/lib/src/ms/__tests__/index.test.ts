/**
 * ms() 分发函数测试：验证字符串/数字双入口与非法输入抛错
 * parse 与 format 的完整行为见 parse.test.ts / format.test.ts
 */
import { describe, expect, it } from "vitest";
import { ms } from "../index";

describe("ms(string)", () => {
  it("字符串入口委托 parse 解析为毫秒数", () => {
    expect(ms("1m")).toBe(60000);
    expect(ms("1.5h")).toBe(5400000);
    expect(ms("100ms")).toBe(100);
  });

  it("长格式字符串同样支持", () => {
    expect(ms("2 days")).toBe(172800000);
    expect(ms("1 month")).toBe(2629800000);
  });

  it("非法字符串返回 NaN", () => {
    // @ts-expect-error - 运行时非法输入
    expect(Number.isNaN(ms("☃"))).toBe(true);
  });
});

describe("ms(number)", () => {
  it("数字入口默认委托 format 输出短格式", () => {
    expect(ms(500)).toBe("500ms");
    expect(ms(60000)).toBe("1m");
  });

  it("long: true 输出长格式", () => {
    expect(ms(1000, { long: true })).toBe("1 second");
    expect(ms(60000, { long: true })).toBe("1 minute");
  });
});

describe("ms(invalid inputs)", () => {
  it("空字符串抛错", () => {
    expect(() => {
      // @ts-expect-error - 运行时非法输入
      ms("");
    }).toThrow();
  });

  it("非字符串非数字输入抛错", () => {
    for (const value of [undefined, null, [], {}]) {
      expect(() => {
        // @ts-expect-error - 运行时非法输入
        ms(value);
      }).toThrow();
    }
  });

  it("NaN / Infinity 抛错", () => {
    expect(() => ms(NaN)).toThrow();
    expect(() => ms(Infinity)).toThrow();
    expect(() => ms(-Infinity)).toThrow();
  });
});
