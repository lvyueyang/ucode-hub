/**
 * 客户端用户注册页面（TanStack Form）
 * 集成图片验证码防护，禁用浏览器自动填充
 */

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@ucode/hub-ui-ssr/ui";
import { toast } from "sonner";
import { CaptchaInput } from "#/components/client";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import { track } from "#/services/track/track";
import { getDisplayErrorMessage } from "#/utils/error-utils";
import { sfnUnwrap } from "#/utils/sfn-error";
import { clientRegisterSFn } from "./-mods/register.functions";

function RegisterError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-8">
      <p className="text-sm text-destructive">
        {getDisplayErrorMessage(error) ?? t("加载失败，请稍后重试")}
      </p>
    </main>
  );
}

export const Route = createFileRoute("/register/")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (user) {
      throw redirect({ to: "/" });
    }
  },
  component: ClientRegisterPage,
  errorComponent: RegisterError,
});

function ClientRegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    defaultValues: {
      username: "",
      email: "",
      password: "",
      captcha: "",
    },
    onSubmit: async ({ value }) => {
      const [result] = await sfnUnwrap(
        clientRegisterSFn({
          data: {
            username: value.username,
            email: value.email,
            password: value.password,
            captcha: value.captcha,
          },
        }),
      );
      if (!result) return;
      if (!result.success) {
        toast.error(result.message || t("注册失败"));
        return;
      }
      toast.success(t("注册成功"));
      track("Register", { form_name: "clientRegister" });
      track("FormSubmit", { form_name: "clientRegister" });
      navigate({ to: "/login" });
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-8 max-sm:px-0">
      <div className="w-full max-w-sm max-sm:max-w-full">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-center text-xl sm:text-2xl">{t("用户注册")}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              className="space-y-3 sm:space-y-4"
              autoComplete="off"
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
                      autoComplete="off"
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
                name="email"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return t("请输入邮箱");
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t("邮箱格式不正确");
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label htmlFor={field.name} className="text-sm font-medium">
                      {t("邮箱")}
                    </label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      autoComplete="off"
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              {/* 邮箱验证码 + 图片验证码弹窗 */}
              <form.Field
                name="captcha"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return t("请输入验证码");
                    if (value.length !== 6) return t("验证码为 6 位");
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label htmlFor={field.name} className="text-sm font-medium">
                      {t("邮箱验证码")}
                    </label>
                    <form.Subscribe>
                      {(state) => (
                        <CaptchaInput
                          email={state.values.email}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onMessage={(msg) => {
                            toast.success(msg);
                          }}
                        />
                      )}
                    </form.Subscribe>
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
                  onChange: ({ value }) => {
                    if (!value) return t("请输入密码");
                    if (value.length < 6) return t("密码至少 6 位");
                    return undefined;
                  },
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
                      autoComplete="new-password"
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
                    {state.isSubmitting ? t("注册中") : t("注册")}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <p className="mt-3 text-center text-sm text-muted-foreground sm:mt-4">
              {t("已有账号？")}{" "}
              <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
                {t("立即登录")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
