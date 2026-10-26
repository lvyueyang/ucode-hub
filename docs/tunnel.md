# 隧道与 ingress（数据面）

> 协议是**两份内容相同的副本**：本仓库的 `packages/protocol`（`@ucode/hub-protocol`）与 UCode 仓库的
> `packages/hub-protocol`；改协议要同时改两处（UCode 侧的 `pnpm verify` 会比对两侧内容）。
> UCode 侧的客户端实现在 `server/src/services/hub`：控制帧结构、二进制帧编解码、协议版本与限额由这份副本定义。

## 拓扑

```
app / 其他客户端 ──Bearer <hub 会话>──▶ hub ingress（按 Host 或路径认设备）
                                          │  ① 建流、发 request 帧
                                          ▼
                                     隧道（WSS，UCode 主动出站）
                                          │  ② 客户端用本地 serviceToken 转发给本机服务
                                          ▼
                                     UCode 服务层（同一套 /api/v1 + 事件流）
```

- **hub 不持有 UCode 的任何凭证**：`serviceToken` 由 UCode 侧的客户端注入（鉴权管线一行没改）。
- **入口鉴权是唯一门**：经隧道到达 UCode 的请求等同本机 owner（可跑 `bash`），因此 ingress 必须
  校验调用方是已登录的 hub 用户，且该设备属于他（管理端账号可访问任意设备）。
- **设备离线不排队**：设备没连着隧道时直接回 502（`device_offline`），由客户端重连后自然恢复。

## 隧道端点与握手

| 项 | 值 |
| --- | --- |
| 路径 | `GET /api/v1/tunnel`（`TUNNEL_PATH`），WebSocket 升级 |
| 鉴权 | `Authorization: Bearer <deviceToken>`（`DEVICE_AUTH_HEADER`）；hub 侧按 sha256 反查设备并要求 `status = active` |
| 首帧 | 客户端发 `{t:"hello", protocol, clientVersion, deviceName, platform}`；hub 回 `welcome` 或 `reject` |
| 版本 | `PROTOCOL_VERSION` 不一致即 `reject(protocol_mismatch)`，不做降级兼容（当前 v2） |
| 心跳 | 应用层 `ping` / `pong`，间隔 `HEARTBEAT_INTERVAL_MS`，超过 `HEARTBEAT_TIMEOUT_MS` 无响应即断开 |
| 接管 | 同一设备重复上线时新连接接管旧的：旧连接上在飞的流按失败收尾，公网侧不会悬着 |
| 重连 | UCode 侧指数退避 + jitter；被 `reject`（令牌失效）后停止重连，等用户重新登录 |

## 帧

- **控制帧**：文本帧里的 JSON，zod 校验（`control.ts`）。`request` / `requestEnd` / `response` /
  `responseEnd` / `abort` / `error` / `close` / `ping` / `pong`。
- **数据帧**：二进制帧，布局 `[kind:1][streamId:4][length:4][payload]`（大端）。
  二进制而不是 base64：事件流是高频小帧，base64 白涨三分之一流量。
  `kind` 有四个值：请求方向 / 响应方向 × 字节 / 文本（`Text` 变体表示这一块的语义是 WebSocket 文本帧；
  终端的上行约定就是文本帧，二进制帧会被它忽略）。
- **流号**：hub 分配、从 1 起、只增不复用；`0` 留给控制帧。
- **限额**：单帧载荷 `MAX_FRAME_PAYLOAD`(1MB)、单隧道并发流 `MAX_CONCURRENT_STREAMS`(64)、
  请求头 `MAX_HEADER_BYTES`(32KB)；超限由 hub 回 429（`tunnel_busy`）。
- **背压**：发送侧按 WS 缓冲水位（高 4MB / 低 1MB）等待 drain；接收侧对端消费慢时停止读上游，
  两端都不整体缓冲。

## ingress

| 项 | 值 |
| --- | --- |
| 寻址 | 两种等价形态：`/d/<设备 id>/`（hub 自己的域名下，不依赖泛域名，默认可用）与 `<设备 id>.<HUB_BASE_DOMAIN>`（配了父域才启用）；设备 id 即 uuid |
| 调用方鉴权 | `Authorization: Bearer <hub 会话 JWT>` 或现有会话 Cookie；解出的用户须为设备属主，或管理端账号 |
| 未认证 | 401 `{"error":"未认证或凭证无效"}` |
| 设备不属于该用户 | 404 `{"error":"设备不存在或已被删除"}`（与「不存在」同文案，不泄露他人设备） |
| 设备未连接 | 502 `{"error":"设备未连接","code":"device_offline"}` |
| 剥掉的请求头 | `cookie`、`authorization`、`host`、`connection`、`x-forwarded-*` |
| 注入的来源头 | `x-hub-source: tunnel`、`x-hub-device: <设备 id>`、`x-hub-client: <登录用户 id>`（只进日志与统计，不参与鉴权，见 UCode 的 `docs/api.md`） |
| 前缀形态 | 路径寻址额外注入 `x-hub-base-path: /d/<设备 id>`：UCode 据此改写 `index.html` 的 `<base href>`（资源在产物里是相对路径）。路径不带尾斜杠时先 308 到带尾斜杠的地址 |
| 流式 | 请求体与响应体逐块转发；响应头先发、SSE 逐帧；公网侧断开时给 UCode 发 `abort` 取消上游 |

### WebSocket 升级

`request.upgrade: true` 的流是一条 WebSocket，只在**路径寻址**下启用（子域形态的升级请求由中间件直接回 501）：

- **升级**：hub 在 `/d/<设备 id>/…` 的专用 WS route 上终结浏览器这条连接，设备侧连本机 WebSocket；
  设备侧的应答必须是 `101`，`101` 之前的上行字节由设备侧排队（`MAX_UPGRADE_BUFFER_BYTES` 封顶）。
- **双向**：上行用 `requestBody` / `requestText` 帧，下行用 `responseBody` / `responseText` 帧；
  升级流没有 `requestEnd` / `responseEnd` 的边界，这两个帧出现在升级流上按协议错误收尾。
- **关闭**：`close` 帧带 WebSocket 关闭码（1000–4999），两端都可发；终端的「进程结束 / 终端已不存在 /
  凭证失效」就靠它传到底。1005 / 1006 / 1015 这类不可发送的码会被换成 1000 / 1011。
- **失败**：设备侧连不上本机 WebSocket 用 `error` 帧，hub 以 1011 关闭浏览器连接；
  本机用普通 HTTP 拒绝了升级（如终端握手票无效）时，设备侧把状态码映射成关闭码
  （401 → 4401、404 → 4404）再发 `close`—不然浏览器只看到「连接异常」，靠关闭码区分终态的场景会一直重连。
- **限额**：一条升级流长期占一个并发名额（`MAX_CONCURRENT_STREAMS`），超限时 hub 以 1013 关闭。

## 部署要点

- 子域 ingress 需要**泛域名解析**（`*.<HUB_BASE_DOMAIN>`）与**泛域名证书**；只用路径形态（`/d/<设备 id>/`）
  则一张普通证书就够，但页面里的相对资源靠 UCode 服务端按 `x-hub-base-path` 改写 `<base href>`——
  **被访问的 UCode 必须是含该改写的版本**（旧产物里没有 `<base>` 标签，改写无从落地）。
- 反代必须：`proxy_buffering off`、`proxy_read_timeout` 拉长（事件流是长连接）、WS 升级透传
  （`Upgrade` / `Connection` 头、HTTP/1.1）。
- hub 侧不要给长连接设请求超时，保活只依赖隧道心跳。

## 验证

阶段 4 的端到端联调（临时端口 + 临时目录，脚本见 `.tmp/hub-e2e/`，不进仓库）：

| 用例 | 结果 |
| --- | --- |
| 经隧道调 UCode `POST /api/v1/status` | 200，返回 UCode 的运行时状态 |
| 经隧道读事件流 `POST /api/v1/events` | 逐帧到达：`event: message` / `data: {"type":"server.connected"}` |
| 未带凭证的 ingress 请求 | 401 |
| UCode 停掉后的 ingress 请求 | 502 `device_offline` |
| 重启 UCode 后 | 隧道自动重连，ingress 恢复 200（自愈） |
| 30MB 附件经隧道上传 | 200，`size: 31457280`（大于 UCode 的 32MB 上限时由 UCode 回 413 `payload_too_large`，说明请求体确实流过去了） |
