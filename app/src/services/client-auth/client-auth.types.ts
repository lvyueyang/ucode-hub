/**
 * 客户端认证模块共享类型定义
 */

/** 客户端用户信息类型 */
export interface ClientUser {
  id: string;
  username: string;
  email: string;
  avatar?: string | null;
  isRoot: false;
  userType: "client";
}

/** 客户端登录结果 */
export interface ClientLoginResult {
  success: boolean;
  message?: string;
  user?: { id: string; username: string; email: string };
  token?: string;
}

/** 客户端注册结果 */
export interface ClientRegisterResult {
  success: boolean;
  message: string;
}
