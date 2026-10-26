/**
 * 资源管理器纯工具与共享类型
 */
import type { ListDirectoryResult } from "#/services/file-explorer/file-explorer.server";

/** 面包屑项类型 */
export interface BreadcrumbItem {
  label: string;
  path: string;
}

/** 目录数据（含面包屑和写保护状态） */
export interface DirData extends ListDirectoryResult {
  breadcrumb: BreadcrumbItem[];
  writeProtected: boolean;
}

/** 文本文件扩展名列表 */
export const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "json",
  "xml",
  "yaml",
  "yml",
  "log",
  "csv",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "html",
  "htm",
  "sh",
  "bash",
  "zsh",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "ini",
  "toml",
  "cfg",
  "conf",
  "env",
  "gitignore",
  "sql",
  "graphql",
  "vue",
  "svelte",
  "less",
  "scss",
  "sass",
]);

export function isTextFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

/** 构建条目的子路径 */
export function entryPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

/** 将子路径格式化为路径输入框的展示值（根目录显示 "/"） */
export function formatDisplayPath(subPath: string): string {
  return subPath && subPath !== "/" ? `/${subPath}` : "/";
}

/**
 * 规范化用户输入的路径：去首尾空格/斜杠、折叠连续斜杠
 * 空输入或仅斜杠视为根目录，返回 ""
 */
export function normalizePath(input: string): string {
  return input
    .trim()
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}
