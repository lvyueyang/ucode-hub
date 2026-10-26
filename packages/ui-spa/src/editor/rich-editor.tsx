/**
 * 基于 @easyx/editor 的富文本编辑器（纯展示组件）
 * 与业务解耦：媒体上传与媒体库列表经回调注入，由宿主决定上传/媒体库实现
 * value / onChange 兼容 antd Form.Item 直接注入
 *
 * @easyx/editor 为命令式 API（createEditor(container, options)），此处以 React 组件包装：
 * 生命周期管理、受控 value 同步、暗色主题跟随、媒体能力装配，均由本组件承担
 */
import type { EditorOptions, MediaUploadConfig } from "@easyx/editor";
import { createEditor } from "@easyx/editor";
import { useEffect, useRef } from "react";

/** 媒体库列表项（结构兼容 @easyx/editor 的 MediaItem） */
export interface RichEditorMediaItem {
  id: string;
  url: string;
  name: string;
  size?: number;
  fileType?: string;
}

/**
 * 媒体能力集合：图片/视频/音频/附件上传 + 媒体库列表
 * 均由宿主注入（如对接项目 uploadFileSFn / getFileListSFn），本组件只负责装配到编辑器
 */
export interface RichEditorMedia {
  /** 图片上传：接收文件，返回可插入编辑器的图片地址 */
  uploadImage?: (file: File) => Promise<string>;
  /** 视频上传：返回可插入编辑器的视频地址 */
  uploadVideo?: (file: File) => Promise<string>;
  /** 音频上传：返回可插入编辑器的音频地址 */
  uploadAudio?: (file: File) => Promise<string>;
  /** 附件上传：返回可插入编辑器的附件地址 */
  uploadAttachment?: (file: File) => Promise<string>;
  /**
   * 媒体库列表：按媒体类型前缀分页拉取已上传文件，供编辑器「媒体库」选择 Tab。
   * mimePrefix / excludeMimePrefixes 由本组件按媒体类型注入：
   * image=image/、video=video/、audio=audio/，attachment 不限定正向前缀但排除音视频/图片
   */
  getList?: (params: {
    mimePrefix?: string;
    excludeMimePrefixes?: string[];
    keyword?: string;
    page: number;
    pageSize: number;
  }) => Promise<{ items: RichEditorMediaItem[]; total: number }>;
}

export interface RichEditorProps {
  /** 当前 HTML 内容（兼容 antd Form.Item 注入） */
  value?: string;
  /** 内容变化回调（兼容 antd Form.Item 注入） */
  onChange?: (html: string) => void;
  /**
   * 图片上传回调（保留旧用法）：接收文件，返回可插入编辑器的图片地址
   * 与 media.uploadImage 等价，二者取其一
   */
  uploadImage?: (file: File) => Promise<string>;
  /** 媒体能力集合（图片/视频/音频/附件上传 + 媒体库列表），由宿主注入 */
  media?: RichEditorMedia;
  /** 编辑器最小高度（number 视为 px）；默认 300 */
  minHeight?: number | string;
  /** 编辑器最大高度：内容撑到上限后编辑器内部滚动；默认 512（抽屉内不顶出 footer） */
  maxHeight?: number | string;
  /** 固定高度：给定值时高度固定并内部滚动（默认随内容伸缩、受 maxHeight 约束） */
  height?: number | "auto" | string;
  /** 是否启用右下角拖拽手柄调节高度（受 minHeight / maxHeight 约束）；默认开启 */
  resizable?: boolean;
}

/** 编辑器默认高度：抽屉内一屏可见正文 + footer，需要更大时由用户拖拽手柄或宿主覆盖 */
const DEFAULT_MIN_HEIGHT = 300;
const DEFAULT_MAX_HEIGHT = 512;

/** @easyx/editor 编辑器实例类型 */
type EasyxEditorInstance = ReturnType<typeof createEditor>;

/** 媒体类型 */
type MediaType = "image" | "video" | "audio" | "attachment";

const MEDIA_TYPES: MediaType[] = ["image", "video", "audio", "attachment"];

/** 各媒体类型对应的 mime 前缀（用于媒体库按类型正向筛选；附件不限定正向前缀） */
const MEDIA_MIME_PREFIX: Record<MediaType, string | undefined> = {
  image: "image/",
  video: "video/",
  audio: "audio/",
  attachment: undefined,
};

/** 各媒体类型在媒体库中的 mime 排除前缀（附件定义为非媒体文件，其它类型无需排除） */
const MEDIA_EXCLUDE_MIME_PREFIXES: Record<MediaType, string[] | undefined> = {
  image: undefined,
  video: undefined,
  audio: undefined,
  attachment: ["image/", "video/", "audio/"],
};

export function RichEditor({
  value = "",
  onChange,
  uploadImage,
  media,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  height,
  resizable = true,
}: RichEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EasyxEditorInstance | null>(null);
  // 高度仅在挂载时生效（编辑器创建参数），ref 承载最新值以满足 hooks 依赖规则
  const heightRef = useRef({ minHeight, maxHeight, height, resizable });
  heightRef.current = { minHeight, maxHeight, height, resizable };
  // refs 承载最新回调/值，避免挂载 effect 产生陈旧闭包，同时满足 hooks 依赖规则
  const onChangeRef = useRef(onChange);
  const uploadImageRef = useRef(uploadImage);
  const mediaRef = useRef<RichEditorMedia | undefined>(media);
  const latestValueRef = useRef(value);
  // 记录最近一次由编辑器自身派发的内容，用于受控 value 同步时跳过来自本身的回写
  const lastEmittedRef = useRef<string | null>(null);

  onChangeRef.current = onChange;
  uploadImageRef.current = uploadImage;
  mediaRef.current = media;
  latestValueRef.current = value;

  // 创建编辑器 + 装配媒体能力 + 跟随管理端主题（data-theme 以 -dark 结尾即暗色），仅初次挂载执行一次
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = () => document.documentElement.dataset.theme?.endsWith("-dark") === true;

    const options: EditorOptions = {
      placeholder: "开始写作...",
      defaultContent: latestValueRef.current,
      defaultTheme: isDark() ? "dark" : "light",
      minHeight: heightRef.current.minHeight,
      maxHeight: heightRef.current.maxHeight,
      height: heightRef.current.height,
      resizable: heightRef.current.resizable,
      onChange: (html) => {
        lastEmittedRef.current = html;
        onChangeRef.current?.(html);
      },
    };

    const mediaCfg = mediaRef.current;
    const getList = mediaCfg?.getList;
    // 汇总各媒体类型上传回调：顶层 uploadImage 兼容旧用法，其余取自 media
    const uploaders: Record<MediaType, ((file: File) => Promise<string>) | undefined> = {
      image: uploadImageRef.current ?? mediaCfg?.uploadImage,
      video: mediaCfg?.uploadVideo,
      audio: mediaCfg?.uploadAudio,
      attachment: mediaCfg?.uploadAttachment,
    };

    // 逐类型装配：上传回调返回的 URL 映射为媒体项；媒体库列表按类型前缀注入。
    // @easyx 要求 MediaUploadConfig.upload 必填，故仅对已配上传的类型启用媒体能力
    for (const type of MEDIA_TYPES) {
      const upload = uploaders[type];
      if (!upload) continue;
      const cfg: MediaUploadConfig = {
        upload: async (file) => {
          const url = await upload(file);
          return { id: url, url, name: file.name, fileType: file.type };
        },
      };
      if (getList) {
        const prefix = MEDIA_MIME_PREFIX[type];
        const excludePrefixes = MEDIA_EXCLUDE_MIME_PREFIXES[type];
        cfg.getList = async (params) => {
          const res = await getList({
            ...params,
            mimePrefix: prefix,
            excludeMimePrefixes: excludePrefixes,
          });
          // 宿主返回的 RichEditorMediaItem[] 结构兼容 @easyx 的 MediaItem
          return { items: res.items, total: res.total };
        };
      }
      if (type === "image") {
        options.image = cfg;
      } else if (type === "video") {
        options.video = cfg;
      } else if (type === "audio") {
        options.audio = cfg;
      } else {
        options.attachment = cfg;
      }
    }

    const editor = createEditor(container, options);
    editorRef.current = editor;

    // 监听 data-theme 变化，切换编辑器亮/暗主题
    const observer = new MutationObserver(() => {
      editor.setTheme(isDark() ? "dark" : "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      observer.disconnect();
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // 外部值同步：表单回填 / 重置等场景写入编辑器；跳过自身派发的值，避免打断输入
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    if (editor.getHTML() === value) return;
    if (editor.isEmpty() && !value) return;
    editor.setHTML(value);
  }, [value]);

  return <div ref={containerRef} style={{ zIndex: 100 }} />;
}
