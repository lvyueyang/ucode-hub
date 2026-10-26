/**
 * 文件上传组件的纯转换工具：文件 ID 与 antd UploadFile 之间的双向映射
 * 拆分自 FileUpload.tsx 以控制组件文件体积；无副作用、不依赖组件上下文
 */
import type { UploadFile } from "antd";

/** 将文件 ID 转为 UploadFile 对象（用于展示） */
export function idToUploadFile(id: string, readUrl: (id: string) => string): UploadFile {
  return {
    uid: id,
    name: id,
    status: "done",
    url: readUrl(id),
  };
}

/** 将 value 转为 UploadFile[] */
export function valueToFileList(
  value: string | string[] | undefined,
  readUrl: (id: string) => string,
): UploadFile[] {
  if (!value) return [];
  const ids = Array.isArray(value) ? value : [value];
  return ids.filter(Boolean).map((id) => idToUploadFile(id, readUrl));
}

/** 从 UploadFile 列表提取文件 ID */
export function extractIds(list: UploadFile[]): string[] {
  return list.filter((f) => f.status === "done" && f.uid).map((f) => f.uid);
}
