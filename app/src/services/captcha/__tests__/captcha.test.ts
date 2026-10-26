/**
 * 图片验证码生成器测试
 */

import { describe, expect, it } from "vitest";
import { create, createMathExpr } from "../captcha";
import { captchaText, mathExpr } from "../random";

describe("create", () => {
  it("返回 data 和 text", () => {
    const result = create();
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("text");
  });

  it("默认生成 4 位字符串文本", () => {
    const result = create();
    expect(result.text).toHaveLength(4);
    expect(typeof result.text).toBe("string");
  });

  it("data 为有效 SVG 字符串", () => {
    const result = create();
    expect(result.data).toContain("<svg");
    expect(result.data).toContain("</svg>");
    expect(result.data).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("SVG 包含 width 和 height 属性", () => {
    const result = create({ width: 200, height: 80 });
    expect(result.data).toContain('width="200"');
    expect(result.data).toContain('height="80"');
  });

  it("自定义 size 生效", () => {
    const result = create({ size: 6 });
    expect(result.text).toHaveLength(6);
  });

  it("ignoreChars 排除指定字符", () => {
    const result = create({
      size: 4,
      ignoreChars: "ABCDEFGHJKMNPQRSTUVWYZabcdefghjkmnpqrstuvwyz123456789",
    });
    expect(result.text).toMatch(/^[Xx]{4}$/);
  });

  it("noise 参数不报错", () => {
    expect(() => create({ noise: 5 })).not.toThrow();
  });

  it("background 参数包含背景矩形", () => {
    const result = create({ background: "#f0f0f0" });
    expect(result.data).toContain("<rect");
    expect(result.data).toContain("#f0f0f0");
  });

  it("多次调用结果不同（随机性）", () => {
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      results.add(create().text);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("charPreset 使用自定义字符集", () => {
    const result = create({ size: 6, charPreset: "AB" });
    expect(result.text).toHaveLength(6);
    expect(result.text).toMatch(/^[AB]{6}$/);
  });

  it("background 开启后自动启用 color 模式", () => {
    const result = create({ background: "#333", color: false });
    expect(result.data).toContain("<rect");
  });

  it("干扰线使用贝塞尔曲线 path", () => {
    const result = create({ noise: 3 });
    expect(result.data).toContain('<path d="M');
    expect(result.data).toContain('fill="none"');
  });

  it("字符渲染为 SVG path（非 text 元素）", () => {
    const result = create({ noise: 0 });
    expect(result.data).not.toContain("<text");
    const pathMatches = result.data.match(/<path fill="/g);
    expect(pathMatches).not.toBeNull();
    expect((pathMatches ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("path data 包含路径命令", () => {
    const result = create({ noise: 0 });
    expect(result.data).toMatch(/d="M[\d.]+ [\d.]+/);
  });
});

describe("captchaText", () => {
  it("返回指定长度的字符串", () => {
    expect(captchaText(6)).toHaveLength(6);
  });

  it("支持 options 对象", () => {
    const text = captchaText({ size: 3, charPreset: "A" });
    expect(text).toBe("AAA");
  });
});

describe("createMathExpr", () => {
  it("返回 data 和 text", () => {
    const result = createMathExpr();
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("text");
  });

  it("text 为数字字符串", () => {
    const result = createMathExpr({ mathMin: 1, mathMax: 3 });
    expect(Number.isInteger(Number(result.text))).toBe(true);
  });

  it("加法模式生成正确答案", () => {
    const result = createMathExpr({
      mathOperator: "+",
      mathMin: 1,
      mathMax: 1,
    });
    expect(result.text).toBe("2");
    expect(result.data).toContain("<svg");
    expect(result.data).toContain("</svg>");
  });

  it("mathOperator 随机模式不报错", () => {
    expect(() => createMathExpr({ mathOperator: "+-" })).not.toThrow();
  });
});

describe("mathExpr", () => {
  it("默认生成加法表达式", () => {
    const result = mathExpr(1, 1);
    expect(result.equation).toBe("1+1");
    expect(result.text).toBe("2");
  });

  it("减法模式 text 为两数之差", () => {
    const result = mathExpr(5, 5, "-");
    expect(result.equation).toBe("5-5");
    expect(result.text).toBe("0");
  });

  it("减法结果恒为非负（交换两数）", () => {
    for (let i = 0; i < 50; i++) {
      const result = mathExpr(3, 8, "-");
      const m = result.equation.match(/^(\d+)-(\d+)$/);
      expect(m).not.toBeNull();
      const diff = Number(m?.[1]) - Number(m?.[2]);
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(result.text).toBe(String(diff));
    }
  });

  it("+- 随机模式结果非负", () => {
    for (let i = 0; i < 50; i++) {
      const result = mathExpr(1, 9, "+-");
      expect(Number(result.text)).toBeGreaterThanOrEqual(0);
    }
  });
});
