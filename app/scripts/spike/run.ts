/**
 * 阶段 2 的架构验证驱动：对**已启动**的 hub 逐个跑四项实验，按预设标准判定通过与否。
 *
 * 前置（见 `docs/spike.md`）：起一套 PostgreSQL + hub（`HUB_SPIKE=1`），把地址给这个脚本。
 * 之所以不复用 vitest：它要的是真实 HTTP / WS 客户端与真实的 200MB 上传，不是单元级断言。
 *
 *   HUB_SPIKE_BASE=http://127.0.0.1:3199 pnpm -F @ucode/hub spike
 */
import { request as httpRequest } from "node:http";

/** 上传实验的体积：够大到「整包缓冲」一定会露馅，又不至于跑太久 */
const UPLOAD_BYTES = 200 * 1024 * 1024;
/** 上传分块：模拟流式上传（不是一次性 body） */
const UPLOAD_CHUNK_BYTES = 1024 * 1024;
/** 首块到达的判定上限（毫秒）：超过它说明框架先读完了整包 */
const FIRST_CHUNK_LIMIT_MS = 200;
/** 首块到达时的 RSS 增涨上限：整包缓冲会让它涨到与体积同量级 */
const RSS_LIMIT_BYTES = 64 * 1024 * 1024;
/** SSE 首帧延迟上限（毫秒） */
const FIRST_FRAME_LIMIT_MS = 300;

// 默认端口错开 e2e（3100）与常见 dev 端口（3000），避免打到别人的进程上
const base = (process.env.HUB_SPIKE_BASE ?? "http://127.0.0.1:3199").replace(/\/$/, "");

type Outcome = { name: string; pass: boolean; detail: string };
const outcomes: Outcome[] = [];

const record = (name: string, pass: boolean, detail: string): void => {
  outcomes.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}\n    ${detail}`);
};

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

type Report = {
  ingressHits: number;
  sseStarted: number;
  sseClosed: number;
  wsOpened: number;
  wsClosed: number;
  memory: { rss: number; heapUsed: number };
  pid: number;
  uptimeMs: number;
};

const readReport = async (): Promise<Report> => {
  const response = await fetch(`${base}/spike/report`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`/spike/report 返回 ${response.status}`);
  return (await response.json()) as Report;
};

/** 实验一：200MB 流式上传，看首块延迟与内存 */
const uploadStreamsWithoutBuffering = async (): Promise<void> => {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= UPLOAD_BYTES) {
        controller.close();
        return;
      }
      const size = Math.min(UPLOAD_CHUNK_BYTES, UPLOAD_BYTES - sent);
      controller.enqueue(new Uint8Array(size));
      sent += size;
    },
  });

  const startedAt = Date.now();
  const response = await fetch(`${base}/spike/upload`, {
    method: "POST",
    body,
    // 流式请求体需要显式声明 half duplex（undici 的要求）
    duplex: "half",
    signal: AbortSignal.timeout(120_000),
  } as RequestInit & { duplex: "half" });
  const summary = (await response.json()) as {
    bytes: number;
    chunks: number;
    maxChunk: number;
    firstChunkMs: number;
    rssBefore: number;
    rssAtFirstChunk: number;
    rssAfter: number;
    ms: number;
  };

  const rssGrowth = summary.rssAtFirstChunk - summary.rssBefore;
  const pass =
    summary.bytes === UPLOAD_BYTES &&
    summary.firstChunkMs >= 0 &&
    summary.firstChunkMs < FIRST_CHUNK_LIMIT_MS &&
    rssGrowth < RSS_LIMIT_BYTES;
  record(
    "① 大请求体流式（不整包缓冲）",
    pass,
    `收到 ${mb(summary.bytes)} / ${summary.chunks} 块（最大单块 ${mb(summary.maxChunk)}），` +
      `首块 ${summary.firstChunkMs}ms（上限 ${FIRST_CHUNK_LIMIT_MS}ms），` +
      `首块时 RSS 增涨 ${mb(rssGrowth)}（上限 ${mb(RSS_LIMIT_BYTES)}），` +
      `全程 ${summary.ms}ms，客户端侧 ${Date.now() - startedAt}ms`,
  );
};

/** 实验二：SSE 首帧与帧间隔 */
const sseFlushesFrameByFrame = async (): Promise<void> => {
  const frames = 5;
  const intervalMs = 200;
  const startedAt = Date.now();
  const response = await fetch(`${base}/spike/sse?frames=${frames}&intervalMs=${intervalMs}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.body) {
    record("② SSE 首帧与逐帧下发", false, "响应没有正文流");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const arrivalTimes: number[] = [];
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (buffer.includes("\n\n")) {
      buffer = buffer.slice(buffer.indexOf("\n\n") + 2);
      arrivalTimes.push(Date.now() - startedAt);
    }
  }

  const firstFrameMs = arrivalTimes[0] ?? -1;
  const gaps = arrivalTimes.slice(1).map((at, index) => at - (arrivalTimes[index] ?? 0));
  const maxGapDeviation = Math.max(...gaps.map((gap) => Math.abs(gap - intervalMs)), 0);
  const pass =
    response.headers.get("content-type")?.includes("text/event-stream") === true &&
    arrivalTimes.length === frames &&
    firstFrameMs >= 0 &&
    firstFrameMs < FIRST_FRAME_LIMIT_MS &&
    maxGapDeviation < 300;
  record(
    "② SSE 首帧与逐帧下发",
    pass,
    `收到 ${arrivalTimes.length}/${frames} 帧，首帧 ${firstFrameMs}ms（上限 ${FIRST_FRAME_LIMIT_MS}ms），` +
      `帧间隔偏差最大 ${maxGapDeviation}ms（期望 ${intervalMs}ms），` +
      `到达时刻 [${arrivalTimes.join(", ")}]`,
  );
};

/** 实验三：同端口上 WS 升级 + Host 路由（ingress）+ 普通 HTTP 路由三者共存 */
const tunnelAndIngressCoexistOnOnePort = async (): Promise<void> => {
  const healthStatus = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10_000) }).then(
    (r) => r.status,
  );

  const ingress = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const url = new URL(base);
    const request = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: "/api/v1/health",
        method: "GET",
        headers: { host: `dev-1.spike.local:${url.port}` },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    request.on("error", reject);
    request.end();
  });
  const ingressBody = JSON.parse(ingress.body) as { device?: string; via?: string };

  const wsUrl = `${base.replace(/^http/, "ws")}/spike/tunnel`;
  const wsResult = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const seen: string[] = [];
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`WS 在 5s 内没有走完握手与回声，已收到 [${seen.join(", ")}]`));
    }, 5000);
    socket.addEventListener("message", (event) => {
      seen.push(String(event.data));
      if (seen.length === 1) socket.send("ping");
      if (seen.length === 2) {
        clearTimeout(timer);
        socket.close();
        resolve(seen.join(" / "));
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WS 连接出错"));
    });
  });

  const pass =
    healthStatus === 200 &&
    ingress.status === 200 &&
    ingressBody.device === "dev-1" &&
    ingressBody.via === "ingress" &&
    wsResult.includes("welcome") &&
    wsResult.includes("ping");
  record(
    "③ WS 升级 + ingress + HTTP 同端口共存",
    pass,
    `同端口 HTTP /health=${healthStatus}；Host: dev-1.spike.local → ${ingress.status} ` +
      `${JSON.stringify(ingressBody)}；WS 握手与回声 [${wsResult}]`,
  );
};

/** 实验四：客户端断开后服务端能观测到取消 */
const disconnectIsObservable = async (): Promise<void> => {
  const before = await readReport();

  const controller = new AbortController();
  const response = await fetch(`${base}/spike/sse?frames=200&intervalMs=50`, {
    signal: controller.signal,
  });
  const reader = response.body?.getReader();
  if (!reader) {
    record("④ 断开可观测", false, "响应没有正文流");
    return;
  }
  // 读两帧就断开，模拟客户端中途离开
  await reader.read();
  await reader.read();
  controller.abort();

  const deadline = Date.now() + 5000;
  let after = await readReport();
  while (after.sseClosed <= before.sseClosed && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    after = await readReport();
  }

  const pass = after.sseClosed > before.sseClosed;
  record(
    "④ 断开可观测（服务端收到取消）",
    pass,
    `断开前 sseClosed=${before.sseClosed}，断开后 ${after.sseClosed}` +
      `${pass ? "" : "（5s 内未观测到取消）"}`,
  );
};

const main = async (): Promise<void> => {
  console.log(`验证目标：${base}\n`);

  const initial = await readReport().catch(() => null);
  if (!initial) {
    console.error(
      "拿不到 /spike/report：确认 hub 已启动且 HUB_SPIKE=1（见 docs/spike.md 的启动步骤）",
    );
    process.exitCode = 1;
    return;
  }

  await uploadStreamsWithoutBuffering();
  await sseFlushesFrameByFrame();
  await tunnelAndIngressCoexistOnOnePort();
  await disconnectIsObservable();

  const failed = outcomes.filter((outcome) => !outcome.pass);
  console.log(`\n${outcomes.length - failed.length}/${outcomes.length} 项通过`);
  if (failed.length > 0) process.exitCode = 1;
};

await main();
