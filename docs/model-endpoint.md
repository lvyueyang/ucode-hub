# 中继模型端点与用量

> 定位：平台机制类 · 人类阅读
> 单一事实来源：`app/server/routes/v1/**` 与 `app/server/model-endpoint/**`（端点、转发与限流）、`app/src/services/usage/**` 与 `app/src/db/schema/model-usage.ts`（用量）、`app/src/shared-services/ai/`（厂商配置）
> 引用关系：← 被 README 文档索引与本页「后台页」引用；→ 引用上述代码单一事实来源，上游厂商口径见 UCode 仓库的 [`plans/hub.md`](https://github.com/lvyueyang/ucode/blob/main/plans/hub.md)
> 更新触发：端点路径与鉴权、转发与超时口径、限流键与阈值、用量字段、厂商配置结构变更时

中继提供一组 **OpenAI 兼容的模型端点**：客户端（设备或网页会话）用 hub 的身份直接把对话请求打到中继，
由中继用运营方配置的厂商凭据转发，并按账号记账。**厂商密钥不下发到客户端**，客户端也不需要自己配 provider。

```
客户端（UCode / app） ──Bearer <设备令牌 | hub 会话 JWT>──▶ hub 模型端点
                                                             │  ① 按 model 解析厂商
                                                             ▼
                                                     上游 OpenAI 兼容厂商
                                                             │  ② 响应原样回传（SSE 逐块）
                                                             ▼
                                                       model_usage（一行一次调用）
```

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/chat/completions` | 对话补全，支持 `stream: true`；请求体与响应体均为 OpenAI Chat Completions 形态 |
| GET | `/v1/models` | 已配置厂商的模型清单，供客户端发现可用模型 |

两个端点走的是 Nitro server route（`app/server/routes/v1/**`），不在 TanStack 路由里，
因此拿得到裸请求与裸响应流——这是「逐帧透传、不整包缓冲」的前提。

### 请求与响应

- **请求体**：只读 `model` / `messages` / `stream` 三个字段判定转发目标，**其余字段原样透传**
  （`temperature` / `tools` / `reasoning_effort` 等上游认识的参数不必在 hub 侧登记）。
  `messages` 必须是非空数组，否则 400。
- **请求体上限** 8MB（含多模态 base64 图），超了 413；再大应由客户端自行裁剪。
- **响应**：状态码与响应体原样回传，只有 `content-type` 跟着上游走；流式额外带
  `cache-control: no-cache` 与 `x-accel-buffering: no`（反代与本浏览器都别缓冲）。
- **不改帧**：流式不做重编码，`reasoning_content`、`finish_reason`、`data: [DONE]` 与厂商自有字段
  保持原形，块序与分块边界也不动。
- **`GET /v1/models`**：`{ object: "list", data: [{ id, object: "model", created, owned_by }] }`；
  `owned_by` 取厂商展示名。多厂商配了同名模型时只报一次（转发时命中配置顺序里靠前的那个）；
  未配置任何厂商时返回空清单而不是报错（发现端点本身可用）。

## 鉴权

`Authorization: Bearer <token>`，令牌只认两种身份（`app/server/model-endpoint/auth.ts`）：

| 身份 | 令牌 | 记账归属 |
| --- | --- | --- |
| 设备 | `deviceToken`（登记设备时下发，明文只回一次；库中只存 sha256） | 设备属主（`ownerType` + `ownerId`）+ `deviceId` |
| 用户 | hub 会话 JWT（`/api/v1/auth/login` 签发，载荷 `{userId, username, userType}`） | 本人；`deviceId` 为空 |

- **分流靠形态**：JWT 恰为三段（两个点），设备令牌是 base64url（不含点），所以不必「先查设备再验签」串两趟。
- **判定条件**：设备令牌要求设备存在、未软删、`status = active`；JWT 要求签名与载荷结构有效，
  且账号仍存在且未停用（令牌没过期也不给已停用账号记账）。两者任一不成立都回 `401`，不区分原因。
- **账号取权威值**：归属 id 取服务层返回的账号 id，而不是令牌自述的 `userId`。
- 两个端点鉴权口径一致（`GET /v1/models` 同样要求令牌），未认证统一 `401`。

## 上游解析

厂商配置在系统配置 `ai_providers`（对象 JSON，键为厂商 id，含 `name` / `baseUrl` / `apiKey` / `default` / `models`），
由后台「AI 厂商管理」维护，读取入口是 `app/src/shared-services/ai/ai.provider.ts` 的 `readProviders()`。

转发目标按「**请求里的 `model` 优先，配置清单兜底**」解析（`resolveCompletionTarget`）：

1. 在**可用户商**（配了地址与密钥）里找模型清单含该 `model` 的厂商，命中就用它；
2. 没命中（厂商随时会上新模型）→ 回落到 `default: true` 的厂商（无标记则取第一个），`model` **原样转发**；
3. 请求没带 `model` → 取该厂商的默认模型（无标记则取第一个）；
4. 一个可用户商都没有 → `503`，提示去后台补配置。

上游地址按 `baseUrl` 拼 `/chat/completions`（`baseUrl` 带不带 `/v1` 都对）；
请求头只补 `Authorization: Bearer <厂商 apiKey>` 与 `content-type: application/json`——**调用方的任何头都不转发**，
包括它带进来的 `Authorization`。

## 流式与 token 口径

- **流式（`stream: true`）**：向上游注入 `stream_options: { include_usage: true }`（若客户端已经带了
  `stream_options`，合并不覆盖），OpenAI 兼容上游据此在**末尾帧**附带 `usage`。
- **取 token**：usage 探针贯穿整段流（`createSseUsageProbe`），按流式解码 + 整行对齐，
  分块切在多字节字符或一行中间也不会误判；同一段流里出现多次 usage 时**以最后一次为准**。
- **不整块缓冲**：响应流由下游读取驱动（`pull`），下游不读就不读上游；上游读流的取消与
  客户端断开联动（断开即中止上游请求）。这一点有单测守门（只消费一块时上游读次数 ≤ 2）。
- **拿不到 usage 的差别**：上游不回 usage（非兼容实现）、或流中途断了，则三个 token 列留 **NULL**——
  「没拿到」与「是 0」在库里是两回事；这行记录仍有请求与耗时。

## 限流

按**调用方身份**在定长窗口内计数（`app/server/model-endpoint/rate-limit.ts`；计数复用
`app/src/services/rate-limit/rate-limit.ts` 的通用实现，进程内存即成立）：

| 端点 | 限流键 | 阈值 |
| --- | --- | --- |
| `POST /v1/chat/completions` | `model-endpoint:device:{设备 id}`（设备令牌）或 `model-endpoint:account:{admin\|client}:{账号 id}`（会话令牌） | 1 分钟 60 次 |
| `GET /v1/models` | 同上 | 1 分钟 120 次 |

- **额度算速率不算并发**：判定只在鉴权通过后、读请求体与转发之前做一次，一条流跑多久都不再占额度——
  并发十条长流不会把后续请求挤掉；要限并发得另做（端点自身不排队）。
- **429 表现**：与其余失败同形 `{ error: { message: "调用过于频繁，请稍后再试", type: "rate_limit_exceeded" } }`
  （`content-type: application/json; charset=utf-8`）；**不落用量行**——请求没到上游，没有可记的账。
- **键的粒度**：设备令牌按设备 id 限（同一账号换设备各有一份额度），会话令牌按账号 id 限
  （同一账号的多个标签页共用一份额度）；键带 `model-endpoint:` 前缀，与登录等场景的计数互不干扰。
- **被限流记 `debug`**：日志为 `模型端点请求被限流`（带限流键、身份类型与阈值），默认 `info` 级别下不出现，
  避免被刷时刷屏。
- **计数在单实例内存里**：hub 是单实例部署（见 [`AGENTS.md`](../AGENTS.md)），多实例时每个实例各限一份、
  实际额度翻倍，换共享存储的位置见 `rate-limit.ts` 文件注释。

## 用量记录

每次调用落一行 `model_usage`（`app/src/db/schema/model-usage.ts`，写入口 `recordUsage`）：

| 列 | 说明 |
| --- | --- |
| `account_type` / `account_id` | 调用归属账号（`admin` / `client` + 账号 id，多态无外键，账号删了历史用量仍可读） |
| `device_id` | 设备令牌调用才有；网页会话调用为 NULL |
| `model` / `provider_id` | 实际发给上游的模型与命中的厂商 id |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | 取自上游 usage，**拿不到时为 NULL** |
| `latency_ms` | 耗时：非流式为「发出上游请求 → 响应体读完」，流式为「发出上游请求 → 最后一帧到达」 |
| `status` | `ok` 上游正常返回；`error` 上游报错 / 连不上 / 流中断 / 客户端取消 |
| `error_message` | 失败摘要（含上游状态码，截断到 500 字符），成功为 NULL |
| `created_at` | 落库时间；按它与 `account_id` 各建一个索引 |

- **记账不返工**：落库是 fire-and-forget，失败只记 `warn`——响应早已回给客户端，
  不能因为记账失败把一次成功的调用变成失败。
- **取消的口径差别**：客户端取消按 `error` 落库（请求没有正常完成），但**不计入外部调用指标**——
  指标衡量上游健康度，用量表衡量请求账目，两者口径不同是有意的。
- **外部调用观测**：上游调用走 `#/shared-services/external-observability` 的
  `logExternalRequest`（`system: "model-endpoint"`，成功 `debug`、失败 `warn`），
  指标为 `external_calls_total{system="model-endpoint"}` 与耗时分位；客户端取消不计结果。

### 后台页

`/admin/usage`（`app/src/routes/admin/_admin/usage/**`，权限码 `usage:view`）：
页头汇总卡（请求数 / 失败数与失败率 / 输入 · 输出 · 合计 token / 平均耗时）+ 明细表
（时间 / 账号 / 设备 / 模型 / Token / 耗时 / 状态，失败行在状态标签上挂 Tooltip 给原文案），
筛选为时间段（默认近 7 天）+ 账号类型 + 模型 + 状态。汇总与列表**共用同一套筛选条件**，
页头卡片与下方明细永远同口径。服务层另有 `usageTotalsForOwner(owner)` 供前台「我的用量」复用。

## 失败透传与状态码

| 场景 | 状态码 | 响应体 |
| --- | --- | --- |
| 缺令牌 / 令牌无效 / 设备被吊销 / 账号停用 | `401` | `{ error: { message, type: "invalid_api_key" } }` |
| 请求体为空、非法 JSON、`messages` 不是非空数组 | `400` | `{ error }` |
| 请求体超过 8MB | `413` | `{ error }` |
| 同一调用方超出限流阈值 | `429` | `{ error: { message, type: "rate_limit_exceeded" } }` |
| 没有可用的已配置厂商 / 没有可用模型 | `503` | `{ error }` |
| 连不上上游、等响应头超时、上游没给响应体 | `502` | `{ error: { message, type: "upstream_error" } }` |
| 上游返回非 2xx | **上游状态码** | 上游错误体：本来就是 `{ error }` 的原样透传，纯文本则包一层 `{ error: { message } }` |
| 上游正常 | 上游状态码 | 上游响应体原样（流式为逐帧） |

失败的调用同样落一行用量（`status: "error"` + `error_message`）；限流的请求在转发之前就被挡下，不落用量行。

## 限制

- **只有 chat completions**：`embeddings` / `images` / `responses` 等面未提供，客户端的其它能力仍走本地 provider。
- **超时分两段**：等上游响应头有 30 秒上限（上游不可达时客户端不能一直悬着）；流式响应体**不设整段超时**
  （长回答会被掐断），改用 120 秒的**空闲超时**兜底（两块之间没有数据即中止上游）。
  非流式响应体没有单独超时，受上游自身超时与客户端断开约束。
- **并发**：端点自身不排队，并发上限由进程与上游决定；速率上限按调用方身份限（见「限流」），阈值不按并发收紧。
- **流式中途出错**：响应头早已发出，只能让流直接结束（不补「假收尾帧」，否则客户端的完整性判断会被骗过），
  客户端看到的是被切断的流；调用方据此重试。
- **不算 token 的场景**：上游不支持 `stream_options`（部分老网关会直接 400）时不注入也拿不到，
  只能记请求与耗时；客户端带的 `stream_options` 会被合并而非覆盖，因此注入本身不会覆盖既有配置。
- 端点不做内容改写、不做 prompt 缓存、不做成本换算（token 数留在用量表，计价口径由使用方决定）。

## 排障

- 日志：每次请求与每块回传都是 `debug`（`模型端点收到对话请求` / `模型端点回传分块` / `模型端点请求结束`），
  默认 `info` 级别下只看到上游告警与落库失败，排障时需要 `LOG_LEVEL=debug`。
- 401 排查顺序：令牌形态（三个点才是 JWT）→ 设备 `status` → 账号是否停用。
- 429 排查：`LOG_LEVEL=debug` 下看 `模型端点请求被限流` 行的限流键，即可判断是哪个设备 / 账号刷的；
  阈值与键的口径见「限流」。
- 503 排查：后台「AI 厂商管理」里是否配了 `baseUrl` + `apiKey` + 至少一个模型。
- 有请求但页面无 token 数：看上游是否真的回了 `usage`（`LOG_LEVEL=debug` 下可见分块日志的完整性）。
