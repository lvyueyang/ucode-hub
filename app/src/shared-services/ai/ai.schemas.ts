/**
 * AI 模块 Schema：多厂商 provider 配置（对象化，参考 OpenCode providers）+ 请求校验
 * 外层以厂商 id 为键，每家厂商嵌套 models 映射（支持一厂商多模型），并携带模型能力位元数据。
 */
import { z } from "zod";

/** 模型输入/输出模态（自约束，暂仅 text/image） */
export const aiModalitySchema = z.enum(["text", "image"]);
export type AiModality = z.infer<typeof aiModalitySchema>;

/** 单个模型配置（键为模型名） */
export const aiModelConfigSchema = z.object({
  /** 展示名称 */
  name: z.string().min(1, "模型名称不能为空").optional(),
  /** 是否该厂商默认模型（多模型时缺省取首个） */
  default: z.boolean().optional(),
  /** 上下文长度上限（token，项目元数据，用于 UI 展示与裁剪/成本提示） */
  contextLimit: z.number().int().positive().optional(),
  /** 输出长度上限（token，项目元数据） */
  outputLimit: z.number().int().positive().optional(),
  /** 是否支持 JSON 结构化输出（映射为 TanStack AI features.structured_outputs） */
  jsonOutput: z.boolean().optional(),
  /** 是否支持工具调用（映射为 TanStack AI features.function_calling） */
  toolCalls: z.boolean().optional(),
  /** 是否思考/推理模型（映射为 TanStack AI features.reasoning） */
  reasoning: z.boolean().optional(),
  /** 输入模态 */
  input: z.array(aiModalitySchema).optional(),
  /** 输出模态（项目元数据；TanStack createModel 无 output 字段） */
  output: z.array(aiModalitySchema).optional(),
});

export type AiModelConfig = z.infer<typeof aiModelConfigSchema>;

/** 单个 AI 厂商配置（对象键为厂商 id） */
export const aiProviderConfigSchema = z.object({
  /** 展示名称 */
  name: z.string().min(1, "厂商名称不能为空").max(64),
  /** OpenAI 兼容 API 基础地址 */
  baseUrl: z.string().min(1, "API 基础地址不能为空"),
  /** API 密钥 */
  apiKey: z.string().min(1, "API 密钥不能为空"),
  /** 是否默认厂商（无 providerId 时优先，多个为 true 取首个） */
  default: z.boolean().optional(),
  /** 模型列表（键为模型名，底层 OpenAI 兼容模型） */
  models: z.record(z.string().min(1), aiModelConfigSchema),
});

export type AiProviderConfig = z.infer<typeof aiProviderConfigSchema>;

/** ai_providers 整体：以厂商 id 为键的对象 */
export const aiProvidersSchema = z.record(z.string().min(1), aiProviderConfigSchema);
export type AiProvidersConfig = z.infer<typeof aiProvidersSchema>;

/** 归一化后的单个模型视图（id 来自 models 对象键） */
export interface AiModelView {
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

/** 归一化后的单个厂商视图（id 来自厂商对象键） */
export interface AiProviderView {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  default?: boolean;
  models: AiModelView[];
}

/** 写入厂商配置的入参（整体对象保存） */
export const saveAiProvidersSchema = z.object({
  providers: aiProvidersSchema,
});
