/**
 * 图片验证码生成器
 * 基于 opentype.js 将字体字形转为 SVG path，实现路径级随机扭曲
 */

import type { ChToPathOptions } from "./ch-to-path";
import chToPath from "./ch-to-path";
import { options } from "./option-manager";
import { captchaText, color, greyColor, int, mathExpr, shuffle } from "./random";

/** 验证码生成选项 */
export interface CaptchaOptions {
  size?: number;
  noise?: number;
  color?: boolean;
  background?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  ignoreChars?: string;
  charPreset?: string;
  /** 直线截断概率 */
  truncateLineProbability?: number;
  /** 曲线拆分概率 */
  truncateCurveProbability?: number;
  /** 曲线拆分位置下限 */
  truncateCurvePositionMin?: number;
  /** 曲线拆分位置上限 */
  truncateCurvePositionMax?: number;
}

/** 验证码生成结果 */
export interface CaptchaResult {
  data: string;
  text: string;
}

/** createMathExpr 选项 */
export interface MathExprOptions extends CaptchaOptions {
  mathMin?: number;
  mathMax?: number;
  mathOperator?: "+" | "-" | "+-";
}

/** 生成贝塞尔曲线干扰路径 */
function getLineNoise(width: number, height: number, opts: CaptchaOptions): string[] {
  const hasColor = opts.color;
  const count = opts.noise ?? options.noise;
  const noiseLines: string[] = [];

  for (let i = 0; i < count; i++) {
    const startX = int(1, 21);
    const startY = int(1, height - 1);
    const endX = int(width - 21, width - 1);
    const endY = int(1, height - 1);
    const mid1X = int(width / 2 - 21, width / 2 + 21);
    const mid1Y = int(1, height - 1);
    const mid2X = int(width / 2 - 21, width / 2 + 21);
    const mid2Y = int(1, height - 1);
    const c = hasColor ? color(opts.background) : greyColor(1, 9);
    noiseLines.push(
      `<path d="M${startX} ${startY} C${mid1X} ${mid1Y},${mid2X} ${mid2Y},${endX} ${endY}" stroke="${c}" fill="none"/>`,
    );
  }

  return noiseLines;
}

/** 将文本转为多个 SVG path */
function getText(text: string, width: number, height: number, opts: CaptchaOptions): string[] {
  const len = text.length;
  const spacing = (width - 2) / (len + 1);
  const chOpts: ChToPathOptions = {
    x: 0,
    y: height / 2,
    fontSize: opts.fontSize ?? options.fontSize,
    truncateLineProbability: opts.truncateLineProbability,
    truncateCurveProbability: opts.truncateCurveProbability,
    truncateCurvePositionMin: opts.truncateCurvePositionMin,
    truncateCurvePositionMax: opts.truncateCurvePositionMax,
  };

  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const x = spacing * (i + 1);
    const y = height / 2;
    const charColor = opts.color ? color(opts.background) : greyColor(0, 4);
    const pathData = chToPath(text[i], { ...chOpts, x, y });
    out.push(`<path fill="${charColor}" d="${pathData}"/>`);
  }

  return out;
}

/**
 * 为指定文本生成验证码 SVG
 * @param text - 要渲染的验证码文本，不传则随机生成
 * @param userOptions - 生成选项
 * @returns SVG 字符串
 */
function createCaptcha(text?: string, userOptions?: CaptchaOptions): string {
  const textToRender = text ?? captchaText(userOptions);
  const opts = { ...options, ...userOptions };
  const bg = opts.background;
  if (bg) opts.color = true;

  const bgRect = bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : "";

  const paths = shuffle(
    ([] as string[])
      .concat(getLineNoise(opts.width, opts.height, opts))
      .concat(getText(textToRender, opts.width, opts.height, opts)),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0,0,${opts.width},${opts.height}">${bgRect}${paths.join("")}</svg>`;
}

/** 生成图片验证码（随机文本 + SVG） */
export function create(userOptions?: CaptchaOptions): CaptchaResult {
  const text = captchaText(userOptions);
  const data = createCaptcha(text, userOptions);
  return { text, data };
}

/** 生成数学表达式验证码（算式 + 答案） */
export function createMathExpr(userOptions?: MathExprOptions): CaptchaResult {
  const expr = mathExpr(userOptions?.mathMin, userOptions?.mathMax, userOptions?.mathOperator);
  const data = createCaptcha(expr.equation, userOptions);
  return { text: expr.text, data };
}
