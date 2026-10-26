/**
 * 图片上传组件（基础组件，照片墙）：支持单/多图上传、拖拽排序、从文件库选择、画廊预览
 * 上传实现经 uploadFile 回调注入，文件库查询经 fetchFiles / readUrl 回调注入
 * value / onChange 兼容 antd Form.Item 直接注入
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "../antd-static";
import type { UploadFileFn } from "./FileUpload";
import { type ImageItem, PhotoWall } from "./PhotoWall";
import { type FetchFiles, SelectFileModal } from "./SelectFileModal";

interface ImageUploadProps {
  /** 文件 ID（单文件）或文件 ID 数组（多文件），兼容 Form.Item 注入 */
  value?: string | string[];
  /** 值变更回调，兼容 Form.Item 注入 */
  onChange?: (value: string | string[]) => void;
  /** 最大上传数量，默认 1 */
  maxCount?: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 接受的文件类型，默认 "image/*" */
  accept?: string;
  /** 上传为永久文件，默认 true；设为 false 则为临时文件（7 天后过期） */
  permanent?: boolean;
  /** 文件上传回调（宿主注入，如对接 uploadFileSFn） */
  uploadFile: UploadFileFn;
  /** 文件库查询回调（宿主注入，如对接 getFileListSFn） */
  fetchFiles: FetchFiles;
  /** 根据文件 ID 生成读取地址（宿主注入，用于内联预览/打开） */
  readUrl: (id: string) => string;
}

/** 将文件 ID 转为 ImageItem（用于展示已存在的文件） */
function idToImageItem(id: string, readUrl: (id: string) => string): ImageItem {
  return {
    uid: id,
    name: "",
    url: readUrl(id),
    status: "done",
  };
}

/** 将 value 转为 ImageItem[] */
function valueToItems(
  value: string | string[] | undefined,
  readUrl: (id: string) => string,
): ImageItem[] {
  if (!value) return [];
  const ids = Array.isArray(value) ? value : [value];
  return ids.filter(Boolean).map((id) => idToImageItem(id, readUrl));
}

/** 从 ImageItem 列表提取文件 ID */
function extractIds(list: ImageItem[]): string[] {
  return list.filter((f) => f.status === "done" && f.uid).map((f) => f.uid);
}

export function ImageUpload({
  value,
  onChange,
  maxCount = 1,
  disabled = false,
  accept = "image/*",
  permanent = true,
  uploadFile,
  fetchFiles,
  readUrl,
}: ImageUploadProps) {
  const [fileList, setFileList] = useState<ImageItem[]>(() => valueToItems(value, readUrl));
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isHoveredRef = useRef(false);
  const internalChangeRef = useRef(false);
  /** fileList 的镜像：异步上传回调中需读取最新列表，避免把副作用塞进 setState updater */
  const fileListRef = useRef(fileList);
  /** 已创建的临时预览地址：回收以列表为基准，避免在状态提交前回收导致预览闪断 */
  const blobUrlsRef = useRef(new Set<string>());

  // 外部 value 变更时同步 fileList（如表单重置）
  useEffect(() => {
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    const next = valueToItems(value, readUrl);
    fileListRef.current = next;
    setFileList(next);
  }, [value, readUrl]);

  // 回收已不被列表引用的临时预览地址（上传成功替换、上传失败移除、手动删除均经此路径；
  // 放在 effect 中是因为此处 DOM 已提交为服务端地址，不会出现「图片还在显示就被回收」）
  useEffect(() => {
    const inUse = new Set(fileList.map((item) => item.url));
    for (const url of blobUrlsRef.current) {
      if (inUse.has(url)) continue;
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
    }
  }, [fileList]);

  // 卸载时回收全部残留（上传中未替换、未删除的条目）
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      for (const url of blobUrls) URL.revokeObjectURL(url);
      blobUrls.clear();
    };
  }, []);

  /** 仅更新本地列表，不通知外部（临时条目的增删不影响对外文件 ID） */
  const updateLocalList = useCallback((next: ImageItem[]) => {
    fileListRef.current = next;
    setFileList(next);
  }, []);

  /** 提交新的文件列表：同步状态与镜像并通知外部值变更 */
  const commitList = useCallback(
    (next: ImageItem[]) => {
      fileListRef.current = next;
      setFileList(next);
      internalChangeRef.current = true;
      const ids = extractIds(next);
      if (maxCount === 1) {
        onChange?.(ids[0] || "");
      } else {
        onChange?.(ids);
      }
    },
    [onChange, maxCount],
  );

  /** 上传单个文件：成功后以服务端地址替换临时预览，失败则移除临时条目（预览地址回收见 blobUrlsRef 的列表回收 effect） */
  const uploadItem = useCallback(
    async (file: File, tempUid: string) => {
      try {
        const result = await uploadFile(file, permanent);
        commitList(
          fileListRef.current.map((item) =>
            item.uid === tempUid
              ? {
                  ...item,
                  uid: result.id,
                  url: readUrl(result.id),
                  status: "done" as const,
                  name: result.originalName || item.name,
                }
              : item,
          ),
        );
        if (result.isDuplicated) {
          message.success("秒传成功（图片已存在）");
        }
      } catch (err) {
        console.error("[ImageUpload] 上传失败", err);
        // 错误提示由宿主注入的 uploadFile 统一处理（项目内经 sfn-error helper），此处不重复提示
        updateLocalList(fileListRef.current.filter((item) => item.uid !== tempUid));
      }
    },
    [permanent, uploadFile, readUrl, commitList, updateLocalList],
  );

  /** 处理待上传文件（校验 + 创建临时条目 + 开始上传） */
  const processFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          message.error(`"${file.name}" 不是图片文件`);
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          message.error(`"${file.name}" 超过 10MB 限制`);
          return;
        }
      }
      const current = fileListRef.current;
      const available = maxCount <= 1 ? 1 - current.length : maxCount - current.length;
      const toUpload = files.slice(0, Math.max(0, available));
      if (files.length > available) {
        message.warning(`最多还能上传 ${available} 张图片，已自动截取`);
      }
      if (toUpload.length === 0) return;
      const tempItems: ImageItem[] = toUpload.map((f) => ({
        uid: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name,
        url: URL.createObjectURL(f),
        status: "uploading" as const,
      }));
      for (const item of tempItems) blobUrlsRef.current.add(item.url);
      updateLocalList([...current, ...tempItems]);
      for (let i = 0; i < toUpload.length; i++) {
        uploadItem(toUpload[i], tempItems[i].uid);
      }
    },
    [maxCount, uploadItem, updateLocalList],
  );

  /** 文件选择变更 */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      processFiles(files);
    },
    [processFiles],
  );

  /** 拖拽上传 */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles],
  );

  // 全局粘贴上传监听（仅悬停时响应）
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled || !isHoveredRef.current) return;
      const items = e.clipboardData?.files;
      if (!items || items.length === 0) return;
      const imageFiles = Array.from(items).filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [disabled, processFiles]);

  /** 文件库选择确认 */
  const handleLibrarySelect = useCallback(
    (ids: string[]) => {
      const existingIds = new Set(extractIds(fileList));
      const newIds = ids.filter((id) => !existingIds.has(id));
      if (newIds.length === 0) {
        message.info("所选文件已存在列表中");
        return;
      }
      const available = maxCount > 1 ? maxCount - fileList.length : 1;
      if (newIds.length > available) {
        message.warning(`最多还能添加 ${available} 个文件`);
        return;
      }
      const newItems = newIds.map((id) => idToImageItem(id, readUrl));
      commitList([...fileList, ...newItems]);
    },
    [fileList, maxCount, commitList, readUrl],
  );

  /** 拖拽排序 */
  const handleDragSort = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newList = [...fileList];
      const [dragged] = newList.splice(dragIndex, 1);
      newList.splice(hoverIndex, 0, dragged);
      commitList(newList);
      setSortKey((k) => k + 1);
    },
    [fileList, commitList],
  );

  /** 删除文件 */
  const handleRemove = useCallback(
    (index: number) => {
      const newList = fileList.filter((_, i) => i !== index);
      commitList(newList);
      setSortKey((k) => k + 1);
    },
    [fileList, commitList],
  );

  const canAdd = maxCount <= 1 ? fileList.length < 1 : fileList.length < maxCount;
  const canSort = maxCount > 1 && fileList.length > 1;
  // 拖拽视觉状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sortKey, setSortKey] = useState(0);

  return (
    <>
      {/* 隐藏的文件选择 input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxCount > 1}
        onChange={handleInputChange}
        style={{ display: "none" }}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 悬停判定只用于「指针停在组件上才响应全局粘贴」，元素本身不可聚焦，无键盘等价触发方式 */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
        onMouseEnter={() => {
          isHoveredRef.current = true;
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false;
        }}
      >
        <PhotoWall
          fileList={fileList}
          canAdd={canAdd}
          canSort={canSort}
          disabled={disabled}
          dragIndex={dragIndex}
          hoverIndex={hoverIndex}
          hoveredCard={hoveredCard}
          dragOver={dragOver}
          sortKey={sortKey}
          inputRef={inputRef}
          onHoverCard={setHoveredCard}
          onDragStart={setDragIndex}
          onDragEnd={() => {
            setDragIndex(null);
            setHoverIndex(null);
          }}
          onDragEnter={setHoverIndex}
          onDragLeave={() => setHoverIndex(null)}
          onDragSort={handleDragSort}
          onRemove={handleRemove}
          onDrop={handleDrop}
          onDragOverToggle={setDragOver}
          onLibraryClick={() => setSelectModalOpen(true)}
        />
      </div>

      <SelectFileModal
        open={selectModalOpen}
        onCancel={() => setSelectModalOpen(false)}
        onSelect={handleLibrarySelect}
        multiple={maxCount > 1}
        accept={accept}
        maxCount={maxCount}
        fetchFiles={fetchFiles}
        readUrl={readUrl}
      />
    </>
  );
}
