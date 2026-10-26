/**
 * 管理端个人「通知渠道设置」弹窗
 */
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Alert, Form, Input, Switch } from "antd";
import { useEffect, useState } from "react";
import { AdminFormModal, FORM_MODAL_WIDTH } from "#/components/admin";
import type { UserNotifyChannels } from "#/db/schema";
import {
  getAdminNotifyChannelsSFn,
  saveAdminNotifyChannelsSFn,
} from "#/services/message/message.functions";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";

/** 渠道配置项 */
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

interface NotifyChannelSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function NotifyChannelSettingsModal({ open, onClose }: NotifyChannelSettingsModalProps) {
  const [form] = Form.useForm<UserNotifyChannels>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void sfnUnwrap(getAdminNotifyChannelsSFn(), {
      error: "加载通知设置失败",
    }).then(([data]) => {
      if (data === null) return;
      // 规整每个渠道：enabled 缺省为 false，保留已配置的 value/secret，避免未配置渠道以 undefined 提交
      const normalized = {} as UserNotifyChannels;
      for (const c of CHANNELS) {
        normalized[c.key] = {
          enabled: data[c.key]?.enabled ?? false,
          value: data[c.key]?.value ?? "",
          secret: data[c.key]?.secret ?? "",
        };
      }
      form.setFieldsValue(normalized);
    });
  }, [open, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await callSfn(saveAdminNotifyChannelsSFn({ data: values }), {
        error: "保存失败，请稍后重试",
      });
      message.success("已保存通知设置");
      onClose();
    } catch {
      // callSfn 已提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormModal
      title="通知渠道设置"
      open={open}
      onOk={() => void handleSave()}
      onClose={onClose}
      submitting={saving}
      okText="保存"
      width={FORM_MODAL_WIDTH.base}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="启用并填写目标地址后，系统才会通过该渠道向你推送通知（总闸关闭时全部不发送）。"
      />
      <Form form={form} layout="vertical">
        {CHANNELS.map((c) => (
          <Form.Item key={c.key} label={c.label} style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Form.Item name={[c.key, "enabled"]} valuePropName="checked" noStyle>
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
              <span
                style={{
                  color: "var(--ant-color-text-secondary)",
                  fontSize: 12,
                }}
              >
                {c.hint}
              </span>
            </div>
            <Form.Item name={[c.key, "value"]} noStyle>
              <Input placeholder={c.key === "email" ? "邮箱地址" : "Webhook 地址"} />
            </Form.Item>
            {c.hasSecret && (
              <Form.Item name={[c.key, "secret"]} noStyle style={{ marginTop: 8 }}>
                <Input placeholder="签名密钥（选填）" style={{ marginTop: 8 }} />
              </Form.Item>
            )}
          </Form.Item>
        ))}
      </Form>
    </AdminFormModal>
  );
}
