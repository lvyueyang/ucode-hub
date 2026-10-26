/**
 * 系统初始化 Server Function
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type InitData, initSystem } from "#/services/init/init.server";

export const initSchema = z
  .object({
    username: z.string().min(1, "用户名不能为空").max(50),
    password: z.string().min(6, "密码至少 6 位").max(100),
    confirmPassword: z.string().min(1, "请确认密码"),
    email: z.string().email("请输入有效的邮箱地址"),
    siteName: z.string().default("HUB"),
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    smtpFrom: z.string().optional(),
    aiBaseUrl: z.string().optional(),
    aiApiKey: z.string().optional(),
    aiModel: z.string().optional(),
    smsProvider: z.string().optional(),
    smsAccessKeyId: z.string().optional(),
    smsAccessKeySecret: z.string().optional(),
    smsSignName: z.string().optional(),
    smsTemplateCode: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

type InitInput = z.infer<typeof initSchema>;

/** 将表单输入转换为初始化负载（可测试的核心逻辑） */
export function buildInitData(data: InitInput): InitData {
  const smtpProvided = !!(
    data.smtpHost ||
    data.smtpPort ||
    data.smtpUser ||
    data.smtpPass ||
    data.smtpFrom
  );
  const aiProvided = !!(data.aiBaseUrl || data.aiApiKey || data.aiModel);
  const smsProvided = !!(
    data.smsProvider ||
    data.smsAccessKeyId ||
    data.smsAccessKeySecret ||
    data.smsSignName ||
    data.smsTemplateCode
  );

  return {
    admin: {
      username: data.username,
      password: data.password,
      email: data.email,
    },
    siteName: data.siteName || "HUB",
    smtp: smtpProvided
      ? {
          host: data.smtpHost,
          port: data.smtpPort,
          secure: data.smtpSecure,
          user: data.smtpUser,
          pass: data.smtpPass,
          from: data.smtpFrom,
        }
      : undefined,
    ai: aiProvided
      ? {
          baseUrl: data.aiBaseUrl,
          apiKey: data.aiApiKey,
          model: data.aiModel,
        }
      : undefined,
    sms: smsProvided
      ? {
          provider: data.smsProvider,
          accessKeyId: data.smsAccessKeyId,
          accessKeySecret: data.smsAccessKeySecret,
          signName: data.smsSignName,
          templateCode: data.smsTemplateCode,
        }
      : undefined,
  };
}

export const initSFn = createServerFn({ method: "POST" })
  .validator(initSchema)
  .handler(async ({ data }) => {
    return initSystem(buildInitData(data));
  });
