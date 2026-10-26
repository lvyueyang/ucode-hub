/**
 * 信号量测试：直接获取、排队唤醒、队列满拒绝、等待超时、监控计数
 */
import { describe, expect, it } from "vitest";
import { Semaphore, SemaphoreTimeoutError } from "../index";

describe("Semaphore", () => {
  it("并发未打满时直接获取许可，无需排队", async () => {
    const sem = new Semaphore({ max: 2, queueLimit: 10, waitMs: 1000 });
    const release1 = await sem.acquire();
    const release2 = await sem.acquire();

    expect(sem.activeCount).toBe(2);
    expect(sem.queueLength).toBe(0);

    release1();
    release2();
    expect(sem.activeCount).toBe(0);
  });

  it("许可打满后请求排队，释放后按 FIFO 唤醒", async () => {
    const sem = new Semaphore({ max: 1, queueLimit: 10, waitMs: 1000 });
    const release1 = await sem.acquire();

    const order: string[] = [];
    const acquire2 = sem.acquire().then((release) => {
      order.push("second");
      return release;
    });
    const acquire3 = sem.acquire().then((release) => {
      order.push("third");
      return release;
    });

    expect(sem.queueLength).toBe(2);

    release1();
    const release2 = await acquire2;
    expect(order).toEqual(["second"]);

    release2();
    const release3 = await acquire3;
    expect(order).toEqual(["second", "third"]);
    release3();
  });

  it("队列打满后新请求直接拒绝并抛 SemaphoreTimeoutError", async () => {
    const sem = new Semaphore({ max: 1, queueLimit: 1, waitMs: 1000 });
    const release = await sem.acquire();

    // 第一个排队占用唯一队列位
    const queued = sem.acquire().catch((err) => err);
    expect(sem.queueLength).toBe(1);

    // 第二个排队请求超限直接拒绝
    await expect(sem.acquire()).rejects.toThrow(SemaphoreTimeoutError);
    await expect(sem.acquire()).rejects.toMatchObject({
      code: "EXECUTION_BUSY",
    });

    const err = await queued;
    expect(err).toBeInstanceOf(SemaphoreTimeoutError);
    release();
  });

  it("排队等待超时后拒绝并清理等待者", async () => {
    const sem = new Semaphore({ max: 1, queueLimit: 10, waitMs: 20 });
    const release = await sem.acquire();

    const start = Date.now();
    await expect(sem.acquire()).rejects.toThrow(SemaphoreTimeoutError);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    expect(sem.queueLength).toBe(0);

    // 超时清理后队列仍可继续排队
    const next = sem.acquire().catch((err) => err);
    expect(sem.queueLength).toBe(1);
    release();
    const release2 = await next;
    release2();
  });

  it("重复调用释放函数不突破并发上限", async () => {
    const sem = new Semaphore({ max: 1, queueLimit: 5, waitMs: 1000 });
    const release = await sem.acquire();
    const p1 = sem.acquire();
    const p2 = sem.acquire();

    release();
    release(); // 重复释放应为空操作

    const r1 = await p1;
    expect(sem.activeCount).toBe(1);
    // 第二个请求仍在排队，未被误唤醒
    expect(sem.queueLength).toBe(1);

    r1();
    const r2 = await p2;
    r2();
    expect(sem.activeCount).toBe(0);
  });

  it("monitor 计数：activeCount 与 queueLength", async () => {
    const sem = new Semaphore({ max: 2, queueLimit: 5, waitMs: 1000 });
    const release1 = await sem.acquire();
    const release2 = await sem.acquire();
    expect(sem.activeCount).toBe(2);

    const pending = sem.acquire();
    expect(sem.queueLength).toBe(1);

    release1();
    release2();
    await pending;
    expect(sem.queueLength).toBe(0);
    expect(sem.activeCount).toBe(1);
  });
});
