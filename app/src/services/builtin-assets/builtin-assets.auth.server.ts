/**
 * 内置资产接口的设备身份鉴权：与隧道共用同一套设备令牌（`Authorization: Bearer <deviceToken>`），
 * 不新造凭证——已登记的设备才能取清单与内容。
 *
 * 与隧道一样只认「设备存在、未被软删除、状态为 active」；令牌明文不落库，比对的是它的 sha256。
 */
import { DEVICE_AUTH_HEADER } from "@ucode/hub-protocol";

import type { DeviceRecord } from "#/services/device/device.server";
import { findDeviceByToken } from "#/services/device/device.server";

/** 从 `Authorization` 头里取 Bearer 令牌；写法不符即 null */
const parseBearerToken = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
};

/**
 * 认设备：通过返回设备记录，否则 null（路由据此回 401）。
 * 令牌无效与已被吊销返回同一个结果，不向调用方区分原因。
 */
export const authorizeBuiltinDevice = async (request: Request): Promise<DeviceRecord | null> => {
  const token = parseBearerToken(request.headers.get(DEVICE_AUTH_HEADER));
  if (!token) return null;
  const device = await findDeviceByToken(token);
  return device?.status === "active" ? device : null;
};
