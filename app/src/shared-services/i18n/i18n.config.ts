/**
 * i18next 实例创建辅助：将翻译数据注入 i18next resource 格式
 */
import i18next, { type i18n } from "i18next";
import type { Locale, Translations } from "./i18n.types";
import { DEFAULT_LOCALE } from "./i18n.types";

export type I18nInstance = i18n;

/**
 * 根据当前语言和翻译数据创建一个 i18next 实例
 * SSR 下需要每次请求创建新实例，避免跨请求状态污染
 * i18next v26：resources 必须通过 init options 传入
 */
export function createI18nInstance(
  locale: Locale,
  translations: Translations,
  fallbackLng: Locale | false = DEFAULT_LOCALE,
): i18n {
  const instance = i18next.createInstance();

  instance.init({
    lng: locale,
    fallbackLng,
    interpolation: {
      escapeValue: false,
      // 使用 i18next 默认 {{key}} 前缀：单大括号不会被误判为插值，避免含 { } 的文案被替换
    },
    returnNull: false,
    returnEmptyString: false,
    resources: {
      [locale]: { translation: translations },
    },
  });

  return instance;
}
