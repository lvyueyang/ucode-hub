/**
 * 信号量：并发限流工具
 * 许可打满时有界排队，等待超时或队列满时拒绝并抛出 SemaphoreTimeoutError
 */

/** 信号量获取超时错误 */
export class SemaphoreTimeoutError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "SemaphoreTimeoutError";
  }
}

/** 信号量配置 */
export interface SemaphoreConfig {
  /** 最大并发数 */
  max: number;
  /** 排队等待上限（超过则直接拒绝） */
  queueLimit: number;
  /** 等待超时（毫秒） */
  waitMs: number;
}

/** 排队满 / 等待超时共用的错误码：调用方据此识别「并发受限」而非业务失败 */
const EXECUTION_BUSY_CODE = "EXECUTION_BUSY";

/** 创建信号量实例 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<{
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(private readonly config: SemaphoreConfig) {}

  /** 获取一个许可，返回释放函数；排队超时则抛 SemaphoreTimeoutError */
  async acquire(): Promise<() => void> {
    // 释放函数带一次性守卫：重复调用不重复放行，防止突破 max 并发上限
    let released = false;
    const releaseOnce = (): void => {
      if (released) return;
      released = true;
      this.release();
    };

    if (this.active < this.config.max) {
      this.active++;
      return releaseOnce;
    }

    if (this.waiters.length >= this.config.queueLimit) {
      throw new SemaphoreTimeoutError("并发排队已满，请稍后重试", EXECUTION_BUSY_CODE);
    }

    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
        }
        reject(new SemaphoreTimeoutError("并发等待超时，请稍后重试", EXECUTION_BUSY_CODE));
      }, this.config.waitMs);

      this.waiters.push({
        resolve: () => {
          clearTimeout(timer);
          this.active++;
          resolve(releaseOnce);
        },
        timer,
      });
    });
  }

  /** 释放一个许可，唤醒下一个等待者 */
  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) {
      next.resolve();
    }
  }

  /** 当前活跃许可数（用于测试/监控） */
  get activeCount(): number {
    return this.active;
  }

  /** 当前排队数（用于测试/监控） */
  get queueLength(): number {
    return this.waiters.length;
  }
}
