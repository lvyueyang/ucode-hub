/**
 * 操作日志查询 Server Function
 */

import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { operationLogListSchema } from "#/shared-services/operation-log/operation-log.schemas";
import {
  getOperationLogModules,
  searchOperationLogs,
} from "#/shared-services/operation-log/operation-log.server";

/** JSON 可序列化的递归值类型 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 将可能为 Date 的值转为 ISO 字符串（可测试的核心逻辑） */
export function mapDateField(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** 分页查询操作日志（模块 / 动作 / 关键词 / 日期范围；分页与每页条数原样透传到服务层） */
export const searchOperationLogsSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .validator(operationLogListSchema)
  .handler(async ({ data }) => {
    const result = await searchOperationLogs(data);
    return {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      records: result.records.map((e) => ({
        id: e.id,
        operatorId: e.operatorId,
        operatorName: e.operatorName,
        module: e.module,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        targetName: e.targetName,
        detail: e.detail as JsonValue,
        createdAt: mapDateField(e.createdAt),
      })),
    };
  });

/** 获取操作模块列表 */
export const getOperationLogModulesSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.LOG_VIEW)])
  .handler(async () => {
    return getOperationLogModules();
  });
