/**
 * 文件管理：Server Function 包装器
 */
import { IMAGE_LIMITS, isProcessableFormat, sniffImage } from "@easyx/image-toolkit";
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";
import { fileIdSchema, fileListSchema } from "./file.schemas";
import {
  duplicateFile,
  getFileInfo,
  getFileList,
  removeFile,
  replaceFileContent,
  uploadFile,
} from "./file.server";

/** 获取文件列表（分页、筛选、搜索、排序） */
export const getFileListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_VIEW)])
  .validator(fileListSchema)
  .handler(async ({ data }) => getFileList(data));

/** 上传文件（支持 SHA256 秒传） */
export const uploadFileSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_UPLOAD)])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    const f = data.get("file");
    if (!f || !(f instanceof File)) throw new Error("未选择文件");
    const permanent = data.get("permanent") === "true";
    return { file: f, permanent };
  })
  .handler(async ({ data: { file: fileField, permanent }, context }) => {
    const buffer = Buffer.from(await fileField.arrayBuffer());
    const originalName = fileField.name;

    // 以魔数嗅探结果为准；非可识别类型时回退客户端声明
    const sniffed = sniffImage(buffer);
    const mimeType = sniffed?.mimeType || fileField.type || "application/octet-stream";
    const imageMeta =
      sniffed && sniffed.width !== null && sniffed.height !== null
        ? { width: sniffed.width, height: sniffed.height }
        : null;

    const { record, isDuplicated } = await uploadFile(
      buffer,
      originalName,
      mimeType,
      permanent,
      imageMeta,
    );

    logCrud(context.user, "file", "upload", {
      id: record.id,
      name: record.originalName,
    });

    return {
      success: true,
      data: {
        id: record.id,
        originalName: record.originalName,
        size: record.size,
        isDuplicated,
      },
    };
  });

/** 解析 FormData 中的可选尺寸参数，钳制到 IMAGE_LIMITS 允许范围 */
function parseDimension(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1) return null;
  return Math.min(IMAGE_LIMITS.maxDimension, rounded);
}

/** 替换文件内容（管理端图片处理后覆盖原图；可先备份原图） */
export const replaceFileContentSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_PROCESS)])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    const id = data.get("id");
    if (typeof id !== "string" || !id) throw new Error("缺少文件 ID");
    const f = data.get("file");
    if (!(f instanceof File)) throw new Error("未提交文件内容");
    return {
      id,
      file: f,
      width: parseDimension(data.get("width")),
      height: parseDimension(data.get("height")),
      backup: data.get("backup") === "true",
    };
  })
  .handler(async ({ data, context }) => {
    const buffer = Buffer.from(await data.file.arrayBuffer());

    // 必须以魔数嗅探为准：文件路由是 inline 返回的，伪造类型会造成存储型 XSS
    const sniffed = sniffImage(buffer);
    if (!sniffed || !isProcessableFormat(sniffed.format)) {
      throw new Error("仅支持替换为 JPEG / PNG / WebP / GIF / TIFF 图片");
    }

    // 备份必须先于覆盖：覆盖会换存储名并删除旧物理文件，事后无法再取回原图
    let backup: { id: string; originalName: string } | null = null;
    if (data.backup) {
      const copy = await duplicateFile(data.id);
      if (!copy) throw new Error("原图备份失败：文件不存在或物理文件缺失");
      backup = { id: copy.id, originalName: copy.originalName };
    }

    // 覆盖失败（含并发删除）时回滚刚创建的备份，避免残留非预期文件
    const rollbackBackup = async () => {
      if (!backup) return;
      await removeFile(backup.id).catch(() => undefined);
    };

    let result: Awaited<ReturnType<typeof replaceFileContent>> = null;
    try {
      result = await replaceFileContent(data.id, {
        buffer,
        mimeType: sniffed.mimeType,
        extension: sniffed.extension,
        // 嗅探能给出尺寸时以服务端解析结果为准，否则回退客户端上报值
        width: sniffed.width ?? data.width,
        height: sniffed.height ?? data.height,
      });
    } catch (error) {
      await rollbackBackup();
      throw error;
    }
    if (!result) {
      await rollbackBackup();
      throw new Error("文件不存在或已删除");
    }

    // 仅在整体成功后写审计，避免被回滚的备份仍留下审计记录
    if (backup) {
      logCrud(context.user, "file", "backup_image", {
        id: backup.id,
        name: backup.originalName,
      });
    }

    logCrud(
      context.user,
      "file",
      "overwrite_image",
      { id: data.id },
      {
        detail: {
          sizeBefore: result.sizeBefore,
          sizeAfter: result.sizeAfter,
          mimeType: sniffed.mimeType,
          backupId: backup?.id ?? null,
        },
      },
    );

    return {
      success: true,
      data: { id: data.id, size: result.sizeAfter, backup },
    };
  });

/** 根据文件 ID 查询原始文件名（供预览组件使用） */
export const getFileInfoSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_VIEW)])
  .validator(fileIdSchema)
  .handler(async ({ data }) => getFileInfo(data.id));
