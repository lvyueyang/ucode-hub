/**
 * 管理端提供器
 */
import { StyleProvider } from "@ant-design/cssinjs";
import { useLocation } from "@tanstack/react-router";
import { AntdStaticBridge, message } from "@ucode/hub-ui-spa/antd-static";
import { enableColumnBudgetWarning } from "@ucode/hub-ui-spa/table";
import { useThemeMode } from "@ucode/hub-ui-ssr/theme";
import { App, theme as antdTheme, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo } from "react";
import { SfnErrorNotice } from "#/components/SfnErrorNotice";
import { ADMIN_THEME } from "#/theme/themes";
import { registerSfnNotifier } from "#/utils/sfn-error";
import { AdminAuthProvider } from "./AdminAuthProvider";
import { AdminLayout } from "./AdminLayout";
import { AdminThemeContext } from "./admin-theme";

// 开发期开启列宽预算校验：列宽合计超预算 / 弹性列不唯一 / 非弹性列缺 width 时在控制台提示
if (import.meta.env.DEV) {
  enableColumnBudgetWarning();
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const isStandalone =
    pathname === "/admin/login" ||
    pathname === "/admin/init" ||
    pathname === "/admin/forgot-password";
  const isAdmin = pathname.startsWith("/admin");

  const { mode, setMode, isDark, scheme } = useThemeMode(ADMIN_THEME);

  // 注册管理端错误提示器（antd message）：正面可读消息 + 可展开诊断详情
  useEffect(
    () =>
      registerSfnNotifier((info) =>
        message.error({
          content: <SfnErrorNotice info={info} />,
          duration: 8,
        }),
      ),
    [],
  );

  const ctxValue = useMemo(() => ({ mode, setMode, isDark }), [mode, setMode, isDark]);

  return (
    <StyleProvider layer>
      <AdminThemeContext.Provider value={ctxValue}>
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              // 品牌主色：随明暗切换（棕亮/棕暗，见主题注册表）
              colorPrimary: scheme.antdColorPrimary,
              colorInfo: scheme.antdColorPrimary,
              // 直角风格：antd 6 borderRadius 归零，派生圆角自动归零
              borderRadius: 0,
            },
            algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          }}
        >
          <App message={{ duration: 5 }} notification={{ duration: 5 }}>
            <AntdStaticBridge />
            {!isStandalone && isAdmin ? (
              <AdminAuthProvider>
                <AdminLayout>{children}</AdminLayout>
              </AdminAuthProvider>
            ) : (
              children
            )}
          </App>
        </ConfigProvider>
      </AdminThemeContext.Provider>
    </StyleProvider>
  );
}
