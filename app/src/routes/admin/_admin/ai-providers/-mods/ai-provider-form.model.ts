/**
 * AI 厂商表单的数据模型与常量：表单值类型 + 输入/输出模态可选项
 * 由 AiProviderFormModal / AiProviderFormContent 共享，拆分自弹窗组件以控制文件体积
 */
import type { AiModality } from "#/shared-services/ai/ai.schemas";

/** 单个模型表单值 */
export interface ModelFormValues {
  id: string;
  name?: string;
  default?: boolean;
  contextLimit?: number;
  outputLimit?: number;
  jsonOutput?: boolean;
  toolCalls?: boolean;
  reasoning?: boolean;
  input?: AiModality[];
  output?: AiModality[];
}

/** 表单值（id 为厂商对象键，default 由整列表保存时统一处理读回） */
export interface FormValues {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  default?: boolean;
  models: ModelFormValues[];
}

/** 表单初始值：厂商级字段可缺省（新增时为空），models 至少一个空行 */
export type FormInitialValues = Partial<FormValues> & {
  models: ModelFormValues[];
};

/** 输入/输出模态可选项 */
export const MODALITY_OPTIONS: { value: AiModality; label: string }[] = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
];
