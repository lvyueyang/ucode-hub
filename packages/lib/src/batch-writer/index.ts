/**
 * 通用批量缓冲写入器
 * 提供内存缓冲 → 定时/定量批量写入的通用框架，避免数据丢失和内存泄漏
 * lib 层日志解耦：错误向上抛出（await flush 可捕获），警告经 onEvent 钩子推事件，
 * 未提供钩子时用 console 兜底，模块自身不依赖任何日志单例
 */

/** 批量写入器输出事件（warning/error），供宿主接管落地日志 */
export interface BatchWriterEvent {
  /** 事件级别：warn（非致命，如缓冲满丢弃）/ error（写入失败） */
  level: "warn" | "error";
  /** 日志标签（用于区分不同 writer） */
  label: string;
  /** 事件消息 */
  message: string;
  /** 关联错误（仅 error 级） */
  error?: unknown;
}

export interface BatchWriterConfig<T> {
  /** 缓冲上限（超出时丢弃最旧条目），默认 1000 */
  maxBufferSize?: number;
  /** 批量写入阈值（达到此数量触发写入），默认 100 */
  batchSize?: number;
  /** 定时刷新间隔（ms），默认 5000 */
  flushInterval?: number;
  /**
   * 批量写入函数：当前实现为直接 INSERT 数据库
   * 预留队列接缝：升级为多实例/持久队列时，可将此函数替换为投递消息队列（Redis/BullMQ），
   * 由独立消费者落库，业务调用方无需改动
   */
  insertFn: (items: T[]) => Promise<void>;
  /** 日志标签（用于区分不同 writer 的日志） */
  logLabel: string;
  /**
   * 可选事件钩子：当写入器需要透出警告/错误时回调宿主（供宿主接入 app 日志单例）。
   * 未提供时使用 console.warn / console.error 兜底。
   */
  onEvent?: (event: BatchWriterEvent) => void;
}

const DEFAULT_MAX_BUFFER_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000;

export class BatchWriter<T> {
  private buffer: T[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private timerStarted = false;
  private flushing = false;
  private readonly maxBufferSize: number;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly insertFn: (items: T[]) => Promise<void>;
  private readonly logLabel: string;
  private readonly onEvent?: (event: BatchWriterEvent) => void;

  constructor(config: BatchWriterConfig<T>) {
    this.maxBufferSize = config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushInterval = config.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.insertFn = config.insertFn;
    this.logLabel = config.logLabel;
    this.onEvent = config.onEvent;
  }

  /** 透出事件：优先 onEvent 钩子，否则 console 兜底 */
  private emit(event: BatchWriterEvent): void {
    if (this.onEvent) {
      this.onEvent(event);
      return;
    }
    if (event.level === "warn") {
      console.warn(event.message);
    } else {
      console.error(event.message, event.error);
    }
  }

  /** 追加条目到缓冲队列 */
  push(item: T): void {
    this.ensureTimer();
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
      this.emit({
        level: "warn",
        label: this.logLabel,
        message: `${this.logLabel} 缓冲已满，丢弃最旧条目`,
      });
    }
    this.buffer.push(item);
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch((err) => {
        this.emit({
          level: "error",
          label: this.logLabel,
          message: `${this.logLabel} 批量刷新失败 (batch)`,
          error: err,
        });
      });
    }
  }

  /** 批量写入；insertFn 失败时向上抛错（await 方处理），缓冲保留待重试 */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;

    const batch = [...this.buffer];
    try {
      await this.insertFn(batch);
      this.buffer.splice(0, batch.length);
    } finally {
      this.flushing = false;
    }
  }

  /** 启动定时刷新（惰性初始化，首次 push 时触发） */
  private ensureTimer(): void {
    if (this.timerStarted) return;
    this.timerStarted = true;
    this.timer = setInterval(() => {
      this.flush().catch((err) => {
        this.emit({
          level: "error",
          label: this.logLabel,
          message: `${this.logLabel} 批量刷新失败 (timer)`,
          error: err,
        });
      });
    }, this.flushInterval);

    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /** 进程退出前强制刷新；失败时向上抛错（调用方知晓数据未落库） */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 复位定时器标记：shutdown 后若继续 push，需能重新启动定时刷新
    this.timerStarted = false;
    await this.flush();
    // 首次 flush 期间仍可能有写入（如优雅关闭的后续步骤）：再刷一次，避免退出前残留缓冲。
    // 只补一轮即可覆盖该窗口，同时避免持续写入时陷入无限刷新
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }
}
