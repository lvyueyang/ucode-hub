/**
 * 文件内容读取路由（通用 file 模块，前台公共访问 + 同源校验防跨站盗链）
 * inline 语义：浏览器可渲染类型直接内联预览，不可渲染类型自动回退下载
 */
import { createFileRoute } from "@tanstack/react-router";
import { createCsrfMiddleware } from "@tanstack/react-start";
import { createFileDownloadResponse } from "#/services/download/download.server";
import { readFileContent } from "#/services/file/file.server";

/**
 * 同源校验中间件：拦截跨站盗链（Sec-Fetch-Site/Origin/Referer 校验）
 * - 放行 same-origin（页面内 img / a 标签）与 none（地址栏直开 / 新标签页导航）
 * - 拒绝 cross-site / same-site：其他网站或子域 <img> 盗链、iframe 嵌入
 * - allowRequestsWithoutOriginCheck 放行无来源头请求（curl / wget / 旧浏览器）
 */
const originGuard = createCsrfMiddleware({
  secFetchSite: ["same-origin", "none"],
  allowRequestsWithoutOriginCheck: true,
});

export const Route = createFileRoute("/file/r/$id")({
  server: {
    middleware: [originGuard],
    handlers: {
      GET: async ({ params }) => {
        const result = await readFileContent(params.id);
        if (!result) {
          return new Response("File not found", { status: 404 });
        }
        return createFileDownloadResponse(result.buffer, {
          filename: result.record.originalName,
          mimeType: result.record.mimeType,
          disposition: "inline",
        });
      },
    },
  },
});
