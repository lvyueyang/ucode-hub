/**
 * Prometheus 指标端点
 * URL: /api/metrics
 * 无鉴权（供 Prometheus 拉取）；如对外暴露需在反向代理层加访问控制
 */
import { createFileRoute } from "@tanstack/react-router";
import { renderMetrics } from "#/shared-services/metrics";

export const Route = createFileRoute("/api/metrics")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(renderMetrics(), {
          headers: { "Content-Type": "text/plain; version=0.0.4" },
        });
      },
    },
  },
});
