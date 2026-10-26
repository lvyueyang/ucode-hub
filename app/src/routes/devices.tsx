/**
 * 前台「我的设备」：展示自己名下已登记的 UCode 实例
 * 未登录跳登录页；改名与吊销在卡片内就地完成（失败由统一出口提示）
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import type { DeviceListItem } from "#/services/device/device.server";
import { sfnUnwrap } from "#/utils/sfn-error";
import { DeviceCard } from "./devices/-mods/DeviceCard";
import {
  getMyDevicesSFn,
  renameMyDeviceSFn,
  revokeMyDeviceSFn,
} from "./devices/-mods/devices.functions";

export const Route = createFileRoute("/devices")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (!user) throw redirect({ to: "/login" });
  },
  loader: async () => getMyDevicesSFn(),
  component: DevicesPage,
});

function DevicesPage() {
  const { t } = useTranslation();
  const initial = Route.useLoaderData();
  const [devices, setDevices] = useState<DeviceListItem[]>(initial);

  const reload = async () => {
    const [list] = await sfnUnwrap(getMyDevicesSFn(), { error: t("加载失败，请稍后重试") });
    if (list) setDevices(list);
  };

  /** 改名：卡片只关心成功与否，成功提示与列表刷新在这里统一处理 */
  const handleRename = async (device: DeviceListItem, name: string): Promise<boolean> => {
    const [, err] = await sfnUnwrap(renameMyDeviceSFn({ data: { id: device.id, name } }));
    if (err) return false;
    toast.success(t("设备已改名"));
    await reload();
    return true;
  };

  const handleRevoke = async (device: DeviceListItem): Promise<boolean> => {
    const [, err] = await sfnUnwrap(revokeMyDeviceSFn({ data: { id: device.id } }));
    if (err) return false;
    toast.success(t("设备已吊销"));
    await reload();
    return true;
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("我的设备")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:mt-2">
          {t("共 {{total}} 台设备", { total: devices.length })}
        </p>
      </header>

      {devices.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">{t("暂无设备")}</div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onRename={(name) => handleRename(device, name)}
              onRevoke={() => handleRevoke(device)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
