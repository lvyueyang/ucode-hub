/**
 * parseCustomHeadConfig() 测试：head 配置解析、校验与兜底
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCustomHeadConfig } from "../custom-head";

describe("parseCustomHeadConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("空字符串或 undefined 返回空配置", () => {
    expect(parseCustomHeadConfig(undefined)).toEqual({});
    expect(parseCustomHeadConfig("")).toEqual({});
    expect(parseCustomHeadConfig("   ")).toEqual({});
  });

  it("合法完整结构正常解析", () => {
    const result = parseCustomHeadConfig(
      JSON.stringify({
        meta: [{ name: "description", content: "站点描述" }],
        links: [{ rel: "canonical", href: "https://example.com" }],
        scripts: [{ type: "application/ld+json", children: "{}" }],
        styles: [{ children: ".custom-head {}" }],
      }),
    );
    expect(result.meta).toHaveLength(1);
    expect(result.meta?.[0]).toMatchObject({ name: "description" });
    expect(result.links).toHaveLength(1);
    expect(result.links?.[0]).toMatchObject({ rel: "canonical" });
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts?.[0]).toMatchObject({ type: "application/ld+json" });
    expect(result.styles).toHaveLength(1);
    expect(result.styles?.[0]).toMatchObject({ children: ".custom-head {}" });
  });

  it("仅提供部分字段时只返回对应字段", () => {
    const result = parseCustomHeadConfig(JSON.stringify({ scripts: [] }));
    expect(result.scripts).toEqual([]);
    expect(result.meta).toBeUndefined();
    expect(result.links).toBeUndefined();
    expect(result.styles).toBeUndefined();
  });

  it("非法 JSON 返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig("{ invalid json");
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("结构不合法（scripts 非数组）返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(JSON.stringify({ scripts: { src: "/x.js" } }));
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("scripts.children 非字符串（JSON-LD 写成对象）返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(
      JSON.stringify({
        scripts: [
          {
            type: "application/ld+json",
            children: { "@type": "Organization" },
          },
        ],
      }),
    );
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("styles.children 非字符串返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(
      JSON.stringify({ styles: [{ children: { color: "red" } }] }),
    );
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("meta 含 children 返回空配置并告警（void 元素渲染会抛异常）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(
      JSON.stringify({ meta: [{ name: "robots", children: "text" }] }),
    );
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("links 含 dangerouslySetInnerHTML 返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(
      JSON.stringify({
        links: [
          {
            rel: "canonical",
            href: "https://example.com",
            dangerouslySetInnerHTML: { __html: "<b>" },
          },
        ],
      }),
    );
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("scripts 同时含 children 与 dangerouslySetInnerHTML 返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(
      JSON.stringify({
        scripts: [
          {
            children: "var a=1;",
            dangerouslySetInnerHTML: { __html: "var b=2;" },
          },
        ],
      }),
    );
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("styles 含非 { __html } 形式的 dangerouslySetInnerHTML 返回空配置并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCustomHeadConfig(
      JSON.stringify({
        styles: [{ dangerouslySetInnerHTML: "not-an-object" }],
      }),
    );
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it("children 缺省或为字符串时通过校验", () => {
    const result = parseCustomHeadConfig(
      JSON.stringify({
        scripts: [{ src: "/x.js" }, { children: "var a=1;" }],
        styles: [{ children: ".x{}" }],
      }),
    );
    expect(result.scripts).toHaveLength(2);
    expect(result.styles).toHaveLength(1);
  });

  it("未知顶层字段被忽略", () => {
    const result = parseCustomHeadConfig(
      JSON.stringify({ meta: [], div: [{ children: "<div>" }] }),
    );
    expect(result.meta).toEqual([]);
  });
});
