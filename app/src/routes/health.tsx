/**
 * 健康检查端点
 * URL: /health
 * 无鉴权（供 Docker healthcheck / Playwright 就绪检查等外部探活使用）
 * 探测数据库与存储目录：全部可用返回 200，任一不可用返回 503（readiness 语义）
 */
import { createFileRoute } from "@tanstack/react-router";
import { checkHealth } from "#/services/health/health.server";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const report = await checkHealth();
        return Response.json(report, {
          status: report.status === "ok" ? 200 : 503,
        });
      },
    },
  },
});
