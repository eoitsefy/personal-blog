#!/usr/bin/env bash
set -Eeuo pipefail

LOG_DIR="${OPS_LOG_DIR:-/root/server-ops/logs}"
LOCK_FILE="${DOCKER_MAINTENANCE_LOCK:-/run/lock/personal-blog-docker-maintenance.lock}"
BUILDER_RETENTION="${BUILDER_RETENTION:-72h}"
IMAGE_RETENTION="${IMAGE_RETENTION:-168h}"
mkdir -p "$LOG_DIR" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0
LOG="$LOG_DIR/docker-maintenance-$(date +%F-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

echo "== Docker maintenance started at $(date --iso-8601=seconds) =="
df -h / /var/lib/docker
docker system df
docker builder prune -af --filter "until=$BUILDER_RETENTION"
docker image prune -af --filter "until=$IMAGE_RETENTION"
docker container prune -f --filter "until=$IMAGE_RETENTION"
docker system df
df -h / /var/lib/docker
find "$LOG_DIR" -maxdepth 1 -type f -name 'docker-maintenance-*.log' -mtime +30 -delete
echo "== Docker maintenance completed at $(date --iso-8601=seconds) =="
