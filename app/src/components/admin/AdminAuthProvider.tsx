/**
 * 管理端认证 Context：全局共享当前管理员信息，提供 refetch 能力
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type AdminPermissionDef, hasAdminPermission } from "#/permissions/admin-permissions";
import { getCurrentAdminSFn } from "#/services/admin-auth/admin-auth.functions";
import type { AdminUser } from "#/services/admin-auth/admin-auth.types";
import { sfnUnwrap } from "#/utils/sfn-error";

interface AdminAuthContextType {
  /** 当前登录管理员，null 表示未登录 */
  user: AdminUser | null;
  /** 首次加载中 */
  isLoading: boolean;
  /** 重新获取当前管理员信息（登录/退出后调用） */
  refetch: () => void;
  /** 判断当前管理员是否拥有某权限码（未登录一律 false） */
  hasPermission: (permission: AdminPermissionDef) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    // 认证引导加载：失败无需打扰用户（未登录/网络异常均回落为未登录态）
    const [u, err] = await sfnUnwrap(getCurrentAdminSFn(), { silent: true });
    if (!err) setUser(u);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadUser().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadUser]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    loadUser().finally(() => setIsLoading(false));
  }, [loadUser]);

  /** 基于当前用户权限码判断；未登录或无权限返回 false */
  const hasPermission = useCallback(
    (permission: AdminPermissionDef) => hasAdminPermission(user?.rolePermissions ?? [], permission),
    [user],
  );

  const value = useMemo(
    () => ({ user, isLoading, refetch, hasPermission }),
    [user, isLoading, refetch, hasPermission],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

/**
 * 获取当前管理端认证状态
 * 必须在 AdminAuthProvider 内部使用
 */
export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth 必须在 AdminAuthProvider 内部使用");
  }
  return context;
}
