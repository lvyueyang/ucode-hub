/**
 * 编辑器类型预览标签：显示 EditorType 对应的中文名称
 */
import { Tag } from "antd";
import type { EditorType } from "#/constants/editor-types";
import { EDITOR_TYPE_LABELS } from "#/constants/editor-types";

interface EditorTypePreviewProps {
  /** 编辑器类型值 */
  valueType: string | null | undefined;
  /** 值为空时显示的文本，默认 "—" */
  fallback?: string;
}

/** 将编辑器类型渲染为带中文标签的 Tag */
export function EditorTypePreview({ valueType, fallback = "—" }: EditorTypePreviewProps) {
  if (!valueType) return <span className="text-xs text-muted-foreground">{fallback}</span>;
  const label = EDITOR_TYPE_LABELS[valueType as EditorType] ?? valueType;
  return <Tag>{label}</Tag>;
}
