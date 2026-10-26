/**
 * 通用批量缓冲写入器测试：批量写入、定时刷新、容量上限、进程退出兜底、事件钩子
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchWriter } from "../index";

describe("BatchWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("push 单条不立即触发写入", () => {
    const insertFn = vi.fn().mockResolvedValue(undefined);
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      insertFn,
    });
    writer.push(1);
    expect(insertFn).not.toHaveBeenCalled();
    writer.shutdown();
  });

  it("达到批量阈值时触发写入并清空缓冲", async () => {
    const insertFn = vi.fn().mockResolvedValue(undefined);
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      batchSize: 3,
      insertFn,
    });
    writer.push(1);
    writer.push(2);
    writer.push(3);
    await vi.runOnlyPendingTimersAsync();
    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(insertFn).toHaveBeenCalledWith([1, 2, 3]);
    writer.shutdown();
  });

  it("定时器触发刷新已入队条目", async () => {
    const insertFn = vi.fn().mockResolvedValue(undefined);
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      flushInterval: 1000,
      insertFn,
    });
    writer.push(1);
    writer.push(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(insertFn).toHaveBeenCalledWith([1, 2]);
    writer.shutdown();
  });

  it("缓冲超过上限时丢弃最旧条目并发出 warn 事件", async () => {
    const insertFn = vi.fn().mockResolvedValue(undefined);
    const onEvent = vi.fn();
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      maxBufferSize: 2,
      insertFn,
      onEvent,
    });
    writer.push(1);
    writer.push(2);
    writer.push(3);
    await writer.shutdown();
    // 丢弃最旧的 1，写入 [2, 3]
    expect(insertFn).toHaveBeenCalledWith([2, 3]);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ level: "warn", label: "测试" }));
  });

  it("写入失败时保留缓冲供下次重试，fire-and-forget 发出 error 事件", async () => {
    const insertFn = vi.fn().mockRejectedValue(new Error("db down"));
    const onEvent = vi.fn();
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      batchSize: 2,
      insertFn,
      onEvent,
    });
    writer.push(1);
    writer.push(2);
    // push 达阈值触发一次写入失败，缓冲不丢，定时器再触发时仍重试
    await vi.runOnlyPendingTimersAsync();
    expect(insertFn).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error", label: "测试" }),
    );
    // shutdown 时缓冲仍保留，再次尝试写入并失败（向上抛错）
    await expect(writer.shutdown()).rejects.toThrow("db down");
    expect(insertFn).toHaveBeenCalledTimes(3);
  });

  it("shutdown 首次 flush 期间写入的条目会被补刷一轮", async () => {
    const insertFn = vi.fn();
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      insertFn,
    });
    let pushedDuringFlush = false;
    insertFn.mockImplementation(async () => {
      if (pushedDuringFlush) return;
      pushedDuringFlush = true;
      // 模拟关闭流程后续步骤的写入：发生在首次 flush 的等待窗口内
      writer.push(2);
    });

    writer.push(1);
    await writer.shutdown();

    expect(insertFn).toHaveBeenNthCalledWith(1, [1]);
    expect(insertFn).toHaveBeenNthCalledWith(2, [2]);
  });

  it("shutdown 后定时器已清理，之后 push 仍能重新启动定时刷新", async () => {
    const insertFn = vi.fn().mockResolvedValue(undefined);
    const writer = new BatchWriter<number>({
      logLabel: "测试",
      insertFn,
    });
    writer.push(42);
    await writer.shutdown();
    expect(insertFn).toHaveBeenCalledWith([42]);
    // 关闭流程中仍可能有审计/埋点写入（如优雅关闭的后续步骤）：定时器必须能重新启动，
    // 否则这些条目只能靠攒满 batchSize 才刷出、进程退出即静默丢失；定时器已 unref，不会拖住退出
    writer.push(99);
    await vi.advanceTimersByTimeAsync(5000);
    expect(insertFn).toHaveBeenCalledTimes(2);
    expect(insertFn).toHaveBeenLastCalledWith([99]);
    await writer.shutdown();
  });
});
