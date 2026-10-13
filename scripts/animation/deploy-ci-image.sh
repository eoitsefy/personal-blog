#!/usr/bin/env bash
# Two-phase, app-only release. Run as root; no builds, migrations, or secret output.
set -euo pipefail
umask 077
mode=${1:?prepare or promote required}
helper=$(dirname "$(readlink -f "$0")")/verify-ci-image-identity.py
release=${2:?absolute artifact directory required}
commit=${3:?full source commit required}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$release" == "/root/releases/$commit" ]] || exit 2
[[ "$mode" == prepare || "$mode" == promote ]] || exit 2
cd "$release"
[[ "$(cat commit.txt)" == "$commit" ]]
sha256sum --check SHA256SUMS
ci_id=$(cat image-id.txt)
[[ "$ci_id" =~ ^sha256:[0-9a-f]{64}$ ]]
tag="personal-blog:release-$commit"
candidate="blog-wave-candidate-${commit:0:7}"
[[ "$(docker inspect blog-app --format '{{index .Config.Labels "com.docker.compose.project"}}')" == personal-blog-web ]]
[[ "$(docker inspect blog-app --format '{{index .Config.Labels "com.docker.compose.service"}}')" == app ]]
if [[ "$mode" == prepare ]]; then
  [[ ! -e candidate-passed-image.txt ]]
  created=false
  prepared=false
  cleanup_prepare() {
    rc=$?
    trap - EXIT
    if [[ "$created" == true && "$prepared" != true ]]; then docker rm -f "$candidate" >/dev/null 2>&1 || true; fi
    exit "$rc"
  }
  trap cleanup_prepare EXIT
  trap 'exit 130' INT TERM HUP
  [[ $(df -Pk / | awk 'NR==2 {print $4}') -gt 5242880 ]]
  curl -fsS --max-time 5 http://127.0.0.1:3000/api/healthz >/dev/null
  docker load --input personal-blog.tar.gz
  expected=$(python3 "$helper" personal-blog.tar.gz "$ci_id" "$commit")
  [[ "$(docker image inspect "$expected" --format '{{.Os}}/{{.Architecture}}')" == linux/amd64 ]]
  [[ "$(docker image inspect "$expected" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$commit" ]]
  [[ "$(docker image inspect "$expected" --format '{{.Config.User}}')" == node ]]
  docker tag "$expected" "$tag"
  docker inspect blog-app --format '{{.Image}}' > previous-image-id.txt
  docker tag "$(cat previous-image-id.txt)" "personal-blog:rollback-before-${commit:0:7}"
  mapfile -t networks < <(docker inspect blog-app --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' | sed '/^$/d')
  [[ ${#networks[@]} == 1 ]]
  [[ -z "$(ss -lntH 'sport = :3001')" ]]
  docker run --detach --name "$candidate" --restart=no --init \
    --network "${networks[0]}" -p 127.0.0.1:3001:3000 \
    --env-file /root/personal-blog-web/.env --env NODE_ENV=production --env PORT=3000 \
    --memory=512m --memory-swap=512m --cpus=0.5 --pids-limit=128 \
    --cap-drop ALL --security-opt no-new-privileges:true \
    --log-opt max-size=5m --log-opt max-file=2 \
    --mount type=bind,src=/var/www/personal-blog/uploads,dst=/app/uploads,readonly "$tag"
  created=true
  ready=false
  for attempt in {1..15}; do
    if curl -fsS --max-time 4 http://127.0.0.1:3001/api/healthz >/dev/null; then ready=true; break; fi
    sleep 2
  done
  [[ "$ready" == true ]]
  curl -fsS --max-time 10 http://127.0.0.1:3001/ >/dev/null
  curl -fsS --max-time 10 http://127.0.0.1:3001/assistant >/dev/null
  [[ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/admin/working-copies/new)" == 401 ]]
  timeout 15 docker exec "$candidate" node -e 'const {PrismaClient}=require("@prisma/client");const db=new PrismaClient();db.post.count().then(()=>console.log("candidate_database_read=PASS")).catch(()=>{console.error("candidate_database_read=FAIL");process.exitCode=1}).finally(()=>db.$disconnect())'
  timeout 90 docker exec -i "$candidate" node scripts/animation/verify-release-assets.cjs < expected-assets.json
  curl -fsS --max-time 5 http://127.0.0.1:3000/api/healthz >/dev/null
  printf '%s\n' "$expected" > candidate-passed-image.txt
  prepared=true
  echo 'CANDIDATE_PASSED_NOT_PROMOTED'
else
  expected=$(python3 "$helper" personal-blog.tar.gz "$ci_id" "$commit")
  [[ "$(cat candidate-passed-image.txt)" == "$expected" ]]
  [[ "$(docker inspect "$candidate" --format '{{.Image}}')" == "$expected" ]]
  curl -fsS --max-time 5 http://127.0.0.1:3001/api/healthz >/dev/null
  previous=$(cat previous-image-id.txt)
  [[ "$(docker inspect blog-app --format '{{.Image}}')" == "$previous" ]]
  cd /root/personal-blog-web
  [[ -z "$(git status --porcelain)" ]]
  git fetch origin main
  git merge --ff-only "$commit"
  [[ "$(git rev-parse HEAD)" == "$commit" ]]
  [[ "$(docker inspect blog-app --format '{{.Config.Image}}')" == personal-blog-web-app ]]
  docker stop --time 10 "$candidate" >/dev/null
  docker rm "$candidate" >/dev/null
  rollback() {
    docker tag "$previous" personal-blog-web-app || return 1
    docker compose up -d --no-deps --no-build app || return 1
    for attempt in {1..20}; do
      if [[ "$(docker inspect blog-app --format '{{.Image}}')" == "$previous" ]] && curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null; then return 0; fi
      sleep 2
    done
    return 1
  }
  promote_complete=false
  recover_on_exit() {
    rc=$?
    trap - EXIT INT TERM HUP
    if [[ "$promote_complete" != true ]]; then
      if rollback; then echo 'FAILED_ROLLED_BACK_AND_VERIFIED' >&2; else echo 'ROLLBACK_FAILED_OPERATOR_REQUIRED' >&2; fi
      exit 1
    fi
    exit "$rc"
  }
  trap recover_on_exit EXIT
  trap 'exit 130' INT TERM HUP
  docker tag "$expected" personal-blog-web-app
  docker compose up -d --no-deps --no-build app
  ready=false
  for attempt in {1..20}; do
    if curl -fsS --max-time 4 http://127.0.0.1:3000/api/healthz >/dev/null; then ready=true; break; fi
    sleep 2
  done
  if [[ "$ready" != true ]] || ! curl -fsS --max-time 10 http://127.0.0.1:3000/ >/dev/null; then
    exit 1
  fi
  [[ "$(docker inspect blog-app --format '{{.Image}}')" == "$expected" ]]
  timeout 90 docker exec -i blog-app node scripts/animation/verify-release-assets.cjs < "$release/expected-assets.json"
  date -u +%FT%TZ > "$release/promoted-at.txt"
  promote_complete=true
  echo 'PROMOTED_PENDING_BROWSER_REVIEW'
fi
