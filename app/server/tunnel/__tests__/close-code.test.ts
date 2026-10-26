/**
 * 关闭码归一：能原样转发的码保持不动，本地状态码与越界值换成可发送的兜底码。
 */
import { describe, expect, it } from "vitest";

import { normalizeCloseCode, truncateCloseReason } from "../close-code";

describe("normalizeCloseCode", () => {
  it("终端的语义码原样保留", () => {
    expect(normalizeCloseCode(1000)).toBe(1000);
    expect(normalizeCloseCode(4426)).toBe(4426);
    expect(normalizeCloseCode(4999)).toBe(4999);
  });

  it("1005 / 1006 / 1015 与越界值换成正常关闭", () => {
    expect(normalizeCloseCode(1005)).toBe(1000);
    expect(normalizeCloseCode(1006)).toBe(1000);
    expect(normalizeCloseCode(1015)).toBe(1000);
    expect(normalizeCloseCode(999)).toBe(1000);
    expect(normalizeCloseCode(5000)).toBe(1000);
    expect(normalizeCloseCode(undefined)).toBe(1000);
  });
});

describe("truncateCloseReason", () => {
  it("超长截断，空值保持空", () => {
    expect(truncateCloseReason(undefined)).toBeUndefined();
    expect(truncateCloseReason("exit:0")).toBe("exit:0");
    expect(truncateCloseReason("x".repeat(200))?.length).toBe(100);
  });
});
