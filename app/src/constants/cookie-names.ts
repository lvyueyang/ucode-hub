/**
 * Cookie 名称：中继自己签发登录态用，交付时按实际域名改（同域下多套系统共存时靠它区分）。
 * 仅服务端使用（鉴权中间件 / 登录 SFn / 测试）；纯常量可在客户端安全引用。
 */
export const COOKIE_NAMES = {
  /** 管理端 JWT Token Cookie */
  ADMIN_TOKEN: "hub_admin_token",
  /** 客户端 JWT Token Cookie */
  CLIENT_TOKEN: "hub_client_token",
} as const;
