/**
 * 公网响应与隧道流之间的桥：把隧道发回的响应首帧、响应块、结束与失败落到一条 web 响应流上。
 *
 * 两段式：`sink.onResponse` 先把状态码与头交回 handler（它带着正确的状态返回 Response），
 * 之后响应块逐块入流。消费端慢到队列压满高水位时，`onBody` 会挂住不返回——分发侧是串行的，
 * 于是隧道那侧的推帧随之停下，hub 不会替慢客户端把整个响应当内存缓存。
 *
 * 背压靠 `pull` 与「等余量」两个信号对接：`pull` 只在队列有空位时被调用，调用后先挂住它返回的
 * promise，等下一次入流再放行（不主动再要数据，否则会陷入空转的微任务循环）。
 */
import type { StreamFailure, StreamSink } from "./dispatch";

/** 公网侧响应流的队列高水位 */
const RESPONSE_QUEUE_HIGH_WATERMARK_BYTES = 4 * 1024 * 1024;

/**
 * 首帧响应的三种收敛：拿到状态码与头 / 隧道侧失败 / 公网侧已断开。
 * 「已断开」单独一态是为了不把「客户端走了」误报成隧道故障。
 */
export type HeadResult =
  | { kind: "head"; status: number; headers: Record<string, string> }
  | { kind: "failure"; failure: StreamFailure }
  | { kind: "aborted" };

export type IngressExchange = {
  sink: StreamSink;
  stream: ReadableStream<Uint8Array>;
  waitHead(): Promise<HeadResult>;
  /** 放弃这条流（并发超限等还没真正开始的场景） */
  discard(): void;
};

export const createIngressExchange = (opts: {
  /** 公网请求的 signal：连接断开时用它兜底取消隧道上的流 */
  signal: AbortSignal;
  /** 公网侧断开：取消隧道上对应的流（发 abort 让 UCode 取消上游） */
  onAbort: (reason: string) => void;
}): IngressExchange => {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let finished = false;
  let headSettled = false;
  /** pull 已请求数据、还没入流：入流后放行，让运行时重新评估余量 */
  let pullGate: (() => void) | null = null;
  /** 队列压满高水位，入流回调在此等消费端腾出余量（同时只能有一个等待者：分发是串行的） */
  let roomGate: (() => void) | null = null;
  let resolveHead: (result: HeadResult) => void = () => undefined;

  const head = new Promise<HeadResult>((resolve) => {
    resolveHead = resolve;
  });

  const releaseRoom = (): void => {
    const gate = roomGate;
    roomGate = null;
    gate?.();
  };

  const settleHead = (result: HeadResult): void => {
    if (headSettled) return;
    headSettled = true;
    resolveHead(result);
  };

  const abort = (reason: string): void => {
    if (finished) return;
    finished = true;
    opts.signal.removeEventListener("abort", onSignalAbort);
    releaseRoom();
    settleHead({ kind: "aborted" });
    opts.onAbort(reason);
  };

  const onSignalAbort = (): void => abort("公网侧断开连接");
  opts.signal.addEventListener("abort", onSignalAbort, { once: true });

  /** 首次收尾返回 false（调用方继续走收尾），已收尾过返回 true（调用方直接返回） */
  const markFinished = (): boolean => {
    if (finished) return true;
    finished = true;
    opts.signal.removeEventListener("abort", onSignalAbort);
    releaseRoom();
    return false;
  };

  const stream = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      pull() {
        if (roomGate) {
          releaseRoom();
          return undefined;
        }
        return new Promise<void>((resolve) => {
          pullGate = resolve;
        });
      },
      cancel(reason) {
        abort(typeof reason === "string" && reason ? reason : "公网侧断开连接");
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: RESPONSE_QUEUE_HIGH_WATERMARK_BYTES }),
  );

  return {
    stream,
    waitHead: () => head,
    discard() {
      if (markFinished()) return;
      controller?.error(new Error("ingress 已放弃该流"));
    },
    sink: {
      onResponse(status, headers) {
        if (finished) return;
        settleHead({ kind: "head", status, headers });
      },
      async onBody(chunk) {
        if (finished || !controller) return;
        while (!finished && controller.desiredSize !== null && controller.desiredSize <= 0) {
          await new Promise<void>((resolve) => {
            roomGate = resolve;
          });
        }
        if (finished || !controller) return;
        controller.enqueue(chunk);
        const gate = pullGate;
        pullGate = null;
        gate?.();
      },
      onEnd() {
        if (markFinished()) return;
        try {
          controller?.close();
        } catch {
          // 消费端已撤销（公网侧断开），没有必要再关
        }
      },
      onError(failure) {
        if (markFinished()) return;
        if (!headSettled) {
          settleHead({ kind: "failure", failure });
          return;
        }
        // 头已经发出去了：只能中断响应体，让调用方看到「被截断」而不是静默的成功
        try {
          controller?.error(new Error(`${failure.code}：${failure.message}`));
        } catch {
          // 消费端已走，响应无法再改写
        }
      },
    },
  };
};
