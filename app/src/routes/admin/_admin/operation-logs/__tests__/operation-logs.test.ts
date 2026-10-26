/**
 * 操作日志处理逻辑单元测试
 */

import { describe, expect, it } from "vitest";
import { mapDateField } from "../-mods/operation-logs.functions";

describe("mapDateField", () => {
  it("Date 类型转为 ISO 字符串", () => {
    const result = mapDateField(new Date("2026-01-15T10:30:00.000Z"));
    expect(result).toBe("2026-01-15T10:30:00.000Z");
  });

  it("字符串直接转为字符串", () => {
    const result = mapDateField("2026-01-15");
    expect(result).toBe("2026-01-15");
  });

  it("null 转为 'null'", () => {
    const result = mapDateField(null);
    expect(result).toBe("null");
  });

  it("undefined 转为 'undefined'", () => {
    const result = mapDateField(undefined);
    expect(result).toBe("undefined");
  });

  it("数字转为字符串", () => {
    const result = mapDateField(12345);
    expect(result).toBe("12345");
  });
});
