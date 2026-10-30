#!/usr/bin/env bash
# 数据库迁移预检：对比待部署镜像内 drizzle/ 迁移文件夹与线上库内迁移记录，发现孤儿/缺失记录
# 背景：库是 SQLite 单文件（node:sqlite），迁移记录在 __drizzle_migrations（无 schema 前缀）；
# 镜像里没有 sqlite3 CLI，查询一律走 app 容器内的 node:sqlite。
# drizzle-orm migrator 的匹配语义分两种——
#   - v0 迁移表（无 name 列，升级前）：应用启动时先升级表结构，升级时凡与镜像迁移对不上的记录
#     都会直接 throw → 应用启动即崩（fail-fast）
#   - v1 迁移表（含 name 列）：按完整 name（文件夹名）匹配，孤儿被静默忽略；
#     但 name 对不上（文件夹改名）会被判定未执行 → 迁移重跑 → DDL 冲突崩溃
# 用法：
#   ./preflight-migrations.sh                    # 交互确认后对比 latest 镜像
#   ./preflight-migrations.sh -y                 # 跳过交互确认
#   TAG=v1.1.0 ./preflight-migrations.sh
#   DEPLOY_DIR=/opt/hub ./preflight-migrations.sh
set -euo pipefail

# 交互确认：仅做只读诊断，不修改任何数据；-y 用于非交互场景
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
TAG="${TAG:-latest}"
IMAGE="ghcr.io/ucode/hub:${TAG}"
APP_CONTAINER="hub-app"

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "未找到 $DEPLOY_DIR/.env，请先创建并填写配置"
  exit 1
fi

COMPOSE=(docker compose -f "$COMPOSE_FILE" --project-directory "$DEPLOY_DIR")

# 容器内读取迁移记录（只读查询，不写库）：首行为表结构（判定迁移表版本），
# 其余行为 "id<TAB>name<TAB>created_at"；name 为空时写 "-"
READ_MIGRATIONS_JS='
const { DatabaseSync } = require("node:sqlite");
const file = (process.env.DATABASE_URL || "./data/data.db").replace(/^file:/, "");
const db = new DatabaseSync(file);
const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "__drizzle_migrations");
const columns = exists ? db.prepare("SELECT name FROM pragma_table_info(?)").all("__drizzle_migrations").map((row) => row.name) : [];
console.log("columns=" + columns.join(","));
if (exists) {
  // v0 表没有 name 列（更早的 drizzle-orm 写入）：退回到不带 name 的查询，由调用侧判定无法按文件夹名比对
  const hasName = columns.includes("name");
  const sql = hasName
    ? "SELECT id, name, created_at FROM __drizzle_migrations ORDER BY created_at"
    : "SELECT id, created_at FROM __drizzle_migrations ORDER BY created_at";
  for (const row of db.prepare(sql).all()) {
    console.log([row.id, (hasName ? row.name : null) ?? "-", row.created_at].join("\t"));
  }
}
db.close();
'

# 首次部署时库还不存在，没有可比对的线上记录
if ! docker inspect "$APP_CONTAINER" > /dev/null 2>&1; then
  echo "未发现 ${APP_CONTAINER} 容器：首次部署无需预检（全新库随首次启动创建）"
  exit 0
fi
if [ "$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null || echo false)" != "true" ]; then
  echo "${APP_CONTAINER} 未运行，读不到线上迁移记录"
  echo "  升级前预检请先启动旧版本：docker compose up -d app"
  exit 1
fi

confirm "将拉取镜像 ${IMAGE} 并读取线上迁移记录（只读诊断，不修改数据），确认继续？" || {
  echo "已取消预检"
  exit 1
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== 1/4 提取待部署镜像内迁移文件夹（${IMAGE}） ==="
docker run --rm --entrypoint ls "$IMAGE" /app/drizzle > "$TMP_DIR/image-names.txt"
echo "镜像内迁移文件夹数: $(wc -l < "$TMP_DIR/image-names.txt" | tr -d ' ')"
# 完整文件夹名：迁移表为 v1 时按 name 匹配
sort -u "$TMP_DIR/image-names.txt" > "$TMP_DIR/image-names-sorted.txt"

echo "=== 2/4 读取线上迁移记录（app 容器运行中即读，只读） ==="
RAW="$TMP_DIR/db-migrations.raw"
if ! "${COMPOSE[@]}" exec -T app node -e "$READ_MIGRATIONS_JS" > "$RAW" 2> "$TMP_DIR/read.err"; then
  echo "读取失败：库文件不可读或路径不对（DATABASE_URL 见 docker-compose.yml）"
  sed "s/^/  /" "$TMP_DIR/read.err" | head -5
  exit 1
fi
COLUMNS="$(sed -n 's/^columns=//p' "$RAW" | head -1)"
grep -v '^columns=' "$RAW" > "$TMP_DIR/db-migrations.txt" || true
if [ ! -s "$TMP_DIR/db-migrations.txt" ]; then
  echo "警告：未读到迁移记录（全新库或迁移表为空），部署后由 bootstrap 执行全部迁移"
fi
echo "线上迁移记录数: $(wc -l < "$TMP_DIR/db-migrations.txt" | tr -d ' ')"

# 迁移表都不存在：全新库，没有可比对的历史
echo "=== 3/4 孤儿记录（库中有而镜像无） ==="
echo ""
if [ -z "$COLUMNS" ]; then
  echo "  无迁移表：线上是全新库（或库文件刚被重建），部署后由 bootstrap 执行全部迁移"
  echo ""
  echo "预检完成。"
  exit 0
fi

# 迁移表版本：v1 含 name 列（按文件夹名比对）；缺 name 列属 v0 旧格式，启动升级时孤儿会直接报错
case ",${COLUMNS}," in
  *,name,*) HAS_NAME=1 ;;
  *) HAS_NAME=0 ;;
esac

if [ "$HAS_NAME" -eq 0 ]; then
  echo "  无法比对：线上迁移表不是 v1 格式（缺 name 列）。现有记录："
  awk -F'\t' '{print "  id=" $1 "  created_at=" $3}' "$TMP_DIR/db-migrations.txt"
  echo ""
  echo "⚠️  该形态只会来自更早的 drizzle-orm：应用下次启动会把迁移表升级到 v1，"
  echo "    升级时凡与镜像迁移对不上的记录都会直接报错、启动即崩；请人工核对后再部署。"
  echo ""
  echo "预检完成（迁移表形态异常，未能完成比对）。"
  exit 0
fi

# name 为空的记录 migrator 同样跳过，因此不参与比对，只提示人工确认
NULL_NAMES=$(awk -F'\t' '$2 == "-"' "$TMP_DIR/db-migrations.txt" | wc -l | tr -d ' ')
if [ "$NULL_NAMES" -ne 0 ]; then
  echo "  警告：${NULL_NAMES} 条记录 name 为空（v0 遗留），migrator 会跳过它们，请人工核对"
  echo ""
fi

awk -F'\t' '$2 != "-" {print $1 "\t" $2}' "$TMP_DIR/db-migrations.txt" > "$TMP_DIR/db-rows.txt"
cut -f2 "$TMP_DIR/db-rows.txt" | sort -u > "$TMP_DIR/db-keys.txt"
comm -23 "$TMP_DIR/db-keys.txt" "$TMP_DIR/image-names-sorted.txt" > "$TMP_DIR/orphans.txt" || true

if [ -s "$TMP_DIR/orphans.txt" ]; then
  while read -r key; do
    id=$(awk -F'\t' -v k="$key" '$2 == k {print $1}' "$TMP_DIR/db-rows.txt" | head -1)
    echo "  id=$id  key=$key  (镜像内无对应迁移文件夹)"
    echo "  => 修复 SQL（人工确认后执行）：DELETE FROM __drizzle_migrations WHERE id = $id;"
  done < "$TMP_DIR/orphans.txt"
  echo ""
  echo "⚠️  迁移表为 v1：孤儿记录会被 migrator 静默忽略，通常无需处理；"
  echo "    若属迁移文件夹改名遗留（同时间戳不同后缀），会导致该迁移被判定未执行而重跑、DDL 冲突崩溃，建议同步删除。"
else
  echo "  无"
fi

echo ""
echo "=== 4/4 缺失记录（镜像有而库中无，即本次待执行的新迁移） ==="
echo ""
comm -13 "$TMP_DIR/db-keys.txt" "$TMP_DIR/image-names-sorted.txt" > "$TMP_DIR/missing.txt" || true
if [ -s "$TMP_DIR/missing.txt" ]; then
  while read -r key; do
    echo "  $key  (部署后由 bootstrap 自动执行)"
  done < "$TMP_DIR/missing.txt"
else
  echo "  无"
fi

echo ""
echo "预检完成。孤儿记录按提示判断；缺失记录为本次待执行迁移。"
