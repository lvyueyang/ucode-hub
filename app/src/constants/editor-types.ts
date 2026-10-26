/**
 * 编辑器类型共享定义：Editor 支持的类型及其标签映射
 * 客户端安全，可被任意模块引用
 */

/** 支持的编辑器类型 */
export type EditorType =
  | "input"
  | "text"
  | "number"
  | "boolean"
  | "json"
  | "rich"
  | "code"
  | "image"
  | "file";

/** 所有编辑器类型的数组，便于迭代渲染 */
export const EDITOR_TYPES = [
  "input",
  "text",
  "number",
  "boolean",
  "json",
  "rich",
  "code",
  "image",
  "file",
] as const satisfies readonly EditorType[];

/** 编辑器类型对应的中文标签 */
export const EDITOR_TYPE_LABELS: Record<EditorType, string> = {
  input: "Input 单行输入",
  text: "Text 多行文本域",
  number: "Number 数字输入",
  boolean: "Boolean 布尔开关",
  json: "JSON 编辑器",
  code: "Code 代码编辑器",
  rich: "Rich 富文本编辑器",
  image: "Image 图片上传",
  file: "File 文件上传",
};
