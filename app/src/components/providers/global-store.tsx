/**
 * 全局状态 Provider：SSR 注入 locale / translations / systemConfig，并组装 i18n Provider
 */

import { createContext, useContext } from "react";
import type { Locale, Translations } from "#/shared-services/i18n/i18n.types";
import { I18nProvider } from "./i18n-context";

interface GlobalStoreValue {
  locale: Locale;
  translations: Translations;
  /** 客户端可见的系统配置：key → 当前语言解析后的值 */
  systemConfig: Record<string, string>;
}

export const globalStoreContext = createContext<GlobalStoreValue | undefined>(undefined);

export function GlobalStoreProvider({
  value,
  children,
}: {
  value: GlobalStoreValue;
  children: React.ReactNode;
}) {
  return (
    <globalStoreContext.Provider value={value}>
      <I18nProvider locale={value.locale} translations={value.translations}>
        {children}
      </I18nProvider>
    </globalStoreContext.Provider>
  );
}

/** 读取全局注入的 locale / translations / systemConfig，必须在 GlobalStoreProvider 内使用 */
export function useGlobalStore(): GlobalStoreValue {
  const context = useContext(globalStoreContext);
  if (!context) {
    throw new Error("useGlobalStore 必须在 GlobalStoreProvider 内部使用");
  }
  const { locale, translations, systemConfig } = context;
  return {
    locale,
    translations,
    systemConfig,
  };
}
