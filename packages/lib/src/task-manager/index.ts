/**
 * 通用内存任务管理器：状态机（pending/running/done/failed）+ TTL 惰性清理 + 事件缓冲/订阅
 * 供后台任务（报表、AI 生成等）复用，业务字段统一放入泛型 state，事件类型泛型化
 */

/** 任务状态 */
export type TaskStatus = "pending" | "running" | "done" | "failed";

/** 任务事件基类：各业务事件须含 type 字段 */
export interface TaskEvent {
  type: string;
  [key: string]: unknown;
}

/** 内存任务记录 */
export interface ManagedTask<TState extends object, TEvent extends TaskEvent = TaskEvent> {
  id: string;
  status: TaskStatus;
  /** 业务状态（如报表的 range/steps、PPT 的 input/result） */
  state: TState;
  /** 事件缓冲（供 SSE 断线重连回放，超限截断保留尾部）；get / list / create 返回的是快照副本 */
  events: TEvent[];
  /** SSE 订阅者（连接断开时移除）。get / list / create 返回的是快照副本，改副本不影响管理器内部；
   *  订阅与取消一律走 subscribe() 的返回值 */
  subscribers: Set<(event: TEvent) => void>;
  createdAt: number;
  updatedAt: number;
}

/** 任务管理器配置 */
export interface TaskManagerOptions {
  /** 任务过期时间（毫秒），默认 1 小时 */
  ttlMs?: number;
  /** 事件缓冲上限，默认 500 */
  eventBufferLimit?: number;
}

/** 任务管理器实例接口 */
export interface TaskManager<TState extends object, TEvent extends TaskEvent = TaskEvent> {
  /** 查询任务，不存在或已过期返回 null */
  get(id: string): ManagedTask<TState, TEvent> | null;
  /** 全部未过期任务（按创建时间倒序） */
  list(): Array<ManagedTask<TState, TEvent>>;
  /** 创建任务（覆盖同 id 旧记录），返回新任务 */
  create(id: string, state: TState): ManagedTask<TState, TEvent>;
  /** 合并更新业务状态并刷新 updatedAt */
  patchState(id: string, patch: Partial<TState>): void;
  /** 更新任务状态并刷新 updatedAt */
  setStatus(id: string, status: TaskStatus): void;
  /** 置终态（done/failed），等价 setStatus */
  finish(id: string, status: "done" | "failed"): void;
  /** 删除任务记录（清空订阅者） */
  remove(id: string): boolean;
  /** 订阅任务事件，返回取消订阅函数；任务不存在返回空操作 */
  subscribe(id: string, callback: (event: TEvent) => void): () => void;
  /** 读取已缓冲事件（供断线重连回放），任务不存在返回空数组 */
  replayEvents(id: string): TEvent[];
  /** 向任务订阅者广播事件：写入缓冲并通知全部订阅方（单方异常不影响其余） */
  broadcast(id: string, event: TEvent): void;
}

/** 任务记录快照：外层字段、业务状态、事件缓冲与订阅者集合均不与内部共享引用，
 * 调用方改快照不会污染管理器内部状态（状态变更一律走 patchState / setStatus / broadcast） */
function snapshotTask<TState extends object, TEvent extends TaskEvent>(
  task: ManagedTask<TState, TEvent>,
): ManagedTask<TState, TEvent> {
  return {
    ...task,
    state: { ...task.state },
    events: [...task.events],
    subscribers: new Set(task.subscribers),
  };
}

/** 创建任务管理器实例（每业务模块一个实例，互不共享） */
export function createTaskManager<TState extends object, TEvent extends TaskEvent = TaskEvent>(
  options: TaskManagerOptions = {},
): TaskManager<TState, TEvent> {
  const { ttlMs = 60 * 60 * 1000, eventBufferLimit = 500 } = options;
  const tasks = new Map<string, ManagedTask<TState, TEvent>>();

  /** 写入任务状态并刷新 updatedAt（setStatus / finish 共用，避免依赖 this 绑定） */
  function applyStatus(id: string, status: TaskStatus): void {
    const task = tasks.get(id);
    if (!task) return;
    task.status = status;
    task.updatedAt = Date.now();
  }

  /** 清理过期任务（惰性：访问时触发） */
  function cleanupExpiredTasks(): void {
    const now = Date.now();
    for (const [id, task] of tasks) {
      if (now - task.updatedAt > ttlMs) {
        task.subscribers.clear();
        tasks.delete(id);
      }
    }
  }

  return {
    get(id) {
      cleanupExpiredTasks();
      const task = tasks.get(id);
      return task ? snapshotTask(task) : null;
    },
    list() {
      cleanupExpiredTasks();
      return Array.from(tasks.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((task) => snapshotTask(task));
    },
    create(id, state) {
      cleanupExpiredTasks();
      const task: ManagedTask<TState, TEvent> = {
        id,
        status: "pending",
        state,
        events: [],
        subscribers: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(id, task);
      return snapshotTask(task);
    },
    patchState(id, patch) {
      const task = tasks.get(id);
      if (!task) return;
      task.state = { ...task.state, ...patch };
      task.updatedAt = Date.now();
    },
    setStatus(id, status) {
      applyStatus(id, status);
    },
    finish(id, status) {
      applyStatus(id, status);
    },
    remove(id) {
      const task = tasks.get(id);
      if (task) task.subscribers.clear();
      return tasks.delete(id);
    },
    subscribe(id, callback) {
      const task = tasks.get(id);
      if (!task) return () => {};
      task.subscribers.add(callback);
      return () => {
        task.subscribers.delete(callback);
      };
    },
    replayEvents(id) {
      return [...(tasks.get(id)?.events ?? [])];
    },
    broadcast(id, event) {
      const task = tasks.get(id);
      if (!task) return;
      // 广播视为任务活跃：刷新 updatedAt，避免只推进度事件的任务被 TTL 惰性清理
      task.updatedAt = Date.now();
      task.events.push(event);
      if (task.events.length > eventBufferLimit) {
        task.events = task.events.slice(-eventBufferLimit);
      }
      for (const sub of task.subscribers) {
        try {
          sub(event);
        } catch {
          /* 订阅方异常不影响广播 */
        }
      }
    },
  };
}
