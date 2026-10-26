/**
 * 设备状态与在线态的展示标签：管理端与前台共用的单一来源
 * 客户端安全，可被前端组件直接引用
 */
import type { DeviceStatus } from "#/db/schema";

/** 设备界面在中继上的挂载前缀：寻址形如 `/d/<设备 id>/`，不依赖泛域名 */
export const DEVICE_ACCESS_PATH_PREFIX = "/d";

/** 设备界面的访问路径：在中继上打开它等于经隧道访问该设备上的 UCode */
export const deviceAccessPath = (deviceId: string): string =>
  `${DEVICE_ACCESS_PATH_PREFIX}/${deviceId}/`;

/** 设备在线态（在线态本体在服务进程内存里，跨端只传折算后的这个取值） */
export type DeviceOnlineState = "online" | "offline";

/** 设备状态 → 中文标签 */
export const DEVICE_STATUS_LABELS = {
  active: "正常",
  revoked: "已吊销",
} as const satisfies Record<DeviceStatus, string>;

/** 设备在线态 → 中文标签（也是前台 i18n 的 key：没有独立英文目录时回退为中文本身） */
export const DEVICE_ONLINE_LABELS = {
  online: "在线",
  offline: "离线",
} as const satisfies Record<DeviceOnlineState, string>;
