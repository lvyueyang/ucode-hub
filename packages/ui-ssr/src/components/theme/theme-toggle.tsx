/**
 * 前台主题切换按钮：三态循环（亮/暗/跟随系统）
 * 需传入主题预设（storageKey 与亮暗两档，见 app 的 theme/themes.ts）
 */
import { type ThemePreset, useThemeMode } from "./use-theme-mode";

interface ThemeToggleProps {
  /** 主题预设（CLIENT_THEME） */
  preset: ThemePreset;
}

export default function ThemeToggle({ preset }: ThemeToggleProps) {
  const { mode, setMode } = useThemeMode(preset);

  function toggleMode() {
    const nextMode = mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
    setMode(nextMode);
  }

  const label =
    mode === "auto"
      ? "主题：跟随系统，点击切换"
      : `主题：${mode === "dark" ? "暗色" : "亮色"}，点击切换`;

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="flex h-8 items-center border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-accent"
    >
      {mode === "auto" ? "Auto" : mode === "dark" ? "Dark" : "Light"}
    </button>
  );
}
