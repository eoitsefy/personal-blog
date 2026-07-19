#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

UPLOAD_ROOT="${UPLOAD_ROOT_HOST:-/var/www/personal-blog/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${UPLOAD_BACKUP_RETENTION_DAYS:-14}"
LOCK_FILE="${UPLOAD_BACKUP_LOCK_FILE:-/run/lock/personal-blog-upload-backup.lock}"
LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"
TS="$(date +%F-%H%M%S)"
FINAL="$BACKUP_DIR/uploads-$TS.tar.gz"
TMP="$FINAL.tmp"

test -d "$UPLOAD_ROOT"
mkdir -p "$BACKUP_DIR" "$(dirname "$LOCK_FILE")"
touch "$LOG"
chmod 600 "$LOG"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "[$(date '+%F %T')] upload backup skipped: lock held" >>"$LOG"; exit 0; }
trap 'rm -f "$TMP"' EXIT

tar -C "$UPLOAD_ROOT" -czf "$TMP" .
tar -tzf "$TMP" >/dev/null
chmod 600 "$TMP"
mv "$TMP" "$FINAL"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uploads-*.tar.gz' \
  -mtime "+$RETENTION_DAYS" -delete
echo "[$(date '+%F %T')] upload backup succeeded file=$(basename "$FINAL") bytes=$(stat -c %s "$FINAL")" | tee -a "$LOG"
