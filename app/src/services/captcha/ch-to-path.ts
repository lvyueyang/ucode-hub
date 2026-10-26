/**
 * 字符 → SVG path data 转换 + 路径扭曲
 */
import { font, options } from "./option-manager";

/** 路径命令节点 */
export interface PathCmd {
  type: string;
  x: number;
  y: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/** 字符转路径的上下文选项 */
export interface ChToPathOptions {
  x: number;
  y: number;
  fontSize: number;
  truncateLineProbability?: number;
  truncateCurveProbability?: number;
  truncateCurvePositionMin?: number;
  truncateCurvePositionMax?: number;
}

/** 对路径命令节点施加随机偏移，模拟手写抖动 */
function rndPathCmd(cmd: PathCmd): void {
  const r = Math.random() * 0.2 - 0.1;
  switch (cmd.type) {
    case "M":
    case "L":
      cmd.x += r;
      cmd.y += r;
      break;
    case "Q":
    case "C":
      cmd.x += r;
      cmd.y += r;
      if (cmd.x1 !== undefined) cmd.x1 += r;
      if (cmd.y1 !== undefined) cmd.y1 += r;
      break;
  }
}

/** 在二次贝塞尔曲线位置 position 处拆分为两条新曲线 */
function splitQuadraticBezier(
  position: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number[] {
  if (position <= 0 || position >= 1) {
    throw new RangeError(`position 必须位于 (0, 1) 开区间内，收到：${position}`);
  }
  const ret: number[] = [];
  const v1 = { x: x1, y: y1 };
  const v2 = { x: x2, y: y2 };
  const v3 = { x: x3, y: y3 };
  const c = position;
  ret.push(v1.x, v1.y);
  v1.x += (v2.x - v1.x) * c;
  v1.y += (v2.y - v1.y) * c;
  ret.push(v1.x, v1.y);
  v2.x += (v3.x - v2.x) * c;
  v2.y += (v3.y - v2.y) * c;
  ret.push(v1.x + (v2.x - v1.x) * c, v1.y + (v2.y - v1.y) * c);
  ret.push(v2.x, v2.y);
  ret.push(v3.x, v3.y);
  return ret;
}

/** 区间随机浮点数 */
function float(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * 随机化路径节点：在连续直线间插入断点，拆分贝塞尔曲线
 */
function randomizePathNodes(commands: PathCmd[], opts: ChToPathOptions): PathCmd[] {
  const result: PathCmd[] = [];
  const truncLine = opts.truncateLineProbability ?? options.truncateLineProbability;
  const truncCurve = opts.truncateCurveProbability ?? options.truncateCurveProbability;
  const posMin = opts.truncateCurvePositionMin ?? options.truncateCurvePositionMin;
  const posMax = opts.truncateCurvePositionMax ?? options.truncateCurvePositionMax;

  for (let i = 0; i < commands.length - 1; i++) {
    const cmd = commands[i];
    if (cmd.type === "L") {
      const next = commands[i + 1];
      if (next.type === "L" && Math.random() > truncLine) {
        const r = float(-0.1, 0.1);
        result.push(cmd);
        result.push({
          type: "L",
          x: (cmd.x + next.x) / 2 + r,
          y: (cmd.y + next.y) / 2 + r,
        });
      } else {
        result.push(cmd);
      }
    } else if (cmd.type === "Q" && i >= 1) {
      const prev = commands[i - 1];
      if ((prev.type === "L" || prev.type === "M") && Math.random() > truncCurve) {
        const r = float(-0.1, 0.1);
        const cpX = (cmd.x1 ?? 0) + r;
        const cpY = (cmd.y1 ?? 0) + r;
        const p1X = cmd.x + r;
        const p1Y = cmd.y + r;
        const newCurve = splitQuadraticBezier(
          float(posMin, posMax),
          prev.x,
          prev.y,
          cpX,
          cpY,
          p1X,
          p1Y,
        );
        result.push({
          type: "Q",
          x1: newCurve[2],
          y1: newCurve[3],
          x: newCurve[4],
          y: newCurve[5],
        });
        result.push({
          type: "L",
          x: newCurve[4],
          y: newCurve[5],
        });
        result.push({
          type: "Q",
          x1: newCurve[6],
          y1: newCurve[7],
          x: newCurve[8],
          y: newCurve[9],
        });
        result.push({
          type: "L",
          x: newCurve[8],
          y: newCurve[9],
        });
      }
    } else {
      result.push(cmd);
    }
  }
  return result;
}

/**
 * 将单个字符转为 SVG path data 字符串
 */
export default function chToPath(text: string, opts: ChToPathOptions): string {
  const ch = text[0];
  if (!ch) throw new Error("expect a non-empty string");

  const fontSize = opts.fontSize;
  const fontScale = fontSize / font.unitsPerEm;

  const glyph = font.charToGlyph(ch);
  const glyphWidth = glyph.advanceWidth ? glyph.advanceWidth * fontScale : 0;
  const left = opts.x - glyphWidth / 2;

  const glyphHeight = (options.ascender + options.descender) * fontScale;
  const top = opts.y + glyphHeight / 2;

  const path = glyph.getPath(left, top, fontSize);
  // 随机抖动每个路径节点
  (path.commands as unknown as PathCmd[]).forEach(rndPathCmd);
  // 随机化路径节点（截断直线、拆分曲线）
  path.commands = randomizePathNodes(
    path.commands as unknown as PathCmd[],
    opts,
  ) as unknown as typeof path.commands;

  return path.toPathData(2);
}
