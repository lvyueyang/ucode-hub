#!/usr/bin/env bash
# 从 backup.sh 产物恢复：SQLite 库快照（db-<ts>.bak）+ 应用数据（app-data-<ts>.tar.gz）
# 破坏性操作：默认要求交互确认，非交互/脚本调用必须显式加 -f 才执行。
# 用法：
#   ./restore.sh db <backup/db-20260822090000.bak>           # 仅恢复数据库
#   ./restore.sh app <backup/app-data-20260822090000.tar.gz> # 仅恢复应用数据
#   ./restore.sh all <20260822090000>                        # 同时恢复两者（按时间戳前缀匹配）
#   ./restore.sh -f {db|app|all} <备份文件|时间戳前缀>         # 跳过交互确认
# 注意：
#   - SQLite 是单文件库，库文件被替换期间应用必须停止写入，脚本会自动 stop app，
#     恢复完成后由运维手动 start app（进程持有旧 inode 的句柄继续写，等于把数据写丢）
#   - 应用数据恢复为 tar 解包覆盖同名文件，**备份后新增的文件不会被清除**
set -euo pipefail

# 破坏性操作强制确认：默认必须人工输入 y；-f 仅用于明确意图的非交互执行
FORCE=0
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    -f|--force) FORCE=1 ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

confirm() {
  [ "$FORCE" -eq 1 ] && return 0
  local ans
  read -r -p "$1 [y/N] " ans || return 1
  [[ "$ans" =~ ^[yY](es)?$ ]] || return 1
}

DEPLOY_DIR="${DEPLOY_DIR:-/opt/hub}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
BACKUP_DIR="${DEPLOY_DIR}/backup"
APP_CONTAINER="hub-app"
APP_DATA_DIR="${DEPLOY_DIR}/volumes/app"

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "未找到 $DEPLOY_DIR/.env，请先创建并填写配置"
  exit 1
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE" --project-directory "$DEPLOY_DIR")

# 库文件完整性：PRAGMA integrity_check 正常时只输出 ok（恢复后用一次性容器复检）
INTEGRITY_JS='const { DatabaseSync } = require("node:sqlite");const db = new DatabaseSync(process.argv[1]);console.log(Object.values(db.prepare("PRAGMA integrity_check").get())[0]);db.close();'

# 容器以 nodejs(1001) 运行：属主不对齐时库文件与上传目录不可写，应用启动即 fail-fast。
# 只对齐属主，不用 chmod 777（放宽权限会把库文件暴露给宿主机上其他账号）。
align_owner() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "警告：当前用户非 root，跳过属主对齐（应为 1001:1001）：$*"
    return 0
  fi
  chown "$@"
}

# 库文件是单文件：替换前必须停写，否则应用写到已删除的 inode 上，恢复等于没恢复
stop_app() {
  local running
  running="$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null || echo false)"
  [ "$running" = "true" ] || return 0
  echo "停止应用容器（恢复期间禁止写入）..."
  "${COMPOSE[@]}" stop app > /dev/null
}

usage() {
  echo "用法：$0 [-f] {db|app|all} <备份文件|时间戳前缀>"
  echo "  例：$0 all 20260822090000"
  echo "  例：$0 db /opt/hub/backup/db-20260822090000.bak"
  echo "  破坏性恢复默认需交互确认，非交互场景加 -f 跳过"
  exit 1
}

[ "${#POSITIONAL[@]}" -ge 2 ] || usage
MODE="${POSITIONAL[0]}"
ARG="${POSITIONAL[1]}"

restore_db() {
  local snap="$1"
  [ -f "$snap" ] || { echo "备份文件不存在：$snap"; exit 1; }
  echo "恢复数据库：$snap"
  confirm "将用备份覆盖 ${APP_DATA_DIR}/data.db（含 -wal / -shm），此操作不可逆！确认？" || {
    echo "已取消恢复"
    exit 1
  }
  stop_app
  # 整文件替换：先清掉旧库三件套，避免残留的 -wal 作用在新库上
  rm -f "${APP_DATA_DIR}/data.db"
  rm -f "${APP_DATA_DIR}/data.db-wal"
  rm -f "${APP_DATA_DIR}/data.db-shm"
  cp "$snap" "${APP_DATA_DIR}/data.db"
  align_owner 1001:1001 "${APP_DATA_DIR}/data.db"
  # 快照在备份时已校验过；这里对落盘后的文件复检，失败只告警——此时应用已停，不该再阻断收尾
  if ! "${COMPOSE[@]}" run --rm --no-deps -T app node -e "$INTEGRITY_JS" /app/data/data.db 2> /dev/null | grep -qx ok; then
    echo "警告：恢复后的库文件未通过完整性校验，请核对备份文件来源"
  fi
  echo "数据库恢复完成。启动应用：docker compose start app"
}

restore_app() {
  local tar="$1"
  [ -f "$tar" ] || { echo "备份文件不存在：$tar"; exit 1; }
  echo "恢复应用数据：$tar"
  confirm "将覆盖 ${APP_DATA_DIR} 下同名文件（不含 SQLite 库文件），确认？" || {
    echo "已取消恢复"
    exit 1
  }
  stop_app
  tar xzf "$tar" -C "$DEPLOY_DIR/volumes"
  # 解包以 root 创建的文件容器内写不了；整目录对齐，属主与容器内 nodejs(1001) 一致
  align_owner -R 1001:1001 "$APP_DATA_DIR"
  echo "应用数据恢复完成。启动应用：docker compose start app"
}

case "$MODE" in
  db)
    restore_db "$ARG"
    ;;
  app)
    restore_app "$ARG"
    ;;
  all)
    restore_db "${BACKUP_DIR}/db-${ARG}.bak"
    restore_app "${BACKUP_DIR}/app-data-${ARG}.tar.gz"
    ;;
  *)
    usage
    ;;
esac
