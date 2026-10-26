/**
 * 行展开面板纯逻辑测试：空值判据、值文本归一与复制内容推导
 * 组件渲染（不含 DOM）由页面侧人工核对，此处只守逻辑与占位符口径
 */
import { describe, expect, it } from "vitest";
import {
  DETAIL_EMPTY_TEXT,
  formatDetailValue,
  isEmptyDetailValue,
  resolveDetailCopyText,
} from "../detail-grid.utils";

describe("isEmptyDetailValue", () => {
  it("null / undefined / 空串视为空值", () => {
    expect(isEmptyDetailValue(null)).toBe(true);
    expect(isEmptyDetailValue(undefined)).toBe(true);
    expect(isEmptyDetailValue("")).toBe(true);
  });

  it("0 / false / 空数组等非空串值不视为空", () => {
    expect(isEmptyDetailValue(0)).toBe(false);
    expect(isEmptyDetailValue(false)).toBe(false);
    expect(isEmptyDetailValue("0")).toBe(false);
  });
});

describe("formatDetailValue", () => {
  it("空值渲染默认占位符「—」", () => {
    expect(formatDetailValue(null)).toBe(DETAIL_EMPTY_TEXT);
    expect(formatDetailValue(undefined)).toBe(DETAIL_EMPTY_TEXT);
    expect(formatDetailValue("")).toBe(DETAIL_EMPTY_TEXT);
  });

  it("支持自定义占位符", () => {
    expect(formatDetailValue(null, "-")).toBe("-");
  });

  it("标量转字符串，0 / false 保留原值", () => {
    expect(formatDetailValue(0)).toBe("0");
    expect(formatDetailValue(false)).toBe("false");
    expect(formatDetailValue("127.0.0.1")).toBe("127.0.0.1");
  });

  it("对象序列化为缩进 JSON", () => {
    expect(formatDetailValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("resolveDetailCopyText", () => {
  it("字符串值可直接复制", () => {
    expect(resolveDetailCopyText({ key: "k", label: "标签", value: "abc" })).toBe("abc");
  });

  it("显式 copyText 优先于 value", () => {
    expect(
      resolveDetailCopyText({
        key: "k",
        label: "标签",
        value: "展示值",
        copyText: "原始值",
      }),
    ).toBe("原始值");
  });

  it("非字符串值不可推导，返回 null", () => {
    expect(resolveDetailCopyText({ key: "k", label: "标签", value: 1 })).toBe(null);
    expect(resolveDetailCopyText({ key: "k", label: "标签", value: null })).toBe(null);
    expect(resolveDetailCopyText({ key: "k", label: "标签" })).toBe(null);
  });

  it("空串 copyText 视为不复制", () => {
    expect(
      resolveDetailCopyText({
        key: "k",
        label: "标签",
        value: "abc",
        copyText: "",
      }),
    ).toBe(null);
  });
});
