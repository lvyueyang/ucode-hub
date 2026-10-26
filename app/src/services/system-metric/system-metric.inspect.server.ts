/**
 * 系统监控按需巡检：STORAGE_DIR 占用统计 + 数据库各表占用
 * 复用运行日志按需查询的取舍：结果带 TTL 内存缓存，页面手动刷新可强制重算
 */
import type { Dirent } from "node:fs";
import { readdir, stat, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "#/env";
import { databaseSizeCache, storageUsageCache } from "./system-metric.cache";
import { getDatabaseTotalBytes, getTableSizes } from "./system-metric.db-size.server";
import type { DatabaseSizes, StorageUsage, StorageUsageEntry } from "./system-metric.types";

/** 存储占用遍历的文件数上限，防止超大规模目录拖垮事件循环 */
const MAX_STORAGE_FILES = 100_000;

/** 存储占用缓存 TTL（毫秒）：目录体积变化慢，且支持手动强制刷新 */
const STORAGE_USAGE_TTL = 5 * 60_000;

/** 数据库占用缓存 TTL（毫秒） */
const DATABASE_SIZE_TTL = 60_000;

/** 单键缓存（仅存一份最新结果） */
const SINGLE_KEY = "current";

/** 遍历累加上下文 */
interface WalkContext {
  fileCount: number;
  truncated: boolean;
}

/** 递归累加目录内文件体积（不跟随符号链接，触达文件数上限即截断） */
async function sumDirBytes(dir: string, ctx: WalkContext): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    if (ctx.fileCount >= MAX_STORAGE_FILES) {
      ctx.truncated = true;
      break;
    }
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await sumDirBytes(full, ctx);
    } else if (entry.isFile()) {
      ctx.fileCount++;
      try {
        total += (await stat(full)).size;
      } catch {
        // 单个文件读取失败不影响整体统计
      }
    }
  }
  return total;
}

/** 统计顶层各条目占用，按字节降序 */
async function collectTopEntries(dir: string, ctx: WalkContext): Promise<StorageUsageEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: StorageUsageEntry[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push({ name: entry.name, bytes: await sumDirBytes(full, ctx) });
    } else if (entry.isFile()) {
      ctx.fileCount++;
      try {
        result.push({ name: entry.name, bytes: (await stat(full)).size });
      } catch {
        // 忽略读取失败的文件
      }
    }
  }
  return result.sort((a, b) => b.bytes - a.bytes);
}

/** 统计 STORAGE_DIR 占用与所在文件系统容量（每次调用现算，不做缓存） */
async function computeStorageUsage(): Promise<StorageUsage> {
  const dir = resolve(env.storageDir);
  const ctx: WalkContext = { fileCount: 0, truncated: false };

  const entries = await collectTopEntries(dir, ctx);

  let filesystem = { totalBytes: 0, usedBytes: 0, freeBytes: 0 };
  try {
    const fsStat = await statfs(dir);
    // 对齐 df 口径：Used = 总块 - 空闲块（含 root 保留块），可用 = 非特权用户可用块
    const totalBytes = fsStat.bsize * fsStat.blocks;
    filesystem = {
      totalBytes,
      usedBytes: fsStat.bsize * (fsStat.blocks - fsStat.bfree),
      freeBytes: fsStat.bsize * fsStat.bavail,
    };
  } catch {
    // 目录不存在或平台不支持 statfs 时留空
  }

  return {
    totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0),
    entries,
    fileCount: ctx.fileCount,
    truncated: ctx.truncated,
    filesystem,
    capturedAt: new Date().toISOString(),
  };
}

/** 获取 STORAGE_DIR 占用（命中缓存直接返回；force 强制重算） */
export async function getStorageUsage(force = false): Promise<StorageUsage> {
  if (!force) {
    const cached = storageUsageCache.get(SINGLE_KEY);
    if (cached) return cached;
  }
  const value = await computeStorageUsage();
  storageUsageCache.set(SINGLE_KEY, value, STORAGE_USAGE_TTL);
  return value;
}

/** 获取数据库占用（库总量 + 各表；命中缓存直接返回，force 强制重算） */
export async function getDatabaseSizes(force = false): Promise<DatabaseSizes> {
  if (!force) {
    const cached = databaseSizeCache.get(SINGLE_KEY);
    if (cached) return cached;
  }
  const [databaseBytes, tables] = await Promise.all([getDatabaseTotalBytes(), getTableSizes()]);
  const value: DatabaseSizes = {
    databaseBytes,
    tables,
    capturedAt: new Date().toISOString(),
  };
  databaseSizeCache.set(SINGLE_KEY, value, DATABASE_SIZE_TTL);
  return value;
}
