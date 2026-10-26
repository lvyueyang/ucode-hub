/**
 * 双端共享的状态注入统一出口（GlobalStore + i18n）
 */
export {
  GlobalStoreProvider,
  globalStoreContext,
  useGlobalStore,
} from "./global-store";
export { I18nProvider, useLocale, useTranslation } from "./i18n-context";
