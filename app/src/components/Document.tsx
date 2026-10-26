/**
 * 根路由 Document 外壳：分离 Admin（客户端渲染）与前台（SSR + 国际化）
 */

import { ClientOnly, HeadContent, Scripts } from "@tanstack/react-router";
import type { ThemePreset } from "@ucode/hub-ui-ssr/theme";
import { useEffect, useMemo, useRef } from "react";
import { Toaster, toast } from "sonner";
import faviconUrl from "#/assets/favicon.svg?url";
import adminFaviconUrl from "#/assets/favicon-admin.svg?url";
import faviconDarkUrl from "#/assets/favicon-dark.svg?url";
import { Footer, Header, useClientAuth } from "#/components/client";
import { useGlobalStore } from "#/components/providers";
import { SfnErrorNotice } from "#/components/SfnErrorNotice";
import {
  setUserId,
  startRouteTracking,
  stopRouteTracking,
  init as trackInit,
} from "#/services/track/track";
import adminGlobalCss from "#/styles/admin.global.css?url";
import ssrGlobalCss from "#/styles/ssr.global.css?inline";
import { ADMIN_THEME, CLIENT_THEME } from "#/theme/themes";
import { parseCustomHeadConfig } from "#/utils/custom-head";
import { registerSfnNotifier } from "#/utils/sfn-error";
import { AdminProvider } from "./admin/AdminProvider";

/**
 * 自定义 head 标签的 key：用标签自身属性拼，不用数组下标。
 * 这些数组是运营在后台配的，改一次顺序就变；用下标会让 React 复用错节点（属性串到别人的标签上）。
 */
const headKeyOf = (props: Record<string, unknown>): string =>
  JSON.stringify(
    Object.entries(props)
      .filter(([key]) => key !== "children")
      .sort(),
  );

// 内联层声明锁定级联层顺序：若全局 CSS <link> 加载失败（混合/陈旧部署 404），antd 运行时注入的
// @layer antd 会成为首层而落到 preflight 之下、全部样式被重置覆盖；声明顺序须与 global.css 顶部一致。
const LAYER_ORDER_STYLE = "@layer properties, theme, base, antd, components, utilities;";

/**
 * 生成主题 init 脚本：storageKey 与 dataTheme 均从 themes.ts 注册表推导，
 * 避免脚本与注册表手工双写导致首帧主题静默失效。
 */
function buildThemeInitScript(preset: ThemePreset): string {
  return `(function(){try{var m=localStorage.getItem('${preset.storageKey}')||'auto';m=(m==='light'||m==='dark'||m==='auto')?m:'auto';var d=m==='auto'?window.matchMedia('(prefers-color-scheme: dark)').matches:m==='dark';var r=document.documentElement;r.setAttribute('data-theme',d?'${preset.dark.dataTheme}':'${preset.light.dataTheme}');r.style.colorScheme=d?'dark':'light'}catch(e){}})();`;
}

const ADMIN_THEME_INIT_SCRIPT = buildThemeInitScript(ADMIN_THEME);
const CLIENT_THEME_INIT_SCRIPT = buildThemeInitScript(CLIENT_THEME);

interface SSRRootDocumentProps {
  children: React.ReactNode;
}

/** 前台路由：SSR 渲染 + 国际化 Provider */
export function SSRRootDocument({ children }: SSRRootDocumentProps) {
  const { locale, systemConfig } = useGlobalStore();
  const siteName = systemConfig?.site_name || "HUB";
  const { user, isLoading } = useClientAuth();
  const trackInitialized = useRef(false);

  // 注册前台错误提示器（sonner toast）：正面可读消息 + 可展开诊断详情
  useEffect(
    () =>
      registerSfnNotifier((info) =>
        toast.error(<SfnErrorNotice info={info} />, { duration: 8000 }),
      ),
    [],
  );

  // 自定义 head 配置：解析系统配置 JSON，按结构注入 meta/links/scripts/styles
  const customHead = useMemo(
    () => parseCustomHeadConfig(systemConfig?.custom_head_config),
    [systemConfig?.custom_head_config],
  );

  // 登录状态就绪后初始化追踪 SDK（仅一次），确保首次 PageView 携带正确的 userId
  useEffect(() => {
    if (isLoading || trackInitialized.current) return;
    trackInitialized.current = true;

    setUserId(user?.id);
    trackInit({ autoPageView: true });
    startRouteTracking();

    return () => {
      stopRouteTracking();
    };
  }, [isLoading, user?.id]);

  // 登录/退出时同步 userId 到追踪 SDK
  useEffect(() => {
    if (isLoading) return;
    setUserId(user?.id);
  }, [isLoading, user?.id]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CLIENT_THEME_INIT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: LAYER_ORDER_STYLE }} />
        <style dangerouslySetInnerHTML={{ __html: ssrGlobalCss }} />
        <link
          rel="icon"
          type="image/svg+xml"
          href={faviconUrl}
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          type="image/svg+xml"
          href={faviconDarkUrl}
          media="(prefers-color-scheme: dark)"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <title>{siteName}</title>
        {systemConfig?.description && (
          <meta name="description" content={systemConfig.description} />
        )}
        {systemConfig?.keywords && <meta name="keywords" content={systemConfig.keywords} />}
        {customHead?.meta?.map((m) => (
          <meta key={headKeyOf(m as Record<string, unknown>)} {...m} />
        ))}
        {customHead?.links?.map((l) => (
          <link key={headKeyOf(l as Record<string, unknown>)} {...l} />
        ))}
        {customHead?.scripts?.map((s) => (
          <script key={headKeyOf(s as Record<string, unknown>)} {...s} />
        ))}
        {customHead?.styles?.map((s) => (
          <style key={headKeyOf(s as Record<string, unknown>)} {...s} />
        ))}
        <HeadContent />
      </head>
      <body className="font-sans antialiased flex min-h-screen flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Toaster position="top-center" richColors />
        <Footer />
        <Scripts />
      </body>
    </html>
  );
}

/** Admin 路由：客户端渲染，集成主题管理与 antd ConfigProvider */
export function AdminRootDocument({
  children,
  siteName = "HUB",
}: {
  children: React.ReactNode;
  siteName?: string;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_INIT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: LAYER_ORDER_STYLE }} />
        <title>{`${siteName} 管理后台`}</title>
        <HeadContent />
        <link rel="stylesheet" href={adminGlobalCss} />
        <link rel="icon" type="image/svg+xml" href={adminFaviconUrl} />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="font-sans antialiased">
        <ClientOnly>
          <AdminProvider>{children}</AdminProvider>
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  );
}
