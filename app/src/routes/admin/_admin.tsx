/**
 * 管理端布局路由：beforeLoad 鉴权守卫
 * 所有 /admin/* 受保护页面在此布局内，login 页面除外
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentAdminSFn } from "#/services/admin-auth/admin-auth.functions";

export const Route = createFileRoute("/admin/_admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await getCurrentAdminSFn();

    if (user?.userType !== "admin") {
      throw redirect({
        to: "/admin/login",
        search: { redirect: location.href },
      });
    }

    return { user };
  },
});
