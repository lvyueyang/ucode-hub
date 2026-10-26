/**
 * 权限匹配纯函数：判断角色权限列表是否匹配指定权限码
 * 匹配优先级：**（超级通配符）→ 精确匹配 → 逐级分组通配（{前缀}:*）
 * 逐级通配覆盖多级冒号权限码（如 open_api:material:query 可被 open_api:* 或 open_api:material:* 命中），
 * 单级权限码（{模块}:{操作}）行为与仅支持一级通配时一致
 */
export function matchPermission(rolePermissions: string[], requiredCode: string): boolean {
  // 超级通配符：拥有全部权限
  if (rolePermissions.includes("**")) return true;
  // 精确匹配
  if (rolePermissions.includes(requiredCode)) return true;
  // 逐级分组通配：按冒号逐段生成前缀通配符并比对
  const parts = requiredCode.split(":");
  for (let i = 1; i < parts.length; i++) {
    if (rolePermissions.includes(`${parts.slice(0, i).join(":")}:*`)) {
      return true;
    }
  }
  return false;
}
