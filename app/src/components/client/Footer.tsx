/**
 * 前台公共 Footer（SSR 端 shadcn/ui）
 * 导航链接通过 useTranslation 国际化
 */
import { Link } from "@tanstack/react-router";
import { ClientLogo } from "#/components/client";
import { useGlobalStore, useTranslation } from "#/components/providers";

export function Footer() {
  const year = new Date().getFullYear();
  const { t } = useTranslation();
  const { systemConfig } = useGlobalStore();
  const siteName = systemConfig?.site_name || "HUB";

  return (
    <footer className="border-t border-border px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ClientLogo height={28} />
            {siteName}
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground sm:gap-4">
            <Link to="/" className="hover:text-foreground">
              {t("首页")}
            </Link>
            <Link to="/devices" className="hover:text-foreground">
              {t("我的设备")}
            </Link>
            <Link to="/about" className="hover:text-foreground">
              {t("关于")}
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground sm:text-sm">
            &copy; {year} {siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
