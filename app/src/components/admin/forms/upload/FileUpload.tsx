/**
 * 文件上传组件（app 业务壳）
 * 基础组件在 @ucode/hub-ui-spa/upload，此处注入项目统一的上传与文件库查询实现
 * value / onChange 兼容 antd Form.Item 直接注入
 */
import { FileUpload as FileUploadBase } from "@ucode/hub-ui-spa/upload";
import { fetchFiles, readUrl, uploadFile } from "./file-adapter";

interface FileUploadProps {
  /** 文件 ID（单文件）或文件 ID 数组（多文件），兼容 Form.Item 注入 */
  value?: string | string[];
  /** 值变更回调，兼容 Form.Item 注入 */
  onChange?: (value: string | string[]) => void;
  /** 最大上传数量，默认 1 */
  maxCount?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 接受的文件类型，不传允许所有类型 */
  accept?: string;
  /** 上传模式：drag 为拖拽区，button 为按钮点击 */
  type?: "drag" | "button";
  /** 上传列表样式：text（文件列表）、picture（缩略图列表） */
  listType?: "text" | "picture";
  /** 上传为永久文件，默认 true；设为 false 则为临时文件（7 天后过期） */
  permanent?: boolean;
}

/** 文件上传（业务壳）：注入项目统一的上传/查询实现，其余属性透传基础组件 */
export function FileUpload(props: FileUploadProps) {
  return (
    <FileUploadBase {...props} uploadFile={uploadFile} fetchFiles={fetchFiles} readUrl={readUrl} />
  );
}
