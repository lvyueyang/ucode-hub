/**
 * 通用内存任务管理器测试：状态机 / TTL 清理 / 事件缓冲与订阅
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskManager } from "../index";

/** 测试用业务状态 */
interface TaskState {
  value: string;
  count?: number;
}

describe("createTaskManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("create 后 get 返回 pending 任务，业务状态与事件缓冲就绪", () => {
    const manager = createTaskManager<TaskState>();
    manager.create("t1", { value: "a" });
    const task = manager.get("t1");
    expect(task?.status).toBe("pending");
    expect(task?.state.value).toBe("a");
    expect(task?.events).toEqual([]);
  });

  it("setStatus / patchState / finish 更新状态与业务字段", () => {
    const manager = createTaskManager<TaskState>();
    manager.create("t1", { value: "a" });
    manager.setStatus("t1", "running");
    expect(manager.get("t1")?.status).toBe("running");
    manager.patchState("t1", { value: "b", count: 1 });
    expect(manager.get("t1")?.state).toEqual({ value: "b", count: 1 });
    manager.finish("t1", "done");
    expect(manager.get("t1")?.status).toBe("done");
  });

  it("不存在的任务 get 返回 null，状态操作静默不抛错", () => {
    const manager = createTaskManager<TaskState>();
    expect(manager.get("nope")).toBeNull();
    expect(() => manager.setStatus("nope", "done")).not.toThrow();
    expect(() => manager.patchState("nope", { value: "x" })).not.toThrow();
    expect(() => manager.finish("nope", "done")).not.toThrow();
  });

  it("TTL 过期后任务被惰性清理", () => {
    const manager = createTaskManager<TaskState>({ ttlMs: 1000 });
    manager.create("t1", { value: "a" });
    vi.advanceTimersByTime(1500);
    expect(manager.get("t1")).toBeNull();
  });

  it("broadcast 刷新 updatedAt，仅推进度事件的任务不被 TTL 清理", () => {
    const manager = createTaskManager<TaskState>({ ttlMs: 1000 });
    manager.create("t1", { value: "a" });
    vi.advanceTimersByTime(900);
    manager.broadcast("t1", { type: "step", n: 1 });
    vi.advanceTimersByTime(900);
    expect(manager.get("t1")).not.toBeNull();
    expect(manager.get("t1")?.events).toHaveLength(1);
  });

  it("list 按创建时间倒序返回未过期任务", () => {
    const manager = createTaskManager<TaskState>();
    manager.create("t1", { value: "a" });
    vi.advanceTimersByTime(1000);
    manager.create("t2", { value: "b" });
    expect(manager.list().map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("broadcast 缓冲事件并通知订阅者，replay 供断线回放，取消订阅后不再接收", () => {
    const manager = createTaskManager<TaskState, { type: string; [key: string]: unknown }>();
    manager.create("t1", { value: "a" });
    const received: Array<{ type: string; [key: string]: unknown }> = [];
    const unsubscribe = manager.subscribe("t1", (e) => received.push(e));
    manager.broadcast("t1", { type: "step", n: 1 });
    expect(received).toEqual([{ type: "step", n: 1 }]);
    expect(manager.replayEvents("t1")).toEqual([{ type: "step", n: 1 }]);
    unsubscribe();
    manager.broadcast("t1", { type: "step", n: 2 });
    expect(received).toEqual([{ type: "step", n: 1 }]);
  });

  it("单个订阅者异常不影响广播与其余订阅者", () => {
    const manager = createTaskManager<TaskState>();
    manager.create("t1", { value: "a" });
    const received: string[] = [];
    manager.subscribe("t1", () => {
      throw new Error("订阅方异常");
    });
    manager.subscribe("t1", (e) => received.push(e.type));
    expect(() => manager.broadcast("t1", { type: "e1" })).not.toThrow();
    expect(received).toEqual(["e1"]);
  });

  it("事件缓冲超限保留尾部", () => {
    const manager = createTaskManager<TaskState, { type: string }>({
      eventBufferLimit: 2,
    });
    manager.create("t1", { value: "a" });
    manager.broadcast("t1", { type: "e1" });
    manager.broadcast("t1", { type: "e2" });
    manager.broadcast("t1", { type: "e3" });
    expect(manager.replayEvents("t1").map((e) => e.type)).toEqual(["e2", "e3"]);
  });

  it("订阅不存在的任务返回空操作且不抛错", () => {
    const manager = createTaskManager<TaskState>();
    expect(() => manager.subscribe("nope", () => {})()).not.toThrow();
    expect(manager.replayEvents("nope")).toEqual([]);
  });

  it("remove 删除任务并清空订阅者，删除不存在任务返回 false", () => {
    const manager = createTaskManager<TaskState>();
    manager.create("t1", { value: "a" });
    const unsubscribe = manager.subscribe("t1", () => {});
    expect(manager.remove("t1")).toBe(true);
    expect(manager.get("t1")).toBeNull();
    expect(manager.remove("nope")).toBe(false);
    expect(() => unsubscribe()).not.toThrow();
  });

  it("create 覆盖同 id 旧任务", () => {
    const manager = createTaskManager<TaskState>();
    manager.create("t1", { value: "a" });
    const task = manager.create("t1", { value: "b" });
    expect(task.id).toBe("t1");
    expect(task.state).toEqual({ value: "b" });
    expect(manager.list()).toHaveLength(1);
  });
});
