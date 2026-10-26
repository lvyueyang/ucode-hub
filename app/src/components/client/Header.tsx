/**
 * 前台公共 Header（SSR 端 shadcn/ui，移动优先）
 * 集成国际化：语言切换按钮，中文作为翻译 key
 * 根据客户端登录状态显示用户名/退出或登录链接
 */

import { ClientOnly, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@ucode/hub-ui-ssr/theme";
import { Button } from "@ucode/hub-ui-ssr/ui";
import { Bell, LogOut, Menu, User, X } from "lucide-react";
import { useState } from "react";
import { ClientLogo, useClientAuth } from "#/components/client";
import { useGlobalStore, useTranslation } from "#/components/providers";
import { track } from "#/services/track/track";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
} from "#/shared-services/i18n/i18n.types";
import { CLIENT_THEME } from "#/theme/themes";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t, locale } = useTranslation();
  const { user, logout } = useClientAuth();
  const { systemConfig } = useGlobalStore();
  const siteName = systemConfig?.site_name || "HUB";

  const NAV_LINKS = [
    { to: "/", label: t("首页") },
    { to: "/devices", label: t("我的设备") },
    { to: "/usage", label: t("我的用量") },
    { to: "/about", label: t("关于") },
  ] as const;

  const handleLogout = async () => {
    track("Logout", {});
    await logout();
    setMobileOpen(false);
  };

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-50 border-b border-border bg-background/80 px-4 backdrop-blur-lg"
    >
      <nav className="mx-auto flex max-w-5xl items-center py-3">
        {/* Logo（左栏等宽，内容靠左） */}
        <div className="flex min-w-0 flex-1 items-center">
          <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
            <ClientLogo height={32} />
            <span className="truncate text-base font-semibold text-foreground">{siteName}</span>
          </Link>
        </div>

        {/* 桌面端导航 */}
        <div className="hidden items-center gap-1 text-sm font-medium sm:flex sm:gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground sm:px-3"
              activeProps={{ className: "text-foreground bg-accent" }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* 右侧操作区（右栏等宽，内容靠右） */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
          {/* 语言切换按钮 */}
          <ClientOnly>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const l = await cookieStore.get(LOCALE_COOKIE);
                const next = SUPPORTED_LOCALES.find((x) => x !== l?.value) ?? DEFAULT_LOCALE;
                await cookieStore.set(LOCALE_COOKIE, next);
                window.location.reload();
              }}
              title={t("切换语言")}
              className="text-xs uppercase"
            >
              {locale === "zh" ? "EN" : "中文"}
            </Button>
          </ClientOnly>
          {/* 桌面端用户区 */}
          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                to="/messages"
                className="relative flex h-8 items-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t("消息中心")}
              >
                <Bell className="h-4 w-4" />
              </Link>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                {user.username}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout} aria-label={t("退出登录")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Link to="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                {t("登录")}
              </Button>
            </Link>
          )}
          <ThemeToggle preset={CLIENT_THEME} />
          {/* 移动端菜单按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="切换菜单"
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </nav>

      {/* 移动端下拉菜单 */}
      {mobileOpen && (
        <div className="border-t border-border pb-3 pt-2 sm:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  {user.username}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  {t("退出登录")}
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {t("登录")}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
