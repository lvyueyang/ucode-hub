/**
 * UI 翻译缓存实例：key = locale，value = { 中文文本: 翻译 }
 * 仅允许 src/shared-services/i18n/i18n.ui.server.ts 直接操作
 */
import { MemoryCache } from "@ucode/hub-lib/cache";

/** UI 翻译缓存实例 */
export const uiTranslationCache = new MemoryCache<Record<string, string>>({});
