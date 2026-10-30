/**
 * 设备域服务层：登记（含令牌轮换）、查询、改名、吊销、软删除，以及按令牌反查。
 *
 * 归属是 `ownerType` + `ownerId` 的多态写法（同 message），因此「限定属主」的操作一律走
 * `findOwnedDevice`：越权与不存在都报同一句中文文案，不泄露他人设备是否存在。
 * 在线态来自 `device.online` 的内存注册表，这里只负责把它拼进展示结构。
 */
import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, inArray, like, type SQL } from "drizzle-orm";

import { db } from "#/db";
import { adminUser, clientUser, type DeviceStatus, device } from "#/db/schema";
import {
  buildSortClause,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  executePaginatedQuery,
  notDeleted,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type { PaginatedResult, SortOrder } from "#/types/query";
import type { UserRef, UserType } from "#/types/user";

import { isDeviceOnline } from "./device.online";

export type DeviceRecord = typeof device.$inferSelect;

/** 前端与外部接口共用的展示结构：在线态来自内存，归属者名字按需补 */
export type DeviceListItem = {
  id: string;
  name: string;
  platform: string | null;
  clientVersion: string | null;
  status: DeviceStatus;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  ownerType: UserType;
  ownerId: string;
  ownerName: string | null;
};

export type DeviceListParams = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: DeviceStatus;
  ownerType?: UserType;
  sortField?: string;
  sortOrder?: SortOrder;
};

export type RegisterDeviceParams = {
  owner: UserRef;
  name: string;
  platform?: string;
  clientVersion?: string;
};

/** 设备令牌：256bit 随机，明文只在登记响应里回一次 */
const createDeviceToken = (): string => randomBytes(32).toString("base64url");

const hashDeviceToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** 排序字段白名单：不放进来的字段一律回落到默认列，避免非法字段进 SQL */
const SORT_FIELDS = {
  name: device.name,
  createdAt: device.createdAt,
  updatedAt: device.updatedAt,
  lastSeenAt: device.lastSeenAt,
} as const;

const toListItem = (row: DeviceRecord, ownerName: string | null = null): DeviceListItem => ({
  id: row.id,
  name: row.name,
  platform: row.platform,
  clientVersion: row.clientVersion,
  status: row.status,
  online: isDeviceOnline(row.id),
  lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
  ownerType: row.ownerType,
  ownerId: row.ownerId,
  ownerName,
});

/** 批量取归属者名字：两种用户表各查一次，返回 `类型:ID` → 名字 */
const ownerNamesOf = async (rows: DeviceRecord[]): Promise<Map<string, string>> => {
  const adminIds = rows.filter((row) => row.ownerType === "admin").map((row) => row.ownerId);
  const clientIds = rows.filter((row) => row.ownerType === "client").map((row) => row.ownerId);
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

const decorate = async (rows: DeviceRecord[]): Promise<DeviceListItem[]> => {
  const names = await ownerNamesOf(rows);
  return rows.map((row) => toListItem(row, names.get(`${row.ownerType}:${row.ownerId}`) ?? null));
};

/** 限定属主时按 `ownerType + ownerId` 收窄；越权与不存在同文案，避免泄露他人设备 */
const findOwnedDevice = async (id: string, owner?: UserRef): Promise<DeviceRecord> => {
  const conditions: SQL[] = [eq(device.id, id), notDeleted(device.deletedAt)];
  if (owner) {
    conditions.push(eq(device.ownerType, owner.type), eq(device.ownerId, owner.id));
  }

  const [row] = await db
    .select()
    .from(device)
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new Error("设备不存在或已被删除");
  return row;
};

/** 管理端列表：分页 + 关键词 / 状态 / 归属端筛选 */
export const listDevicesForAdmin = async (
  params: DeviceListParams,
): Promise<PaginatedResult<DeviceListItem>> => {
  const page = params.page ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

  const conditions: SQL[] = [notDeleted(device.deletedAt)];
  if (params.keyword) conditions.push(like(device.name, `%${params.keyword}%`));
  if (params.status) conditions.push(eq(device.status, params.status));
  if (params.ownerType) conditions.push(eq(device.ownerType, params.ownerType));
  const where = and(...conditions);

  const result = await executePaginatedQuery(
    db
      .select()
      .from(device)
      .where(where)
      .orderBy(buildSortClause(SORT_FIELDS, params.sortField, params.sortOrder, "createdAt"))
      .limit(pageSize)
      .offset(paginationOffset(page, pageSize)),
    db.$count(db.select().from(device).where(where)),
    page,
    pageSize,
  );

  return { ...result, records: await decorate(result.records) };
};

/** 前台与外部接口：某个用户名下的全部设备（量级小，不分页） */
export const listDevicesForOwner = async (owner: UserRef): Promise<DeviceListItem[]> => {
  const rows = await db
    .select()
    .from(device)
    .where(
      and(
        eq(device.ownerType, owner.type),
        eq(device.ownerId, owner.id),
        notDeleted(device.deletedAt),
      ),
    )
    .orderBy(desc(device.createdAt));
  return decorate(rows);
};

/**
 * 登记设备：同一用户名下同名设备视为同一台（重复登记只轮换令牌并刷新版本信息）；
 * 已吊销的设备重新登记即恢复可用。返回展示结构 + 明文令牌（此后不再可查）。
 */
export const registerDevice = async (
  params: RegisterDeviceParams,
): Promise<{ device: DeviceListItem; token: string }> => {
  const token = createDeviceToken();
  const values = {
    ownerType: params.owner.type,
    ownerId: params.owner.id,
    name: params.name,
    platform: params.platform ?? null,
    clientVersion: params.clientVersion ?? null,
    tokenHash: hashDeviceToken(token),
    status: "active" as DeviceStatus,
    revokedAt: null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select()
    .from(device)
    .where(
      and(
        eq(device.ownerType, params.owner.type),
        eq(device.ownerId, params.owner.id),
        eq(device.name, params.name),
        notDeleted(device.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(device)
      .set(values)
      .where(eq(device.id, existing.id))
      .returning();
    if (!updated) throw new Error("设备登记失败");
    return { device: toListItem(updated, null), token };
  }

  const [created] = await db.insert(device).values(values).returning();
  if (!created) throw new Error("设备登记失败");
  return { device: toListItem(created, null), token };
};

export const renameDevice = async (params: {
  id: string;
  name: string;
  owner?: UserRef;
}): Promise<DeviceListItem> => {
  const row = await findOwnedDevice(params.id, params.owner);
  const [updated] = await db
    .update(device)
    .set({ name: params.name, updatedAt: new Date() })
    .where(eq(device.id, row.id))
    .returning();
  if (!updated) throw new Error("设备改名失败");
  const [item] = await decorate([updated]);
  return item ?? toListItem(updated);
};

/** 吊销：令牌立即失效（隧道侧按 `status` 判定），记录保留给前台查看 */
export const revokeDevice = async (params: {
  id: string;
  owner?: UserRef;
}): Promise<DeviceListItem> => {
  const row = await findOwnedDevice(params.id, params.owner);
  const [updated] = await db
    .update(device)
    .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(device.id, row.id))
    .returning();
  if (!updated) throw new Error("设备吊销失败");
  const [item] = await decorate([updated]);
  return item ?? toListItem(updated);
};

/** 软删除：列表不再出现，令牌同样不可用（查询侧一律过滤 deleted） */
export const deleteDevice = async (params: { id: string; owner?: UserRef }): Promise<void> => {
  const row = await findOwnedDevice(params.id, params.owner);
  await db
    .update(device)
    .set({ deletedAt: new Date(), status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(device.id, row.id));
};

/** 按明文令牌反查设备（隧道握手与资产下发用；是否可用由调用方按 `status` 判定） */
export const findDeviceByToken = async (token: string): Promise<DeviceRecord | null> => {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(device)
    .where(and(eq(device.tokenHash, hashDeviceToken(token)), notDeleted(device.deletedAt)))
    .limit(1);
  return row ?? null;
};

/** 巡检落库：把内存里的最近活跃时间写进 `last_seen_at`（只写发生变化的设备） */
export const saveLastSeen = async (updates: Map<string, Date>): Promise<number> => {
  for (const [deviceId, at] of updates) {
    await db
      .update(device)
      .set({ lastSeenAt: at })
      .where(and(eq(device.id, deviceId), notDeleted(device.deletedAt)));
  }
  return updates.size;
};
