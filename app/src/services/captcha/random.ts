/**
 * 随机生成工具
 */
import { options } from "./option-manager";

/** 区间随机整数（含两端）：Math.floor 保证首尾与中间值同概率 */
export function int(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Fisher–Yates 原地洗牌：`sort(() => Math.random() - 0.5)` 的分布有明显偏置，不可用于随机顺序 */
export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function greyColor(min?: number, max?: number): string {
  const mn = min ?? 1;
  const mx = max ?? 9;
  const v = int(mn, mx).toString(16);
  return `#${v}${v}${v}`;
}

function stripChars(str: string, chars: string): string {
  return str
    .split("")
    .filter((c) => chars.indexOf(c) === -1)
    .join("");
}

/** 计算 hex 颜色的亮度值（0~1），用于背景对比度判断 */
function getLightness(hexColor: string): number {
  if (hexColor?.[0] !== "#") return 1;
  let c = hexColor.slice(1);
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const n = parseInt(c, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / (2 * 255);
}

/** HSL → RGB 辅助函数 */
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * 生成随机 HSL 颜色，根据背景亮度自动调整对比度
 */
export function color(bgColor?: string): string {
  const hue = int(0, 24) / 24;
  const saturation = int(60, 80) / 100;
  const bgLightness = bgColor ? getLightness(bgColor) : 1.0;

  let minL: number;
  let maxL: number;
  if (bgLightness >= 0.5) {
    minL = Math.round(bgLightness * 100) - 45;
    maxL = Math.round(bgLightness * 100) - 25;
  } else {
    minL = Math.round(bgLightness * 100) + 25;
    maxL = Math.round(bgLightness * 100) + 45;
  }
  const lightness = int(minL, maxL) / 100;

  const q =
    lightness < 0.5
      ? lightness * (lightness + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const r = Math.floor(hue2rgb(p, q, hue + 1 / 3) * 255);
  const g = Math.floor(hue2rgb(p, q, hue) * 255);
  const b = Math.floor(hue2rgb(p, q, hue - 1 / 3) * 255);

  return `#${((b | (g << 8) | (r << 16) | (1 << 24)) >>> 0).toString(16).slice(1)}`;
}

/** 验证码文本选项 */
export interface CaptchaTextOptions {
  size?: number;
  ignoreChars?: string;
  charPreset?: string;
}

/**
 * 生成随机验证码文本
 */
export function captchaText(userOptions?: number | CaptchaTextOptions): string {
  let opts: CaptchaTextOptions;
  if (typeof userOptions === "number") {
    opts = { size: userOptions };
  } else {
    opts = userOptions ?? {};
  }

  const size = opts.size ?? options.size;
  const ignoreChars = opts.ignoreChars ?? options.ignoreChars;
  let chars = opts.charPreset ?? options.charPreset;

  if (ignoreChars) {
    chars = stripChars(chars, ignoreChars);
  }

  const len = chars.length - 1;
  let out = "";
  for (let i = -1; ++i < size; ) {
    out += chars[int(0, len)];
  }
  return out;
}

/** 数学表达式结果 */
export interface MathExprResult {
  /** 正确答案文本 */
  text: string;
  /** 展示用算式 */
  equation: string;
}

/**
 * 生成随机数学表达式
 * @param min 运算数下限，默认 1
 * @param max 运算数上限，默认 9
 * @param operator 运算符号，默认 "+"；"+-" 随机加减
 */
export function mathExpr(min?: number, max?: number, operator?: string): MathExprResult {
  const mn = min ?? 1;
  const mx = max ?? 9;
  const op = operator ?? "+";
  const left = int(mn, mx);
  const right = int(mn, mx);

  switch (op) {
    case "+":
      return {
        text: (left + right).toString(),
        equation: `${left}+${right}`,
      };
    case "-": {
      // 交换两数保证结果非负，避免用户输入带负号的答案
      const [a, b] = left >= right ? [left, right] : [right, left];
      return {
        text: (a - b).toString(),
        equation: `${a}-${b}`,
      };
    }
    default:
      return int(1, 2) % 2
        ? { text: (left + right).toString(), equation: `${left}+${right}` }
        : (() => {
            const [a, b] = left >= right ? [left, right] : [right, left];
            return {
              text: (a - b).toString(),
              equation: `${a}-${b}`,
            };
          })();
  }
}
