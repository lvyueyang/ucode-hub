/**
 * 实体字段翻译的导入与导出：ContentTranslation 数据的批量导出与批量 upsert 导入
 * 独立成「导入导出」职责，由 i18n.server barrel 直接引用
 */
import { and, inArray, sql } from "drizzle-orm";
import { EDITOR_TYPES, type EditorType } from "#/constants/editor-types";
import { db, withTransaction } from "#/db/index";
import { contentTranslation } from "#/db/schema";
import { refreshConfigTranslationCache } from "#/shared-services/config/config.server";
import type { Locale, TranslationImportResult } from "./i18n.types";

/** 实体翻译导出数据格式 */
export interface ContentTranslationExportData {
  translations: {
    entityType: string;
    entityId: string;
    fieldName: string;
    locale: string;
    value: string;
    valueType: string;
  }[];
}

/** 获取所有实体翻译（用于导出） */
export async function getAllContentTranslationsForExport(): Promise<
  ContentTranslationExportData["translations"]
> {
  const rows = await db
    .select()
    .from(contentTranslation)
    .orderBy(
      contentTranslation.entityType,
      contentTranslation.entityId,
      contentTranslation.fieldName,
      contentTranslation.locale,
    );
  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    fieldName: row.fieldName,
    locale: row.locale,
    value: row.value,
    valueType: row.valueType,
  }));
}

/** 导入实体翻译（按唯一键去重后批量原子 upsert，在事务中完成） */
export async function importContentTranslations(
  data: ContentTranslationExportData,
): Promise<TranslationImportResult> {
  // 规范化 valueType 并去重（拷贝数据，避免污染入参）
  const dedupMap = new Map<
    string,
    Omit<typeof contentTranslation.$inferInsert, "id" | "createdAt" | "updatedAt">
  >();
  for (const item of data.translations) {
    const valueType = EDITOR_TYPES.includes(item.valueType as EditorType)
      ? (item.valueType as EditorType)
      : "text";
    dedupMap.set(`${item.entityType}::${item.entityId}::${item.fieldName}::${item.locale}`, {
      entityType: item.entityType,
      entityId: item.entityId,
      fieldName: item.fieldName,
      locale: item.locale,
      value: item.value,
      valueType,
    });
  }
  const batch = Array.from(dedupMap.values());
  if (batch.length === 0) return { created: 0, updated: 0 };

  const entityTypes = [...new Set(batch.map((item) => item.entityType))];
  const locales = [...new Set(batch.map((item) => item.locale))];

  let created = 0;
  let updated = 0;

  await withTransaction(async (tx) => {
    // 统计：单次查询已存在的唯一键，据此判定新增/更新，避免逐条 select
    const existingRows = await tx
      .select({
        entityType: contentTranslation.entityType,
        entityId: contentTranslation.entityId,
        fieldName: contentTranslation.fieldName,
        locale: contentTranslation.locale,
      })
      .from(contentTranslation)
      .where(
        and(
          inArray(contentTranslation.entityType, entityTypes),
          inArray(contentTranslation.locale, locales),
        ),
      );
    const existingKeys = new Set(
      existingRows.map(
        (row) => `${row.entityType}::${row.entityId}::${row.fieldName}::${row.locale}`,
      ),
    );
    for (const item of batch) {
      const key = `${item.entityType}::${item.entityId}::${item.fieldName}::${item.locale}`;
      if (existingKeys.has(key)) updated++;
      else created++;
    }

    // 批量原子 upsert：事务内整批一次写入，基于唯一约束冲突更新
    await tx
      .insert(contentTranslation)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          contentTranslation.entityType,
          contentTranslation.entityId,
          contentTranslation.fieldName,
          contentTranslation.locale,
        ],
        set: {
          value: sql`excluded.value`,
          valueType: sql`excluded.value_type`,
          updatedAt: new Date(),
        },
      });
  });

  // 导入可能改写 system_config 翻译，导入后刷新对应语言配置翻译缓存（修复此前未同步的隐患）
  const affectedConfigLocales = new Set<Locale>();
  for (const item of batch) {
    if (item.entityType === "system_config") {
      affectedConfigLocales.add(item.locale as Locale);
    }
  }
  await Promise.all(
    [...affectedConfigLocales].map((locale) => refreshConfigTranslationCache(locale)),
  );

  return { created, updated };
}
