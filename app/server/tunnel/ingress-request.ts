/**
 * 隧道数据面入口的请求侧纯逻辑：握手的凭证抽取、按 Host 认设备、转发头构造。
 *
 * 没有 IO、不碰框架对象：给定字符串（Host、Cookie、头集合）就能判定，便于单测；
 * 需要的都取自 `Headers`，这样隧道握手（`request.headers`）与 ingress（`event.req.headers`）共用一套。
 */
import { COOKIE_NAMES } from "#/constants/cookie-names";
import { DEVICE_ACCESS_PATH_PREFIX } from "#/constants/device";
import type { UserRef, UserType } from "#/types/user";

/** 请求路径上限：与协议 `requestFrameSchema.path` 的 `.max(4096)` 对齐，超了连帧都装不下 */
export const MAX_INGRESS_PATH_LENGTH = 4096;

/** 设备 id 就是 uuid：子域标签只认它，别的形态（含多级子域）都不进 ingress */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 逐跳头（RFC 9110 §7.6.1）：只对单跳有意义。
 * 两个方向都不能透传——尤其 `transfer-encoding`，转发方自己会决定分块方式。
 */
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/**
 * 转发时必须剥掉的头：调用方凭证（hub 自己不转发身份，UCode 只认本机 serviceToken）、
 * Host（下游的 Host 由它自己决定）、逐跳头，以及来源地址（`forwarded` 家族只对 hub 这一跳有意义）。
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  "cookie",
  "authorization",
  "host",
  "forwarded",
  ...HOP_BY_HOP_HEADERS,
]);

/** 注入的来源头：CC 里约定同名常量，hub 侧不依赖 UCode 的仓库，故写字面量并在此处收口 */
export const INGRESS_SOURCE_HEADER = "x-hub-source";
export const INGRESS_DEVICE_HEADER = "x-hub-device";
export const INGRESS_CLIENT_HEADER = "x-hub-client";

/**
 * 页面被挂在前缀下时告诉 UCode 前缀是什么（它据此改写 `index.html` 的 `<base href>`）。
 * 与来源头同理，hub 侧不依赖 UCode 的仓库，这里收口字面量。
 */
export const INGRESS_BASE_PATH_HEADER = "x-hub-base-path";

/** 隧道来源标记：UCode 侧只把它记进日志与统计，不参与鉴权 */
export const INGRESS_SOURCE_VALUE = "tunnel";

/**
 * 从 Host 里取出设备 id：要求 `设备 uuid.父域`，大小写不敏感、允许带端口。
 * 多级子域、非 uuid 标签、父域自身都返回 null——不匹配的请求照常落到 admin / 前台路由。
 */
export const parseDeviceHost = (
  host: string | null | undefined,
  baseDomain: string,
): string | null => {
  if (!host) return null;
  const hostname = (host.split(":")[0] ?? "").toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  return UUID_PATTERN.test(label) ? label : null;
};

/**
 * 路径寻址的结果：设备 id、浏览器看到的前缀，以及剥掉前缀后要转发给 UCode 的路径。
 * `basePath` 不带尾斜杠，用于告诉 UCode 页面挂在哪（`<base href>`）。
 */
export type DevicePathMatch = {
  deviceId: string;
  basePath: string;
  rest: string;
};

/**
 * 从请求路径里取设备：`/d/<设备 id>` 与 `/d/<设备 id>/<其余>` 都认，其余返回 null（照常落 hub 路由）。
 * 不带尾斜杠时 `rest` 是 `/`——调用方应先重定向到带尾斜杠的地址，否则页面里的相对资源
 * 会以 `/d/` 为基准解析。
 */
export const parseDevicePath = (pathname: string): DevicePathMatch | null => {
  const prefix = `${DEVICE_ACCESS_PATH_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;

  const remainder = pathname.slice(prefix.length);
  const slash = remainder.indexOf("/");
  const label = (slash < 0 ? remainder : remainder.slice(0, slash)).toLowerCase();
  if (!UUID_PATTERN.test(label)) return null;

  return {
    deviceId: label,
    basePath: `${DEVICE_ACCESS_PATH_PREFIX}/${label}`,
    rest: slash < 0 ? "/" : remainder.slice(slash),
  };
};

/** 取 Bearer 令牌（纯解析，不校验签名）：方案不是 Bearer、无令牌、多段都返回 null */
export const parseBearerToken = (header: string | null | undefined): string | null => {
  if (!header) return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) return null;
  return token;
};

const readCookie = (cookieHeader: string, name: string): string | null => {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value ? value : null;
  }
  return null;
};

/** 从 Cookie 头里取会话令牌：管理端与客户端两种登录态都认（先管理端） */
export const readSessionToken = (cookieHeader: string | null | undefined): string | null => {
  if (!cookieHeader) return null;
  return (
    readCookie(cookieHeader, COOKIE_NAMES.ADMIN_TOKEN) ??
    readCookie(cookieHeader, COOKIE_NAMES.CLIENT_TOKEN)
  );
};

/** 是否要求协议升级：v1 的隧道不支持承载 Upgrade（终端、内置浏览器面板不经 hub） */
export const isUpgradeRequest = (headers: Headers): boolean =>
  headers.get("upgrade")?.toLowerCase() === "websocket";

/** 设备归属判定：管理端账号可访问任意设备，客户端用户只能是设备属主 */
export const canAccessDevice = (
  device: { ownerType: UserType; ownerId: string },
  user: UserRef,
): boolean =>
  user.type === "admin" || (device.ownerType === user.type && device.ownerId === user.id);

/** 构造转发给 UCode 的请求头：剥凭证 / Host / 逐跳头 / `forwarded` 与 `x-forwarded-*`，再注入来源头 */
export const buildIngressRequestHeaders = (
  headers: Headers,
  source: { deviceId: string; userId: string; basePath?: string | null },
): Record<string, string> => {
  const forwarded: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (STRIPPED_REQUEST_HEADERS.has(name) || name.startsWith("x-forwarded-")) continue;
    forwarded[name] = value;
  }
  forwarded[INGRESS_SOURCE_HEADER] = INGRESS_SOURCE_VALUE;
  forwarded[INGRESS_DEVICE_HEADER] = source.deviceId;
  forwarded[INGRESS_CLIENT_HEADER] = source.userId;
  // 子域形态下页面就在 origin 根上，不需要告诉 UCode 前缀
  if (source.basePath) forwarded[INGRESS_BASE_PATH_HEADER] = source.basePath;
  return forwarded;
};

/** 构造回给公网侧的头：逐跳头必须剥掉，其余（含 content-length / content-encoding）原样透传 */
export const buildIngressResponseHeaders = (
  headers: Record<string, string>,
): Record<string, string> => {
  const forwarded: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.includes(name.toLowerCase())) continue;
    forwarded[name] = value;
  }
  return forwarded;
};
