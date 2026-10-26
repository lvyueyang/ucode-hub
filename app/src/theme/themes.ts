/**
 * 主题注册表：管理端与前台主题的单一事实来源
 * 每个端对应一个主题预设（`ThemePreset`），含亮/暗两档具名主题，
 * data-theme 属性承载完整主题名（如 admin-brown-light）。
 * 注意：antd 的 colorPrimary 需要真实色值，必须与 CSS 中对应 `--s-primary` 保持同色。
 * Document.tsx 内联 init 脚本从注册表推导 storageKey 与 dataTheme，避免手工双写漂移。
 */
import type { ThemePreset } from "@ucode/hub-ui-ssr/theme";

/** 管理端主题预设：棕色品牌 */
export const ADMIN_THEME: ThemePreset = {
  storageKey: "admin-theme",
  light: {
    dataTheme: "admin-brown-light",
    isDark: false,
    // 与 admin.global.css 亮色 --s-primary（--t-brand-brown-500）同色
    antdColorPrimary: "#795548",
    // 与 admin.global.css 亮色 --s-surface（--t-neutral-0）同色
    themeColor: "#ffffff",
  },
  dark: {
    dataTheme: "admin-brown-dark",
    isDark: true,
    // 与 admin.global.css 暗色 --s-primary（--t-brand-brown-300）同色
    antdColorPrimary: "#a1887f",
    // 与 admin.global.css 暗色 --s-surface 同色
    themeColor: "#0a0a0a",
  },
};

/** 前台主题预设：中性灰 */
export const CLIENT_THEME: ThemePreset = {
  storageKey: "client-theme",
  light: {
    dataTheme: "client-neutral-light",
    isDark: false,
    // 前台为「文字即主色」的中性风格，主色取中性深色
    antdColorPrimary: "#212121",
    // 与 ssr.global.css 亮色 --s-surface（--t-neutral-0）同色
    themeColor: "#ffffff",
  },
  dark: {
    dataTheme: "client-neutral-dark",
    isDark: true,
    antdColorPrimary: "#f5f5f5",
    // 与 ssr.global.css 暗色 --s-surface 同色
    themeColor: "#0a0a0a",
  },
};
