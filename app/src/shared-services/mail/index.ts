/**
 * 邮件发送模块（shared-services）：基于 nodemailer，SMTP 配置直接读取系统配置
 * 直接引用 logger 单例与 getConfig（均在本层，无需 init 注入）；配置变更时自动重建 transporter
 */
import { createTransport, type Transporter } from "nodemailer";
import { getConfig } from "#/shared-services/config/config.server";
import { logExternalRequest } from "#/shared-services/external-observability";
import { logger } from "#/shared-services/logger";

/** 邮件发送参数 */
export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

let _transporter: Transporter | null = null;
let _lastConfigFingerprint = "";

/**
 * 懒加载创建 transporter，配置变更时自动重建
 */
async function getTransporter(): Promise<Transporter | null> {
  const host = await getConfig("smtp_host");
  if (!host) {
    logger.warn("SMTP 未配置（smtp_host 为空），邮件功能不可用");
    return null;
  }

  const port = Number(await getConfig("smtp_port")) || 587;
  const secure = (await getConfig("smtp_secure")) === "true";
  const user = await getConfig("smtp_user");
  const pass = await getConfig("smtp_pass");
  const from = await getConfig("smtp_from");
  const fingerprint = [host, port, secure, user, pass, from].join("|");

  if (_transporter && _lastConfigFingerprint === fingerprint) {
    return _transporter;
  }

  _transporter = createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  _lastConfigFingerprint = fingerprint;
  return _transporter;
}

/**
 * 发送邮件
 * 外发结果统一经 logExternalRequest 收口（成功 debug / 失败 warn + Prometheus 指标），
 * 调用方不再另打 info/error，避免同一调用双份日志与级别虚高
 */
export async function sendMail(options: SendMailOptions): Promise<boolean> {
  const startedAt = Date.now();
  try {
    const transporter = await getTransporter();
    if (!transporter) {
      logger.warn({ to: options.to }, "邮件发送跳过：SMTP 未配置");
      return false;
    }

    const from = (await getConfig("smtp_from")) || "noreply@example.com";
    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    logExternalRequest({
      system: "mail",
      requestType: "business",
      path: "smtp/sendMail",
      duration: Date.now() - startedAt,
      success: true,
      extra: { to: options.to, subject: options.subject },
    });
    return true;
  } catch (err) {
    logExternalRequest({
      system: "mail",
      requestType: "business",
      path: "smtp/sendMail",
      duration: Date.now() - startedAt,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      extra: { to: options.to },
    });
    return false;
  }
}

export async function sendCaptchaMail(to: string, code: string): Promise<boolean> {
  // 邮件模板使用内联样式 + 十六进制色值：邮件客户端不解析 CSS 变量/语义令牌，
  // 且内联样式是跨客户端唯一可靠方案，故在样式令牌规则上属例外。
  // 圆角遵循项目直角风格统一归零。
  const html = `
     <div style="max-width: 480px; margin: 0 auto; padding: 32px; font-family: sans-serif; background: #f9fafb; border-radius: 0;">
       <h2 style="color: #1f2937; margin-top: 0;">验证码</h2>
       <p style="color: #6b7280;">您的验证码是：</p>
       <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #111827; background: #fff; padding: 12px 24px; border-radius: 0; display: inline-block; margin: 12px 0;">
         ${code}
       </div>
       <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">有效期 5 分钟，请勿向他人泄露。</p>
     </div>
   `;
  return sendMail({
    to,
    subject: "验证码",
    html,
  });
}
