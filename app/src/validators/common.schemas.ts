/**
 * 公共 Zod Schema：管理端 CRUD 列表页与通用态操作共用的校验 schema（单一来源）
 *
 * 列表 SFn 一律以 `listSchema` 为基座 `.extend({...})` 追加业务筛选字段，
 * 保证分页 / 每页条数 / 关键词 / 排序参数全链路一致——`pageSize` 必须能透传到服务层，
 * 否则前端每页条数控件将成为无效控件。
 */
import { z } from "zod";

/** ID 校验（删除 / 单项操作复用） */
export const idSchema = z.object({ id: z.string().min(1) });

/** 排序方向（列表查询参数 sortOrder） */
export const sortDirectionSchema = z.enum(["ascend", "descend"]).optional();

/** 重置密码校验 */
export const resetPwdSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(6).max(100),
});

/**
 * 通用列表查询参数基座
 *
 * 分页参数在此统一设界（页码从 1 起、每页 1–100 条），避免各列表 SFn 各自把关；
 * 服务层仍需按自身上限二次钳制。
 */
export const listSchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  keyword: z.string().optional(),
  sortField: z.string().optional(),
  sortOrder: sortDirectionSchema,
});

/**
 * 排序权重单字段更新（列表内联编辑）
 * 仅更新一个字段，避免复用整表更新把表单其他字段一起回写
 */
export const updateSortOrderSchema = z.object({
  id: z.string().min(1),
  sortOrder: z.number().int().min(0).max(9999),
});

/** 发布状态单字段更新（列表内联开关） */
export const togglePublishedSchema = z.object({
  id: z.string().min(1),
  isPublished: z.boolean(),
});
