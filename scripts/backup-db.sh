#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/root/backups"
TS=$(date +%F-%H%M%S)
FILE="$BACKUP_DIR/blogdb-$TS.sql"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

{
  echo "[$(date '+%F %T')] start backup -> $FILE"
  docker exec -t blog-postgres pg_dump -U blog -d blogdb > "$FILE"
  gzip -f "$FILE"
  find "$BACKUP_DIR" -name "blogdb-*.sql.gz" -mtime +7 -delete
  echo "[$(date '+%F %T')] success backup -> ${FILE}.gz"
} >> "$LOG" 2>&1
