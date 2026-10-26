/**
 * 管理端认证模块共享类型定义
 */

/** 管理端用户信息类型 */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  avatar?: string | null;
  isRoot: boolean;
  roleNames?: string[];
  /** 角色权限码集合（root 用户为 ["**"]），供前端按权限条件渲染 */
  rolePermissions: string[];
  userType: "admin";
}

/** 管理端登录结果 */
export interface AdminLoginResult {
  success: boolean;
  message?: string;
  user?: { id: string; username: string; email: string };
  token?: string;
}
