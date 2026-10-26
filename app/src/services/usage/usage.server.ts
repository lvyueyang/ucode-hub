/**
 * 用量域服务层：中继模型调用的落库、管理端分页查询与按需汇总。
 *
 * 写入来自模型端点（`server/routes/v1/**`），读侧供管理端用量页与（后续）前台「我的用量」；
 * 归属按 `accountType` + `accountId` 多态记录（同 device），账号名与设备名在查询时批量补齐，
 * 不做外键——账号或设备被删后历史用量仍要能读。
 *
 * 汇总与列表必须共用同一套筛选条件（`buildUsageWhere`），否则页头卡片与下方列表会各说各话。
 */
import { toDayRange } from "@ucode/hub-lib/date-format";
import { and, eq, gte, ilike, inArray, lt, type SQL, sql } from "drizzle-orm";

import { db } from "#/db";
import { adminUser, clientUser, device, type ModelUsageStatus, modelUsage } from "#/db/schema";
import {
  buildSortClause,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  executePaginatedQuery,
  extractRows,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type { PaginatedResult, SortOrder } from "#/types/query";
import type { UserRef, UserType } from "#/types/user";

export type ModelUsageRecord = typeof modelUsage.$inferSelect;

/** 上游 usage 摘要：上游没回 usage 时三项均为 null */
export type UsageTokens = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/** 记一次调用的入参（失败也记，`status` 区分） */
export type RecordUsageInput = UsageTokens & {
  /** 归属账号：设备令牌调用记设备属主，网页会话调用记本人 */
  accountType: UserType;
  accountId: string;
  deviceId?: string | null;
  model: string;
  providerId: string;
  latencyMs: number;
  status: ModelUsageStatus;
  /** 失败摘要，成功不传 */
  errorMessage?: string | null;
};

/** 用量筛选条件（列表与汇总共用） */
export type UsageFilter = {
  accountType?: UserType;
  accountId?: string;
  deviceId?: string;
  /** 模型按模糊匹配：管理员多按厂商前缀找（如 `deepseek`） */
  model?: string;
  status?: ModelUsageStatus;
  /** 按业务时区解析的日期区间，闭区间含当日 */
  startDate?: string;
  endDate?: string;
};

export type UsageListParams = UsageFilter & {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: SortOrder;
};

export type UsageTotalsParams = UsageFilter;

/** 列表行：在记录上补账号名与设备名，供表格直接渲染 */
export type ModelUsageListItem = ModelUsageRecord & {
  accountName: string | null;
  deviceName: string | null;
};

/** 汇总结果：请求数、失败数、token 合计与平均耗时 */
export type UsageTotals = {
  requests: number;
  errorRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
};

/** 错误摘要列宽上限（varchar(500)）：超长截断，避免插入失败丢掉整行用量 */
const ERROR_MESSAGE_MAX = 500;

/** 排序字段白名单：不放进来的字段一律回落到默认列，避免非法字段进 SQL */
const SORT_FIELDS = {
  createdAt: modelUsage.createdAt,
  latencyMs: modelUsage.latencyMs,
  totalTokens: modelUsage.totalTokens,
} as const;

const toNullableText = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text.slice(0, ERROR_MESSAGE_MAX) : null;
};

/**
 * 落库一行用量。
 * @throws 数据库错误（调用方一律 fire-and-forget 并自行兜底，不能因为记账失败影响已返回的响应）
 */
export const recordUsage = async (input: RecordUsageInput): Promise<void> => {
  await db.insert(modelUsage).values({
    accountType: input.accountType,
    accountId: input.accountId,
    deviceId: input.deviceId ?? null,
    model: input.model.slice(0, 120),
    providerId: input.providerId.slice(0, 64),
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    latencyMs: input.latencyMs,
    status: input.status,
    errorMessage: toNullableText(input.errorMessage),
  });
};

/** 构建筛选条件（列表与汇总共用同一份，避免两处口径漂移） */
const buildUsageWhere = (filter: UsageFilter): SQL | undefined => {
  const conditions: SQL[] = [];
  if (filter.accountType) conditions.push(eq(modelUsage.accountType, filter.accountType));
  if (filter.accountId) conditions.push(eq(modelUsage.accountId, filter.accountId));
  if (filter.deviceId) conditions.push(eq(modelUsage.deviceId, filter.deviceId));
  if (filter.model) conditions.push(ilike(modelUsage.model, `%${filter.model}%`));
  if (filter.status) conditions.push(eq(modelUsage.status, filter.status));
  if (filter.startDate) {
    conditions.push(gte(modelUsage.createdAt, toDayRange(filter.startDate).start));
  }
  if (filter.endDate) {
    // endDate 含当日全天：排他上界为次日 00:00
    conditions.push(lt(modelUsage.createdAt, toDayRange(filter.endDate).end));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
};

/** 批量取账号名（两种用户表各查一次）：返回 `类型:ID` → 用户名 */
const loadAccountNames = async (rows: ModelUsageRecord[]): Promise<Map<string, string>> => {
  const adminIds = rows.filter((r) => r.accountType === "admin").map((r) => r.accountId);
  const clientIds = rows.filter((r) => r.accountType === "client").map((r) => r.accountId);
  const names = new Map<string, string>();

  if (adminIds.length > 0) {
    const found = await db
      .select({ id: adminUser.id, username: adminUser.username })
      .from(adminUser)
      .where(inArray(adminUser.id, adminIds));
    for (const row of found) names.set(`admin:${row.id}`, row.username);
  }
  if (clientIds.length > 0) {
    const found = await db
      .select({ id: clientUser.id, username: clientUser.username })
      .from(clientUser)
      .where(inArray(clientUser.id, clientIds));
    for (const row of found) names.set(`client:${row.id}`, row.username);
  }
  return names;
};

/** 批量取设备名：设备被软删也要给名字（历史用量的归属仍要可读） */
const loadDeviceNames = async (rows: ModelUsageRecord[]): Promise<Map<string, string>> => {
  const ids = rows.map((r) => r.deviceId).filter((id): id is string => id !== null);
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: device.id, name: device.name })
    .from(device)
    .where(inArray(device.id, ids));
  return new Map(found.map((row) => [row.id, row.name]));
};

/** 补齐账号名与设备名 */
const decorateUsage = async (rows: ModelUsageRecord[]): Promise<ModelUsageListItem[]> => {
  const [accountNames, deviceNames] = await Promise.all([
    loadAccountNames(rows),
    loadDeviceNames(rows),
  ]);
  return rows.map((row) => ({
    ...row,
    accountName: accountNames.get(`${row.accountType}:${row.accountId}`) ?? null,
    deviceName: row.deviceId ? (deviceNames.get(row.deviceId) ?? null) : null,
  }));
};

/** 管理端用量列表：分页 + 账号 / 设备 / 模型 / 时间段筛选 */
export const listUsageForAdmin = async (
  params: UsageListParams,
): Promise<PaginatedResult<ModelUsageListItem>> => {
  const page = params.page ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const where = buildUsageWhere(params);

  const result = await executePaginatedQuery(
    db
      .select()
      .from(modelUsage)
      .where(where)
      .orderBy(buildSortClause(SORT_FIELDS, params.sortField, params.sortOrder, "createdAt"))
      .limit(pageSize)
      .offset(paginationOffset(page, pageSize)),
    db.$count(db.select().from(modelUsage).where(where)),
    page,
    pageSize,
  );

  return { ...result, records: await decorateUsage(result.records) };
};

/**
 * 汇总一行：token 与耗时交给库侧聚合，不把明细拉进内存。
 * 聚合走原生 SQL（与埋点 / 操作日志分析同口径）：标准 query builder 表达不了
 * `COUNT(*) FILTER (...)` 与多列一次算完；求和列为 bigint、平均为 numeric，驱动都回字符串，统一在此转数字。
 */
const sumUsage = async (where: SQL | undefined): Promise<UsageTotals> => {
  const filter = where ? sql` WHERE ${where}` : sql``;
  const result = await db.execute(sql`
		SELECT COUNT(*)::int AS requests,
		       COUNT(*) FILTER (WHERE ${modelUsage.status} = 'error')::int AS error_requests,
		       COALESCE(SUM(${modelUsage.promptTokens}), 0)::bigint AS prompt_tokens,
		       COALESCE(SUM(${modelUsage.completionTokens}), 0)::bigint AS completion_tokens,
		       COALESCE(SUM(${modelUsage.totalTokens}), 0)::bigint AS total_tokens,
		       COALESCE(AVG(${modelUsage.latencyMs}), 0)::float8 AS avg_latency_ms
		  FROM ${modelUsage}${filter}
	`);
  const row = extractRows<{
    requests: number;
    error_requests: number;
    prompt_tokens: string;
    completion_tokens: string;
    total_tokens: string;
    avg_latency_ms: string | number;
  }>(result)[0];

  return {
    requests: Number(row?.requests ?? 0),
    errorRequests: Number(row?.error_requests ?? 0),
    promptTokens: Number(row?.prompt_tokens ?? 0),
    completionTokens: Number(row?.completion_tokens ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    // 平均耗时取整到毫秒：小数没有展示价值，前端也不必再格式化
    avgLatencyMs: Math.round(Number(row?.avg_latency_ms ?? 0)),
  };
};

/** 管理端用量汇总：与列表同一套筛选（页头卡片必须与下方列表同口径） */
export const usageTotalsForAdmin = async (params: UsageTotalsParams): Promise<UsageTotals> =>
  sumUsage(buildUsageWhere(params));

/** 某账号自己的用量汇总（前台「我的用量」用；账号类型与 id 由属主身份固定，不取调用方传入） */
export const usageTotalsForOwner = async (
  owner: UserRef,
  params: UsageTotalsParams = {},
): Promise<UsageTotals> =>
  sumUsage(buildUsageWhere({ ...params, accountType: owner.type, accountId: owner.id }));
