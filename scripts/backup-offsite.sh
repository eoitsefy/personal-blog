#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG="${OFFSITE_BACKUP_CONFIG:-/etc/personal-blog/offsite-backup.env}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
LOCK_FILE="${OFFSITE_BACKUP_LOCK:-/run/lock/personal-blog-offsite-backup.lock}"
LOG="${OFFSITE_BACKUP_LOG:-$BACKUP_DIR/offsite-backup.log}"
[[ -r "$CONFIG" ]] || { echo "off-site backup config is missing: $CONFIG"; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"
: "${OFFSITE_REMOTE:?OFFSITE_REMOTE is required}"
command -v rclone >/dev/null || { echo "rclone is required"; exit 1; }

mkdir -p "$BACKUP_DIR" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0
touch "$LOG"; chmod 600 "$LOG"
TS="$(date +%F-%H%M%S)"
MANIFEST="$BACKUP_DIR/offsite-manifest-$TS.sha256"
trap 'rm -f "$MANIFEST"' EXIT

DB="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'blogdb-*.sql.gz' -printf '%T@|%p\n' | sort -nr | head -n 1 | cut -d'|' -f2-)"
UPLOADS="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uploads-*.tar.gz' -printf '%T@|%p\n' | sort -nr | head -n 1 | cut -d'|' -f2-)"
[[ -n "$DB" && -n "$UPLOADS" ]] || { echo "database or upload backup is missing"; exit 1; }
gzip -t "$DB"; tar -tzf "$UPLOADS" >/dev/null
(cd "$BACKUP_DIR" && sha256sum "$(basename "$DB")" "$(basename "$UPLOADS")") >"$MANIFEST"

for file in "$DB" "$UPLOADS" "$MANIFEST"; do
  rclone copyto "$file" "$OFFSITE_REMOTE/$(hostname)/$(basename "$file")" \
    --retries 3 --low-level-retries 5
done
rclone check "$BACKUP_DIR" "$OFFSITE_REMOTE/$(hostname)" \
  --include "$(basename "$DB")" --include "$(basename "$UPLOADS")" --one-way
echo "[$(date '+%F %T')] off-site backup succeeded database=$(basename "$DB") uploads=$(basename "$UPLOADS")" | tee -a "$LOG"
