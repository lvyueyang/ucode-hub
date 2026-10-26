/**
 * 管理端鉴权核心逻辑（仅服务端）：
 * 校验 token 并返回用户上下文，供 admin-auth 中间件 guard 回调调用
 * 本文件仅服务端加载，客户端构建经 import-protection 拦截，不会泄漏
 */

import { type AdminAuthContext, AdminAuthError } from "#/middleware/admin-auth";
import { getAdminUserForAuth } from "#/services/admin-auth/admin-auth.server";
import { jwt } from "#/shared-services/jwt";

/**
 * 管理端鉴权核心逻辑：校验 token 并返回用户上下文
 * 不涉及 Cookie 读取，由中间件层传入
 * isRoot 用户自动拥有所有权限，不依赖角色表
 */
export async function resolveAdminAuthContext(
  token: string | undefined,
): Promise<AdminAuthContext> {
  if (!token) {
    throw new AdminAuthError("未登录或登录已过期", 401);
  }

  const jwtPayload = await jwt.verifyToken(token);
  if (!jwtPayload) {
    throw new AdminAuthError("未登录或登录已过期", 401);
  }

  if (jwtPayload.userType !== "admin") {
    throw new AdminAuthError("无权访问管理端", 403);
  }

  const result = await getAdminUserForAuth(jwtPayload.userId);
  if (!result.success) {
    if (result.reason === "not_found") {
      throw new AdminAuthError("用户不存在", 401);
    }
    throw new AdminAuthError("账号已被禁用或删除", 403);
  }

  return {
    user: {
      id: result.id,
      username: result.username,
      email: result.email,
      userType: "admin" as const,
      isRoot: result.isRoot,
    },
    rolePermissions: result.rolePermissions,
  };
}
