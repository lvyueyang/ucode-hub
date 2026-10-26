/**
 * 模型端点的真实依赖装配：把服务层实现装进鉴权所需的接缝，供路由直接引用。
 * 单独一层是为了让 `auth.ts` / `protocol.ts` / `forward.ts` 保持可脱库单测。
 */
import { getAdminUserForAuth } from "#/services/admin-auth/admin-auth.server";
import { getClientUserForAuth } from "#/services/client-auth/client-auth.server";
import { findDeviceByToken } from "#/services/device/device.server";
import { jwt } from "#/shared-services/jwt";

import type { ModelEndpointAuthDeps } from "./auth";

export const modelEndpointAuthDeps: ModelEndpointAuthDeps = {
  findDeviceByToken,
  verifyJwt: (token) => jwt.verifyToken(token),
  getAdminUserForAuth,
  getClientUserForAuth,
};
