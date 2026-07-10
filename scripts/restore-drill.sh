#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/root/backups"
LOG_DIR="/root/server-ops/logs/restore-drill"
PG_CONTAINER="${PG_CONTAINER:-blog-postgres}"
PG_USER="${PG_USER:-blog}"
PROD_DB="${PROD_DB:-blogdb}"
TMP_DB="${TMP_DB:-blog_restore_drill}"

mkdir -p "$LOG_DIR"
TS="$(date +'%F-%H%M%S')"
LOG_FILE="$LOG_DIR/restore-drill-$TS.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[INFO] Start restore drill at $TS"
echo "[INFO] container=$PG_CONTAINER user=$PG_USER prod_db=$PROD_DB tmp_db=$TMP_DB"

LATEST_BACKUP="$(ls -1t "$BACKUP_DIR"/blogdb-*.sql.gz | head -n 1 || true)"
if [[ -z "$LATEST_BACKUP" ]]; then
  echo "[ERROR] no backup found in $BACKUP_DIR"
  exit 1
fi
echo "[INFO] backup=$LATEST_BACKUP"

# 前置连通性检查
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" -c "SELECT current_user, current_database();"

START=$(date +%s)

# 断开临时库连接并重建
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TMP_DB}' AND pid <> pg_backend_pid();"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" -c "DROP DATABASE IF EXISTS \"${TMP_DB}\";"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" -c "CREATE DATABASE \"${TMP_DB}\";"

# 恢复
gunzip -c "$LATEST_BACKUP" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TMP_DB"

# 校验
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TMP_DB" -c "SELECT COUNT(*) AS post_count FROM \"Post\";"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TMP_DB" -c "SELECT COUNT(*) AS asset_count FROM \"Asset\";"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TMP_DB" -c "SELECT COUNT(*) AS ref_count FROM \"PostAssetRef\";"

END=$(date +%s)
echo "[INFO] restore drill success, cost=$((END-START))s"
echo "[INFO] log=$LOG_FILE"
