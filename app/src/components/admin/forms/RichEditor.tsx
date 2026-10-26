/**
 * 富文本编辑器（app 业务壳）
 * 纯组件逻辑在 @ucode/hub-ui-spa/editor，此处注入项目统一的文件上传与媒体库列表实现
 * value / onChange 兼容 antd Form.Item 直接注入
 */

import type { RichEditorMedia } from "@ucode/hub-ui-spa/editor";
import { RichEditor as RichEditorBase } from "@ucode/hub-ui-spa/editor";
import { getMediaList, uploadFileAndGetUrl } from "./upload/file-adapter";

interface RichEditorProps {
  value?: string;
  onChange?: (html: string) => void;
}

/** 编辑器媒体能力：图片/视频/音频/附件统一走后台上传，媒体库取自文件库 */
const MEDIA: RichEditorMedia = {
  uploadImage: uploadFileAndGetUrl,
  uploadVideo: uploadFileAndGetUrl,
  uploadAudio: uploadFileAndGetUrl,
  uploadAttachment: uploadFileAndGetUrl,
  getList: getMediaList,
};

export function RichEditor({ value = "", onChange }: RichEditorProps) {
  return <RichEditorBase value={value} onChange={onChange} media={MEDIA} />;
}
