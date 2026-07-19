#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
LOG_DIR="${RESTORE_LOG_DIR:-/root/server-ops/logs/restore-drill}"
PG_CONTAINER="${PG_CONTAINER:-blog-postgres}"
PG_USER="${PG_USER:-blog}"
PROD_DB="${PROD_DB:-blogdb}"
TMP_DB="${TMP_DB:-blog_restore_drill_$(date +%s)}"
LOCK_FILE="${RESTORE_LOCK_FILE:-/run/lock/personal-blog-restore-drill.lock}"

[[ "$TMP_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || {
  echo "[ERROR] invalid temporary database name"
  exit 1
}
mkdir -p "$LOG_DIR" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "[ERROR] another restore drill is running"; exit 1; }

TS="$(date +'%F-%H%M%S')"
LOG_FILE="$LOG_DIR/restore-drill-$TS.log"
exec > >(tee -a "$LOG_FILE") 2>&1

cleanup() {
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TMP_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" \
    -c "DROP DATABASE IF EXISTS \"${TMP_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[INFO] restore drill started at $TS"
echo "[INFO] container=$PG_CONTAINER production=$PROD_DB temporary=$TMP_DB"
LATEST_BACKUP="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'blogdb-*.sql.gz' -printf '%T@|%p\n' | sort -nr | sed -n '1p' | cut -d'|' -f2-)"
[[ -n "$LATEST_BACKUP" ]] || { echo "[ERROR] no backup found"; exit 1; }
gzip -t "$LATEST_BACKUP"
echo "[INFO] backup=$(basename "$LATEST_BACKUP") bytes=$(stat -c %s "$LATEST_BACKUP")"

docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" \
  -c "SELECT current_user, current_database();"
START="$(date +%s)"
cleanup
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PROD_DB" \
  -c "CREATE DATABASE \"${TMP_DB}\";"
gunzip -c "$LATEST_BACKUP" | docker exec -i "$PG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$TMP_DB"

for table in User Post Asset PostAssetRef; do
  docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" \
    -d "$TMP_DB" -c "SELECT COUNT(*) AS \"${table}_count\" FROM \"${table}\";"
done
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$TMP_DB" -Atc \
  "SELECT CASE WHEN to_regclass('\"User\"') IS NOT NULL AND to_regclass('\"Post\"') IS NOT NULL THEN 'schema_ok' ELSE 'schema_missing' END;" \
  | grep -qx schema_ok

END="$(date +%s)"
echo "[INFO] restore drill succeeded duration=$((END-START))s"
echo "[INFO] temporary database will be removed"
echo "[INFO] log=$LOG_FILE"
