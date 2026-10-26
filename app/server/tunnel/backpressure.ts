/**
 * 隧道出站背压：对端消费慢时按水位线等 drain，而不是把帧无限堆进内存。
 *
 * 适配器不提供缓冲信号时 `bufferedAmount` 恒为 0，等待自然退化为直通；drain 钩子只在
 * 部分适配器上触发，因此除钩子外还按低水位轮询兜底（两者都只影响「等多久」，不影响帧序）。
 * 写队列串行化：调用方按任意顺序排入，帧按排入顺序发出。
 */

/** 已排队但未写出的字节数（`peer.bufferedAmount` 的结构类型） */
export type BufferedPeer = {
  readonly bufferedAmount: number;
};

/** 高水位：超过它就暂停写，等缓冲降下来 */
export const HIGH_WATERMARK_BYTES = 4 * 1024 * 1024;

/** 低水位：轮询到缓冲降到它以下才恢复写（高/低分开避免在阈值上反复抖动） */
export const LOW_WATERMARK_BYTES = 1024 * 1024;

/** 无 drain 信号的适配器靠轮询发现缓冲已降下来；间隔取小值以免拉长每次逐个流的等待 */
const POLL_INTERVAL_MS = 25;

export type DrainWaiter = {
  /** 等缓冲降到低水位以下；连接被接管/关闭时由 release 放行 */
  wait(peer: BufferedPeer): Promise<void>;
  /** WS drain 钩子：放行当前等待者 */
  notifyDrain(): void;
  /** 连接已关闭：放行所有等待者，写队列不能挂在死连接上 */
  release(): void;
};

export const createDrainWaiter = (): DrainWaiter => {
  const waiters = new Set<{ peer: BufferedPeer; resolve: () => void }>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stopTimer = (): void => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const settle = (predicate: (peer: BufferedPeer) => boolean): void => {
    for (const waiter of [...waiters]) {
      if (!predicate(waiter.peer)) continue;
      waiters.delete(waiter);
      waiter.resolve();
    }
    if (waiters.size === 0) stopTimer();
  };

  return {
    wait(peer) {
      if (peer.bufferedAmount <= LOW_WATERMARK_BYTES) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.add({ peer, resolve });
        if (timer !== null) return;
        timer = setInterval(
          () => settle((waiting) => waiting.bufferedAmount <= LOW_WATERMARK_BYTES),
          POLL_INTERVAL_MS,
        );
        timer.unref?.();
      });
    },
    notifyDrain() {
      settle(() => true);
    },
    release() {
      settle(() => true);
    },
  };
};

export type FrameWriter = {
  /** 排入一帧；返回的 promise 在「可以继续写下一帧」时 resolve（有背压时等它降下来） */
  write(frame: string | Uint8Array): Promise<void>;
};

/**
 * 帧写队列：串行 + 背压。
 * `send` 自身的异常由调用方吞掉（连接可能已经断了），队列不能因此断掉后续帧。
 */
export const createFrameWriter = (opts: {
  peer: BufferedPeer;
  waiter: DrainWaiter;
  send: (frame: string | Uint8Array) => void;
}): FrameWriter => {
  let tail: Promise<void> = Promise.resolve();

  return {
    write(frame) {
      const next = tail.then(async () => {
        if (opts.peer.bufferedAmount > HIGH_WATERMARK_BYTES) await opts.waiter.wait(opts.peer);
        opts.send(frame);
      });
      tail = next.catch(() => undefined);
      return next;
    },
  };
};
