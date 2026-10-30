/**
 * 设备表：一台 UCode 实例在 hub 上的登记记录，隧道与内置资产下发都认这一个身份。
 *
 * 归属沿用 message 的多态写法（`ownerType` + `ownerId`，不建外键）：删用户不级联删设备，
 * 设备是「用户的资产」而不是用户的从属行。令牌只存 sha256，明文仅在登记响应里回一次。
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { UserType } from "#/types/user";

import { pk, softDelete, timestamps } from "./columns";

/** 设备状态：`active` 可用；`revoked` 已吊销，令牌立即失效（记录保留给前台查看） */
export type DeviceStatus = "active" | "revoked";

export const device = sqliteTable(
  "device",
  {
    ...pk(),
    ownerType: text("owner_type").$type<UserType>().notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    /** 平台标识（如 darwin / win32 / linux），供前台辨认是哪台机器 */
    platform: text("platform"),
    clientVersion: text("client_version"),
    /** 设备令牌的 sha256（hex）：按它反查设备，明文不落库 */
    tokenHash: text("token_hash").notNull(),
    status: text("status").$type<DeviceStatus>().default("active").notNull(),
    /** 最近一次隧道连接时间；在线态本体在进程内存里，这里只留证据 */
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    ...timestamps(),
    ...softDelete(),
  },
  (table) => [
    index("idx_device_owner").on(table.ownerType, table.ownerId),
    uniqueIndex("uidx_device_token_hash").on(table.tokenHash),
  ],
);
