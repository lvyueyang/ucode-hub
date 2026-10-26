/**
 * 客户端「通知渠道设置」面板：用户配置自己接收的外发渠道（邮件/飞书/企微/钉钉/通用 Webhook）
 * 简洁可控状态实现（shadcn 无 Switch，用复选框 + Input）
 */
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@ucode/hub-ui-ssr/ui";
import { useState } from "react";
import { toast } from "sonner";
import type { UserNotifyChannels } from "#/db/schema";
import {
  getMyNotifyChannelsSFn,
  saveMyNotifyChannelsSFn,
} from "#/services/message/message.functions";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";

/** 渠道展示配置：是否支持 secret 输入框 */
const CHANNELS: {
  key: keyof UserNotifyChannels;
  label: string;
  hint: string;
  hasSecret: boolean;
}[] = [
  { key: "email", label: "邮件", hint: "接收邮箱地址", hasSecret: false },
  {
    key: "feishu",
    label: "飞书",
    hint: "飞书群机器人 Webhook 地址",
    hasSecret: true,
  },
  {
    key: "wecom",
    label: "企业微信",
    hint: "企业微信群机器人 Webhook 地址",
    hasSecret: true,
  },
  {
    key: "dingtalk",
    label: "钉钉",
    hint: "钉钉群自定义机器人 Webhook 地址",
    hasSecret: true,
  },
  {
    key: "webhook",
    label: "通用 Webhook",
    hint: "自定义 Webhook 地址",
    hasSecret: true,
  },
];

export function NotifyChannelSettings() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<UserNotifyChannels>({});
  const [loading, setLoading] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    if (Object.keys(channels).length === 0) {
      setLoading(true);
      const [data] = await sfnUnwrap(getMyNotifyChannelsSFn(), {
        error: "加载通知设置失败",
      });
      if (data !== null) setChannels(data);
      setLoading(false);
    }
  };

  const setChannel = (
    key: keyof UserNotifyChannels,
    patch: Partial<NonNullable<UserNotifyChannels[typeof key]>>,
  ) => {
    setChannels((prev) => ({
      ...prev,
      [key]: { enabled: false, ...prev[key], ...patch },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await callSfn(saveMyNotifyChannelsSFn({ data: channels }), {
        error: "保存失败，请稍后重试",
      });
      toast.success("已保存通知设置");
    } catch {
      // callSfn 已提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={openPanel}>
        通知渠道设置
      </Button>

      {open && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">通知渠道</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              启用并填写目标地址后，系统才会通过该渠道向你推送通知（总闸关闭时全部不发送）。
            </p>
            {CHANNELS.map((c) => {
              const cfg = channels[c.key];
              return (
                <div key={c.key} className="space-y-1.5 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={cfg?.enabled ?? false}
                      disabled={loading}
                      onChange={(e) => setChannel(c.key, { enabled: e.target.checked })}
                    />
                    {c.label}
                    <span className="text-xs text-muted-foreground">{c.hint}</span>
                  </label>
                  <Input
                    placeholder={c.key === "email" ? "邮箱地址" : "Webhook 地址"}
                    value={cfg?.value ?? ""}
                    disabled={loading}
                    onChange={(e) => setChannel(c.key, { value: e.target.value })}
                  />
                  {c.hasSecret && (
                    <Input
                      placeholder="签名密钥（选填）"
                      value={cfg?.secret ?? ""}
                      disabled={loading}
                      onChange={(e) => setChannel(c.key, { secret: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                关闭
              </Button>
              <Button size="sm" disabled={saving} onClick={handleSave}>
                保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
