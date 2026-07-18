#!/usr/bin/env bash
set -uo pipefail

DISK_LIMIT="${OPS_DISK_LIMIT_PERCENT:-80}"
INODE_LIMIT="${OPS_INODE_LIMIT_PERCENT:-80}"
BACKUP_MAX_AGE="${OPS_BACKUP_MAX_AGE_SECONDS:-108000}"
CERT_MIN_DAYS="${OPS_CERT_MIN_DAYS:-21}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
CERT_FILE="${OPS_CERT_FILE:-/etc/letsencrypt/live/eastherphil.cn-0001/fullchain.pem}"
ALERT_DIR="${OPS_ALERT_DIR:-/root/server-ops/alerts}"
LOG_DIR="${OPS_LOG_DIR:-/root/server-ops/logs}"
FAILURES=()
mkdir -p "$ALERT_DIR" "$LOG_DIR"
LOG="$LOG_DIR/ops-check-$(date +%F-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

fail() { FAILURES+=("$1"); echo "FAIL $1"; }
pass() { echo "PASS $1"; }
percent() { df "$1" | awk 'NR==2 {gsub(/%/,"",$5); print $5}'; }
inode_percent() { df -i "$1" | awk 'NR==2 {gsub(/%/,"",$5); print $5}'; }

disk="$(percent /)"; [[ "$disk" -lt "$DISK_LIMIT" ]] && pass "disk=${disk}%" || fail "disk=${disk}%"
inodes="$(inode_percent /)"; [[ "$inodes" -lt "$INODE_LIMIT" ]] && pass "inodes=${inodes}%" || fail "inodes=${inodes}%"
[[ "${OPS_CHECK_FORCE_FAILURE:-}" == "disk" ]] && fail "forced_disk_test"

for container in blog-app blog-postgres blog-redis; do
  state="$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo missing)"
  [[ "$state" == "running" ]] && pass "$container=$state" || fail "$container=$state"
done
curl -fsS --max-time 10 http://127.0.0.1:3000/api/healthz >/dev/null \
  && pass "healthz=200" || fail "healthz=failed"

latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'blogdb-*.sql.gz' -printf '%T@|%p\n' 2>/dev/null | sort -nr | head -n 1)"
if [[ -z "$latest" ]]; then
  fail "database_backup=missing"
else
  modified="${latest%%.*}"; age="$(( $(date +%s) - modified ))"
  file="${latest#*|}"
  gzip -t "$file" && [[ "$age" -le "$BACKUP_MAX_AGE" ]] \
    && pass "database_backup_age=${age}s" || fail "database_backup_age=${age}s_or_invalid"
fi

if [[ -r "$CERT_FILE" ]]; then
  expiry="$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2-)"
  days="$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 ))"
  [[ "$days" -ge "$CERT_MIN_DAYS" ]] && pass "certificate_days=$days" || fail "certificate_days=$days"
else
  fail "certificate=missing"
fi

if ((${#FAILURES[@]})); then
  printf '%s\n' "$(date --iso-8601=seconds) ${FAILURES[*]}" >"$ALERT_DIR/current"
  chmod 600 "$ALERT_DIR/current"
  logger -p daemon.err -t personal-blog-ops "${FAILURES[*]}"
  echo "RESULT=FAIL count=${#FAILURES[@]}"
  exit 1
fi
rm -f "$ALERT_DIR/current"
echo "RESULT=PASS"
find "$LOG_DIR" -maxdepth 1 -type f -name 'ops-check-*.log' -mtime +30 -delete
