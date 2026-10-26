/**
 * 剪贴板复制工具测试：Clipboard API 优先、execCommand 兜底、整体失败返回 false
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../index";

/** 覆写 navigator.clipboard（jsdom 默认可能缺失或只读） */
function stubClipboard(value: unknown): void {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
  });
}

describe("copyToClipboard", () => {
  afterEach(() => {
    stubClipboard(undefined);
    vi.restoreAllMocks();
  });

  it("Clipboard API 可用时优先使用并返回 true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("Clipboard API 被拒时退回 execCommand 兜底并清理临时节点", async () => {
    stubClipboard({
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    await expect(copyToClipboard("fallback")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // 临时 textarea 必须被移除，避免残留 DOM
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("Clipboard API 缺失时走兜底", async () => {
    stubClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    await expect(copyToClipboard("no-api")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("Clipboard API 缺失且 execCommand 不可用时返回 false", async () => {
    stubClipboard(undefined);
    document.execCommand = vi.fn().mockReturnValue(false) as unknown as typeof document.execCommand;

    await expect(copyToClipboard("fail")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("execCommand 抛错时返回 false 且仍清理临时节点", async () => {
    stubClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error("unsupported");
    }) as unknown as typeof document.execCommand;

    await expect(copyToClipboard("throw")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
