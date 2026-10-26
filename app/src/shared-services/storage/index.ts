/**
 * 文件存储实现层（shared-services）：本地存储适配器 + 应用级单例
 * StorageAdapter 契约来自 @ucode/hub-lib/storage；LocalStorageAdapter 读 env 基址，storage 为默认单例
 */
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { StorageAdapter } from "@ucode/hub-lib/storage";
import { env } from "#/env";

/** 本地文件存储适配器实现 */
export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolve(env.storageDir, "uploads");
  }

  async save(filePath: string, content: Buffer | Readable): Promise<string> {
    const fullPath = resolve(this.baseDir, filePath);
    const dir = resolve(fullPath, "..");
    await fs.mkdir(dir, { recursive: true });

    if (Buffer.isBuffer(content)) {
      await fs.writeFile(fullPath, content);
    } else {
      const writeStream = createWriteStream(fullPath);
      await pipeline(content, writeStream);
    }

    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    const fullPath = resolve(this.baseDir, filePath);
    return fs.readFile(fullPath);
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = resolve(this.baseDir, filePath);
    if (existsSync(fullPath)) {
      await fs.unlink(fullPath);
    }
  }

  getUrl(filePath: string): string {
    return `/${env.storageDir}/uploads/${filePath}`;
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = resolve(this.baseDir, filePath);
    return existsSync(fullPath);
  }
}

/** 默认存储适配器实例 */
export const storage: StorageAdapter = new LocalStorageAdapter();
