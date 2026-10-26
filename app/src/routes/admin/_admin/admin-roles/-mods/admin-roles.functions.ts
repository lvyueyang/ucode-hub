/**
 * 管理端角色管理路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  adminRoleCreateSchema,
  adminRoleListSchema,
  adminRoleUpdateSchema,
  idSchema,
} from "#/services/admin-role/admin-role.schemas";
import {
  createAdminRole,
  deleteAdminRole,
  getAdminRoleList,
  updateAdminRole,
} from "#/services/admin-role/admin-role.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取角色列表（分页、筛选、排序） */
export const getAdminRolesSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_ROLE_VIEW)])
  .validator(adminRoleListSchema)
  .handler(async ({ data }) => getAdminRoleList(data));

/** 创建角色 */
export const createAdminRoleSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_ROLE_CREATE)])
  .validator(adminRoleCreateSchema)
  .handler(async ({ data, context }) => {
    const result = await createAdminRole(data);
    logCrud(context.user, "admin-role", "create", {
      id: result.id,
      name: result.name,
    });
    return result;
  });

/** 更新角色 */
export const updateAdminRoleSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_ROLE_EDIT)])
  .validator(adminRoleUpdateSchema)
  .handler(async ({ data, context }) => {
    const result = await updateAdminRole(data.id, data);
    logCrud(context.user, "admin-role", "update", {
      id: data.id,
      name: result?.name,
    });
    return result;
  });

/** 删除角色 */
export const deleteAdminRoleSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.ADMIN_ROLE_DELETE)])
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    await deleteAdminRole(data.id);
    logCrud(context.user, "admin-role", "delete", { id: data.id });
  });
