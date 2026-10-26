/**
 * cn() 工具函数测试：类名合并、冲突去重、falsy 过滤
 */

import { describe, expect, it } from "vitest";
import { cn } from "../index";

describe("cn", () => {
  it("多个类名合并为一个字符串", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("单个类名直接返回", () => {
    expect(cn("single")).toBe("single");
  });

  it("冲突的 Tailwind 类名去重（twMerge）", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("不同前缀的类名共存", () => {
    expect(cn("px-2", "py-4", "text-red-500")).toBe("px-2 py-4 text-red-500");
  });

  it("falsy 值被过滤（false）", () => {
    expect(cn("base", false && "hidden")).toBe("base");
  });

  it("falsy 值被过滤（undefined / null）", () => {
    expect(cn("base", undefined, null)).toBe("base");
  });

  it("空输入返回空字符串", () => {
    expect(cn()).toBe("");
  });

  it("条件类名合并", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("btn", isActive && "active", isDisabled && "disabled")).toBe("btn active");
  });
});
