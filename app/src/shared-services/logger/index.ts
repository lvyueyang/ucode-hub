/**
 * 日志模块（shared-services）：pino 工厂 + 应用级单例
 * createLogger 工厂参数由宿主应用显式传入（不读环境变量，不设默认值）；
 * logger 单例配置取自 env 模块，mixin 自动注入 requestId 与操作者身份实现链路追踪
 * 不使用 pino transport（pino-roll），避免 ESM 打包后 __dirname 未定义问题
 * 开发环境使用 pino-pretty 作为 Transform Stream 美化控制台输出
 */
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { toDateString } from "@ucode/hub-lib/date-format";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { env } from "#/env";
import { getRequestContext } from "#/shared-services/request-context";

/** 日志实例创建选项 */
export interface LoggerOptions {
  /** 日志级别 */
  level: string;
  /** 存储目录（logs 子目录位于其下），由宿主应用传入 */
  storageDir: string;
  /** 生产环境标志 */
  isProd: boolean;
  /**
   * 每条日志自动合并的附加字段（如 requestId），由宿主注入以解耦模块与请求上下文
   * 无附加字段时返回空对象
   */
  mixin?: () => Record<string, unknown>;
}

/** pino 日志实例类型 */
export type Logger = pino.Logger;

/** 获取当前日期的日志文件名（按业务统一时区切割） */
function getLogDate(): string {
  return toDateString(new Date());
}

/**
 * 创建 pino 日志实例：文件按天切割 + 控制台输出（开发环境 pino-pretty 美化）
 */
export function createLogger(opts: LoggerOptions): Logger {
  const { level, storageDir, isProd, mixin } = opts;

  const logDir = join(storageDir, "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logFile = join(logDir, `${getLogDate()}.log`);
  const fileStream = createWriteStream(logFile, { flags: "a" });

  /** 开发环境美化控制台输出 */
  const stdoutStream = isProd
    ? process.stdout
    : pinoPretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        destination: process.stdout,
      });

  return pino(
    { level, mixin },
    pino.multistream([
      // 文件流跟随配置级别：LOG_LEVEL=debug 时 debug 需落盘，否则排障链路（如外部调用成功记 debug）在文件中不可见
      { stream: fileStream, level },
      // 控制台仍按环境收窄：生产仅输出 warn 以上，避免高频日志刷屏
      {
        stream: stdoutStream,
        level: isProd ? "warn" : "info",
      },
    ]),
  );
}

/** 应用级默认日志实例：配置取自 env，mixin 注入 requestId 与操作者身份实现链路追踪 */
export const logger = createLogger({
  level: env.logLevel,
  storageDir: env.storageDir,
  isProd: env.isProduction,
  mixin: () => {
    const ctx = getRequestContext();
    if (!ctx) return {};
    const fields: Record<string, unknown> = {};
    if (ctx.requestId) fields.requestId = ctx.requestId;
    // 操作者身份随请求上下文注入，使每条日志可归属到具体用户
    if (ctx.operator) {
      if (ctx.operator.id) fields.operatorId = ctx.operator.id;
      if (ctx.operator.username) fields.operatorName = ctx.operator.username;
      fields.operatorType = ctx.operator.type;
    }
    return fields;
  },
});
