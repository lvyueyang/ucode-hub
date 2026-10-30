# hub 生产部署运维手册

生产环境部署配置与运维脚本，服务器部署目录 `/opt/hub/`（可用 `DEPLOY_DIR` 环境变量覆盖）。

## 文件说明

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 生产环境 docker compose 配置（单 app 服务，SQLite 库文件落在 app 数据卷内） |
| `deploy.sh` | 一键部署/更新脚本 |
| `backup.sh` | 全量备份脚本（SQLite 在线快照 + 应用数据打包，无需停服） |
| `preflight-migrations.sh` | 迁移预检（部署前校验库内迁移记录与镜像迁移文件夹一致性） |
| `restore.sh` | 恢复脚本（库快照 + 应用数据） |
| `nginx.conf.example` | 宿主机反代样例（TLS、WS 升级、事件流不缓冲、泛子域 ingress） |
| `.env.example` | 环境变量模板（复制为 `.env` 填写） |
| `VERSION` | 部署配置版本号 |

## 使用

```bash
# 首次部署（服务器上）
cp .env.example .env   # 填写 JWT_SECRET（DATABASE_URL 用模板默认值即可）
TAG=latest ./deploy.sh

# 后续更新
TAG=latest ./deploy.sh
```

## 服务拓扑

```
宿主机 nginx (80/443, SSL)
    ├── hub.example.com        → 控制面（后台 / 设备接口 / 隧道端点）
    └── *.hub.example.com      → 隧道回灌（ingress，按 <设备 id> 认设备）
            │  proxy_pass http://127.0.0.1:3009
            ▼
    docker compose
    └── app (hub-app :3009)    # 镜像 ghcr.io/ucode/hub:${TAG}，nodejs 用户运行
          └── volumes/app       # 应用数据 + SQLite 库 data.db（宿主属主 1001:1001）
```

数据库是应用进程内的 SQLite 单文件库（`node:sqlite`），库文件 `data.db` 与其 `-wal` / `-shm`
三件套必须一起留在 `volumes/app` 卷里：换路径或丢卷等于换库。`deploy.sh` 会把该目录属主对齐到容器内运行用户
（1001:1001），库文件不可写时应用启动即 fail-fast。

> **从 PostgreSQL 版本切过来的一次性处理**：上一版的 `hub-db` 容器由 `deploy.sh` 的 `--remove-orphans` 自动移除，
> 但 PostgreSQL 数据不会迁移到 SQLite（结构不兼容），所以首次切换前必须用旧方式把数据导出并另存，
> 确认不再需要后再自行删除 `volumes/db`；SQLite 新库由应用启动时自动建表（全量基线迁移），初始为空库。

## 反代与域名（逐企业交付必读）

hub 自己只监听回环，公网入口全在反代上。配置文件直接用 [`nginx.conf.example`](./nginx.conf.example)，三条硬要求必须保留：

1. `proxy_buffering off`（以及 ingress 上的 `proxy_request_buffering off`）：事件流与上传都是流式，缓冲会把首帧 / 首块拖到末尾；
2. `proxy_read_timeout` 拉长（样例给 1h）：隧道与事件流长时间没有数据帧，超时过短会反复断连；
3. WS 升级透传：隧道端点是 WebSocket（`/api/v1/tunnel`），`Upgrade` / `Connection` 头缺一不可（样例用 `map $http_upgrade`）。

域名规划：

- **主域**（如 `hub.example.com`）：控制面；`.env` 不设 `HUB_BASE_DOMAIN` 时只用这一个域。
- **泛子域**（`*.<HUB_BASE_DOMAIN>`）：隧道回灌。启用它需要在 `.env` 设 `HUB_BASE_DOMAIN=hub.example.com`，并配（1）泛域名解析、（2）**泛域名证书**（DNS-01 挑战，见样例文末）、（3）反代的泛子域 server 段。**Host 必须原样透传**，hub 靠子域认设备。

首次启用记得先建超管（init 是自助的，第一个访问 `/admin/init` 的人就是超管）：

```bash
# 1) 先只在本机 / 内网把服务起起来
TAG=latest ./deploy.sh
# 2) 用 SSH 隧道或内网 IP 访问 /admin/init 建超管，随后在后台建运营账号
# 3) 确认超管建好之后再对外开放域名（否则先到的人会成为超管）
```

隧道与 ingress 的行为边界（哪些头会被剥掉、离线 / 越权各返回什么、限额）见
[docs/tunnel.md](../docs/tunnel.md)。

## 数据库迁移机制（重要）

- **迁移唯一生效入口**：app 容器启动时 `bootstrap → runMigrations()`（drizzle-orm migrator）自动执行镜像内 `/app/drizzle` 的迁移文件；**迁移失败即应用启动崩溃（fail-fast）**
- `deploy.sh` 不显式执行迁移；`up -d` 后等待 app 健康检查通过即为迁移成功（fail-fast 语义下健康检查即迁移结果）
- 迁移记录表：`__drizzle_migrations`（SQLite 单文件库，无 schema 前缀；镜像里没有 `sqlite3` CLI，查询只能走容器内 `node:sqlite`）。匹配语义分两种：**v1 表（含 `name` 列）按完整文件夹名匹配**；**v0 表（更早的 drizzle-orm 写入，无 `name` 列）在启动时先升级表结构**
- **孤儿记录风险**：`preflight-migrations.sh` 读库内记录并与镜像迁移文件夹比对（需 `hub-app` 运行中；首次部署自动跳过）。v0 表存在孤儿记录会让升级报错、应用启动即崩；v1 表孤儿会被静默忽略，仅当属文件夹改名遗留时才需同步删除。升级前务必先跑预检

## 版本升级流程

### 1. 升级前备份（必做）

```bash
cd /opt/hub
./backup.sh            # 交互确认后生成 backup/db-<ts>.bak + backup/app-data-<ts>.tar.gz
```

输出两份产物，自动校验并保留最近 3 天（`RETENTION_DAYS` 可调）：

- `db-<ts>.bak`：容器内 `VACUUM INTO` 得到的库在线一致快照（单文件，直接就是可用的 SQLite 库）
- `app-data-<ts>.tar.gz`：除库文件（`data.db` / `-wal` / `-shm`）外的应用数据，如上传文件、日志

**交互确认**：开始备份与清理过期备份前均需输入 `y` 确认，`./backup.sh -y` 跳过（cron 等非交互场景必须用 `-y`）。

如需整体物理快照双保险（可选，需停服）：

```bash
docker compose stop app
tar czf backup/volumes-app-$(date +%Y%m%d%H%M%S).tar.gz volumes/app
docker compose start app
```

### 2. 迁移预检（必做）

```bash
cd /opt/hub
TAG=<新版本号> ./preflight-migrations.sh     # 交互确认后执行，-y 跳过
```

- 输出「孤儿记录（库中有而镜像无）」与「缺失记录（本次待执行的新迁移）」两类结论
- 发现孤儿记录：按脚本提示的 DELETE SQL，**人工确认后**删除对应迁移记录（保留备份后再删）
- 脚本只读诊断，不做任何写入；不传 `-y` 会先要一次交互确认

### 3. 执行升级

```bash
cd /opt/hub
TAG=<新版本号> ./deploy.sh
```

> `up -d` 为异步返回。`deploy.sh` 启动后会等待 app 通过容器健康检查（**数据库迁移在此过程中执行**）：超时或容器反复退出（迁移失败 crash loop）会打印最近日志并以非零退出，**deploy.sh 不报错即代表部署成功**。

### 4. 升级后验证

```bash
# 服务健康
docker compose ps
docker compose logs -f app | grep -i migrat    # 确认迁移执行日志
curl -s http://127.0.0.1:3009/health

# 迁移记录应含 name 列、新迁移已写入
docker compose exec -T app node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync((process.env.DATABASE_URL||'./data/data.db').replace(/^file:/,''));console.log(JSON.stringify(db.prepare('SELECT id, name, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5').all(), null, 2));db.close()"

# 业务核心页面冒烟（管理后台登录、首页、关键模块）
```

## 恢复

> 恢复期间写入会丢失：脚本会**自动停止 app 容器**（SQLite 单文件库被替换时必须先停写，否则进程会写到已删除的 inode 上），恢复完成后由运维手动 `docker compose start app`。
> 破坏性操作默认要求交互确认（输入 `y`），非交互/脚本执行必须显式加 `-f`。
> 应用数据恢复为 tar 解包覆盖同名文件（备份已排除库文件），**备份后新增/残留的文件不会被清除**；如需完全一致请先清空 `volumes/app` 再用 `db` 模式单独恢复库。

```bash
cd /opt/hub
# 全部恢复（按时间戳前缀匹配 backup/db-<ts>.bak 与 app-data-<ts>.tar.gz）
./restore.sh all 20260822090000

# 仅数据库
./restore.sh db /opt/hub/backup/db-20260822090000.bak
# 仅应用数据
./restore.sh app /opt/hub/backup/app-data-20260822090000.tar.gz

# 非交互执行（跳过确认）
./restore.sh -f all 20260822090000
```

数据库恢复为整文件替换（停服后清掉 `data.db` / `-wal` / `-shm` 三件套，再拷入快照，恢复后属主对齐 1001:1001）；快照在备份时已做 `PRAGMA integrity_check`，恢复后应用启动会自动重新核对迁移。

> 回灌到不同机器时同样适用：整卷 `volumes/app`（含库文件）是自包含的，`docker compose stop app` 后整体打包拷出、放到目标机解包并把属主对齐 1001:1001 即可。

## 回滚

```bash
# 应用回滚到旧版本（旧镜像 tag 保留在仓库）
cd /opt/hub
TAG=<旧版本号> ./deploy.sh
```

- 仅代码/配置回滚：上述命令即可
- 数据库结构已变更且业务异常：用升级前备份执行 `restore.sh db`（或 `all`）恢复库与数据，再回滚应用

## 定期备份（cron）

```bash
# 每日 02:00 执行备份，日志写入 backup/cron.log（cron 非交互，必须加 -y）
0 2 * * * /opt/hub/backup.sh -y >> /opt/hub/backup/cron.log 2>&1
```

定期备份保留策略由 `RETENTION_DAYS`（默认 3 天）控制。
