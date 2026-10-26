/**
 * 关于页面：中继服务的定位、数据落点与前台入口
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@ucode/hub-ui-ssr/ui";
import { useClientAuth } from "#/components/client";
import { useTranslation } from "#/components/providers";

export const Route = createFileRoute("/about")({
  component: About,
});

/** 中继承担的几件事：一句一条，不展开技术细节 */
const CAPABILITIES = [
  "远程访问：UCode 主动出站建立隧道，公网请求经中继回灌到本机服务，不必对外暴露端口。",
  "账号与设备：后台管理账号与角色权限，登记本机 UCode 实例、查看在线状态并吊销令牌。",
  "模型端点与资产下发：模型调用集中转发与记账，技能与提示词命令统一发布，凭据不下发到设备。",
];

/** 数据落点：中继是自建服务，两处都在部署方本机 */
const DATA_PLACES = [
  "中继是自建服务，每企业一套：账号、设备与用量数据都存在部署方自有的 PostgreSQL 里，不经过第三方。",
  "上传文件与运行日志同样落在部署方本机的存储目录，数据不出企业边界。",
];

/** 前台入口：登录态决定首项是「登录」还是「我的设备」（设备页与用量页本身也会各自拦未登录） */
const ENTRIES = [
  { to: "/devices", label: "我的设备", variant: "default" },
  { to: "/usage", label: "我的用量", variant: "outline" },
] as const;

const LOGIN_ENTRY = { to: "/login", label: "登录", variant: "outline" } as const;

function About() {
  const { t } = useTranslation();
  const { user } = useClientAuth();
  const entries = user ? ENTRIES : [LOGIN_ENTRY, ...ENTRIES];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-16">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl">{t("关于 UCode 中继")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:space-y-6 sm:p-6 sm:pt-0">
          <p className="text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {t(
              "这里是 UCode 的中继服务：登录后即可远程访问本机 UCode，用它统一管理账号与设备，并由它承载模型端点与内置资产下发。",
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="p-4 sm:p-5">
                <CardTitle className="text-sm sm:text-base">{t("中继做什么")}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                <ul className="space-y-2 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                  {CAPABILITIES.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-4 sm:p-5">
                <CardTitle className="text-sm sm:text-base">{t("数据放在哪")}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
                <ul className="space-y-2 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                  {DATA_PLACES.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {entries.map((entry) => (
              <Link key={entry.to} to={entry.to} className="sm:w-auto">
                <Button variant={entry.variant} className="w-full sm:w-auto">
                  {t(entry.label)}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
