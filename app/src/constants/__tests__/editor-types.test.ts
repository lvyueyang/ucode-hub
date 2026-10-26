/**
 * 编辑器类型常量测试：EditorType、EDITOR_TYPES、EDITOR_TYPE_LABELS
 */

import { describe, expect, it } from "vitest";
import type { EditorType } from "#/constants/editor-types";
import { EDITOR_TYPE_LABELS, EDITOR_TYPES } from "#/constants/editor-types";

describe("EDITOR_TYPES", () => {
  it("包含全部 9 种编辑器类型", () => {
    expect(EDITOR_TYPES).toHaveLength(9);
  });

  it("所有元素均为唯一值", () => {
    expect(new Set(EDITOR_TYPES).size).toBe(EDITOR_TYPES.length);
  });

  it("按预期顺序排列（input → text → number → boolean → json → rich → code → image → file）", () => {
    expect(EDITOR_TYPES).toEqual([
      "input",
      "text",
      "number",
      "boolean",
      "json",
      "rich",
      "code",
      "image",
      "file",
    ]);
  });
});

describe("EDITOR_TYPE_LABELS", () => {
  it("每个 EditorType 都有对应的中文标签", () => {
    for (const type of EDITOR_TYPES) {
      expect(EDITOR_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("不允许有未定义的 EditorType 键", () => {
    const keys = Object.keys(EDITOR_TYPE_LABELS) as EditorType[];
    expect(keys.sort()).toEqual([...EDITOR_TYPES].sort());
  });

  it("所有标签值均为非空字符串", () => {
    for (const label of Object.values(EDITOR_TYPE_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.trim()).not.toBe("");
    }
  });

  it("标签值唯一不重复", () => {
    const labels = Object.values(EDITOR_TYPE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
