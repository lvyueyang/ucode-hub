/**
 * 通用 webhook 通知发送器：飞书 / 企微 / 钉钉 / 通用 webhook 本质都是 POST 一个 URL，
 * 只是 JSON 消息体格式与可选签名不同，按 variant 生成 payload。
 * 零外部依赖：HTTP 用 Node fetch，签名用内置 crypto。
 */
import { createHmac } from "node:crypto";
import { logExternalRequest } from "#/shared-services/external-observability";

/** webhook 变体 */
export type WebhookVariant = "generic" | "feishu" | "wecom" | "dingtalk";

/** webhook 发送结果 */
export interface ChannelResult {
  ok: boolean;
  error?: string;
}

/** 飞书/企微/钉钉机器人签名算法（HMAC-SHA256(secret, `${timestamp}\n${secret}`) → base64 → urlencode），三家公式一致，仅 timestamp 单位不同 */
function robotSign(secret: string, timestamp: number): string {
  const sign = createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64");
  return encodeURIComponent(sign);
}

/** 带签名的机器人 URL：timestamp 单位按变体取值（钉钉为毫秒，飞书/企微为秒） */
function buildRobotUrl(url: string, secret: string | undefined, timestamp: number): string {
  if (!secret) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}timestamp=${timestamp}&sign=${robotSign(secret, timestamp)}`;
}

/** 按变体生成消息体 payload */
function buildPayload(
  variant: WebhookVariant,
  title: string,
  content: string,
  time: string,
): unknown {
  switch (variant) {
    case "feishu":
      return {
        msg_type: "text",
        content: { text: `${title}\n${content}` },
      };
    case "wecom":
      return { msgtype: "text", text: { content: `${title}\n${content}` } };
    case "dingtalk":
      return { msgtype: "text", text: { content: `${title}\n${content}` } };
    default:
      return { title, content, time };
  }
}

/**
 * 发送 webhook 通知
 * @param url 目标 webhook URL
 * @param secret 可选签名密钥（飞书/企微/钉钉机器人加签；通用 webhook 则放入 X-Signature 头）
 * @param variant 消息体格式变体
 * @param payload 消息内容
 * @returns 发送结果（失败仅返回，不抛出）
 */
export async function sendWebhook(
  url: string,
  secret: string | undefined,
  variant: WebhookVariant,
  payload: { title: string; content: string },
): Promise<ChannelResult> {
  const time = new Date().toISOString();
  const now = Date.now();
  // 钉钉机器人 timestamp 为毫秒，飞书/企微为秒
  const timestamp = variant === "dingtalk" ? now : Math.floor(now / 1000);
  const finalUrl = variant === "generic" ? url : buildRobotUrl(url, secret, timestamp);
  const body = JSON.stringify(buildPayload(variant, payload.title, payload.content, time));

  const startedAt = Date.now();
  // 观测字段：不回传 webhook URL（含 access_token 等凭据），只记变体
  const logBase = {
    system: "webhook",
    requestType: "business" as const,
    path: "webhook",
    method: "POST",
    extra: { variant },
  };
  try {
    const res = await fetch(finalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(variant === "generic" && secret ? { "X-Signature": secret } : {}),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      logExternalRequest({
        ...logBase,
        duration: Date.now() - startedAt,
        success: false,
        status: res.status,
        error: `HTTP ${res.status}`,
        extra: { variant, body: bodyText.slice(0, 500) },
      });
      return { ok: false, error: `HTTP ${res.status}` };
    }
    logExternalRequest({
      ...logBase,
      duration: Date.now() - startedAt,
      success: true,
      status: res.status,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "webhook 请求异常";
    logExternalRequest({
      ...logBase,
      duration: Date.now() - startedAt,
      success: false,
      error: message,
    });
    return { ok: false, error: message };
  }
}
