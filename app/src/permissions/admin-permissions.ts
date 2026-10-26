/**
 * 权限码常量定义及元数据
 * 格式：{模块}:{操作}
 * 使用 definePermission 工厂创建权限常量，分组由 code 前缀自动推导
 */
import { matchPermission } from "@ucode/hub-lib/match-permission";

/**
 * 创建权限码常量
 * 返回值即权限的完整定义对象，直接作为 adminPermGuard / hasAdminPermission 的入参
 */
function definePermission<C extends string, N extends string, D extends string>(
  code: C,
  name: N,
  desc: D,
) {
  const group = code.split(":")[0];
  return { code, name, desc, group } as const;
}

export const ADMIN_PERMISSIONS = {
  // 管理员管理
  ADMIN_VIEW: definePermission("admin:view", "查看管理员", "允许查看管理员列表"),
  ADMIN_CREATE: definePermission("admin:create", "创建管理员", "允许创建新的管理员账号"),
  ADMIN_EDIT: definePermission("admin:edit", "编辑管理员", "允许编辑管理员信息"),
  ADMIN_DELETE: definePermission("admin:delete", "删除管理员", "允许删除管理员账号"),
  // 客户端用户
  CLIENT_VIEW: definePermission("client:view", "查看客户端用户", "允许查看前台注册用户列表"),
  CLIENT_CREATE: definePermission("client:create", "创建客户端用户", "允许创建新的客户端用户账号"),
  CLIENT_EDIT: definePermission("client:edit", "编辑客户端用户", "允许编辑客户端用户信息"),
  CLIENT_DELETE: definePermission("client:delete", "删除客户端用户", "允许删除客户端用户账号"),
  // 角色管理
  ADMIN_ROLE_VIEW: definePermission("admin-role:view", "查看角色", "允许查看角色列表"),
  ADMIN_ROLE_CREATE: definePermission("admin-role:create", "创建角色", "允许创建新的角色"),
  ADMIN_ROLE_EDIT: definePermission("admin-role:edit", "编辑角色", "允许编辑角色信息和权限分配"),
  ADMIN_ROLE_DELETE: definePermission("admin-role:delete", "删除角色", "允许删除角色"),
  // 客户端角色管理
  CLIENT_ROLE_VIEW: definePermission(
    "client-role:view",
    "查看客户端角色",
    "允许查看客户端角色列表",
  ),
  CLIENT_ROLE_CREATE: definePermission(
    "client-role:create",
    "创建客户端角色",
    "允许创建新的客户端角色",
  ),
  CLIENT_ROLE_EDIT: definePermission(
    "client-role:edit",
    "编辑客户端角色",
    "允许编辑客户端角色信息和权限分配",
  ),
  CLIENT_ROLE_DELETE: definePermission(
    "client-role:delete",
    "删除客户端角色",
    "允许删除客户端角色",
  ),
  // 字典管理
  DICT_VIEW: definePermission("dict:view", "查看字典", "允许查看字典类型和条目"),
  DICT_CREATE: definePermission("dict:create", "创建字典", "允许创建新的字典类型"),
  DICT_EDIT: definePermission("dict:edit", "编辑字典", "允许编辑字典类型信息"),
  DICT_DELETE: definePermission("dict:delete", "删除字典", "允许删除字典类型"),
  DICT_CREATE_ITEM: definePermission("dict:create-item", "创建字典条目", "允许在字典中新增条目"),
  DICT_EDIT_ITEM: definePermission("dict:edit-item", "编辑字典条目", "允许编辑字典条目内容"),
  DICT_DELETE_ITEM: definePermission("dict:delete-item", "删除字典条目", "允许删除字典条目"),
  DICT_EXPORT: definePermission("dict:export", "导出字典", "允许将字典数据导出为 JSON 文件"),
  DICT_IMPORT: definePermission("dict:import", "导入字典", "允许从 JSON 文件导入字典数据"),
  // 设备管理
  DEVICE_VIEW: definePermission("device:view", "查看设备", "允许查看设备列表与在线状态"),
  DEVICE_UPDATE: definePermission("device:update", "编辑设备", "允许修改设备名称"),
  DEVICE_REVOKE: definePermission(
    "device:revoke",
    "吊销设备",
    "允许吊销设备（令牌立即失效，设备当场断开）",
  ),
  DEVICE_DELETE: definePermission("device:delete", "删除设备", "允许删除设备（软删除）"),
  // 系统配置
  CONFIG_VIEW: definePermission("config:view", "查看配置", "允许查看系统配置项"),
  CONFIG_CREATE: definePermission("config:create", "创建配置", "允许新增系统配置项"),
  CONFIG_EDIT: definePermission("config:edit", "编辑配置", "允许修改系统配置项的值"),
  CONFIG_DELETE: definePermission("config:delete", "删除配置", "允许删除系统配置项"),
  CONFIG_EXPORT: definePermission("config:export", "导出配置", "允许将系统配置导出为 JSON 文件"),
  CONFIG_IMPORT: definePermission("config:import", "导入配置", "允许从 JSON 文件导入系统配置项"),
  // 文件管理
  FILE_VIEW: definePermission("file:view", "查看文件", "允许查看文件列表"),
  FILE_UPLOAD: definePermission("file:upload", "上传文件", "允许上传新文件"),
  FILE_EDIT: definePermission("file:edit", "编辑文件", "允许修改文件属性（如转为永久存储）"),
  FILE_DELETE: definePermission("file:delete", "删除文件", "允许删除文件"),
  FILE_PROCESS: definePermission(
    "file:process",
    "图片处理",
    "允许对文件库中的图片进行压缩、裁切并覆盖原图",
  ),
  // 文件资源管理器
  FILE_EXPLORER_VIEW: definePermission(
    "file-explorer:view",
    "浏览存储目录",
    "允许浏览 STORAGE_DIR 目录结构",
  ),
  FILE_EXPLORER_UPLOAD: definePermission(
    "file-explorer:upload",
    "上传文件",
    "允许向存储目录上传文件",
  ),
  FILE_EXPLORER_DELETE: definePermission(
    "file-explorer:delete",
    "删除条目",
    "允许删除存储目录中的文件或目录",
  ),
  FILE_EXPLORER_RENAME: definePermission(
    "file-explorer:rename",
    "重命名条目",
    "允许重命名存储目录中的文件或目录",
  ),
  FILE_EXPLORER_MKDIR: definePermission(
    "file-explorer:mkdir",
    "创建目录",
    "允许在存储目录中创建子目录",
  ),
  // 日志管理
  LOG_VIEW: definePermission("log:view", "查看日志", "允许查询和查看系统日志"),
  LOG_DOWNLOAD: definePermission("log:download", "下载日志", "允许下载系统日志文件"),
  // 系统监控
  SYSTEM_MONITOR_VIEW: definePermission(
    "system:monitor:view",
    "查看系统监控",
    "允许查看进程资源占用、存储占用与数据库表占用",
  ),
  // 仪表盘
  DASHBOARD_VIEW: definePermission("dashboard:view", "查看仪表盘", "允许查看管理端首页统计信息"),
  // 埋点分析
  TRACK_VIEW: definePermission("track:view", "查看元数据", "允许查看元事件和元属性定义"),
  TRACK_QUERY: definePermission("track:query", "查询分析", "允许查询触发事件和查看分析图表"),
  TRACK_MANAGE: definePermission(
    "track:manage",
    "管理元数据",
    "允许新增、编辑、删除元事件和元属性",
  ),
  // 消息管理
  MESSAGE_VIEW: definePermission("message:view", "查看消息", "允许查看全部用户消息列表"),
  MESSAGE_SEND: definePermission("message:send", "发送消息", "允许向管理端或客户端用户发送消息"),
  MESSAGE_DELETE: definePermission("message:delete", "删除消息", "允许删除任意用户消息"),
  // 翻译管理
  TRANSLATION_VIEW: definePermission(
    "translation:view",
    "查看翻译",
    "允许查看 UI 翻译和实体字段翻译",
  ),
  TRANSLATION_MANAGE: definePermission(
    "translation:manage",
    "管理翻译",
    "允许新增、编辑、删除翻译内容",
  ),
  TRANSLATION_EXPORT: definePermission(
    "translation:export",
    "导出翻译",
    "允许将翻译数据导出为 JSON 文件",
  ),
  TRANSLATION_IMPORT: definePermission(
    "translation:import",
    "导入翻译",
    "允许从 JSON 文件导入翻译数据",
  ),
  // AI 功能
  AI_PROVIDER_MANAGE: definePermission(
    "ai:provider",
    "AI 厂商管理",
    "允许新增、编辑、删除 AI 厂商配置（ai_providers）",
  ),
  // 模型用量
  USAGE_VIEW: definePermission("usage:view", "查看用量", "允许查看中继模型端点的调用用量与汇总"),
} as const;

/** 权限完整定义对象类型 */
export type AdminPermissionDef = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

/** 权限码字符串类型 */
export type AdminPermissionCode = AdminPermissionDef["code"];

/** 所有权限码的元数据映射（从 ADMIN_PERMISSIONS 自动派生） */
export const ADMIN_PERMISSION_META: Record<AdminPermissionCode, AdminPermissionDef> =
  Object.fromEntries(Object.values(ADMIN_PERMISSIONS).map((d) => [d.code, d])) as Record<
    AdminPermissionCode,
    AdminPermissionDef
  >;

/** 按分组归类的权限列表（从 ADMIN_PERMISSIONS 自动派生） */
export const ADMIN_PERMISSIONS_BY_GROUP: Record<string, AdminPermissionDef[]> = Object.values(
  ADMIN_PERMISSIONS,
).reduce<Record<string, AdminPermissionDef[]>>((acc, d) => {
  const list = acc[d.group] ?? [];
  list.push(d);
  acc[d.group] = list;
  return acc;
}, {});

/**
 * 检查角色是否拥有指定权限
 */
export function hasAdminPermission(
  rolePermissions: string[],
  required: AdminPermissionDef,
): boolean {
  return matchPermission(rolePermissions, required.code);
}

/**
 * 检查角色是否拥有任一权限
 */
export function hasAnyAdminPermission(
  rolePermissions: string[],
  required: AdminPermissionDef[],
): boolean {
  return required.some((p) => matchPermission(rolePermissions, p.code));
}

/**
 * 检查角色是否拥有全部权限
 */
export function hasAllAdminPermissions(
  rolePermissions: string[],
  required: AdminPermissionDef[],
): boolean {
  return required.every((p) => matchPermission(rolePermissions, p.code));
}
