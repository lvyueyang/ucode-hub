/**
 * 系统配置密文工具：以环境变量主密钥保护敏感配置值
 * 密文格式 enc:v1:{iv}:{ciphertext}:{authTag}，AES-256-GCM，每次加密使用随机 IV
 * 属纯加解密工具，不读写 DB / 缓存，不引日志；密文仅由 config.server 读写路径调用
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "#/env";

/** 密文前缀：既可标识格式，也用于幂等判别明文与密文 */
const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 取主密钥；未配置时明文无法解密，直接报错而不是静默退回明文存储 */
function encryptionKey(): Buffer {
  const key = env.configEncryptionKey;
  if (!key) throw new Error("缺少 CONFIG_ENCRYPTION_KEY，无法读取敏感系统配置");
  return key;
}

export function isEncryptedConfigValue(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** 加密敏感配置值 */
export function encryptConfigValue(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}`;
}

/** 解密密文配置值，格式不符或认证失败时抛错 */
export function decryptConfigValue(value: string): string {
  if (!isEncryptedConfigValue(value)) throw new Error("系统配置密文格式无效");
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("系统配置密文格式无效");
  const [ivText, ciphertextText, tagText] = parts;
  const iv = Buffer.from(ivText, "base64url");
  const ciphertext = Buffer.from(ciphertextText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("系统配置密文长度无效");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
