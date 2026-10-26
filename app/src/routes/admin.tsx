/**
 * 管理端根布局路由：/admin 前缀外层无布局（SPA 壳），仅渲染子路由 Outlet
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  component: RouteComponent,
  ssr: false,
});

function RouteComponent() {
  return <Outlet />;
}
