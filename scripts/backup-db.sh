#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-blog-postgres}"
PG_USER="${PG_USER:-blog}"
PG_DATABASE="${PG_DATABASE:-blogdb}"
LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/personal-blog-db-backup.lock}"
LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"
TS="$(date +%F-%H%M%S)"
FINAL="$BACKUP_DIR/blogdb-$TS.sql.gz"
TMP_SQL="$BACKUP_DIR/.blogdb-$TS.sql.tmp"
TMP_GZ="$FINAL.tmp"

mkdir -p "$BACKUP_DIR" "$(dirname "$LOCK_FILE")"
touch "$LOG"
chmod 600 "$LOG"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "[$(date '+%F %T')] backup skipped: lock held" >>"$LOG"; exit 0; }
trap 'rm -f "$TMP_SQL" "$TMP_GZ"' EXIT

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
log "start database backup"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DATABASE" \
  --no-owner --no-privileges >"$TMP_SQL"
test -s "$TMP_SQL"
gzip -c "$TMP_SQL" >"$TMP_GZ"
gzip -t "$TMP_GZ"
chmod 600 "$TMP_GZ"
mv "$TMP_GZ" "$FINAL"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'blogdb-*.sql.gz' \
  -mtime "+$RETENTION_DAYS" -delete
log "database backup succeeded file=$(basename "$FINAL") bytes=$(stat -c %s "$FINAL")"
