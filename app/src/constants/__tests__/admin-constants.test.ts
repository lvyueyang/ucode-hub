/**
 * 管理端常量模块测试：日志级别颜色、选项、预置字典定义
 */

import { describe, expect, it } from "vitest";

import { LEVEL_COLORS, LEVEL_OPTIONS, PRESET_DICTS } from "../index";

describe("LEVEL_COLORS", () => {
  it("包含所有日志级别颜色映射", () => {
    expect(LEVEL_COLORS).toHaveProperty("info", "blue");
    expect(LEVEL_COLORS).toHaveProperty("warn", "gold");
    expect(LEVEL_COLORS).toHaveProperty("error", "red");
    expect(LEVEL_COLORS).toHaveProperty("debug", "default");
    expect(LEVEL_COLORS).toHaveProperty("fatal", "red");
  });

  it("error 和 fatal 共用红色", () => {
    expect(LEVEL_COLORS.error).toBe("red");
    expect(LEVEL_COLORS.fatal).toBe("red");
  });
});

describe("LEVEL_OPTIONS", () => {
  it("包含全部选项", () => {
    expect(LEVEL_OPTIONS).toHaveLength(6);
  });

  it("第一个选项为空值（全部）", () => {
    expect(LEVEL_OPTIONS[0]).toEqual({ label: "全部", value: "" });
  });

  it("每个选项都有 label 和 value", () => {
    for (const option of LEVEL_OPTIONS) {
      expect(option).toHaveProperty("label");
      expect(option).toHaveProperty("value");
      expect(typeof option.label).toBe("string");
      expect(typeof option.value).toBe("string");
    }
  });
});

describe("PRESET_DICTS", () => {
  it("包含 user_status 预置字典", () => {
    const slugs = PRESET_DICTS.map((d) => d.slug);
    expect(slugs).toContain("user_status");
  });

  it("user_status 字典包含正常和禁用条目", () => {
    const dict = PRESET_DICTS.find((d) => d.slug === "user_status");
    expect(dict).toBeDefined();
    expect(dict!.name).toBe("用户状态");
    expect(dict!.items).toHaveLength(2);
    const values = dict!.items.map((i) => i.value);
    expect(values).toContain("active");
    expect(values).toContain("disabled");
  });

  it("每个字典条目包含必要字段", () => {
    for (const dict of PRESET_DICTS) {
      for (const item of dict.items) {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("value");
        expect(item).toHaveProperty("sortOrder");
        expect(typeof item.label).toBe("string");
        expect(typeof item.value).toBe("string");
        expect(typeof item.sortOrder).toBe("number");
      }
    }
  });
});
