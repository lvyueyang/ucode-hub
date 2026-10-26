/**
 * 操作日志服务层：内存缓冲批量写入 + 分页查询
 * logOperation 为 fire-and-forget 调用，5 秒或满 100 条时批量 INSERT
 * 仅承载用户操作审计（CRUD / 登录 / 注册等）；外部系统调用可观测见 shared-services/external-observability
 */

import { BatchWriter, type BatchWriterEvent } from "@ucode/hub-lib/batch-writer";
import { toDayRange } from "@ucode/hub-lib/date-format";
import { and, eq, gte, ilike, lt, or, type SQLWrapper } from "drizzle-orm";
import { db } from "#/db/index";
import { type OperatorType, operationLog } from "#/db/schema";
import { logger } from "#/shared-services/logger";
import {
  buildSortClause,
  executePaginatedQuery,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import { getRequestContext } from "#/shared-services/request-context";
import type { PaginatedSortParams } from "#/types/query";

/** 操作日志输入参数 */
export interface OperationLogInput {
  operatorId: string | null;
  operatorName: string;
  /** 操作者类型，默认 admin（兼容历史调用） */
  operatorType?: OperatorType;
  /** 请求关联 ID，未显式传入时从 ALS 上下文捕获 */
  requestId?: string;
  module: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  detail?: Record<string, unknown>;
}

/** 操作日志查询参数 */
export interface OperationLogQuery extends PaginatedSortParams {
  module?: string;
  action?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

/** 操作日志查询结果 */
export interface OperationLogQueryResult {
  records: (typeof operationLog.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
}

/** 将 OperationLogInput 映射为数据库行 */
function toRow(item: OperationLogInput) {
  return {
    requestId: item.requestId ?? null,
    operatorId: item.operatorId,
    operatorName: item.operatorName,
    operatorType: item.operatorType ?? "admin",
    module: item.module,
    action: item.action,
    targetType: item.targetType,
    targetId: item.targetId ?? null,
    targetName: item.targetName ?? null,
    detail: item.detail ?? null,
  };
}

/** 包装 batch-writer 事件到 app 日志单例（warn → info 级别告警，error → error 级别） */
const logBatchEvent = (event: BatchWriterEvent): void => {
  if (event.level === "warn") {
    logger.warn(event.message);
  } else {
    logger.error(
      {
        error: event.error instanceof Error ? event.error.message : String(event.error),
      },
      event.message,
    );
  }
};

/** 审计日志缓冲（仅承载用户操作审计，外部系统调用改走 pino + 指标） */
const opLogWriter = new BatchWriter<OperationLogInput>({
  logLabel: "操作日志",
  onEvent: logBatchEvent,
  insertFn: async (batch) => {
    await db.insert(operationLog).values(batch.map(toRow));
  },
});

/** 追加操作日志到缓冲队列（同步返回，不阻塞业务） */
export function logOperation(params: OperationLogInput): void {
  opLogWriter.push({
    ...params,
    requestId: params.requestId ?? getRequestContext()?.requestId,
  });
}

/** CRUD 审计日志的操作用户（结构化入参，避免依赖中间件类型） */
export interface CrudLogOperator {
  id: string;
  username: string;
}

/** CRUD 审计日志目标 */
export interface CrudLogTarget {
  id?: string;
  name?: string | null;
}

/**
 * 写操作审计日志（fire-and-forget）
 * 将 SFn handler 中重复的操作人/模块/targetType 装配收敛为一行调用：
 * logCrud(context.user, "admin-role", "create", { id: result.id, name: result.name })
 */
export function logCrud(
  operator: CrudLogOperator,
  module: string,
  action: string,
  target?: CrudLogTarget,
  options?: {
    targetType?: string;
    detail?: Record<string, unknown>;
    /** 操作者类型，默认 admin；客户端自助操作传 "client" */
    operatorType?: OperatorType;
  },
): void {
  logOperation({
    operatorId: operator.id,
    operatorName: operator.username,
    operatorType: options?.operatorType,
    module,
    action,
    targetType: options?.targetType ?? module,
    targetId: target?.id,
    targetName: target?.name ?? undefined,
    detail: options?.detail,
  });
}

/** 强制刷新缓冲（用于服务关闭前兜底；失败仅记日志，不阻断优雅关闭） */
export async function flushOperationLogs(): Promise<void> {
  try {
    await opLogWriter.shutdown();
  } catch (err) {
    logger.error({ err }, "操作日志缓冲刷入失败（优雅关闭继续）");
  }
}

/** 分页查询操作日志 */
export async function searchOperationLogs(
  query?: OperationLogQuery,
): Promise<OperationLogQueryResult> {
  const {
    module,
    action,
    keyword,
    startDate,
    endDate,
    page = 1,
    pageSize = 20,
    sortField,
    sortOrder,
  } = query ?? {};

  const conditions: (SQLWrapper | undefined)[] = [];

  if (module) {
    conditions.push(eq(operationLog.module, module));
  }
  if (action) {
    conditions.push(eq(operationLog.action, action));
  }
  if (keyword) {
    conditions.push(
      or(
        ilike(operationLog.operatorName, `%${keyword}%`),
        ilike(operationLog.targetName, `%${keyword}%`),
        ilike(operationLog.module, `%${keyword}%`),
      ),
    );
  }
  if (startDate) {
    conditions.push(gte(operationLog.createdAt, toDayRange(startDate).start));
  }
  if (endDate) {
    // endDate 按业务时区包含当天全天：排他上界为次日 00:00
    conditions.push(lt(operationLog.createdAt, toDayRange(endDate).end));
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = paginationOffset(page, pageSize);

  const sortFieldMap = {
    createdAt: operationLog.createdAt,
  };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "createdAt");

  return executePaginatedQuery(
    db
      .select()
      .from(operationLog)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(operationLog).where(whereCondition)),
    page,
    pageSize,
  );
}

/** 获取已有的操作模块列表（供筛选下拉） */
export async function getOperationLogModules(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ module: operationLog.module })
    .from(operationLog)
    .orderBy(operationLog.module);
  return rows.map((r) => r.module);
}
