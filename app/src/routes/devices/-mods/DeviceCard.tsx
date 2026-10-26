/**
 * 前台设备卡片：单台设备的展示与就地操作（改名 / 吊销）
 *
 * 改名与吊销的中间态（编辑中、待确认）由卡片自持，父级只负责调接口与刷新列表：
 * 操作结果回给「是否成功」，卡片据此收起自己的中间态。
 */
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@ucode/hub-ui-ssr/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "#/components/providers";
import { DEVICE_ONLINE_LABELS, DEVICE_STATUS_LABELS, deviceAccessPath } from "#/constants/device";
import type { DeviceListItem } from "#/services/device/device.server";

/** 卡片内的字段行：标签在上、值在下，长值省略 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** 时间统一按中文时区展示：服务端与浏览器取同一区域，避免 SSR 水合结果不一致 */
const formatTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("zh-CN") : "—";

interface DeviceCardProps {
  device: DeviceListItem;
  /** 改名：返回是否成功 */
  onRename: (name: string) => Promise<boolean>;
  /** 吊销：返回是否成功 */
  onRevoke: () => Promise<boolean>;
}

export function DeviceCard({ device, onRename, onRevoke }: DeviceCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const isActive = device.status === "active";
  // 只能打开正在隧道上且在线的设备：离线时中继直接回 502，给了入口只会点出错误
  const canOpen = isActive && device.online;

  const submitRename = async () => {
    setBusy(true);
    const ok = await onRename(draft.trim());
    setBusy(false);
    if (ok) setEditing(false);
  };

  const submitRevoke = async () => {
    setBusy(true);
    const ok = await onRevoke();
    setBusy(false);
    if (ok) setConfirming(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="min-w-0 truncate text-base">{device.name}</CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            {!isActive && (
              <Badge variant="destructive" className="text-xs">
                {t(DEVICE_STATUS_LABELS.revoked)}
              </Badge>
            )}
            <Badge variant={device.online ? "default" : "secondary"} className="text-xs">
              {device.online ? t(DEVICE_ONLINE_LABELS.online) : t(DEVICE_ONLINE_LABELS.offline)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Field label={t("平台")}>{device.platform ?? "—"}</Field>
          <Field label={t("版本")}>{device.clientVersion ?? "—"}</Field>
          <Field label={t("最近活跃")}>{formatTime(device.lastSeenAt)}</Field>
          <Field label={t("创建时间")}>{formatTime(device.createdAt)}</Field>
        </dl>

        {editing && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input
              value={draft}
              maxLength={100}
              placeholder={t("设备名")}
              className="min-w-0 flex-1"
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || draft.trim() === ""}
              onClick={() => void submitRename()}
            >
              {t("保存")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(device.name);
                setEditing(false);
              }}
            >
              {t("取消")}
            </Button>
          </div>
        )}

        {!editing && confirming && (
          <div className="mt-4 border border-border bg-background-secondary p-3">
            <p className="text-sm text-foreground-secondary">
              {t("吊销后该设备立即断开且令牌失效，需重新登记才能再次连接。")}
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {t("取消")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void submitRevoke()}
              >
                {t("确认吊销")}
              </Button>
            </div>
          </div>
        )}

        {!editing && !confirming && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {canOpen && (
              <Button asChild size="sm">
                <a
                  href={deviceAccessPath(device.id)}
                  target="_blank"
                  rel="noreferrer"
                  title={t("经中继打开设备上的 UCode")}
                >
                  {t("打开")}
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(device.name);
                setEditing(true);
              }}
            >
              {t("改名")}
            </Button>
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirming(true)}
              >
                {t("吊销")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
