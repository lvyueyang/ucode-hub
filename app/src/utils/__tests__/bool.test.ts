/**
 * 布尔值解析工具测试：系统配置等字符串布尔值统一转换
 */
import { describe, expect, it } from "vitest";
import { toBool } from "#/utils/bool";

describe("toBool", () => {
  it('字符串 "true" 为真', () => {
    expect(toBool("true")).toBe(true);
  });

  it('字符串 "1" 为真', () => {
    expect(toBool("1")).toBe(true);
  });

  it("数字 1 为真", () => {
    expect(toBool(1)).toBe(true);
  });

  it('字符串 "false" 为假', () => {
    expect(toBool("false")).toBe(false);
  });

  it('字符串 "0" 为假', () => {
    expect(toBool("0")).toBe(false);
  });

  it("非 1 的数字为假", () => {
    expect(toBool(0)).toBe(false);
  });

  it("undefined 视为假", () => {
    expect(toBool(undefined)).toBe(false);
  });

  it("非法字符串视为假", () => {
    expect(toBool("yes")).toBe(false);
  });
});
