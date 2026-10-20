#!/usr/bin/env bash
# Only for an isolated CI runner and its disposable PostgreSQL service.
set -euo pipefail
[[ "${CI:-}" == "true" ]] || { echo 'CI=true is required' >&2; exit 1; }
node <<'JS'
const assert = require('node:assert/strict');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.ok(url.pathname.endsWith('_test'), 'Disposable _test database required');
JS

image=personal-blog:ci
name="blog-container-ci-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-0}"
[[ "$(docker image inspect "$image" --format '{{.Config.User}}')" == node ]]

docker run --rm --network host --env DATABASE_URL "$image" \
  node node_modules/prisma/build/index.js migrate deploy

docker run --rm --network host --env DATABASE_URL -i "$image" node <<'JS'
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const db = new PrismaClient();
(async () => {
  try {
    assert.equal(process.getuid(), 1000);
    assert.match(process.version, /^v24\./);
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#f4c343' } }).png().toBuffer();
    assert.equal((await sharp(image).metadata()).format, 'png');
    await db.postWorkingCopy.count();
    await db.postRevision.count();
    console.log('container_native_modules_and_database=passed');
  } finally { await db.$disconnect(); }
})().catch(() => { console.error('Container native module/database verification failed'); process.exitCode = 1; });
JS

cleanup() {
  docker logs "$name" 2>&1 || true
  docker rm --force "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker run --detach --name "$name" --network host --env DATABASE_URL \
  --memory=512m --memory-swap=512m --cpus=0.5 --pids-limit=128 \
  --env MAP_PROVIDER=none --env AI_ASSISTANT_ENABLED=false --env UPLOAD_ROOT=/app/uploads \
  --cap-drop ALL --security-opt no-new-privileges:true "$image" >/dev/null

curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-all-errors \
  --max-time 5 http://127.0.0.1:3000/api/healthz |
  node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{if(JSON.parse(s).ok!==true)process.exit(1)})'
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/ >/dev/null
[[ "$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3000/api/admin/working-copies/new)" == 401 ]]
echo 'container_http_and_auth_boundary=passed'

[[ "$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3000/admin/assistant/actions)" == 307 ]]
[[ "$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3000/dev/assistant-h3/resources)" == 404 ]]
echo 'assistant_resource_page_auth_and_dev_boundary=passed'

node <<'JS' | docker exec -i "$name" node scripts/animation/verify-release-assets.cjs
const fs = require('node:fs');
const releases = [['h3','h3-v7'], ['h3-mobile','h3-mobile-v5']].map(([kind,directory]) => {
  const manifest = JSON.parse(fs.readFileSync(`src/lib/assistant/releases/${directory}/manifest.json`, 'utf8'));
  const assets = [...Object.values(manifest.assets), ...Object.values(manifest.stills)].map(asset => ({
    src:asset.src, sha256:asset.sha256, width:asset.width ?? manifest.width, height:asset.height ?? manifest.height,
  }));
  return {kind, version:manifest.version, assets};
});
process.stdout.write(JSON.stringify({releases}));
JS

docker exec -i "$name" node < scripts/verify-login-throttle.cjs
