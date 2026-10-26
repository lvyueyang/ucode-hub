/**
 * 隧道多路复用：把帧分发到各条在飞的流上，并维护每条流的收敛状态。
 *
 * 只做协议状态机 + 回调，不碰 WS 与 HTTP：出站经 `transport`，入站把结果交给 `sink`
 * （ingress 侧把它实现成公网响应流）。流号由注入的分配器给出（只增不复用），
 * 并发上限按协议常量收口，超限时 `openStream` 返回 null（由 ingress 回 429）。
 *
 * 收敛规则（对端发错就得让这条流失败，而不是把连接搞崩）：
 * 首帧响应之前的响应体、重复的首帧响应、未开始就结束，都按协议错误收尾。
 *
 * 升级流（`upgrade: true`）是一条 WebSocket：应答必须是 101，之后两端各自持续发自己方向的
 * 数据帧，直到某一方发 `close`——它没有「请求体发完」「响应体发完」的边界。
 */
import {
  type ControlFrame,
  DATA_FRAME_KINDS,
  type DataFrame,
  MAX_CONCURRENT_STREAMS,
  type ResponseFrame,
} from "@ucode/hub-protocol";

/** 一条待转发请求的描述（对应 `request` 控制帧） */
export type StreamRequest = {
  method: string;
  /** 含查询串的原始路径 */
  path: string;
  /** 已剥掉调用方凭证与逐跳头的请求头 */
  headers: Record<string, string>;
  hasBody: boolean;
  /** 要转成 WebSocket：应答必须是 101，之后双向发数据帧，直到某一方发 `close` */
  upgrade?: boolean;
};

/** 出站侧的出口：控制帧与请求体分块（编码与背压在实现方之后） */
export type StreamTransport = {
  sendControlFrame(frame: ControlFrame): void;
  /**
   * 请求体分块；返回的 promise 在「可以继续送下一块」时 resolve（背压由实现方负责）。
   * `text` 为真表示这一块是 WebSocket 文本帧的内容。
   */
  sendRequestBodyFrame(streamId: number, chunk: Uint8Array, text?: boolean): Promise<void>;
};

/** 流失败：`code` 取协议错误码或 hub 侧自造码，ingress 据此回 502 */
export type StreamFailure = {
  code: string;
  message: string;
};

/** 一条流的消费端；回调可返回 promise（响应流按水位线吊住分发即由此实现） */
export type StreamSink = {
  onResponse(status: number, headers: Record<string, string>): void | Promise<void>;
  /** `text` 为真表示这一块是 WebSocket 文本帧的内容（普通 HTTP 流转发时不会出现） */
  onBody(chunk: Uint8Array, text?: boolean): void | Promise<void>;
  onEnd(): void | Promise<void>;
  onError(failure: StreamFailure): void | Promise<void>;
  /** 升级流被对端关闭：带 WebSocket 关闭码（普通流不会走到这里） */
  onClose?(code: number, reason: string | undefined): void | Promise<void>;
};

export type StreamDispatcher = {
  /** 开一条流并发 `request` 帧；超过并发上限返回 null */
  openStream(request: StreamRequest, sink: StreamSink): number | null;
  /** 送请求体分块；返回 false 表示不必再送（该流已收尾，或对端已开始回包），调用方应停止读上传 */
  sendRequestBody(streamId: number, chunk: Uint8Array, text?: boolean): Promise<boolean>;
  /** 请求体送完（升级流没有这回事，调用无副作用） */
  endRequest(streamId: number): void;
  /** 关闭一条升级流：发 `close` 给对端并移出登记表。浏览器侧已经关了，不再回调 sink */
  closeStream(streamId: number, code: number, reason?: string): void;
  /** hub 侧取消（公网侧断开）：发 `abort` 并移出登记表，不再回调 sink */
  abortStream(streamId: number, reason?: string): void;
  /** 连接级收尾：所有在飞流逐条以失败回调（连接已断，不再发帧） */
  failAllStreams(failure: StreamFailure): void;
  /** 入站控制帧（只处理流级帧，其余返回 undefined 交给宿主） */
  handleControlFrame(frame: ControlFrame): Promise<void>;
  /** 入站数据帧（请求体帧由客户端发来属违规） */
  handleDataFrame(frame: DataFrame): Promise<void>;
  /** 在飞流数（并发上限与观测用） */
  pendingStreamCount(): number;
};

type PendingStream = {
  id: number;
  sink: StreamSink;
  /** 首帧响应到达前不接受响应体；升级流在 101 到达前也允许上行 */
  phase: "awaitingResponse" | "streaming";
  /** 是否是 WebSocket 升级流 */
  upgrade: boolean;
};

export const createStreamDispatcher = (opts: {
  transport: StreamTransport;
  /** 流号分配器：从 1 起、只增不复用（见 connections.ts） */
  allocateStreamId: () => number;
  maxStreams?: number;
}): StreamDispatcher => {
  const maxStreams = opts.maxStreams ?? MAX_CONCURRENT_STREAMS;
  const streams = new Map<number, PendingStream>();

  const failStream = async (stream: PendingStream, failure: StreamFailure): Promise<void> => {
    streams.delete(stream.id);
    await stream.sink.onError(failure);
  };

  const respond = async (frame: ResponseFrame): Promise<void> => {
    const stream = streams.get(frame.id);
    if (!stream) return;
    if (stream.phase !== "awaitingResponse") {
      await failStream(stream, { code: "protocol_error", message: "同一条流收到重复的响应首帧" });
      return;
    }
    // 升级流只认 101：设备侧连不上本机 WebSocket 时用 `error` 帧，不在这里回普通状态码
    if (stream.upgrade && frame.status !== 101) {
      await failStream(stream, {
        code: "protocol_error",
        message: `升级流收到了 ${frame.status} 应答`,
      });
      return;
    }
    stream.phase = "streaming";
    await stream.sink.onResponse(frame.status, frame.headers);
  };

  const endStream = async (streamId: number): Promise<void> => {
    const stream = streams.get(streamId);
    if (!stream) return;
    if (stream.upgrade) {
      await failStream(stream, {
        code: "protocol_error",
        message: "升级流不得以 responseEnd 结束",
      });
      return;
    }
    if (stream.phase !== "streaming") {
      await failStream(stream, { code: "protocol_error", message: "响应体未开始就收到结束帧" });
      return;
    }
    streams.delete(streamId);
    await stream.sink.onEnd();
  };

  const failById = async (streamId: number, failure: StreamFailure): Promise<void> => {
    const stream = streams.get(streamId);
    if (!stream) return;
    await failStream(stream, failure);
  };

  return {
    openStream(request, sink) {
      if (streams.size >= maxStreams) return null;
      const id = opts.allocateStreamId();
      streams.set(id, { id, sink, phase: "awaitingResponse", upgrade: request.upgrade === true });
      opts.transport.sendControlFrame({
        t: "request",
        id,
        method: request.method,
        path: request.path,
        headers: request.headers,
        hasBody: request.hasBody,
        ...(request.upgrade ? { upgrade: true } : {}),
      });
      return id;
    },
    async sendRequestBody(streamId, chunk, text) {
      const stream = streams.get(streamId);
      if (!stream) return false;
      // 普通流早回包就停下上行；升级流是双向的，101 之后还要继续送
      if (!stream.upgrade && stream.phase !== "awaitingResponse") return false;
      await opts.transport.sendRequestBodyFrame(streamId, chunk, text);
      return streams.has(streamId);
    },
    /** 请求体送完：早回包的流也要发，客户端据此收尾请求体；升级流没有这个边界 */
    endRequest(streamId) {
      const stream = streams.get(streamId);
      if (!stream || stream.upgrade) return;
      opts.transport.sendControlFrame({ t: "requestEnd", id: streamId });
    },
    closeStream(streamId, code, reason) {
      if (!streams.delete(streamId)) return;
      opts.transport.sendControlFrame({ t: "close", id: streamId, code, reason });
    },
    abortStream(streamId, reason) {
      if (!streams.delete(streamId)) return;
      opts.transport.sendControlFrame({ t: "abort", id: streamId, reason });
    },
    failAllStreams(failure) {
      const pending = [...streams.values()];
      streams.clear();
      // 连接已断，不再逐个 await：sink 各自按幂等收尾（起回应流已被消费端撤销）
      for (const stream of pending) void stream.sink.onError(failure);
    },
    async handleControlFrame(frame) {
      switch (frame.t) {
        case "response":
          await respond(frame);
          return;
        case "responseEnd":
          await endStream(frame.id);
          return;
        case "close": {
          const stream = streams.get(frame.id);
          if (!stream) return;
          if (!stream.upgrade) {
            await failStream(stream, {
              code: "protocol_error",
              message: "普通流不得以 close 结束",
            });
            return;
          }
          streams.delete(frame.id);
          await stream.sink.onClose?.(frame.code, frame.reason);
          return;
        }
        case "error":
          await failById(frame.id, { code: frame.code, message: frame.message });
          return;
        case "abort":
          await failById(frame.id, { code: "aborted", message: frame.reason ?? "对端已取消" });
          return;
        default:
          return;
      }
    },
    async handleDataFrame(frame) {
      const stream = streams.get(frame.streamId);
      if (!stream) return;
      if (
        frame.kind !== DATA_FRAME_KINDS.responseBody &&
        frame.kind !== DATA_FRAME_KINDS.responseText
      ) {
        await failStream(stream, { code: "protocol_error", message: "客户端不得发送请求体帧" });
        return;
      }
      if (stream.phase !== "streaming") {
        await failStream(stream, { code: "protocol_error", message: "响应首帧之前收到响应体" });
        return;
      }
      await stream.sink.onBody(frame.payload, frame.kind === DATA_FRAME_KINDS.responseText);
    },
    pendingStreamCount() {
      return streams.size;
    },
  };
};
