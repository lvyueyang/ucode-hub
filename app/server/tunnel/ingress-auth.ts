/**
 * ingress 的入口准入：解调用方身份、确认设备归属、取出该设备的在线隧道。
 *
 * HTTP 回灌（`middleware/ingress.ts`）与 WebSocket 升级（`routes/d/[deviceId]/[...path].ts`）
 * 共用这一段——「入口是唯一门」的判定只能有一份，否则两条路的放行口径迟早会分叉。
 */

import { TUNNEL_ERROR_CODES } from "@ucode/hub-protocol";
import { and, eq } from "drizzle-orm";
import { db } from "#/db";
import { type DeviceStatus, device } from "#/db/schema";
import { getAdminUserForAuth } from "#/services/admin-auth/admin-auth.server";
import { getClientUserForAuth } from "#/services/client-auth/client-auth.server";
import { jwt } from "#/shared-services/jwt";
import { notDeleted } from "#/shared-services/query/query-utils.server";
import type { UserRef, UserType } from "#/types/user";
import { type TunnelConnection, tunnelRegistry } from "./connections";
import { canAccessDevice, parseBearerToken, readSessionToken } from "./ingress-request";

/** 准入失败：`status` 与 `error` 直接回给调用方，`code` 仅能在归类时给出 */
export type IngressDenial = {
  status: number;
  error: string;
  code?: string;
};

/** 准入通过：后续转发用这条隧道与该调用方的身份 */
export type IngressAdmission = {
  connection: TunnelConnection;
  userId: string;
  userType: UserType;
};

export const isIngressDenial = (
  result: IngressAdmission | IngressDenial,
): result is IngressDenial => "status" in result;

/**
 * 解出调用方身份：Bearer 令牌优先，其次管理端 / 客户端会话 Cookie。
 * 除签名外还核对用户仍存在且未被禁用——入口是唯一门，令牌没过期也不该放行已停用的账号。
 */
export const resolveIngressUser = async (headers: Headers): Promise<UserRef | null> => {
  const token =
    parseBearerToken(headers.get("authorization")) ?? readSessionToken(headers.get("cookie"));
  if (!token) return null;

  const payload = await jwt.verifyToken(token);
  if (!payload) return null;

  if (payload.userType === "admin") {
    const found = await getAdminUserForAuth(payload.userId);
    return found.success ? { type: "admin", id: found.id } : null;
  }
  const found = await getClientUserForAuth(payload.userId);
  return found.success ? { type: "client", id: found.id } : null;
};

/** 按 id 取设备的归属与状态；id 已由上层校验过是 uuid，可以直接查 */
const findDevice = async (
  deviceId: string,
): Promise<{ ownerType: UserType; ownerId: string; status: DeviceStatus } | null> => {
  const [row] = await db
    .select({ ownerType: device.ownerType, ownerId: device.ownerId, status: device.status })
    .from(device)
    .where(and(eq(device.id, deviceId), notDeleted(device.deletedAt)))
    .limit(1);
  return row ?? null;
};

/**
 * 完整准入：身份 → 设备归属 → 未吊销 → 在线隧道。
 * 已吊销的设备即便隧道还连着也不放行，与「没有隧道」同判定（客户端会自行断线重连）。
 */
export const admitIngress = async (
  deviceId: string,
  headers: Headers,
): Promise<IngressAdmission | IngressDenial> => {
  const user = await resolveIngressUser(headers);
  if (!user) return { status: 401, error: "未认证或凭证无效" };

  const found = await findDevice(deviceId);
  if (!found || !canAccessDevice(found, user)) {
    return { status: 404, error: "设备不存在或已被删除" };
  }

  const connection = found.status === "active" ? tunnelRegistry.get(deviceId) : null;
  if (!connection)
    return { status: 502, error: "设备未连接", code: TUNNEL_ERROR_CODES.deviceOffline };

  return { connection, userId: user.id, userType: user.type };
};
