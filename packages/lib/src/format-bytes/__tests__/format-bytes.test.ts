/**
 * 字节可读化测试：单位换算、精度与非法入参
 */

import { describe, expect, it } from "vitest";
import { formatBytes } from "../index";

describe("formatBytes", () => {
  it("按单位阶梯换算", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
    expect(formatBytes(1024 ** 4)).toBe("1.0 TB");
  });

  it("B 级不保留小数，其余按 precision", () => {
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1500, 2)).toBe("1.46 KB");
  });

  it("超出单位阶梯时按最大单位展示", () => {
    expect(formatBytes(1024 ** 5)).toBe("1024.0 TB");
  });

  it("非正数与非法数值返回 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });
});
