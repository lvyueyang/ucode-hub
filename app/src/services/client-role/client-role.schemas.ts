/**
 * 客户端角色管理共享 Zod Schema
 */
import { z } from "zod";
import { listSchema } from "#/validators/common.schemas";

/** 通过 id 删除角色 */
export const idSchema = z.object({ id: z.string().min(1) });

/** 角色列表查询：通用分页 / 排序参数 + 关键词（关键词已含于基座，无额外业务筛选） */
export const clientRoleListSchema = listSchema;

/** 新建角色 */
export const clientRoleCreateSchema = z.object({
  name: z.string().min(1, "角色名称不能为空").max(50),
  slug: z.string().min(1, "角色标识不能为空").max(50),
  permissions: z.array(z.string()).default([]),
  description: z.string().optional(),
});

/** 更新角色 */
export const clientRoleUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50).optional(),
  slug: z.string().min(1).max(50).optional(),
  permissions: z.array(z.string()).optional(),
  description: z.string().optional(),
});
