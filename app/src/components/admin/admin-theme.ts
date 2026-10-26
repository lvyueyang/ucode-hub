/**
 * 管理端主题 Context：亮/暗/跟随系统三态模式 + 是否暗色判断
 * 独立文件承载，避免 Context 定义埋在 AdminLayout 中被多处引用
 */
import type { ThemeMode } from "@ucode/hub-ui-ssr/theme";
import { createContext, useContext } from "react";

/** Admin 主题 Context 值 */
interface AdminThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** 当前是否为暗色模式（水合完成前为 false） */
  isDark: boolean;
}

export const AdminThemeContext = createContext<AdminThemeContextType | undefined>(undefined);

/**
 * 获取管理端主题状态
 * 必须在 AdminProvider 内使用
 */
export function useAdminTheme(): AdminThemeContextType {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error("useAdminTheme 必须在 AdminProvider 内使用");
  return ctx;
}
