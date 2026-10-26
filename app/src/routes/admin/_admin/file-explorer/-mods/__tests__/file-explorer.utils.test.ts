/**
 * 资源管理器工具函数测试：路径展示、路径规范化
 */
import { describe, expect, it } from "vitest";
import { entryPath, formatDisplayPath, isTextFile, normalizePath } from "../file-explorer.utils";

describe("formatDisplayPath", () => {
  it("根目录展示为 /", () => {
    expect(formatDisplayPath("")).toBe("/");
  });

  it("服务端根目录标记 / 展示为 /", () => {
    expect(formatDisplayPath("/")).toBe("/");
  });

  it("单级子路径加前导斜杠", () => {
    expect(formatDisplayPath("uploads")).toBe("/uploads");
  });

  it("多级子路径加前导斜杠", () => {
    expect(formatDisplayPath("uploads/2026/08")).toBe("/uploads/2026/08");
  });
});

describe("normalizePath", () => {
  it("空输入视为根目录", () => {
    expect(normalizePath("")).toBe("");
  });

  it("仅斜杠视为根目录", () => {
    expect(normalizePath("/")).toBe("");
  });

  it("去首尾空格", () => {
    expect(normalizePath("  uploads  ")).toBe("uploads");
  });

  it("去前导斜杠", () => {
    expect(normalizePath("/uploads/foo")).toBe("uploads/foo");
  });

  it("去尾部斜杠", () => {
    expect(normalizePath("uploads/foo/")).toBe("uploads/foo");
  });

  it("折叠连续斜杠", () => {
    expect(normalizePath("uploads//foo///bar")).toBe("uploads/foo/bar");
  });

  it("组合场景：空格 + 斜杠混杂", () => {
    expect(normalizePath("  /uploads//foo/  ")).toBe("uploads/foo");
  });
});

describe("entryPath", () => {
  it("根目录下拼接条目名", () => {
    expect(entryPath("", "a.txt")).toBe("a.txt");
  });

  it("子路径下拼接条目名", () => {
    expect(entryPath("uploads", "a.txt")).toBe("uploads/a.txt");
  });
});

describe("isTextFile", () => {
  it("已知扩展名视为文本文件", () => {
    expect(isTextFile("readme.md")).toBe(true);
    expect(isTextFile("config.json")).toBe(true);
    expect(isTextFile("app.tsx")).toBe(true);
  });

  it("扩展名大小写不敏感", () => {
    expect(isTextFile("README.MD")).toBe(true);
  });

  it("无扩展名视为非文本文件", () => {
    expect(isTextFile("LICENSE")).toBe(false);
  });

  it("未知扩展名视为非文本文件", () => {
    expect(isTextFile("photo.png")).toBe(false);
    expect(isTextFile("archive.zip")).toBe(false);
  });
});
