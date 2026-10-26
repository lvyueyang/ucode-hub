/**
 * 客户端用户忘记密码页面（TanStack Form）
 * 通过邮箱验证码重置密码
 */

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { AutofillBlocker } from "@ucode/hub-ui-ssr/form";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@ucode/hub-ui-ssr/ui";
import { toast } from "sonner";
import { CaptchaInput } from "#/components/client";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import { getDisplayErrorMessage } from "#/utils/error-utils";
import { sfnUnwrap } from "#/utils/sfn-error";
import { resetPwdSFn } from "./-mods/forgot-password.functions";

function ForgotPasswordError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-8">
      <p className="text-sm text-destructive">
        {getDisplayErrorMessage(error) ?? t("加载失败，请稍后重试")}
      </p>
    </main>
  );
}

export const Route = createFileRoute("/forgot-password/")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (user) {
      throw redirect({ to: "/" });
    }
  },
  component: ForgotPasswordPage,
  errorComponent: ForgotPasswordError,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    defaultValues: {
      email: "",
      captcha: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      const [result] = await sfnUnwrap(
        resetPwdSFn({
          data: {
            email: value.email,
            captcha: value.captcha,
            password: value.password,
            confirmPassword: value.confirmPassword,
          },
        }),
      );
      if (!result) return;
      if (!result.success) {
        toast.error(result.message || t("重置失败"));
        return;
      }
      toast.success(result.message);
      navigate({ to: "/login" });
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-8 max-sm:px-0">
      <div className="w-full max-w-sm max-sm:max-w-full">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-center text-xl sm:text-2xl">{t("忘记密码")}</CardTitle>
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
                      placeholder="user@example.com"
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                      <p className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </form.Field>

              {/* 邮箱验证码 */}
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
                    if (!value) return t("请输入新密码");
                    if (value.length < 6) return t("密码至少 6 位");
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label htmlFor={field.name} className="text-sm font-medium">
                      {t("新密码")}
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

              <form.Field
                name="confirmPassword"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return t("请确认新密码");
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label htmlFor={field.name} className="text-sm font-medium">
                      {t("确认新密码")}
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
                    {state.isSubmitting ? t("重置中") : t("重置密码")}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <p className="mt-3 text-center text-sm text-muted-foreground sm:mt-4">
              <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
                {t("返回登录")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
