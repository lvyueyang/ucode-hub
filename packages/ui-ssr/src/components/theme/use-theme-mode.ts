/**
 * 统一主题模式管理 hook
 * 基于 useSyncExternalStore 将 localStorage 中的主题模式作为共享外部状态，
 * 保证同一 storageKey 的多个调用点（ThemeToggle / AdminLayout）实时同步，
 * 并支持跨标签页与操作系统主题变化联动。
 * 每个端对应一个主题预设（亮/暗两档具名主题），data-theme 承载完整主题名
 * （预设定义见 app 的 theme/themes.ts）。
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

/** 具名主题方案：dataTheme 须与对应 global.css 主题块选择器一致 */
export interface ThemeScheme {
  /** data-theme 属性值，须与 CSS 主题块选择器一致 */
  dataTheme: string;
  isDark: boolean;
  /** antd ConfigProvider colorPrimary，须与 CSS `--s-primary` 同色 */
  antdColorPrimary: string;
  /** 浏览器 UI 主题色（地址栏等），须与对应 global.css `--s-surface` 同色，驱动 `<meta name="theme-color">` */
  themeColor: string;
}

/** 主题预设：一端（管理端/前台）的明暗两档主题 */
export interface ThemePreset {
  /** localStorage 明暗模式键名 */
  storageKey: string;
  light: ThemeScheme;
  dark: ThemeScheme;
}

/** 主题明暗模式 */
export type ThemeMode = "light" | "dark" | "auto";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** 从 localStorage 读取保存的主题明暗模式 */
function getStoredMode(key: string): ThemeMode {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  } catch {
    /* SSR 环境忽略 */
  }
  return "auto";
}

/** 模块级监听器集合：同一页面内所有 hook 实例共享，setMode 时统一通知 */
const listeners = new Set<() => void>();

function notifyThemeChange() {
  for (const listener of listeners) listener();
}

/**
 * 订阅主题变化：同页实例通知 + storage 事件（跨标签页）。
 * storage 回调仅关注本端主题键，避免同源其他键的写入触发无关重渲染。
 */
function subscribeTheme(preset: ThemePreset, callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === preset.storageKey) {
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** 订阅操作系统暗色偏好变化（auto 模式下需要联动） */
function subscribeMedia(callback: () => void) {
  const mq = window.matchMedia(DARK_MEDIA_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMediaSnapshot() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

/**
 * 应用主题到 DOM：两端统一使用 data-theme 属性（值为完整主题名，见主题注册表）。
 * 主题名由 themes.ts 注册表与 global.css 主题块共同约定。
 */
function applyThemeToDom(mode: ThemeMode, preset: ThemePreset, prefersDark: boolean) {
  const resolvedDark = mode === "auto" ? prefersDark : mode === "dark";
  const scheme = resolvedDark ? preset.dark : preset.light;
  document.documentElement.setAttribute("data-theme", scheme.dataTheme);
  document.documentElement.style.colorScheme = resolvedDark ? "dark" : "light";

  // 同步浏览器 UI 主题色（地址栏等），跟随当前明暗主题
  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", scheme.themeColor);
  }
}

/**
 * 统一主题模式 hook
 * @param preset 主题预设（storageKey + 亮暗两档，见 app 的 theme/themes.ts）
 * @returns mode 明暗三态、scheme 当前主题方案（含 dataTheme 与 antd 主色）
 */
export function useThemeMode(preset: ThemePreset) {
  const mode = useSyncExternalStore(
    (cb) => subscribeTheme(preset, cb),
    () => getStoredMode(preset.storageKey),
    () => "auto" as ThemeMode,
  );
  const prefersDark = useSyncExternalStore(subscribeMedia, getMediaSnapshot, () => false);

  const setMode = useCallback(
    (newMode: ThemeMode) => {
      try {
        localStorage.setItem(preset.storageKey, newMode);
      } catch {
        /* ignore */
      }
      notifyThemeChange();
    },
    [preset.storageKey],
  );

  // 同步主题到 DOM：多实例应用同一值是幂等操作。
  // 直接读取 localStorage/媒体查询的最新值应用，而非使用 effect 闭包里的快照——
  // SSR 前台水合期间 useSyncExternalStore 首帧返回服务端默认值，若用默认值应用会
  // 短暂覆盖 Document init 脚本已设置好的首帧主题（管理端包在 ClientOnly 内不受影响）。
  // 依赖里的 mode/prefersDark 只作为重放触发源，effect 内改读最新持久化值。
  useEffect(() => {
    applyThemeToDom(
      getStoredMode(preset.storageKey),
      preset,
      window.matchMedia(DARK_MEDIA_QUERY).matches,
    );
  }, [mode, prefersDark, preset]);

  const isDark = mode === "auto" ? prefersDark : mode === "dark";
  const scheme: ThemeScheme = isDark ? preset.dark : preset.light;

  return { mode, setMode, isDark, scheme };
}
