/**
 * 短信发送模块（shared-services）：服务商工厂模式，配置直接读取系统配置
 * 直接引用 logger 单例与 getConfig（均在本层，无需 init 注入）；配置变更时自动重建客户端
 */
import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import { getConfig } from "#/shared-services/config/config.server";
import { logExternalRequest } from "#/shared-services/external-observability";
import { logger } from "#/shared-services/logger";

/** 短信服务商标识 */
export type SmsProvider = "aliyun";

/** 阿里云短信配置键 */
const ALIYUN_CONFIG_KEYS = {
  accessKeyId: "sms_aliyun_access_key_id",
  accessKeySecret: "sms_aliyun_access_key_secret",
  signName: "sms_aliyun_sign_name",
  templateCode: "sms_aliyun_template_code",
} as const;

let _client: Dysmsapi20170525 | null = null;
let _lastConfigFingerprint = "";

/** 读取阿里云配置并计算指纹 */
async function readAliyunConfig(): Promise<{
  accessKeyId: string;
  accessKeySecret: string;
  signName: string;
  templateCode: string;
  fingerprint: string;
}> {
  const accessKeyId = await getConfig(ALIYUN_CONFIG_KEYS.accessKeyId);
  const accessKeySecret = await getConfig(ALIYUN_CONFIG_KEYS.accessKeySecret);
  const signName = await getConfig(ALIYUN_CONFIG_KEYS.signName);
  const templateCode = await getConfig(ALIYUN_CONFIG_KEYS.templateCode);
  const fingerprint = `${accessKeyId}||${accessKeySecret}||${signName}||${templateCode}`;
  return { accessKeyId, accessKeySecret, signName, templateCode, fingerprint };
}

/** 获取阿里云短信客户端（延迟初始化，配置变更时重建） */
async function getAliyunClient(): Promise<Dysmsapi20170525 | null> {
  const config = await readAliyunConfig();

  if (!config.accessKeyId || !config.accessKeySecret) {
    if (_client) {
      _client = null;
      _lastConfigFingerprint = "";
    }
    return null;
  }

  if (config.fingerprint !== _lastConfigFingerprint) {
    const openApiConfig = new $OpenApi.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: "dysmsapi.aliyuncs.com",
    });
    _client = new Dysmsapi20170525(openApiConfig);
    _lastConfigFingerprint = config.fingerprint;
    logger.info("阿里云短信客户端已初始化");
  }

  return _client;
}

/** 手机号脱敏（保留前 3 后 4） */
function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

/** 发送阿里云短信验证码（外发结果经 logExternalRequest 收口） */
async function sendAliyunSms(phone: string, code: string): Promise<void> {
  const client = await getAliyunClient();
  if (!client) {
    throw new Error("阿里云短信未配置，请检查 AccessKey 相关系统配置");
  }

  const config = await readAliyunConfig();
  if (!config.signName) {
    throw new Error("短信签名未配置");
  }
  if (!config.templateCode) {
    throw new Error("短信模板码未配置");
  }

  const request = new SendSmsRequest({
    phoneNumbers: phone,
    signName: config.signName,
    templateCode: config.templateCode,
    templateParam: JSON.stringify({ code }),
  });

  const startedAt = Date.now();
  // 观测字段：手机号脱敏后入日志，模板码标识本次业务类型
  const logBase = {
    system: "sms",
    requestType: "business" as const,
    path: "dysmsapi/SendSms",
    method: "POST",
    extra: {
      provider: "aliyun",
      phone: maskPhone(phone),
      templateCode: config.templateCode,
    },
  };
  try {
    const response = await client.sendSms(request);
    if (response.body?.code !== "OK") {
      throw new Error(`阿里云短信: ${response.body?.message || "短信发送失败"}`);
    }
    logExternalRequest({
      ...logBase,
      duration: Date.now() - startedAt,
      success: true,
    });
  } catch (err) {
    logExternalRequest({
      ...logBase,
      duration: Date.now() - startedAt,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * 发送短信验证码
 * 根据系统配置 sms_provider 自动选择服务商
 */
export async function sendSms(phone: string, code: string): Promise<void> {
  const provider = (await getConfig("sms_provider")) as SmsProvider | "";
  if (!provider) {
    throw new Error("短信服务未配置，请先在系统配置中选择短信服务商");
  }

  switch (provider) {
    case "aliyun":
      return sendAliyunSms(phone, code);
    default:
      throw new Error(`不支持的短信服务商: ${provider}`);
  }
}
