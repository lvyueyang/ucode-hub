/**
 * 系统配置模块 Zod Schema：管理端 CRUD + 导入，单一来源
 */

import { z } from "zod";

export const createConfigSchema = z.object({
  key: z.string().min(1, "配置键不能为空").max(100),
  value: z.string().min(1, "配置值不能为空"),
  /** 敏感配置：值加密入库（创建后不可修改该标记） */
  isSecret: z.boolean().optional(),
  clientVisible: z.boolean().optional(),
  valueType: z.string().optional(),
  groupName: z.string().optional(),
  description: z.string().optional(),
});

export const updateConfigSchema = z.object({
  id: z.string().min(1),
  value: z.string().optional(),
  clientVisible: z.boolean().optional(),
  valueType: z.string().optional(),
  groupName: z.string().optional(),
  description: z.string().optional(),
});

export const deleteConfigSchema = z.object({ id: z.string().min(1) });

const configItemSchema = z.object({
  key: z.string().min(1),
  // 允许空值：敏感配置的导出备份不含原文，需能原样回灌（导入时保留原密文）
  value: z.string(),
  // 导出备份携带敏感标记；导入时用于新建敏感配置行（已有敏感行保留原密文）
  isSecret: z.boolean().optional(),
  clientVisible: z.boolean().optional(),
  valueType: z.string().optional(),
  groupName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const configImportSchema = z.object({
  configs: z.array(configItemSchema),
});
