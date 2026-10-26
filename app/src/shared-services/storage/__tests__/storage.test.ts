/**
 * LocalStorageAdapter 测试：文件 CRUD 生命周期
 */

import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { StorageAdapter } from "@ucode/hub-lib/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "../index";

process.env.STORAGE_DIR = ".tmp";

describe("LocalStorageAdapter", () => {
  let adapter: LocalStorageAdapter;
  let testDir: string;

  beforeEach(async () => {
    const suffix = `storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testDir = resolve(tmpdir(), suffix);
    adapter = new LocalStorageAdapter(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("save(Buffer) → read 往返内容一致", async () => {
    const content = Buffer.from("Hello, 存储测试!");
    const filePath = await adapter.save("test.txt", content);
    expect(filePath).toBe("test.txt");

    const readBack = await adapter.read("test.txt");
    expect(readBack.toString("utf-8")).toBe("Hello, 存储测试!");
  });

  it("save(Readable stream) → read 往返内容一致", async () => {
    const { Readable } = await import("node:stream");
    const content = "Stream 内容测试";
    const stream = Readable.from([content]);
    await adapter.save("stream.txt", stream);

    const readBack = await adapter.read("stream.txt");
    expect(readBack.toString("utf-8")).toBe(content);
  });

  it("exists 存在返回 true，不存在返回 false", async () => {
    expect(await adapter.exists("missing.txt")).toBe(false);

    await adapter.save("exists.txt", Buffer.from("data"));
    expect(await adapter.exists("exists.txt")).toBe(true);
  });

  it("delete 删除后 exists 返回 false", async () => {
    await adapter.save("del.txt", Buffer.from("data"));
    await adapter.delete("del.txt");
    expect(await adapter.exists("del.txt")).toBe(false);
  });

  it("delete 不存在的文件不抛异常", async () => {
    await expect(adapter.delete("nonexistent.txt")).resolves.toBeUndefined();
  });

  it("getUrl 返回正确的 URL 格式", async () => {
    const url = adapter.getUrl("images/photo.jpg");
    expect(url).toContain("photo.jpg");
    expect(url).toContain("/uploads/");
  });
});

describe("StorageAdapter 接口", () => {
  it("接口可被 mock 实现", () => {
    const mock: StorageAdapter = {
      save: async () => "path",
      read: async () => Buffer.from(""),
      delete: async () => {},
      getUrl: () => "/url",
      exists: async () => true,
    };
    expect(mock).toBeDefined();
    expect(typeof mock.save).toBe("function");
    expect(typeof mock.read).toBe("function");
    expect(typeof mock.delete).toBe("function");
    expect(typeof mock.getUrl).toBe("function");
    expect(typeof mock.exists).toBe("function");
  });
});
