/**
 * 导出文件落盘：统一「调用导出 Server Function → 落盘」流程与文件名约定
 * 本模块不引 UI 包，成功提示由调用方在 UI 层给出
 */
import { downloadFile } from "@ucode/hub-lib/export";
import dayjs from "dayjs";
import { sfnUnwrap } from "#/utils/sfn-error";

/** 导出落盘选项 */
export interface DownloadExportOptions<S> {
  /** 文件名主干，最终形如 `{name}_{YYYY-MM-DD}.{ext}` */
  name: string;
  /** 从导出结果取出文件内容；默认按字符串处理 */
  pick?: (result: S) => string;
  /** 文件扩展名，默认 json */
  ext?: string;
  /** MIME 类型，默认 application/json（CSV 用 text/csv;charset=utf-8） */
  mime?: string;
  /** 失败提示，默认「导出失败」 */
  errorMessage?: string;
}

/**
 * 调用导出 Server Function 并落盘为文件
 * @returns 是否成功落盘（失败已由 sfnUnwrap 统一提示）
 */
export async function downloadExport<S>(
  request: PromiseLike<S>,
  options: DownloadExportOptions<S>,
): Promise<boolean> {
  const {
    name,
    pick = (result) => String(result ?? ""),
    ext = "json",
    mime = "application/json",
    errorMessage = "导出失败",
  } = options;

  const [result] = await sfnUnwrap(request, { error: errorMessage });
  if (result === null || result === undefined) return false;

  const content = pick(result);
  if (!content) return false;

  downloadFile(content, `${name}_${dayjs().format("YYYY-MM-DD")}.${ext}`, mime);
  return true;
}
