/**
 * 文件库适配器：把项目统一的上传 SFn 与文件库查询 SFn 适配为基础组件的回调契约
 * 上传与查询入口在此单点收敛，业务壳组件（文件/图片上传、富文本编辑器）只做参数透传
 */
import { message } from "@ucode/hub-ui-spa/antd-static";
import type { RichEditorMedia } from "@ucode/hub-ui-spa/editor";
import type { FetchFiles, UploadFileFn } from "@ucode/hub-ui-spa/upload";
import { getFileListSFn, uploadFileSFn } from "#/services/file/file.functions";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";

/** 文件读取地址（内联预览 / 打开） */
export function readUrl(id: string): string {
  return `/file/r/${id}`;
}

/** 上传文件到文件库（permanent=false 时入库为 7 天后过期的临时文件） */
export const uploadFile: UploadFileFn = async (file, permanent) => {
  const fd = new FormData();
  fd.append("file", file);
  if (permanent) fd.append("permanent", "true");
  const result = await callSfn(uploadFileSFn({ data: fd }), {
    error: "上传失败",
  });
  if (!result.success || !result.data) {
    throw new Error("上传失败");
  }
  return result.data;
};

/** 上传单个文件（永久）并返回读取地址，供富文本编辑器插入媒体 */
export async function uploadFileAndGetUrl(file: File): Promise<string> {
  const info = await uploadFile(file, true);
  if (!info.id) {
    message.error("上传失败：上传未返回文件标识");
    throw new Error("上传未返回文件标识");
  }
  return readUrl(info.id);
}

/** 查询文件库列表（服务端分页） */
export const fetchFiles: FetchFiles = async ({ keyword, mimePrefix, page, pageSize }) => {
  const [result] = await sfnUnwrap(
    getFileListSFn({ data: { keyword, mimePrefix, page, pageSize } }),
    { error: "加载文件列表失败" },
  );
  if (result === null) return { records: [], total: 0 };
  return { records: result.records ?? [], total: result.total };
};

/** 媒体库列表：按媒体类型前缀拉取永久文件，映射为编辑器媒体项 */
export const getMediaList: RichEditorMedia["getList"] = async ({
  mimePrefix,
  excludeMimePrefixes,
  keyword,
  page,
  pageSize,
}) => {
  const [result] = await sfnUnwrap(
    getFileListSFn({
      data: {
        keyword,
        mimePrefix,
        excludeMimePrefixes,
        status: "permanent",
        page,
        pageSize,
      },
    }),
    { error: "媒体库加载失败" },
  );
  if (result === null) return { items: [], total: 0 };
  const items = (result.records ?? []).map((r) => ({
    id: r.id,
    url: readUrl(r.id),
    name: r.originalName,
    size: r.size,
    fileType: r.mimeType,
  }));
  return { items, total: result.total };
};
