/**
 * 字符转 SVG path 模块测试：空字符抛错、非空字符生成 path、字符差异
 */
import { describe, expect, it } from "vitest";
import chToPath from "../ch-to-path";

describe("chToPath", () => {
  const opts = { x: 10, y: 20, fontSize: 48 };

  it("非空字符返回非空 path data", () => {
    const path = chToPath("A", opts);
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
  });

  it("空字符串抛错", () => {
    expect(() => chToPath("", opts)).toThrow("expect a non-empty string");
  });

  it("不同字符产生不同的 path", () => {
    const a = chToPath("A", opts);
    const b = chToPath("B", opts);
    expect(a).not.toBe(b);
  });
});
