/**
 * 客户端权限码常量定义
 * 格式 {模块}:{操作}，分组由 code 前缀自动推导
 * 当前无业务模块，权限码集为空；业务模块扩展时在此填充并配套 client_role 表初始化
 */
import { matchPermission } from "@ucode/hub-lib/match-permission";

/**
 * 创建权限码常量
 * 返回值即权限的完整定义对象，直接作为 clientPermGuard / hasClientPermission 的入参
 */
function definePermission<C extends string, N extends string, D extends string>(
  code: C,
  name: N,
  desc: D,
) {
  const group = code.split(":")[0];
  return { code, name, desc, group } as const;
}

export const CLIENT_PERMISSIONS = {
  // 业务模块权限码预留位
};

/** 权限码对象字面量派生类型；空集合时为 never */
type ClientPermissionDefs = (typeof CLIENT_PERMISSIONS)[keyof typeof CLIENT_PERMISSIONS];

/**
 * 客户端权限完整定义对象类型
 * 空集合（当前状态）下退化为 definePermission 的通用返回类型，避免 never 导致守卫无法调用；
 * 填入权限码后自动收窄为字面量联合，clientPermGuard / hasClientPermission 恢复字面量校验
 */
export type ClientPermissionDef = [ClientPermissionDefs] extends [never]
  ? ReturnType<typeof definePermission>
  : ClientPermissionDefs;

/** 权限码字符串类型 */
export type ClientPermissionCode = ClientPermissionDef["code"];

/** 权限定义列表：空集合时 Object.values 推出 unknown[]，统一按权限定义对象收口 */
const clientPermissionDefs = Object.values(CLIENT_PERMISSIONS) as ClientPermissionDef[];

/** 所有客户端权限码的元数据映射（当前为空集合） */
export const CLIENT_PERMISSION_META: Record<string, ClientPermissionDef> = Object.fromEntries(
  clientPermissionDefs.map((d) => [d.code, d]),
);

/** 按分组归类的客户端权限列表（当前为空集合） */
export const CLIENT_PERMISSIONS_BY_GROUP: Record<string, ClientPermissionDef[]> =
  clientPermissionDefs.reduce<Record<string, ClientPermissionDef[]>>((acc, d) => {
    const list = acc[d.group] ?? [];
    list.push(d);
    acc[d.group] = list;
    return acc;
  }, {});

/**
 * 检查客户端角色是否拥有指定权限
 */
export function hasClientPermission(
  rolePermissions: string[],
  required: ClientPermissionDef,
): boolean {
  return matchPermission(rolePermissions, required.code);
}
