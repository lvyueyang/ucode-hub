/**
 * 字典模块 Zod Schema：字典类型 + 字典条目 + 导入导出，单一来源
 */

import { z } from "zod";
import { listSchema, updateSortOrderSchema } from "#/validators/common.schemas";

/** 字典条目列表查询：通用分页 / 排序参数 + 所属字典 slug */
export const dictListSchema = listSchema.extend({
  dictSlug: z.string().min(1),
});
export const idSchema = z.object({ id: z.string().min(1) });

/** 列表内联修改条目排序权重（单字段更新） */
export const updateDictItemSortSchema = updateSortOrderSchema;

/** 列表中切换条目启用状态（单字段更新） */
export const dictItemStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "disabled"]),
});

export const createDictSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50),
  description: z.string().optional(),
});

export const updateDictSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
});

export const createItemSchema = z.object({
  dictSlug: z.string().min(1),
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
  sortOrder: z.number().default(0),
  extraType: z.string().optional(),
  extra: z.string().optional(),
  color: z.string().optional(),
});

export const updateItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(100).optional(),
  value: z.string().max(100).optional(),
  sortOrder: z.number().optional(),
  status: z.string().optional(),
  extraType: z.string().optional(),
  extra: z.string().optional(),
  color: z.string().optional(),
});

/** 树形导入数据中条目 schema（不含 dictSlug，由父级继承） */
const treeDictItemSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  sortOrder: z.number().optional(),
  status: z.string().optional(),
  extraType: z.string().nullable().optional(),
  extra: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

/** 树形导入 schema：字典类型下嵌套 children */
export const dictImportSchema = z.object({
  dicts: z.array(
    z.object({
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().nullable().optional(),
      children: z.array(treeDictItemSchema).optional().default([]),
    }),
  ),
});
