/**
 * 客户端用户登录页面（TanStack Form）
 */

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@ucode/hub-ui-ssr/ui";
import { toast } from "sonner";
import { useClientAuth } from "#/components/client";
import { useGlobalStore, useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import { track } from "#/services/track/track";
import { toBool } from "#/utils/bool";
import { getDisplayErrorMessage } from "#/utils/error-utils";
import { sfnUnwrap } from "#/utils/sfn-error";
import { clientLoginSFn } from "./-mods/login.functions";

function LoginError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-8">
      <p className="text-sm text-destructive">
        {getDisplayErrorMessage(error) ?? t("加载失败，请稍后重试")}
      </p>
    </main>
  );
}

export const Route = createFileRoute("/login/")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (user) {
      throw redirect({ to: "/" });
    }
  },
  component: ClientLoginPage,
  errorComponent: LoginError,
});

function ClientLoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { refetch } = useClientAuth();
  const { systemConfig } = useGlobalStore();
  // 注册入口跟随站点开关：关闭时整条提示不渲染，登录页本身不受影响
  const isRegisterEnabled = toBool(systemConfig.client_register_enabled);

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const [result] = await sfnUnwrap(clientLoginSFn({ data: value }));
      if (!result) return;
      if (!result.success) {
        toast.error(result.message || t("登录失败"));
        return;
      }
      // 刷新客户端登录态，避免 Header 等组件仍显示未登录
      refetch();
      toast.success(t("登录成功"));
      track("Login", { form_name: "clientLogin" });
      track("FormSubmit", { form_name: "clientLogin" });
      navigate({ to: "/" });
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-8 max-sm:px-0">
      <div className="w-full max-w-sm max-sm:max-w-full">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-center text-xl sm:text-2xl">{t("用户登录")}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              className="space-y-3 sm:space-y-4"
            >
              <AutofillBlocker />
              <form.Field
                name="username"
                validators={{
                  onChange: ({ value }) => (!value ? t("请输入用户名") : undefined),
                }}
              >
                {(field) => (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label htmlFor={field.name} className="text-sm font-medium">
                      {t("用户名")}
                    </label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="text"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      autoFocus
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="password"
                validators={{
                  onChange: ({ value }) => (!value ? t("请输入密码") : undefined),
                }}
              >
                {(field) => (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label htmlFor={field.name} className="text-sm font-medium">
                      {t("密码")}
                    </label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Subscribe>
                {(state) => (
                  <Button type="submit" disabled={!state.canSubmit} className="w-full">
                    {state.isSubmitting ? t("登录中") : t("登录")}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              <Link
                to="/forgot-password"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("忘记密码？")}
              </Link>
            </p>

            {isRegisterEnabled && (
              <p className="mt-1 text-center text-sm text-muted-foreground">
                {t("还没有账号？")}{" "}
                <Link to="/register" className="underline underline-offset-4 hover:text-foreground">
                  {t("立即注册")}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
