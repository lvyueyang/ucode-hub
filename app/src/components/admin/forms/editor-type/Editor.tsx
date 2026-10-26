/**
 * 根据编辑器类型动态切换编辑控件：input / text / number / json / rich / code / image / file
 * 支持预览模式（preview），以只读形式展示内容
 * value / onChange 兼容 antd Form.Item 注入
 */

import { Input, InputNumber, Switch } from "antd";
import type { ChangeEvent } from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import { getFileInfoSFn } from "#/services/file/file.functions";
import { toBool } from "#/utils/bool";
import { sfnUnwrap } from "#/utils/sfn-error";
import { RichEditor } from "../RichEditor";

const CodeEditor = lazy(() =>
  import("@ucode/hub-ui-spa/editor").then((mod) => ({
    default: mod.CodeEditor,
  })),
);

const ImageUpload = lazy(() =>
  import("../upload/ImageUpload").then((mod) => ({
    default: mod.ImageUpload,
  })),
);

const FileUpload = lazy(() =>
  import("../upload/FileUpload").then((mod) => ({
    default: mod.FileUpload,
  })),
);

import type { EditorType } from "#/constants/editor-types";

export interface EditorProps {
  /** 编辑器类型，决定使用何种编辑控件 */
  type: EditorType;
  /** 当前值（兼容 antd Form.Item 注入） */
  value?: string | number;
  /** 值变化回调（兼容 antd Form.Item 注入） */
  onChange?: (value: string | number) => void;
  /** 是否为预览模式，开启后所有编辑器变为只读展示 */
  preview?: boolean;
  /** 编程语言标识（json / code 类型使用），默认 json 为 'json'，code 为 'plaintext' */
  language?: string;
  /** 数字编辑器最小值 */
  min?: number;
  /** 数字编辑器最大值 */
  max?: number;
  /** 数字编辑器步长 */
  step?: number;
  /** 文本域行数 */
  rows?: number;
  /** 占位文字 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** DOM id */
  id?: string;
}

/** CodeEditor 加载中的占位 */
function EditorLoading() {
  return (
    <div className="flex items-center justify-center h-[300px] rounded-md border border-border bg-background-secondary text-muted-foreground text-sm">
      编辑器加载中...
    </div>
  );
}

/** JSON 值格式化：尝试解析并美化，失败则返回原字符串 */
function formatJsonValue(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** 文件预览组件：异步获取文件名后展示下载链接 */
function FilePreview({ fileId }: { fileId: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!fileId) {
      setLoading(false);
      return;
    }
    // 文件名仅用于预览展示，失败静默并回落展示文件 ID
    const loadFileName = async () => {
      const [name, err] = await sfnUnwrap(getFileInfoSFn({ data: { id: fileId } }), {
        silent: true,
      });
      if (cancelled) return;
      if (!err) setFileName(name);
      setLoading(false);
    };
    loadFileName();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const href = `/file/r/${fileId}`;
  return (
    <div className="rounded-md border border-border bg-background-secondary px-3 py-2 text-sm min-h-[40px] flex items-center">
      {loading ? (
        <span className="text-muted-foreground">加载中...</span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline truncate"
        >
          {fileName || fileId}
        </a>
      )}
    </div>
  );
}

function PreviewContent({
  type,
  value,
  language,
}: {
  type: EditorType;
  value: string;
  language?: string;
}) {
  switch (type) {
    case "json": {
      const formatted = formatJsonValue(value);
      return (
        <Suspense fallback={<EditorLoading />}>
          <CodeEditor value={formatted} language="json" readOnly />
        </Suspense>
      );
    }
    case "code":
      return (
        <Suspense fallback={<EditorLoading />}>
          <CodeEditor value={value} language={language ?? "plaintext"} readOnly />
        </Suspense>
      );
    case "rich":
      return (
        <div
          className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-border p-4 min-h-[120px]"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      );
    case "text":
      return (
        <pre className="rounded-md border border-border bg-background-secondary p-4 min-h-[80px] text-sm whitespace-pre-wrap break-words">
          {value || <span className="text-muted-foreground">—</span>}
        </pre>
      );
    case "image": {
      const src = value ? `/file/r/${value}` : "";
      return (
        <div className="rounded-md border border-border p-2 min-h-[80px] flex items-center justify-center bg-background-secondary">
          {value ? (
            <img
              src={src}
              alt="预览图片"
              className="max-h-[200px] max-w-full object-contain rounded"
            />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      );
    }
    case "file":
      return <FilePreview fileId={value} />;
    case "boolean":
      return (
        <div className="rounded-md border border-border bg-background-secondary px-3 py-2 text-sm min-h-[40px]">
          {toBool(value) ? "是" : "否"}
        </div>
      );
    default:
      return (
        <div className="rounded-md border border-border bg-background-secondary px-3 py-2 text-sm min-h-[40px]">
          {value || <span className="text-muted-foreground">—</span>}
        </div>
      );
  }
}

export function Editor({
  type,
  value,
  onChange,
  preview = false,
  language,
  min,
  max,
  step,
  rows = 3,
  placeholder,
  disabled = false,
  id,
}: EditorProps) {
  if (preview) {
    return (
      <PreviewContent type={type} value={value != null ? String(value) : ""} language={language} />
    );
  }

  switch (type) {
    case "input":
      return (
        <Input
          id={id}
          value={value as string}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      );

    case "text":
      return (
        <Input.TextArea
          id={id}
          value={value as string}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
        />
      );

    case "number":
      return (
        <InputNumber
          id={id}
          value={value as number}
          onChange={(v: number | null) => onChange?.(v ?? 0)}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full"
        />
      );

    case "boolean":
      return (
        <Switch
          id={id}
          checked={toBool(value)}
          onChange={(checked) => onChange?.(checked ? "true" : "false")}
          disabled={disabled}
        />
      );

    case "json":
      return (
        <Suspense fallback={<EditorLoading />}>
          <CodeEditor
            value={value != null ? String(value) : ""}
            onChange={(v) => onChange?.(v)}
            language="json"
          />
        </Suspense>
      );

    case "code":
      return (
        <Suspense fallback={<EditorLoading />}>
          <CodeEditor
            value={value != null ? String(value) : ""}
            onChange={(v) => onChange?.(v)}
            language={language ?? "plaintext"}
          />
        </Suspense>
      );

    case "rich":
      return <RichEditor value={value as string} onChange={(html) => onChange?.(html)} />;

    case "image":
      return (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[120px] rounded-md border border-border bg-background-secondary text-muted-foreground text-sm">
              上传组件加载中...
            </div>
          }
        >
          <ImageUpload
            value={value as string}
            onChange={(v) => onChange?.(v as string)}
            maxCount={1}
            disabled={disabled}
          />
        </Suspense>
      );

    case "file":
      return (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[120px] rounded-md border border-border bg-background-secondary text-muted-foreground text-sm">
              上传组件加载中...
            </div>
          }
        >
          <FileUpload
            value={value as string}
            onChange={(v) => onChange?.(v as string)}
            maxCount={1}
            disabled={disabled}
          />
        </Suspense>
      );

    default:
      return null;
  }
}
