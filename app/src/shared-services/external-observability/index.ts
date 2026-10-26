/**
 * 外部系统调用可观测服务：记录对外部系统的调用日志与指标
 * 不走 operation_log（审计表只留用户操作，避免高频外部调用污染），改走
 * 「pino 结构化日志 + Prometheus 指标」——指标对成功/失败均计数与计时；
 * 日志成功记 debug、失败记 warn（携带 requestId 与操作者，便于按链路排障）。
 * 注意：默认 LOG_LEVEL=info 下成功日志被过滤，成功调用仅体现为指标，需 LOG_LEVEL=debug 才落成功日志。
 * 响应体内容不入库，仅记录 responseSize
 */
import { logger } from "#/shared-services/logger";
import { externalCallDurationSeconds, externalCallsTotal } from "#/shared-services/metrics";
import { getRequestId, getRequestOperator } from "#/shared-services/request-context";

/** 外部系统调用日志输入参数 */
export interface ExternalRequestLogInput {
  /** 外部系统标识（调用方传入自身系统代号） */
  system: string;
  /** 请求类型：登录或业务请求 */
  requestType: "login" | "business";
  /** 接口路径 */
  path: string;
  /** HTTP 方法 */
  method?: string;
  /** 请求耗时（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 响应状态码 */
  status?: number;
  /** 响应体大小（字节） */
  responseSize?: number;
  /** 失败时的错误信息 */
  error?: string;
  /** 额外元数据（接口代号/业务标识等），不含请求/响应体 */
  extra?: Record<string, unknown>;
}

/**
 * 记录一次外部系统调用：写 pino 诊断日志（成功 debug / 失败 warn）+ Prometheus 指标
 * 操作者身份从 ALS 读取（鉴权中间件注入），无上下文记 system
 */
export function logExternalRequest(input: ExternalRequestLogInput): void {
  const op = getRequestOperator();
  const outcome = input.success ? "success" : "error";
  // 指标：外部调用计数 + 耗时直方图
  externalCallsTotal.inc({ system: input.system, outcome });
  externalCallDurationSeconds.observe(input.duration / 1000, {
    system: input.system,
  });
  // 诊断日志：成功 debug / 失败 warn（携带链路与操作者，便于排障串联）
  const logFields = {
    system: input.system,
    requestType: input.requestType,
    path: input.path,
    method: input.method,
    duration: input.duration,
    status: input.status,
    responseSize: input.responseSize,
    error: input.error,
    operatorId: op.id,
    operatorName: op.username,
    operatorType: op.type,
    requestId: getRequestId(),
    ...input.extra,
  };
  if (input.success) {
    logger.debug(logFields, `外部系统调用成功 ${input.system}`);
  } else {
    logger.warn(logFields, `外部系统调用失败 ${input.system}`);
  }
}

/**
 * 是否为消费方主动取消（AbortSignal / SDK 取消），此类中断不属上游故障
 * 建流阶段与流内阶段的计数口径共用本判定，避免两处漂移
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * 观测流式外部调用：包装异步流后返回。
 * 单次 logExternalRequest 只能覆盖「请求已发出」这一时点，对流式响应而言既测不到真实耗时、
 * 也漏掉流内失败，故按流生命周期收口：
 * - 迭代自然结束 → 记成功，duration 为整段流耗时
 * - 流内抛错 → 记失败并原样抛出
 * - 消费方中途放弃（客户端断开）→ 不记结果，避免把取消计入失败率
 * @param stream 上游返回的异步流
 * @param input 除 duration / success / error 外的日志字段（由本函数补齐）
 */
export async function* observeExternalStream<T>(
  stream: AsyncIterable<T>,
  input: Omit<ExternalRequestLogInput, "duration" | "success" | "error">,
): AsyncGenerator<T> {
  const startedAt = Date.now();
  try {
    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (err) {
    if (!isAbortError(err)) {
      logExternalRequest({
        ...input,
        duration: Date.now() - startedAt,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
  logExternalRequest({
    ...input,
    duration: Date.now() - startedAt,
    success: true,
  });
}
