/**
 * 短信通知渠道适配器接口：本轮仅留接口，不实现发送
 * 后续接入时按现有 sms 服务商工厂（aliyun）扩展通用通知模板即可
 */
import type { ChannelResult } from "./webhook";

/** 发送短信通知（占位实现，未接入） */
export async function sendChannelSms(
  _to: string,
  _payload: { title: string; content: string },
): Promise<ChannelResult> {
  return { ok: false, error: "短信通知渠道未实现" };
}
