/**
 * 基于 @monaco-editor/react 的代码编辑器组件
 * 支持语法高亮、JSON 校验、亮/暗主题、只读模式
 * value / onChange 兼容 antd Form.Item 注入
 */
import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";

export interface CodeEditorProps {
  /** 自定义类名 */
  className?: string;
  /** 编辑器内容 */
  value: string;
  /** 内容变化回调 */
  onChange?: (value: string) => void;
  /** 编程语言标识 */
  language: string;
  /** 是否只读 */
  readOnly?: boolean;
  /** 编辑器高度：数字按像素，字符串透传为 height 样式值，默认 300 */
  height?: number | string;
}

/** 当前是否暗色主题：data-theme 承载完整主题名（如 admin-theme-dark） */
function isDarkTheme(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme?.endsWith("-dark") === true
  );
}

export function CodeEditor({
  className,
  value,
  onChange,
  language,
  readOnly = false,
  height = 300,
}: CodeEditorProps) {
  const [isDark, setIsDark] = useState(isDarkTheme);

  // 订阅 data-theme 变化：主题切换后同步编辑器亮/暗（与 rich-editor 的实现对齐）
  useEffect(() => {
    setIsDark(isDarkTheme());
    const observer = new MutationObserver(() => setIsDark(isDarkTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`rounded-md border border-border overflow-hidden ${className}`}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <Editor
        height="100%"
        language={language}
        value={value}
        theme={isDark ? "vs-dark" : "light"}
        onChange={(val: string | undefined) => onChange?.(val ?? "")}
        loading={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            编辑器加载中...
          </div>
        }
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          lineNumbers: "on",
          renderLineHighlight: "none",
          fontSize: 13,
          tabSize: 2,
          padding: { top: 12 },
          automaticLayout: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
    </div>
  );
}
