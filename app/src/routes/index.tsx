/**
 * 前台首页：中继服务定位 + 入口
 * 未登录给登录 / 注册，已登录给「我的设备」；后台入口只对管理端账号展示
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, CardDescription, CardHeader, CardTitle } from "@ucode/hub-ui-ssr/ui";
import { useClientAuth } from "#/components/client";
import { useTranslation } from "#/components/providers";
import { getCurrentAdminSFn } from "#/services/admin-auth/admin-auth.functions";

export const Route = createFileRoute("/")({
  component: HomePage,
  // 与管理端布局守卫同一处身份判定：普通客户端用户拿不到后台入口
  loader: async () => ({ isAdmin: (await getCurrentAdminSFn()) !== null }),
});

const features = [
  {
    label: "远程访问",
    desc: "UCode 主动出站建立隧道，公网请求经中继回灌到本机服务，不必对外暴露端口。",
  },
  {
    label: "我的设备",
    desc: "登记本机 UCode 实例，随时查看在线状态，按需改名或吊销令牌。",
  },
  {
    label: "模型端点与资产下发",
    desc: "由中继统一承载：模型调用集中转发与记账，技能与提示词命令统一发布，凭据不下发到设备。",
  },
];

function HomePage() {
  const { t } = useTranslation();
  const { user } = useClientAuth();
  const { isAdmin } = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-16">
      {/* Hero 区域 */}
      <section className="mb-12 text-center sm:mb-20">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          {t("UCode 中继服务")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:mt-4 sm:text-lg">
          {t("登录后可远程访问本机 UCode；后续承载模型端点与内置资产下发。")}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row sm:gap-4">
          {user ? (
            <Link to="/devices">
              <Button className="w-full sm:w-auto">{t("我的设备")}</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button className="w-full sm:w-auto">{t("登录")}</Button>
              </Link>
              <Link to="/register">
                <Button variant="outline" className="w-full sm:w-auto">
                  {t("注册")}
                </Button>
              </Link>
            </>
          )}
          {isAdmin && (
            <Link to="/admin">
              <Button variant="outline" className="w-full sm:w-auto">
                {t("后台")}
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* 中继能力 */}
      <section className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {features.map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <CardTitle>{t(item.label)}</CardTitle>
              <CardDescription>{t(item.desc)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
