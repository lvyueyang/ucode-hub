/**
 * 通知外发渠道统一入口：按渠道分发到对应适配器
 * 目标地址与签名由用户配置（user_config.notify_channels）提供；总闸由系统配置 notify_enabled 控制
 */
import { logger } from "#/shared-services/logger";
import { sendChannelEmail } from "./email";
import { sendChannelSms } from "./sms";
import { type ChannelResult, sendWebhook, type WebhookVariant } from "./webhook";

/** 通知外发渠道（站内信为主渠道，不在此列） */
export type NotifyChannel = "email" | "feishu" | "wecom" | "dingtalk" | "webhook" | "sms";

/** 单渠道投递参数（目标 value + 可选 secret） */
export interface NotifyChannelDispatch {
  channel: NotifyChannel;
  value: string;
  secret?: string;
  title: string;
  content: string;
}

/** 走 webhook 适配器的渠道：与 WEBHOOK_VARIANTS 键集合同源，保证映射无遗漏 */
type WebhookChannel = Extract<NotifyChannel, "feishu" | "wecom" | "dingtalk" | "webhook">;

/** webhook 变体与渠道映射 */
const WEBHOOK_VARIANTS: Record<WebhookChannel, WebhookVariant> = {
  feishu: "feishu",
  wecom: "wecom",
  dingtalk: "dingtalk",
  webhook: "generic",
};

/**
 * 投递一条外发通知
 * 失败不抛出、不阻断主流程（站内信已落库），仅记录日志
 */
export async function sendNotificationChannel(
  dispatch: NotifyChannelDispatch,
): Promise<ChannelResult> {
  switch (dispatch.channel) {
    case "email":
      return sendChannelEmail(dispatch.value, {
        title: dispatch.title,
        content: dispatch.content,
      });
    case "sms":
      return sendChannelSms(dispatch.value, {
        title: dispatch.title,
        content: dispatch.content,
      });
    case "feishu":
    case "wecom":
    case "dingtalk":
    case "webhook": {
      return sendWebhook(dispatch.value, dispatch.secret, WEBHOOK_VARIANTS[dispatch.channel], {
        title: dispatch.title,
        content: dispatch.content,
      });
    }
    default:
      logger.warn({ channel: dispatch.channel }, "未知通知渠道，跳过");
      return { ok: false, error: "未知通知渠道" };
  }
}
