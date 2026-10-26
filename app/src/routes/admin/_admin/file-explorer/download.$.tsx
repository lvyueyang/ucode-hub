/**
 * 资源管理器：文件下载路由（catch-all 路径参数）
 * URL: /admin/file-explorer/download/*
 */
import { createFileRoute } from "@tanstack/react-router";
import { adminPermRouteGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { createFileDownloadResponse } from "#/services/download/download.server";
import { createFileReadStream } from "#/services/file-explorer/file-explorer.server";

export const Route = createFileRoute("/admin/_admin/file-explorer/download/$")({
  server: {
    middleware: [adminPermRouteGuard(ADMIN_PERMISSIONS.FILE_EXPLORER_VIEW)],
    handlers: {
      GET: async ({ params }) => {
        try {
          const subPath = decodeURIComponent(params._splat ?? "");
          const { stream, name } = await createFileReadStream(subPath);
          return createFileDownloadResponse(stream, {
            filename: name,
            mimeType: "application/octet-stream",
            disposition: "attachment",
          });
        } catch (err) {
          const e = err as NodeJS.ErrnoException;
          const status = e.code === "ENOENT" ? 404 : 500;
          return new Response(JSON.stringify({ error: e.message }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
