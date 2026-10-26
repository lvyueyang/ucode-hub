/**
 * 客户端认证 Context：全局共享当前客户端用户信息，提供 refetch 和 logout 能力
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { clientLogoutSFn, getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import type { ClientUser } from "#/services/client-auth/client-auth.types";
import { sfnUnwrap } from "#/utils/sfn-error";

interface ClientAuthContextType {
  /** 当前登录用户，null 表示未登录 */
  user: ClientUser | null;
  /** 首次加载中 */
  isLoading: boolean;
  /** 重新获取当前用户信息（登录后调用） */
  refetch: () => void;
  /** 退出登录 */
  logout: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(undefined);

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    // 认证引导加载：失败无需打扰用户（未登录/网络异常均回落为未登录态）
    const [u, err] = await sfnUnwrap(getCurrentClientSFn(), { silent: true });
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

  const logout = useCallback(async () => {
    const [, err] = await sfnUnwrap(clientLogoutSFn());
    if (err) return;
    setUser(null);
  }, []);

  return (
    <ClientAuthContext.Provider value={{ user, isLoading, refetch, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

/**
 * 获取当前客户端认证状态
 * 必须在 ClientAuthProvider 内部使用
 */
export function useClientAuth(): ClientAuthContextType {
  const context = useContext(ClientAuthContext);
  if (!context) {
    throw new Error("useClientAuth 必须在 ClientAuthProvider 内部使用");
  }
  return context;
}
