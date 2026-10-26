/**
 * 验证码默认选项与字体加载
 */
import type { Font } from "opentype.js";
import * as opentypeNs from "opentype.js";
import { FONT_BASE64 } from "./font-data";

// opentype.js v2 的模块形状在 dev（CJS 预打包）与 build（ESM）下不同：
// 有的形状把命名导出挂在 default 上，有的直接挂在命名空间上——取真正带 parse 的那份，两种形状都能跑
const opentypeDefault = (opentypeNs as typeof opentypeNs & { default?: typeof opentypeNs }).default;
const opentype =
  typeof opentypeNs.parse === "function" ? opentypeNs : (opentypeDefault ?? opentypeNs);

// 字体解析是纯 CPU 开销，模块级单例复用解析结果，避免每次生成验证码重复解析
const fontBuffer = Buffer.from(FONT_BASE64, "base64").buffer as ArrayBuffer;
const font = opentype.parse(fontBuffer) as Font;

/** 默认字符集：排除易混淆字符（0/O、1/I/l） */
const charPreset = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const defaultOptions = {
  width: 150,
  height: 50,
  noise: 1,
  color: false,
  background: "",
  size: 4,
  ignoreChars: "",
  fontSize: 56,
  charPreset,
  font,
  ascender: font.ascender,
  descender: font.descender,
  truncateLineProbability: 0.5,
  truncateCurveProbability: 0.5,
  truncateCurvePositionMin: 0.4,
  truncateCurvePositionMax: 0.6,
};

/**
 * 验证码默认选项，只读：禁止调用方改写全局默认值
 * （生成时由 createCaptcha 与本对象做浅拷贝合并，合法定制走 userOptions 入参）
 */
const options: Readonly<typeof defaultOptions> = defaultOptions;

export { font, options };
