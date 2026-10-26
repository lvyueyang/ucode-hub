/**
 * 国际化服务层统一导出（barrel）
 * UI 翻译 → i18n.ui.server；实体字段翻译 → i18n.content.server；
 * 实体翻译导入导出 → i18n.content-io；共享类型 → i18n.types
 */

export type {
  ContentTranslationResult,
  ListContentTranslationsParams,
} from "./i18n.content.server";
export {
  applyTranslations,
  deleteContentTranslation,
  getContentTranslations,
  getExistingTranslations,
  getFieldTranslations,
  listContentTranslations,
  translateRecord,
  translateRecords,
  upsertContentTranslation,
  upsertContentTranslations,
} from "./i18n.content.server";
export type { ContentTranslationExportData } from "./i18n.content-io";
export {
  getAllContentTranslationsForExport,
  importContentTranslations,
} from "./i18n.content-io";
export type { TranslationImportResult } from "./i18n.types";
export type {
  ListUITranslationsParams,
  UiTranslationExportData,
} from "./i18n.ui.server";
export {
  deleteUITranslation,
  getAllUITranslationsForExport,
  getUITranslations,
  importUiTranslations,
  listUITranslations,
  loadUITranslations,
  refreshUITranslationCache,
  upsertUITranslation,
} from "./i18n.ui.server";
