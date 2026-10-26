/**
 * 系统配置缓存实例测试：验证 configCache / configTranslationCache 挂载于 globalThis，
 * 跨 bundle（模拟模块重载得到新实例）仍共享同一份缓存，运行时配置变更可被另一侧读到
 */
import { describe, expect, it, vi } from "vitest";

describe("configCache / configTranslationCache", () => {
  // 模拟跨 bundle 重载：每次重新 import 得到新模块实例，但底层应为同一 globalThis 缓存
  it("模块重载后仍共享同一缓存实例", async () => {
    vi.resetModules();
    const first = await import("#/shared-services/config/config.cache");
    vi.resetModules();
    const second = await import("#/shared-services/config/config.cache");

    // 新模块实例引用同一 globalThis 单例
    expect(first.configCache).toBe(second.configCache);
    expect(first.configTranslationCache).toBe(second.configTranslationCache);

    // 任一侧写入，另一侧可见
    second.configCache.set("all", [
      {
        id: "1",
        key: "ai_base_url",
        value: "https://api.example.com",
        clientVisible: false,
        isSecret: false,
      },
    ]);
    expect(first.configCache.get("all")).toHaveLength(1);
  });

  it("缓存实例具备基本 get/set 行为", async () => {
    vi.resetModules();
    const { configCache } = await import("#/shared-services/config/config.cache");
    configCache.clear();
    configCache.set("all", [
      { id: "1", key: "k", value: "v", clientVisible: true, isSecret: false },
    ]);
    expect(configCache.get("all")).toHaveLength(1);
  });
});
