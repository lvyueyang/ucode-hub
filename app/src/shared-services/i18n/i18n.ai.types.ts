/**
 * 国际化 AI 翻译共享类型（客户端安全：仅类型，无服务端依赖）
 * 供 i18n.ai.server（服务端编排）与客户端（SSE 消费、事件处理）共用，避免服务端类型进入客户端 bundle
 */

import type { EditorType } from "#/constants/editor-types";
import type { Locale } from "./i18n.types";

/** 可翻译字段（批量翻译用，valueType 仅用于写库渲染） */
export interface AiTranslatableField {
  name: string;
  valueType?: EditorType;
}

/** 单个实体的源值（主表字段名 → 源文本） */
export interface AiBatchEntity {
  id: string;
  values: Record<string, string>;
}

/** 已有翻译映射：entityId -> locale -> 已存在的字段名数组 */
export type ExistingTranslationMap = Record<string, Record<string, string[]>>;

/** 一个批次：同一目标语言下，batchSize 个实体打包成一个 JSON 调用一次 AI */
export interface AiBatchGroup {
  batchIndex: number;
  total: number;
  targetLocale: Locale;
  entities: Array<{
    entityId: string;
    /** 本批需要翻译的字段（fill/correct 已筛选） */
    fields: AiTranslatableField[];
    /** 本批需要的源值（字段名 → 源文本） */
    source: Record<string, string>;
  }>;
}

/** 单条翻译结果 */
export interface AiTranslationResult {
  entityType: string;
  entityId: string;
  fieldName: string;
  locale: Locale;
  value: string;
  valueType?: EditorType;
}

/** 单条翻译失败项 */
export interface AiFailedItem {
  entityId: string;
  fieldName: string;
  locale: Locale;
  reason: string;
}

/** 批次级错误（整批失败） */
export interface AiBatchError {
  batchIndex: number;
  reason: string;
}

/** 批量翻译汇总 */
export interface BatchTranslateSummary {
  created: number;
  updated: number;
  failedCount: number;
  translations: AiTranslationResult[];
  failed: AiFailedItem[];
  errors: AiBatchError[];
}

/** 批量翻译 SSE 事件（服务端 → 客户端，逐事件下发） */
export type BatchTranslateSseEvent =
  | {
      type: "batch-start";
      batchIndex: number;
      total: number;
      entityCount: number;
    }
  | { type: "text-delta"; batchIndex: number; delta: string }
  | {
      type: "batch-done";
      batchIndex: number;
      total: number;
      created: number;
      updated: number;
      failedCount: number;
      failed: AiFailedItem[];
    }
  | { type: "failed"; batchIndex: number; total: number; reason: string }
  | { type: "done"; summary: BatchTranslateSummary }
  | { type: "error"; reason: string };
