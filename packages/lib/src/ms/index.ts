/**
 * 时间字符串与毫秒数互转工具
 * 源码来自 https://github.com/vercel/ms (v3)：实现与注释保持与上游一致，便于后续按版本对齐
 */
const s = 1000;
const m = s * 60;
const h = m * 60;
const d = h * 24;
const w = d * 7;
const y = d * 365.25;
const mo = y / 12;

type Years = "years" | "year" | "yrs" | "yr" | "y";
type Months = "months" | "month" | "mo";
type Weeks = "weeks" | "week" | "w";
type Days = "days" | "day" | "d";
type Hours = "hours" | "hour" | "hrs" | "hr" | "h";
type Minutes = "minutes" | "minute" | "mins" | "min" | "m";
type Seconds = "seconds" | "second" | "secs" | "sec" | "s";
type Milliseconds = "milliseconds" | "millisecond" | "msecs" | "msec" | "ms";
type Unit = Years | Months | Weeks | Days | Hours | Minutes | Seconds | Milliseconds;

type UnitAnyCase = Capitalize<Unit> | Uppercase<Unit> | Unit;

export type StringValue = `${number}` | `${number}${UnitAnyCase}` | `${number} ${UnitAnyCase}`;

interface Options {
  /**
   * 设为 true 使用长格式，默认 false
   */
  long?: boolean;
}

/**
 * 解析时间字符串为毫秒数或格式化毫秒数为字符串
 */
export function ms(value: StringValue, options?: Options): number;
export function ms(value: number, options?: Options): string;
export function ms(value: StringValue | number, options?: Options): number | string {
  if (typeof value === "string") {
    return parse(value);
  }
  if (typeof value === "number") {
    return format(value, options);
  }
  throw new Error(
    `Value provided to ms() must be a string or number. value=${JSON.stringify(value)}`,
  );
}

/**
 * 解析时间字符串为毫秒数
 * 无法解析时返回 NaN
 */
export function parse(str: string): number {
  if (typeof str !== "string" || str.length === 0 || str.length > 100) {
    throw new Error(
      `Value provided to ms.parse() must be a string with length between 1 and 99. value=${JSON.stringify(str)}`,
    );
  }
  const match =
    /^(?<value>-?\d*\.?\d+) *(?<unit>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)?$/i.exec(
      str,
    );

  if (!match?.groups) {
    return NaN;
  }

  const { value, unit = "ms" } = match.groups as {
    value: string;
    unit: string | undefined;
  };

  const n = parseFloat(value);

  const matchUnit = unit.toLowerCase() as Lowercase<Unit>;

  switch (matchUnit) {
    case "years":
    case "year":
    case "yrs":
    case "yr":
    case "y":
      return n * y;
    case "months":
    case "month":
    case "mo":
      return n * mo;
    case "weeks":
    case "week":
    case "w":
      return n * w;
    case "days":
    case "day":
    case "d":
      return n * d;
    case "hours":
    case "hour":
    case "hrs":
    case "hr":
    case "h":
      return n * h;
    case "minutes":
    case "minute":
    case "mins":
    case "min":
    case "m":
      return n * m;
    case "seconds":
    case "second":
    case "secs":
    case "sec":
    case "s":
      return n * s;
    case "milliseconds":
    case "millisecond":
    case "msecs":
    case "msec":
    case "ms":
      return n;
    default:
      matchUnit satisfies never;
      throw new Error(
        `Unknown unit "${matchUnit}" provided to ms.parse(). value=${JSON.stringify(str)}`,
      );
  }
}

/**
 * 类型安全的解析函数，仅接受 StringValue 类型
 */
export function parseStrict(value: StringValue): number {
  return parse(value);
}

/**
 * 短格式
 */
function fmtShort(msValue: number): StringValue {
  const msAbs = Math.abs(msValue);
  if (msAbs >= y) {
    return `${Math.round(msValue / y)}y`;
  }
  if (msAbs >= mo) {
    return `${Math.round(msValue / mo)}mo`;
  }
  if (msAbs >= w) {
    return `${Math.round(msValue / w)}w`;
  }
  if (msAbs >= d) {
    return `${Math.round(msValue / d)}d`;
  }
  if (msAbs >= h) {
    return `${Math.round(msValue / h)}h`;
  }
  if (msAbs >= m) {
    return `${Math.round(msValue / m)}m`;
  }
  if (msAbs >= s) {
    return `${Math.round(msValue / s)}s`;
  }
  return `${msValue}ms`;
}

/**
 * 长格式
 */
function fmtLong(msValue: number): StringValue {
  const msAbs = Math.abs(msValue);
  if (msAbs >= y) {
    return plural(msValue, msAbs, y, "year");
  }
  if (msAbs >= mo) {
    return plural(msValue, msAbs, mo, "month");
  }
  if (msAbs >= w) {
    return plural(msValue, msAbs, w, "week");
  }
  if (msAbs >= d) {
    return plural(msValue, msAbs, d, "day");
  }
  if (msAbs >= h) {
    return plural(msValue, msAbs, h, "hour");
  }
  if (msAbs >= m) {
    return plural(msValue, msAbs, m, "minute");
  }
  if (msAbs >= s) {
    return plural(msValue, msAbs, s, "second");
  }
  return `${msValue} ms`;
}

/**
 * 格式化毫秒数为时间字符串
 */
export function format(msValue: number, options?: Options): string {
  if (typeof msValue !== "number" || !Number.isFinite(msValue)) {
    throw new Error("Value provided to ms.format() must be of type number.");
  }

  return options?.long ? fmtLong(msValue) : fmtShort(msValue);
}

/**
 * 复数辅助函数
 */
function plural(msValue: number, msAbs: number, n: number, name: string): StringValue {
  const isPlural = msAbs >= n * 1.5;
  return `${Math.round(msValue / n)} ${name}${isPlural ? "s" : ""}` as StringValue;
}
