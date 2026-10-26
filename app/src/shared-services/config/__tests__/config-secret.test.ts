/** 系统配置密文工具测试：加解密往返、随机 IV、缺密钥与篡改防护 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptConfigValue,
  encryptConfigValue,
  isEncryptedConfigValue,
} from "#/shared-services/config/config-secret.server";

describe("config-secret", () => {
  beforeEach(() => {
    process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("可以加密并解密配置值", () => {
    const encrypted = encryptConfigValue("SMTP 密码");
    expect(isEncryptedConfigValue(encrypted)).toBe(true);
    expect(encrypted).not.toContain("SMTP");
    expect(decryptConfigValue(encrypted)).toBe("SMTP 密码");
  });

  it("每次加密使用不同随机向量", () => {
    expect(encryptConfigValue("same")).not.toBe(encryptConfigValue("same"));
  });

  it("支持 64 位十六进制主密钥", () => {
    process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("hex");
    expect(decryptConfigValue(encryptConfigValue("hex"))).toBe("hex");
  });

  it("缺少主密钥时拒绝加密", () => {
    delete process.env.CONFIG_ENCRYPTION_KEY;
    expect(() => encryptConfigValue("secret")).toThrow("CONFIG_ENCRYPTION_KEY");
  });

  it("主密钥长度非法时拒绝加密", () => {
    process.env.CONFIG_ENCRYPTION_KEY = "dG9vLXNob3J0";
    expect(() => encryptConfigValue("secret")).toThrow("32 字节");
  });

  it("密文被篡改时拒绝解密", () => {
    const encrypted = encryptConfigValue("secret");
    const [prefix, iv, ciphertext, tag] = encrypted.split(":");
    const tamperedTag = `${tag.slice(0, -1)}${tag.endsWith("A") ? "B" : "A"}`;
    const tampered = [prefix, iv, ciphertext, tamperedTag].join(":");
    expect(() => decryptConfigValue(tampered)).toThrow();
  });

  it("非密文格式拒绝解密", () => {
    expect(() => decryptConfigValue("plain")).toThrow("密文格式无效");
  });
});
