/**
 * 客户端鉴权核心逻辑（仅服务端）：
 * 校验 token 并返回用户上下文，供 client-auth 中间件 guard 回调调用
 * 本文件仅服务端加载，客户端构建经 import-protection 拦截，不会泄漏
 */

import { type ClientAuthContext, ClientAuthError } from "#/middleware/client-auth";
import { getClientUserForAuth } from "#/services/client-auth/client-auth.server";
import { jwt } from "#/shared-services/jwt";

/**
 * 客户端鉴权核心逻辑：校验 token 并返回用户上下文
 * 不涉及 Cookie 读取，由中间件层传入
 */
export async function resolveClientAuthContext(
  token: string | undefined,
): Promise<ClientAuthContext> {
  if (!token) {
    throw new ClientAuthError("请先登录", 401);
  }

  const payload = await jwt.verifyToken(token);
  if (payload?.userType !== "client") {
    throw new ClientAuthError("无效的用户身份", 401);
  }

  const result = await getClientUserForAuth(payload.userId);
  if (!result.success) {
    if (result.reason === "not_found") {
      throw new ClientAuthError("用户不存在", 401);
    }
    throw new ClientAuthError("账号已被禁用", 403);
  }

  return {
    userId: result.id,
    username: result.username,
    email: result.email,
    rolePermissions: result.rolePermissions,
  };
}
