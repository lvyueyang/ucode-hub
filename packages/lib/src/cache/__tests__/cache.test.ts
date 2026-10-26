/**
 * MemoryCache 测试：覆盖基本读写、过期、删除、清空、清理等全部操作
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "../index";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("set / get", () => {
    it("写入后读取返回相同值", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("读取不存在的键返回 undefined", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("覆盖写入后读取最新值", () => {
      cache.set("key1", "old");
      cache.set("key1", "new");
      expect(cache.get("key1")).toBe("new");
    });
  });

  describe("过期逻辑", () => {
    it("未过期时 get 正常返回", () => {
      cache.set("key1", "value1", 1000);
      vi.advanceTimersByTime(500);
      expect(cache.get("key1")).toBe("value1");
    });

    it("过期后 get 返回 undefined", () => {
      cache.set("key1", "value1", 1000);
      vi.advanceTimersByTime(1001);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("过期后该键被自动删除", () => {
      cache.set("key1", "value1", 1000);
      vi.advanceTimersByTime(1001);
      cache.get("key1"); // 触发过期删除
      expect(cache.keys()).not.toContain("key1");
    });

    it("TTL 为 0 表示永不过期", () => {
      cache.set("key1", "value1", 0);
      vi.advanceTimersByTime(99999);
      expect(cache.get("key1")).toBe("value1");
    });
  });

  describe("delete", () => {
    it("删除存在的键返回 true", () => {
      cache.set("key1", "value1");
      expect(cache.delete("key1")).toBe(true);
    });

    it("删除不存在的键返回 false", () => {
      expect(cache.delete("nonexistent")).toBe(false);
    });

    it("删除后 get 返回 undefined", () => {
      cache.set("key1", "value1");
      cache.delete("key1");
      expect(cache.get("key1")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("存在的键返回 true", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);
    });

    it("不存在的键返回 false", () => {
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("过期后返回 false 并自动删除", () => {
      cache.set("key1", "value1", 1000);
      vi.advanceTimersByTime(1001);
      expect(cache.has("key1")).toBe(false);
      expect(cache.keys()).not.toContain("key1");
    });
  });

  describe("clear", () => {
    it("清空后 size 为 0", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it("清空后 keys 返回空数组", () => {
      cache.set("a", "1");
      cache.clear();
      expect(cache.keys()).toEqual([]);
    });
  });

  describe("size / keys", () => {
    it("写入后 size 递增", () => {
      expect(cache.size).toBe(0);
      cache.set("a", "1");
      expect(cache.size).toBe(1);
      cache.set("b", "2");
      expect(cache.size).toBe(2);
    });

    it("keys 返回所有键", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.keys()).toEqual(["a", "b"]);
    });

    it("删除后 size 递减", () => {
      cache.set("a", "1");
      cache.delete("a");
      expect(cache.size).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("仅清理已过期的条目", () => {
      cache.set("fresh", "1", 10000);
      cache.set("expired", "2", 1000);
      vi.advanceTimersByTime(2000);

      const removed = cache.cleanup();
      expect(removed).toBe(1);
      expect(cache.has("fresh")).toBe(true);
      expect(cache.has("expired")).toBe(false);
    });

    it("无过期条目时返回 0", () => {
      cache.set("a", "1");
      expect(cache.cleanup()).toBe(0);
      expect(cache.size).toBe(1);
    });

    it("永不过期的条目不被清理", () => {
      cache.set("forever", "val", 0);
      vi.advanceTimersByTime(99999);
      expect(cache.cleanup()).toBe(0);
      expect(cache.has("forever")).toBe(true);
    });
  });

  describe("defaultTTL 构造选项", () => {
    it("未设置 defaultTTL 时默认永不过期", () => {
      const c = new MemoryCache<string>();
      c.set("k", "v");
      vi.advanceTimersByTime(99999);
      expect(c.get("k")).toBe("v");
    });

    it("设置 defaultTTL 后所有写入自动过期", () => {
      const c = new MemoryCache<string>({ defaultTTL: 1000 });
      c.set("k", "v");
      vi.advanceTimersByTime(1001);
      expect(c.get("k")).toBeUndefined();
    });

    it("写入时指定 ttl 覆盖 defaultTTL", () => {
      const c = new MemoryCache<string>({ defaultTTL: 1000 });
      c.set("short", "v", 500);
      c.set("long", "v", 5000);

      vi.advanceTimersByTime(600);
      expect(c.get("short")).toBeUndefined();
      expect(c.get("long")).toBe("v");
    });
  });
});
