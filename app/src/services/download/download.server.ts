/**
 * 下载响应：统一的流式 Response 构造与 Content-Disposition 编码
 */
import { Readable } from "node:stream";

/** 下载响应构造参数 */
export interface DownloadResponseOptions {
  /** 下载文件名 */
  filename: string;
  /** MIME 类型，默认 application/octet-stream */
  mimeType?: string;
  /** Content-Disposition 语义：inline 内联预览 / attachment 强制下载，默认 attachment */
  disposition?: "inline" | "attachment";
}

/** 将 Buffer / 字符串 / Node 流统一转换为 Web ReadableStream */
export function toWebStream(source: Buffer | string | Readable): ReadableStream {
  const readable =
    source instanceof Readable
      ? source
      : Readable.from(typeof source === "string" ? Buffer.from(source) : source);
  return Readable.toWeb(readable) as ReadableStream;
}

/**
 * 按 RFC 5987 对 filename* 值做百分号编码（内部实现，行为经 createFileDownloadResponse 覆盖）
 * encodeURIComponent 已对非 ASCII 逐字节编码，但会保留 '()*，需额外转义（attr-char 不允许）
 * 孤立代理项（未配对的 \uD800-\uDFFF）会令 encodeURIComponent 抛 URIError，先替换为 U+FFFD 兜底
 */
function encodeRfc5987(value: string): string {
  const wellFormed = value.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "\uFFFD",
  );
  return encodeURIComponent(wellFormed).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * 生成 RFC 6266 的 filename 回退值（仅 ASCII，内部实现，行为经 createFileDownloadResponse 覆盖）
 * Headers 值必须为 ASCII，中文等非 ASCII 字符只能走 filename*，回退值保留可打印 ASCII
 */
function toFallbackFilename(filename: string): string {
  return filename
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "_")
    .trim();
}

/**
 * 构造统一的文件下载 Response
 * Content-Disposition 同时输出 RFC 6266 的 filename 回退值与 RFC 5987 的 filename*，
 * 兼容不支持 filename* 的旧浏览器/下载器，且避免中文文件名乱码
 */
export function createFileDownloadResponse(
  source: Buffer | string | Readable,
  opts: DownloadResponseOptions,
): Response {
  const disposition = opts.disposition ?? "attachment";
  const fallback = toFallbackFilename(opts.filename);
  const dispositionParts: string[] = [disposition];
  if (fallback) dispositionParts.push(`filename="${fallback}"`);
  dispositionParts.push(`filename*=UTF-8''${encodeRfc5987(opts.filename)}`);
  return new Response(toWebStream(source), {
    headers: {
      "Content-Type": opts.mimeType ?? "application/octet-stream",
      "Content-Disposition": dispositionParts.join("; "),
      // 禁止 MIME 嗅探：文件内容可被管理端替换，避免伪造类型被当作 HTML 渲染
      "X-Content-Type-Options": "nosniff",
    },
  });
}
