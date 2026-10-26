/**
 * 数据导出工具测试：CSV / JSON 序列化、浏览器下载
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, toCsv, toJson } from "../index";

describe("toCsv", () => {
  const columns = [
    { key: "name", title: "姓名" },
    { key: "age", title: "年龄" },
    { key: "city", title: "城市" },
  ];

  it("将对象数组序列化为带 BOM 的 CSV 字符串", () => {
    const rows = [
      { name: "张三", age: 25, city: "北京" },
      { name: "李四", age: 30, city: "上海" },
    ];
    const result = toCsv(rows, columns);
    // 以 BOM 开头
    expect(result.startsWith("\uFEFF")).toBe(true);
    expect(result).toContain("姓名,年龄,城市");
    expect(result).toContain("张三,25,北京");
    expect(result).toContain("李四,30,上海");
  });

  it("包含逗号的字段用双引号包裹", () => {
    const rows = [{ name: "张三,李四", age: 25, city: "北京" }];
    const result = toCsv(rows, columns);
    expect(result).toContain('"张三,李四"');
  });

  it("包含双引号的字段被转义", () => {
    const rows = [{ name: '张"三', age: 25, city: "北京" }];
    const result = toCsv(rows, columns);
    expect(result).toContain('"张""三"');
  });

  it("空数组仅返回 BOM + 表头", () => {
    const result = toCsv([], columns);
    expect(result).toBe("\uFEFF姓名,年龄,城市\n");
  });

  it("null / undefined 值转为空字符串", () => {
    const rows = [{ name: null, age: undefined, city: "北京" }];
    const result = toCsv(rows, columns);
    const lines = result.split("\n");
    expect(lines[1]).toBe(",,北京");
  });
});

describe("toJson", () => {
  it("将对象序列化为格式化的 JSON 字符串", () => {
    const result = toJson({ name: "test", value: 123 });
    expect(result).toBe('{\n  "name": "test",\n  "value": 123\n}');
  });

  it("数组正确序列化", () => {
    const result = toJson([1, 2, 3]);
    expect(result).toBe("[\n  1,\n  2,\n  3\n]");
  });
});

describe("downloadFile", () => {
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  const origBlob = globalThis.Blob;

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    globalThis.Blob = origBlob;
  });

  it("创建并触发 Blob 下载", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const click = vi.fn();

    // mock DOM API
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    globalThis.Blob = vi.fn(function (this: unknown) {
      return this;
    }) as unknown as typeof Blob;

    const createElementOrig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return {
          href: "",
          download: "",
          click,
        } as unknown as HTMLElement;
      }
      return createElementOrig(tag);
    });

    vi.spyOn(document.body, "appendChild").mockImplementation(appendChild);
    vi.spyOn(document.body, "removeChild").mockImplementation(removeChild);

    downloadFile("test content", "test.json", "application/json");

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});
