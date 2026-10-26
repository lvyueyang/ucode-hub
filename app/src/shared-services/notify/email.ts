/**
 * 邮件通知发送：复用 mail（smtp_*），模板内联样式（邮件客户端不解析 CSS 变量）
 */
import { sendMail } from "#/shared-services/mail";
import type { ChannelResult } from "./webhook";

/** 标题转义（标题为纯文本，避免注入破坏布局；content 允许 HTML 不做转义） */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 组装通知邮件 HTML：标题转义，content 按 HTML 原样渲染（支持内联样式/富文本定制） */
function buildEmailHtml(title: string, content: string): string {
  return `
  <div style="max-width: 560px; margin: 0 auto; padding: 32px; font-family: sans-serif; background: #f9fafb; border-radius: 0;">
    <h2 style="color: #1f2937; margin-top: 0;">${escapeHtml(title)}</h2>
    <div style="color: #374151; margin-top: 8px;">${content}</div>
  </div>`;
}

export async function sendChannelEmail(
  to: string,
  payload: { title: string; content: string },
): Promise<ChannelResult> {
  const ok = await sendMail({
    to,
    subject: payload.title,
    html: buildEmailHtml(payload.title, payload.content),
  });
  if (ok) {
    return { ok: true };
  }
  return { ok: false, error: "邮件发送失败" };
}
