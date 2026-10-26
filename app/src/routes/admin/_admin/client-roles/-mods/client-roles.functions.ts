/**
 * 客户端角色管理路由共享 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import {
  clientRoleCreateSchema,
  clientRoleListSchema,
  clientRoleUpdateSchema,
  idSchema,
} from "#/services/client-role/client-role.schemas";
import {
  createClientRole,
  deleteClientRole,
  getClientRoleList,
  updateClientRole,
} from "#/services/client-role/client-role.server";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";

/** 获取客户端角色列表（分页、筛选、排序） */
export const getClientRolesSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CLIENT_ROLE_VIEW)])
  .validator(clientRoleListSchema)
  .handler(async ({ data }) => getClientRoleList(data));

/** 创建客户端角色 */
export const createClientRoleSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CLIENT_ROLE_CREATE)])
  .validator(clientRoleCreateSchema)
  .handler(async ({ data, context }) => {
    const result = await createClientRole(data);
    logCrud(context.user, "client-role", "create", {
      id: result.id,
      name: result.name,
    });
    return result;
  });

/** 更新客户端角色 */
export const updateClientRoleSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CLIENT_ROLE_EDIT)])
  .validator(clientRoleUpdateSchema)
  .handler(async ({ data, context }) => {
    const result = await updateClientRole(data.id, data);
    logCrud(context.user, "client-role", "update", {
      id: data.id,
      name: result?.name,
    });
    return result;
  });

/** 删除客户端角色 */
export const deleteClientRoleSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.CLIENT_ROLE_DELETE)])
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    await deleteClientRole(data.id);
    logCrud(context.user, "client-role", "delete", { id: data.id });
  });
