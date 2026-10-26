/**
 * 错误处理工具：日志脱敏 + 客户端错误归一化 + 错误分类
 */

/** 生产环境未知错误兜底文案（客户端据此识别系统错误） */
export const CLIENT_ERROR_FALLBACK_MESSAGE = "服务器内部错误，请稍后重试";

/** 客户端可见错误的分类：鉴权 / 校验 / 业务 / 系统 */
export type ClientErrorKind = "auth" | "validation" | "business" | "internal";

/**
 * 归类错误（不含 auth：鉴权类需依据各端 AdminAuthError / ClientAuthError 判定，由 app 层覆盖）
 * - validation：校验错误
 * - business：含中文文案（本项目约定 UI 文案均为简体中文）
 * - internal：其余技术错误（SQL/堆栈/英文/未知）
 */
export function classifyError(
  error: unknown,
): Extract<ClientErrorKind, "validation" | "business" | "internal"> {
  if (extractValidationMessage(error) !== null) return "validation";
  if (error instanceof Error && isUserFacingMessage(error.message)) {
    return "business";
  }
  return "internal";
}

/**
 * 错误边界可展示给终端用户的文案
 * - 业务 / 校验 / 鉴权错误：返回服务端归一化文案（已剥离 SFn 元信息后缀）
 * - 系统级错误（SQL / 堆栈 / 英文技术报错 / 未知）：返回 null，由调用方渲染本地化兜底文案，
 *   避免把内部细节透出给用户
 * 分类优先取服务端随消息携带的 kind（权威），缺失时退回按文案内容判定
 */
export function getDisplayErrorMessage(error: unknown): string | null {
  const { message, kind } = parseSfnErrorMeta(getErrorMessage(error, ""));
  const effectiveKind = kind ?? classifyError(error);
  if (effectiveKind === "internal") return null;
  // 校验错误的首条 issue 文案不在 message 上，需单独提取
  const text = extractValidationMessage(error) ?? message;
  return text || null;
}

/** 随错误消息传输的元信息（类型 / 请求号 / SFn 可读方法名） */
export interface SfnErrorMetaInfo {
  /** 错误分类（供客户端识别系统错误） */
  kind?: ClientErrorKind;
  /** 请求关联 ID */
  requestId?: string;
  /** SFn 可读方法名（服务端 serverFnMeta.name） */
  sfnName?: string;
}

/** 错误类型的中文标签：随消息传输并解析回分类 */
const KIND_LABELS: Record<ClientErrorKind, string> = {
  auth: "鉴权",
  validation: "校验",
  business: "业务",
  internal: "系统",
};
const KIND_LABEL_TO_KIND: Record<string, ClientErrorKind> = Object.fromEntries(
  Object.entries(KIND_LABELS).map(([kind, label]) => [label, kind]),
) as Record<string, ClientErrorKind>;

/** 元信息后缀：末尾成对中文括号，内容须含「类型：/请求号：/SFn：」标记，避免误伤业务文案括号 */
const META_SUFFIX_RE = /（([^（）]*)）\s*$/;
const KIND_PREFIX = "类型：";
const REQUEST_ID_PREFIX = "请求号：";
const SFN_NAME_PREFIX = "SFn：";
const META_PART_SEP = "；";

/**
 * 将错误类型 / 请求号 / SFn 方法名以人类可读后缀追加到消息末尾
 * （框架 ShallowErrorPlugin 仅序列化 Error 的 message，自定义属性无法过界）
 * 无有效字段时原样返回
 */
export function appendSfnErrorMeta(message: string, meta: SfnErrorMetaInfo): string {
  const parts: string[] = [];
  if (meta.kind) parts.push(`${KIND_PREFIX}${KIND_LABELS[meta.kind]}`);
  if (meta.requestId) parts.push(`${REQUEST_ID_PREFIX}${meta.requestId}`);
  if (meta.sfnName) parts.push(`${SFN_NAME_PREFIX}${meta.sfnName}`);
  if (parts.length === 0) return message;
  return `${message}（${parts.join(META_PART_SEP)}）`;
}

/** 解析消息末尾的元信息后缀，返回剥离后的消息与解析出的字段；无该后缀时原样返回 */
export function parseSfnErrorMeta(message: string): {
  message: string;
  kind?: ClientErrorKind;
  requestId?: string;
  sfnName?: string;
} {
  const match = META_SUFFIX_RE.exec(message);
  if (!match) return { message };

  const content = match[1];
  if (
    !content.includes(KIND_PREFIX) &&
    !content.includes(REQUEST_ID_PREFIX) &&
    !content.includes(SFN_NAME_PREFIX)
  ) {
    return { message };
  }

  const parsed: {
    message: string;
    kind?: ClientErrorKind;
    requestId?: string;
    sfnName?: string;
  } = { message: message.slice(0, match.index).trim() };
  for (const part of content.split(META_PART_SEP)) {
    if (part.startsWith(KIND_PREFIX)) {
      parsed.kind = KIND_LABEL_TO_KIND[part.slice(KIND_PREFIX.length)];
    } else if (part.startsWith(REQUEST_ID_PREFIX)) {
      parsed.requestId = part.slice(REQUEST_ID_PREFIX.length);
    } else if (part.startsWith(SFN_NAME_PREFIX)) {
      parsed.sfnName = part.slice(SFN_NAME_PREFIX.length);
    }
  }
  return parsed;
}

/** 仅剥离元信息后缀，返回面向用户的消息 */
export function stripSfnErrorMeta(message: string): string {
  return parseSfnErrorMeta(message).message;
}

/**
 * 归一化抛给客户端的错误，保证 err.message 始终为「业务文案 / 校验文案 / 兜底文案」之一
 * - 校验错误（StandardSchema issues / ZodError）→ "参数校验失败：{首条 issue}"
 * - 业务错误（含中文文案，本项目约定 UI 文案均为简体中文）→ 原样透传
 * - 其他技术错误（SQL/堆栈/英文）→ 生产环境兜底，开发环境保留原样便于排查
 * - 非 Error 抛出值（如 TanStack 重定向对象）→ 原样透传
 * @param error 任意抛出值
 * @param isProd 是否生产环境
 */
export function toClientError(error: unknown, isProd: boolean): unknown {
  const validationMessage = extractValidationMessage(error);
  if (validationMessage !== null) {
    return new Error(`参数校验失败：${validationMessage}`);
  }

  if (error instanceof Error) {
    // 开发环境保留原始错误（含堆栈细节），生产环境仅透传业务文案
    if (!isProd) return error;
    if (isUserFacingMessage(error.message)) return error;
    return new Error(CLIENT_ERROR_FALLBACK_MESSAGE);
  }

  return error;
}

/**
 * 从任意抛出值提取错误消息，缺失时返回兜底文案
 * 兼容 Error 实例、带 message 的对象与字符串；纯函数，不读取环境
 * @param error 任意抛出值
 * @param fallback 无法提取时的兜底文案
 */
export function getErrorMessage(error: unknown, fallback = "未知错误"): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    return message || fallback;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}

/**
 * 从校验错误中提取首条 issue 文案，非校验错误返回 null
 * 兼容两种形态：StandardSchema 返回的 issues 数组、TanStack 将 issues JSON 序列化后抛出的 Error
 */
function extractValidationMessage(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "issues" in error) {
    const issues = (error as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issueToMessage(issues[0]);
    }
  }

  if (error instanceof Error) {
    try {
      const parsed: unknown = JSON.parse(error.message);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return issueToMessage(parsed[0]);
      }
    } catch {
      // 非 JSON 消息，忽略
    }
  }

  return null;
}

/** 提取单条 issue 的 message 字段 */
function issueToMessage(issue: unknown): string {
  if (typeof issue === "object" && issue !== null && "message" in issue) {
    const message = (issue as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "输入参数不合法";
}

/** 判断是否为面向用户的业务文案：包含中文字符即视为业务文案 */
function isUserFacingMessage(message: string): boolean {
  return /[\u4e00-\u9fff]/.test(message);
}

/** 需要在日志中脱敏的敏感字段 */
const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/"token"\s*:\s*"[^"]+"/gi, '"token":"***REDACTED***"'],
  [/"password"\s*:\s*"[^"]+"/gi, '"password":"***REDACTED***"'],
  [/'token'\s*:\s*'[^']+'/gi, "'token':'***REDACTED***'"],
  [/'password'\s*:\s*'[^']+'/gi, "'password':'***REDACTED***'"],
  [/Bearer\s+[^\s"]+/gi, "Bearer ***REDACTED***"],
  [/secret[=:]\s*\S+/gi, "secret=***REDACTED***"],
];

/** 递归脱敏的最大深度：防止 error.cause 循环引用导致无限递归 */
const MAX_CAUSE_DEPTH = 10;

/** 对单个字符串应用全部敏感模式脱敏 */
function redactSensitive(text: string): string {
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/**
 * 对错误对象进行脱敏处理
 * 移除 password / token / secret 等敏感信息；仅开发环境输出 stack trace
 * @param error 任意抛出值
 * @param isDev 是否开发环境（必填：由宿主注入，本模块不读取运行环境，避免漏传导致排查信息静默丢失）
 */
export function sanitizeError(error: unknown, isDev: boolean): Record<string, unknown> {
  return sanitizeErrorInternal(error, new WeakSet<object>(), 0, isDev);
}

/** 内部递归实现：seen 记录已访问的对象，避免 cause 成环 */
function sanitizeErrorInternal(
  error: unknown,
  seen: WeakSet<object>,
  depth: number,
  isDev: boolean,
): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  // 同一 Error 再次出现或超出深度上限时截断，防止日志路径无限递归掩盖原始错误
  if (depth >= MAX_CAUSE_DEPTH || seen.has(error)) {
    return { name: error.name, message: "[cause 循环或过深，已截断]" };
  }
  seen.add(error);

  let message = error.message;
  let stack = error.stack;

  message = redactSensitive(message);
  if (stack) stack = redactSensitive(stack);

  const result: Record<string, unknown> = {
    name: error.name,
    message,
  };

  if (isDev) {
    result.stack = stack;
  }

  if (error.cause !== undefined) {
    result.cause = sanitizeCause(error.cause, seen, depth + 1, isDev);
  }

  return result;
}

/**
 * 递归脱敏 cause：Error 走错误脱敏，任意对象/数组/字符串逐层应用脱敏规则
 * 避免非 Error 的 cause（如 fetch/axios 错误对象）原样落库绕过脱敏
 */
function sanitizeCause(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  isDev: boolean,
): unknown {
  if (value instanceof Error) {
    return sanitizeErrorInternal(value, seen, depth, isDev);
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return redactSensitive(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (typeof value === "object") {
    if (depth >= MAX_CAUSE_DEPTH || seen.has(value)) {
      return "[cause 循环或过深，已截断]";
    }
    seen.add(value);
    // 内置对象保留原样，避免破坏结构
    if (value instanceof Date || value instanceof RegExp || value instanceof URL) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeCause(item, seen, depth + 1, isDev));
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = sanitizeCause(item, seen, depth + 1, isDev);
    }
    return out;
  }
  // function / symbol 等不可序列化类型
  return String(value);
}
