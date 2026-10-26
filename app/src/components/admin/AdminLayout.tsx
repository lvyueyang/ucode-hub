/**
 * 管理端布局：纯 Tailwind 侧边栏 + 内容区
 * 顶栏由 AdminPageContent 组件在每个页面中提供
 */
import {
  BellOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { Link } from "@tanstack/react-router";
import type { ThemeMode } from "@ucode/hub-ui-ssr/theme";
import { Avatar, Badge, Button, Divider, Flex, Popover, Tooltip } from "antd";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { logoutSFn } from "#/services/admin-auth/admin-auth.functions";
import { getAdminUnreadCountSFn } from "#/services/message/message.functions";
import { sfnUnwrap } from "#/utils/sfn-error";
import { useAdminAuth } from "./AdminAuthProvider";
import { AdminLogo } from "./AdminLogo";
import { AdminNav } from "./AdminNav";
import { useAdminTheme } from "./admin-theme";
import { useAdminConfigStore } from "./stores/admin-config-store";
import { useAdminDictStore } from "./stores/admin-dict-store";

/** 主题模式循环顺序 */
const THEME_CYCLE: ThemeMode[] = ["light", "dark", "auto"];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { mode, setMode, isDark } = useAdminTheme();
  const { user } = useAdminAuth();

  /** 未读消息数（30 秒轮询） */
  const [unreadCount, setUnreadCount] = useState(0);

  /** 拉取未读消息数（轮询辅助信息，失败静默） */
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const [count] = await sfnUnwrap(getAdminUnreadCountSFn(), { silent: true });
    if (count !== null) setUnreadCount(count);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [user, fetchUnreadCount]);

  const handleLogout = async () => {
    const [, err] = await sfnUnwrap(logoutSFn());
    if (err) return;
    window.location.href = "/admin/login";
  };

  /** 循环切换主题模式（亮/暗/跟随系统） */
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(mode);
    setMode(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  // 进入 admin 时一次性加载全部字典到 zustand store
  useEffect(() => {
    useAdminDictStore.getState().loadAll();
  }, []);

  // 加载客户端可见系统配置到 zustand store
  useEffect(() => {
    useAdminConfigStore.getState().loadAll();
  }, []);

  const siteName = useAdminConfigStore((s) => s.config.site_name) || "HUB";

  // 更新管理端页面标题
  useEffect(() => {
    document.title = `${siteName} 管理后台`;
  }, [siteName]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 侧边栏 */}
      <aside
        className={`flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${
          collapsed ? "w-16" : "w-50"
        }`}
      >
        {/* Logo 区域 */}
        <div className="flex h-14 shrink-0 items-center border-b border-border px-3 overflow-hidden">
          <AdminLogo height={36} />
          {!collapsed && (
            <span className="ml-2 text-sm font-semibold text-sidebar-primary whitespace-nowrap">
              {siteName}
            </span>
          )}
        </div>

        {/* 导航菜单 */}
        <AdminNav collapsed={collapsed} />

        {/* 底部操作区 */}
        <div className="shrink-0 border-t border-border px-2 py-3">
          {/* Row 1: 折叠 + 主题切换（纯图标） */}
          <div
            className={`mb-2 flex items-center gap-1 ${collapsed ? "flex-col" : "justify-center"}`}
          >
            <Tooltip title={collapsed ? "展开侧边栏" : "收起侧边栏"}>
              <Button
                type="text"
                onClick={() => setCollapsed(!collapsed)}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              />
            </Tooltip>
            <Tooltip
              title={`当前：${mode === "light" ? "亮色" : mode === "dark" ? "暗色" : "跟随系统"}，点击切换`}
            >
              <Button
                type="text"
                onClick={cycleTheme}
                icon={isDark ? <MoonOutlined /> : <SunOutlined />}
              />
            </Tooltip>
            {/* 消息中心铃铛（未读角标 + 跳转） */}
            <Tooltip title="我的消息">
              <Badge count={unreadCount} size="small">
                <Link to="/admin/messages">
                  <Button type="text" icon={<BellOutlined />} />
                </Link>
              </Badge>
            </Tooltip>
          </div>

          {/* Row 2: 用户块（hover Popover） */}
          {user && (
            <Popover
              trigger="hover"
              placement="rightBottom"
              content={
                <div className="w-56">
                  {/* 用户信息卡片 */}
                  <div className="flex items-center gap-3 pb-1">
                    <Avatar src={user.avatar ?? undefined} size="large" shape="square">
                      {user.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{user.username}</div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                  <Divider size="small" />
                  {/* 退出登录 */}
                  <Flex justify="flex-end" align="center">
                    <Button type="link" onClick={handleLogout} danger>
                      <LogoutOutlined />
                      退出登录
                    </Button>
                  </Flex>
                </div>
              }
            >
              {/* 触发区 */}
              <div
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                <Avatar src={user.avatar ?? undefined} size="large" shape="square">
                  {user.username.charAt(0).toUpperCase()}
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-sidebar-foreground">
                      {user.username}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {user.isRoot
                        ? "超级管理员"
                        : (user.roleNames?.length ?? 0) > 0
                          ? (user.roleNames ?? []).join("、")
                          : "管理员"}
                    </div>
                  </div>
                )}
              </div>
            </Popover>
          )}
        </div>
      </aside>

      {/* 主内容区 — 顶栏由 AdminPageContent 在各页面中提供 */}
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
