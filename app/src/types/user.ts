/**
 * 用户域共享类型：多态用户引用（管理端 / 客户端），无外键定位
 */

/** 用户端类型 */
export type UserType = "admin" | "client";

/** 多态用户引用：userType + userId 定位（admin_user / client_user） */
export interface UserRef {
  type: UserType;
  id: string;
}
