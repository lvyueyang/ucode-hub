/**
 * 模型端点鉴权：`Authorization: Bearer <deviceToken>`（设备身份）或 `<hub 会话 JWT>`（用户身份）。
 *
 * 令牌形态本身就能分流——JWT 恰为三段（两个点），设备令牌是 base64url（不含点），
 * 因此无需「先查设备再验签」串两趟；两种身份收敛成同一份「账号 + 设备」口径，用量一律记到账号上
 * （设备令牌是账号的资产，记账不能记到设备身上，否则换设备就丢账）。
 *
 * 设备查询 / 验签 / 账号校验都以参数注入，判定逻辑因此可脱库单测。
 */
import type { UserType } from "#/types/user";

import { parseBearerToken } from "../tunnel/ingress-request";

/** 调用方身份：设备令牌记设备属主，网页会话记本人 */
export type ModelEndpointCaller = {
  accountType: UserType;
  accountId: string;
  /** 只有设备身份有值，用量表的 `device_id` 据此落库 */
  deviceId: string | null;
  kind: "device" | "user";
};

/** 设备记录里鉴权与记账需要的字段 */
export type CallerDevice = {
  id: string;
  ownerType: UserType;
  ownerId: string;
  status: string;
};

/** 账号校验结果：id 取服务层返回的权威值，不用令牌里的自述 */
export type CallerAccount =
  | { success: true; id: string; tokenVersion: number }
  | { success: false; reason: "not_found" | "disabled" };

/** 鉴权依赖：路由注入真实实现，测试传替身 */
export type ModelEndpointAuthDeps = {
  /** 按明文令牌反查设备（服务层已过滤软删） */
  findDeviceByToken: (token: string) => Promise<CallerDevice | null>;
  /** 验签并解出身份：除 id / 类型外还要拿令牌版本，用于判断会话是否已被撤销 */
  verifyJwt: (token: string) => Promise<{ userId: string; userType: UserType; v: number } | null>;
  /** 账号仍存在且未停用才放行：令牌没过期也不该给已删 / 已停用的账号记账 */
  getAdminUserForAuth: (userId: string) => Promise<CallerAccount>;
  getClientUserForAuth: (userId: string) => Promise<CallerAccount>;
};

/** JWT 恰为三段；设备令牌是 base64url，不含点 */
export const isJwtShaped = (token: string): boolean => token.split(".").length === 3;

const resolveDeviceCaller = async (
  token: string,
  deps: ModelEndpointAuthDeps,
): Promise<ModelEndpointCaller | null> => {
  const found = await deps.findDeviceByToken(token);
  // 吊销 / 软删的设备与「令牌不存在」同判定：不给任何可区分的线索
  if (found?.status !== "active") return null;
  return {
    accountType: found.ownerType,
    accountId: found.ownerId,
    deviceId: found.id,
    kind: "device",
  };
};

const resolveUserCaller = async (
  token: string,
  deps: ModelEndpointAuthDeps,
): Promise<ModelEndpointCaller | null> => {
  const payload = await deps.verifyJwt(token);
  if (!payload) return null;
  const found =
    payload.userType === "admin"
      ? await deps.getAdminUserForAuth(payload.userId)
      : await deps.getClientUserForAuth(payload.userId);
  if (!found.success) return null;
  // 令牌版本不一致：该会话已被改密 / 被重置 / 登出撤销，与 Cookie 会话、/api/v1/* 同一口径
  if (found.tokenVersion !== payload.v) return null;
  return {
    accountType: payload.userType,
    accountId: found.id,
    deviceId: null,
    kind: "user",
  };
};

/** 解出调用方身份；缺令牌、形态不符、令牌无效 / 已吊销 / 账号停用一律返回 null（调用方回 401） */
export const resolveModelEndpointCaller = async (
  authorization: string | null | undefined,
  deps: ModelEndpointAuthDeps,
): Promise<ModelEndpointCaller | null> => {
  const token = parseBearerToken(authorization);
  if (!token) return null;
  return isJwtShaped(token)
    ? await resolveUserCaller(token, deps)
    : await resolveDeviceCaller(token, deps);
};
