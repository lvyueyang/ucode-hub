#!/usr/bin/env bash
# 一键全量备份：SQLite 库在线一致快照（容器内 VACUUM INTO）+ 应用数据打包，无需停服
# 用法：
#   ./backup.sh                              # 交互确认后备份到 ${DEPLOY_DIR}/backup/
#   ./backup.sh -y                           # 跳过交互确认（cron 定时备份必须加 -y）
#   DEPLOY_DIR=/opt/hub RETENTION_DAYS=14 ./backup.sh
set -euo pipefail

# 产物含库文件与上传内容：默认收紧权限（文件 0600、目录 0700），只能由部署账号读取
umask 077

# 交互确认：cron/脚本等非交互场景必须用 -y 跳过
SKIP_CONFIRM=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) SKIP_CONFIRM=1 ;;
    *) echo "未知参数：$arg（仅支持 -y/--yes）" >&2; exit 1 ;;
  esac
done

confirm() {
  [ "$SKIP_CONFIRM" -eq 1 ] && return 0
  local ans
  read -r -p "$1 [y/N] " ans || return 1
  [[ "$ans" =~ ^[yY](es)?$ ]] || return 1
}

DEPLOY_DIR="${DEPLOY_DIR:-/opt/hub}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
BACKUP_DIR="${DEPLOY_DIR}/backup"
RETENTION_DAYS="${RETENTION_DAYS:-3}"
APP_CONTAINER="hub-app"

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "未找到 $DEPLOY_DIR/.env，请先创建并填写配置"
  exit 1
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE" --project-directory "$DEPLOY_DIR")
TS=$(date +%Y%m%d%H%M%S)
CONTAINER_SNAP="/tmp/db-${TS}.bak"

# 容器内快照只是中转文件，不论成功失败都在退出时清掉，避免占着容器可写层
cleanup_container_snap() {
  "${COMPOSE[@]}" exec -T app rm -f "$CONTAINER_SNAP" >/dev/null 2>&1 || true
}
trap cleanup_container_snap EXIT

# VACUUM INTO 对运行中的库做在线一致快照：镜像里没有 sqlite3 CLI，只能用 node:sqlite
SNAPSHOT_JS='
const { DatabaseSync } = require("node:sqlite");
const { rmSync } = require("node:fs");
const file = (process.env.DATABASE_URL || "./data/data.db").replace(/^file:/, "");
const target = process.argv[1];
// VACUUM INTO 不会覆盖已存在的文件：同一秒重跑时先清掉残留
rmSync(target, { force: true });
const db = new DatabaseSync(file);
db.prepare("VACUUM INTO ?").run(target);
db.close();
'
# 快照完整性：PRAGMA integrity_check 正常时只输出 ok，异常时输出问题描述
INTEGRITY_JS='
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
const row = db.prepare("PRAGMA integrity_check").get();
console.log(Object.values(row)[0]);
db.close();
'

confirm "即将执行全量备份到 ${BACKUP_DIR}（SQLite 库快照 + 应用数据），确认继续？" || {
  echo "已取消备份"
  exit 1
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "=== 1/4 SQLite 库在线快照（VACUUM INTO） ==="
DB_SNAP="${BACKUP_DIR}/db-${TS}.bak"
if ! "${COMPOSE[@]}" exec -T app node -e "$SNAPSHOT_JS" "$CONTAINER_SNAP"; then
  echo "数据库快照失败（app 容器是否运行中、卷是否可写？）"
  exit 1
fi

echo "=== 2/4 校验快照并拷出 ==="
# 先校验快照本身可读且结构完整，再拷到宿主机：拷出后的文件即恢复用的库
if ! "${COMPOSE[@]}" exec -T app node -e "$INTEGRITY_JS" "$CONTAINER_SNAP" | grep -qx ok; then
  echo "数据库快照完整性校验未通过（快照未拷出，请检查应用日志与卷状态）"
  exit 1
fi
if ! docker cp "${APP_CONTAINER}:${CONTAINER_SNAP}" "$DB_SNAP"; then
  echo "数据库快照拷贝失败，清理不完整产物"
  rm -f "$DB_SNAP"
  exit 1
fi
if [ ! -s "$DB_SNAP" ]; then
  echo "数据库快照为空，删除产物"
  rm -f "$DB_SNAP"
  exit 1
fi
chmod 600 "$DB_SNAP"

echo "=== 3/4 应用数据打包 ==="
APP_TAR="${BACKUP_DIR}/app-data-${TS}.tar.gz"
# 上传文件、日志等应用数据（volumes/app）。库文件由 1/4 的快照承载，这里排除：
# 运行中的 data.db 与 -wal / -shm 是活文件，打进包里只会得到不自洽的副本
if ! tar czf "$APP_TAR" -C "$DEPLOY_DIR/volumes" --exclude="app/data.db*" app; then
  echo "应用数据打包失败，清理不完整产物"
  rm -f "$APP_TAR"
  exit 1
fi

if ! tar tzf "$APP_TAR" > /dev/null 2>&1; then
  echo "应用数据打包校验失败，删除产物"
  rm -f "$APP_TAR"
  exit 1
fi
chmod 600 "$APP_TAR"

echo "=== 4/4 清理过期备份（保留最近 ${RETENTION_DAYS} 天） ==="
EXPIRED_DB=$(find "$BACKUP_DIR" -name "db-*.bak" -mtime +"$RETENTION_DAYS" 2>/dev/null | wc -l | tr -d ' ')
EXPIRED_APP=$(find "$BACKUP_DIR" -name "app-data-*.tar.gz" -mtime +"$RETENTION_DAYS" 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXPIRED_DB" -eq 0 ] && [ "$EXPIRED_APP" -eq 0 ]; then
  echo "无过期备份，跳过清理"
elif confirm "将删除 ${RETENTION_DAYS} 天前的备份（${EXPIRED_DB} 个 db 快照 + ${EXPIRED_APP} 个 app-data），确认？"; then
  find "$BACKUP_DIR" -name "db-*.bak" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  find "$BACKUP_DIR" -name "app-data-*.tar.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  echo "过期备份已清理"
else
  echo "跳过过期备份清理"
fi

echo ""
echo "备份完成："
ls -lh "$DB_SNAP" "$APP_TAR"
echo ""
echo "本次备份文件："
echo "  $DB_SNAP"
echo "  $APP_TAR"
