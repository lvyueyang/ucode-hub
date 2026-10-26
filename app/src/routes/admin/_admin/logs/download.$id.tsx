/**
 * 日志下载路由（管理端）
 */
import { createFileRoute } from "@tanstack/react-router";
import { adminPermRouteGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { createFileDownloadResponse } from "#/services/download/download.server";
import { getLogRawContent } from "#/services/logs/logs.server";

export const Route = createFileRoute("/admin/_admin/logs/download/$id")({
  server: {
    middleware: [adminPermRouteGuard(ADMIN_PERMISSIONS.LOG_DOWNLOAD)],
    handlers: {
      GET: async ({ params }) => {
        const content = await getLogRawContent(params.id);
        if (!content) {
          return new Response("File not found", { status: 404 });
        }
        return createFileDownloadResponse(content, {
          filename: `${params.id}.log`,
          mimeType: "text/plain; charset=utf-8",
          disposition: "attachment",
        });
      },
    },
  },
});
