/**
 * UI 翻译模块：uiTranslation 表的查询、维护、导出与导入
 * 内存缓存全量 UI 翻译，按 locale 懒加载
 */

import { and, eq, inArray, like, or, type SQLWrapper, sql } from "drizzle-orm";
import { EDITOR_TYPES, type EditorType } from "#/constants/editor-types";
import { db } from "#/db/index";
import { uiTranslation } from "#/db/schema";
import { uiTranslationCache } from "#/shared-services/i18n/i18n.ui.cache";
import { logger } from "#/shared-services/logger";
import {
  buildSortClause,
  executePaginatedQuery,
  paginationOffset,
} from "#/shared-services/query/query-utils.server";
import type { PaginatedSortParams } from "#/types/query";
import { DEFAULT_LOCALE, type Locale, type TranslationImportResult } from "./i18n.types";

/** 从数据库全量加载指定语言的所有 UI 翻译 */
export async function loadUITranslations(locale: Locale): Promise<Record<string, string>> {
  const rows = await db.select().from(uiTranslation).where(eq(uiTranslation.locale, locale));

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return result;
}

/** 获取 UI 翻译（优先缓存） */
export async function getUITranslations(locale: Locale): Promise<Record<string, string>> {
  // 默认语言即源语言：key 为中文原文，无需翻译资源，直接返回空，免一次查库
  if (locale === DEFAULT_LOCALE) return {};

  const cached = uiTranslationCache.get(locale);
  if (cached) return cached;

  const result = await loadUITranslations(locale);
  uiTranslationCache.set(locale, result);
  return result;
}

/**
 * 刷新 UI 翻译缓存（管理端编辑翻译后调用）
 * 仅失效缓存 key，交由下一次读取懒加载重建，避免单条变更后全量重查库
 */
export async function refreshUITranslationCache(locale?: Locale): Promise<void> {
  if (locale) {
    uiTranslationCache.delete(locale);
    logger.info({ locale }, "UI 翻译缓存已失效");
  } else {
    for (const key of uiTranslationCache.keys()) {
      uiTranslationCache.delete(key);
    }
    logger.info("全部 UI 翻译缓存已清理");
  }
}

/** UI 翻译列表查询参数 */
export interface ListUITranslationsParams extends PaginatedSortParams {
  locale?: Locale;
  keyword?: string;
}

export async function listUITranslations(params?: ListUITranslationsParams) {
  const { locale, keyword, page = 1, pageSize = 20, sortField, sortOrder } = params ?? {};
  const offset = paginationOffset(page, pageSize);

  const conditions: (SQLWrapper | undefined)[] = [];
  if (locale) conditions.push(eq(uiTranslation.locale, locale));
  if (keyword) {
    conditions.push(
      or(like(uiTranslation.key, `%${keyword}%`), like(uiTranslation.value, `%${keyword}%`)),
    );
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const sortFieldMap = {
    key: uiTranslation.key,
    locale: uiTranslation.locale,
    updatedAt: uiTranslation.updatedAt,
  };
  const direction = buildSortClause(sortFieldMap, sortField, sortOrder, "key");

  return executePaginatedQuery(
    db
      .select()
      .from(uiTranslation)
      .where(whereCondition)
      .orderBy(direction)
      .limit(pageSize)
      .offset(offset),
    db.$count(db.select().from(uiTranslation).where(whereCondition)),
    page,
    pageSize,
  );
}

/** UI 翻译创建或更新（基于 locale + key 唯一约束） */
export async function upsertUITranslation(params: {
  id?: string;
  locale: Locale;
  key: string;
  value: string;
  valueType?: EditorType;
}) {
  const valueType: EditorType = params.valueType ?? "input";

  if (params.id) {
    // 更新已有记录：按 id 直改，允许同时修改 key（管理端编辑场景）
    await db
      .update(uiTranslation)
      .set({
        locale: params.locale,
        key: params.key,
        value: params.value,
        valueType,
        updatedAt: new Date(),
      })
      .where(eq(uiTranslation.id, params.id));
  } else {
    // 新建：基于 (locale, key) 唯一约束做原子 upsert，避免并发 select-then-write 竞态
    await db
      .insert(uiTranslation)
      .values({
        locale: params.locale,
        key: params.key,
        value: params.value,
        valueType,
      })
      .onConflictDoUpdate({
        target: [uiTranslation.locale, uiTranslation.key],
        set: {
          value: params.value,
          valueType,
          updatedAt: new Date(),
        },
      });
  }

  // 失效缓存
  await refreshUITranslationCache(params.locale);

  return { success: true };
}

export async function deleteUITranslation(id: string): Promise<boolean> {
  const [existing] = await db.select().from(uiTranslation).where(eq(uiTranslation.id, id)).limit(1);
  if (!existing) return false;

  await db.delete(uiTranslation).where(eq(uiTranslation.id, id));
  await refreshUITranslationCache(existing.locale as Locale);

  return true;
}

/** UI 翻译导出数据格式 */
export interface UiTranslationExportData {
  translations: {
    locale: string;
    key: string;
    value: string;
    valueType: string;
  }[];
}

/** 获取所有 UI 翻译（用于导出） */
export async function getAllUITranslationsForExport(): Promise<
  UiTranslationExportData["translations"]
> {
  const rows = await db
    .select()
    .from(uiTranslation)
    .orderBy(uiTranslation.locale, uiTranslation.key);
  return rows.map((row) => ({
    locale: row.locale,
    key: row.key,
    value: row.value,
    valueType: row.valueType,
  }));
}

/** 导入 UI 翻译（按 (locale, key) 去重后批量原子 upsert） */
export async function importUiTranslations(
  data: UiTranslationExportData,
): Promise<TranslationImportResult> {
  // 规范化 valueType 并去重（拷贝数据，避免污染入参）
  const dedupMap = new Map<
    string,
    Omit<typeof uiTranslation.$inferInsert, "id" | "createdAt" | "updatedAt">
  >();
  for (const item of data.translations) {
    const valueType = EDITOR_TYPES.includes(item.valueType as EditorType)
      ? (item.valueType as EditorType)
      : "input";
    dedupMap.set(`${item.locale}::${item.key}`, {
      locale: item.locale,
      key: item.key,
      value: item.value,
      valueType,
    });
  }
  const batch = Array.from(dedupMap.values());
  if (batch.length === 0) return { created: 0, updated: 0 };

  const affectedLocales = [...new Set(batch.map((item) => item.locale))];

  // 统计：单次查询已存在的 (locale, key)，据此判定新增/更新，避免逐条 select
  const existingRows = await db
    .select({ locale: uiTranslation.locale, key: uiTranslation.key })
    .from(uiTranslation)
    .where(inArray(uiTranslation.locale, affectedLocales));
  const existingKeys = new Set(existingRows.map((row) => `${row.locale}::${row.key}`));

  let created = 0;
  let updated = 0;
  for (const item of batch) {
    if (existingKeys.has(`${item.locale}::${item.key}`)) updated++;
    else created++;
  }

  // 批量原子 upsert：整批一次写入，基于唯约束冲突更新
  await db
    .insert(uiTranslation)
    .values(batch)
    .onConflictDoUpdate({
      target: [uiTranslation.locale, uiTranslation.key],
      set: {
        value: sql`excluded.value`,
        valueType: sql`excluded.value_type`,
        updatedAt: new Date(),
      },
    });

  // 失效受影响语言的缓存
  await Promise.all(affectedLocales.map((locale) => refreshUITranslationCache(locale as Locale)));

  return { created, updated };
}
