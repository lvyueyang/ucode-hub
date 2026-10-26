/**
 * 根路由：根据路径前缀分离 Admin（客户端渲染）与前台（SSR）
 * locale 由 localeMiddleware 注入 request context，通过 getLocaleBundleSFn 读取
 */

import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, useLocation } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Fragment, useEffect } from "react";
import { ClientAuthProvider } from "#/components/client";
import { AdminRootDocument, SSRRootDocument } from "#/components/Document";
import { GlobalStoreProvider } from "#/components/providers";
import { SfnErrorDialogHost } from "#/components/SfnErrorDialog";
import { getVisibleConfigsSFn } from "#/shared-services/config/config.functions";
import { getLocaleBundleSFn } from "#/shared-services/i18n/i18n.functions";
import { DEFAULT_LOCALE } from "#/shared-services/i18n/i18n.types";
import { stripSfnErrorMeta } from "#/utils/error-utils";
import { installSfnErrorFallback } from "#/utils/sfn-error";

export const Route = createRootRoute({
  head: () => {
    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
      ],
    };
  },
  async loader({ location }) {
    // 管理端为中文 SPA，不注入 GlobalStoreProvider，无需加载 UI 翻译与其 locale
    if (location.pathname.startsWith("/admin")) {
      const systemConfig = await getVisibleConfigsSFn();
      return { locale: DEFAULT_LOCALE, translations: {}, systemConfig };
    }
    const [bundle, systemConfig] = await Promise.all([
      getLocaleBundleSFn(),
      getVisibleConfigsSFn(),
    ]);
    return { ...bundle, systemConfig };
  },
  shellComponent: RootDocument,
  errorComponent: RootError,
});

function RootError({ error }: { error: unknown }) {
  const msg =
    error instanceof Error ? stripSfnErrorMeta(error.message) : "页面加载失败，请刷新重试";
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="text-center space-y-3 px-4">
          <p className="text-lg font-semibold text-foreground">页面加载失败</p>
          <p className="text-sm text-muted-foreground">{msg}</p>
        </div>
      </body>
    </html>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname;
  const data = Route.useLoaderData();

  // 全局兜底：未被任何调用点处理的 SFn 错误统一友好提示（仅客户端生效）
  useEffect(installSfnErrorFallback, []);

  const isAdmin = pathname.startsWith("/admin");
  return (
    <Fragment>
      {isAdmin ? (
        <AdminRootDocument siteName={data.systemConfig?.site_name}>{children}</AdminRootDocument>
      ) : (
        <GlobalStoreProvider
          value={{
            locale: data.locale,
            translations: data.translations,
            systemConfig: data.systemConfig,
          }}
        >
          <ClientAuthProvider>
            <SSRRootDocument>{children}</SSRRootDocument>
          </ClientAuthProvider>
        </GlobalStoreProvider>
      )}
      <TanStackDevtools
        config={{ position: "bottom-right" }}
        plugins={[
          {
            name: "Tanstack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
      {/* SFn 错误详情弹窗宿主（覆盖管理端与前台，独立于 toast 生命周期） */}
      <SfnErrorDialogHost />
    </Fragment>
  );
}
