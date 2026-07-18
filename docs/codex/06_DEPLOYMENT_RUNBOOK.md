# Deployment Runbook

> Production commands are templates derived from the documented environment. Verify service names, paths, environment files, and Compose configuration before execution.

## Environment

- Server project: `/root/personal-blog-web`
- Domain: `eastherphil.cn`
- Nginx -> app: `127.0.0.1:3000`
- Containers: `blog-app`, `blog-postgres`, `blog-redis`
- Backup directory: `/root/backups`
- Upload directory: `/var/www/personal-blog/uploads`
- Operations logs: `/root/server-ops/logs`

## Pre-deployment checklist

```bash
cd /root/personal-blog-web
git status
git remote -v
git fetch --all --prune
git log --oneline --decorate -10
df -h
docker compose ps
sudo nginx -t
sudo ss -lntp
sudo crontab -l
tail -n 100 /root/backups/backup.log
```

Confirm:

- working tree is clean;
- target commit is reviewed;
- only intended ports are exposed;
- database backup is recent;
- upload directory is mounted/preserved;
- certificate is currently valid;
- the previous application image/tag or commit is recorded.
- `POSTGRES_PASSWORD` and `DATABASE_URL` contain non-placeholder production values. Phase 4B sessions are opaque, hashed database records and no longer require `JWT_SECRET`.
- `UPLOAD_ROOT=/app/uploads`, `MAX_UPLOAD_BYTES` is an approved positive per-file limit, `MAX_MEDIA_STORAGE_BYTES` is an approved positive total quota, and `/var/www/personal-blog/uploads` exists with write access for the application container.
- Phase 5B uses `MAP_PROVIDER=amap` plus a domain-restricted `AMAP_JS_API_KEY`. The matching AMap `securityJsCode` must exist only in a root-readable Nginx snippet, never in Git, `.env`, application logs, shell history, or browser code.
- the Phase 1B migration has been reviewed; it adds taxonomy, login-throttle, and soft-delete columns without dropping content.
- the Phase 2 migration has been reviewed; it adds optional asset filename/dimension metadata and an asset recycle-bin index without dropping media records.
- the Phase 4B migration has been reviewed; it converts roles to a closed enum, adds account status and database sessions, and intentionally signs administrators out once during deployment.
- the Phase 4B lifecycle migration has been reviewed; invitation and password-reset tokens are random, stored only as hashes, expire, and can be used once.
- the Phase 4B comments migration has been reviewed; it adds comment/report/rate-limit tables plus a non-destructive `commentsLocked` post flag, with post/comment cleanup enforced by foreign keys.

## Manual backup before a risky release

Prefer the existing tested script:

```bash
/root/personal-blog-web/scripts/backup-db.sh
```

Then verify the newest file:

```bash
ls -lhtr /root/backups | tail
gzip -t /root/backups/<newest-backup>.sql.gz
```

Do not place database dumps in the Git repository.

## Deployment sequence

A conservative flow:

```bash
cd /root/personal-blog-web
git fetch origin
git checkout main
git pull --ff-only origin main
```

Record the deployment commit:

```bash
git rev-parse HEAD
```

Build and inspect using the actual Compose service names:

```bash
docker compose build app
```

If Prisma migrations exist, inspect them before deployment and run the repository-approved command. A common pattern is:

```bash
docker compose run --rm app npx prisma migrate deploy
```

Do not run `prisma migrate dev` in production.

For a first deployment, create the administrator after migrations with `npm run admin:create`. Supply `ADMIN_EMAIL` and `ADMIN_PASSWORD` through an approved temporary secret mechanism, and remove the plaintext password from the environment immediately afterward. Re-running the command rotates the password for the same administrator; it refuses to create a second administrator.

Start/update services:

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=200 app
```

Validate Nginx and reload only when configuration changed:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Post-deployment checks

```bash
curl -I http://eastherphil.cn
curl -I https://eastherphil.cn
curl -fsS https://eastherphil.cn/api/healthz

docker compose ps
docker compose logs --tail=200 app
sudo tail -n 100 /var/log/nginx/error.log
```

Functional checks:

- home and post pages load;
- HTTP redirects to HTTPS;
- admin login works;
- create/edit/preview/publish flow works;
- keyword/category/tag filters return only published, non-deleted posts;
- moving a test draft to the recycle bin and restoring it leaves it as a draft;
- a valid JPEG/PNG/WebP upload is stored and served from a stable `/uploads/...` URL;
- an invalid or oversized upload is rejected, a referenced image cannot be deleted, and an unreferenced image can complete the recycle-bin restore/purge lifecycle;
- database and cache operations succeed;
- AI feature flag is disabled if provider connectivity is not healthy;
- no repeated errors appear in application or Nginx logs.

## Application rollback

## Phase 5A deployment gate

Before deploying Phase 5A:

- back up PostgreSQL and verify the gzip archive;
- confirm the target commit contains `prisma/migrations/20260718150000_phase_5a_places/migration.sql`;
- build the new application image before switching the running container;
- run `npx prisma migrate deploy` once from the new image;
- verify the `PlacePrivacy` and `CoordinateSystem` enums plus the `Place` and `PostPlace` tables;
- create one test place for each privacy level and associate them with a disposable published article;
- verify `/api/places` returns the public coordinates for `EXACT`, the separate public coordinates for `APPROXIMATE`, no coordinates for `CITY_ONLY`, and no record for `HIDDEN`;
- verify draft-only, soft-deleted-place and soft-deleted-post relationships are absent;
- verify the administrator can edit, recycle and restore a place, while permanent deletion is blocked until article relations are removed;
- verify a place cover increments media references and cannot be deleted while referenced;
- verify `/places`, its search form, article links, mobile layout and the public article place links through Nginx.

The migration is additive. Application rollback may retain the schema, but database restoration or a forward fix is required before considering any destructive schema reversal. Phase 5A does not require a map-provider key.

## Phase 5B AMap deployment gate

Phase 5B has no database migration. Before deployment:

- create an AMap Web JS API key and matching `securityJsCode` in the AMap console;
- restrict the browser key to the approved production domains, including `eastherphil.cn` and `www.eastherphil.cn` if both remain public;
- configure usage/remaining-quota alerts in the AMap console;
- set `MAP_PROVIDER=amap` and `AMAP_JS_API_KEY=<domain-restricted-browser-key>` in the production `.env`;
- create `/etc/nginx/snippets/personal-blog-amap-secret.conf` as root with `set $amap_security_jscode "...";`, owner `root:root`, and mode `600`;
- add the two locations from `deploy/nginx/amap-service.conf.example` to the HTTPS server block, keeping the styles location first;
- run `nginx -t` and reload Nginx without printing the secret-bearing full configuration to deployment logs;
- build the image after the CSP change and recreate only the application container.

Production acceptance must verify:

- `/api/healthz` reports `features.map.provider=amap` and `enabled=true` without returning either credential;
- `/places` loads `https://webapi.amap.com/loader.js`, while AMap service calls use the same-origin `/_AMapService` proxy;
- GCJ-02 points plot directly; WGS84 and BD-09 public points convert and plot in batches of no more than 40;
- exact and approximate places use only their public serialized coordinates, city-only places remain text-only, and hidden/draft/deleted records never reach the map;
- clustered markers work on desktop and mobile and can move the reader to the equivalent text card;
- blocking the AMap script or disabling `MAP_PROVIDER` leaves the local coordinate preview, search and text list usable;
- application logs contain bounded `map_client_event` records for ready/error states without coordinates, names, free text or credentials;
- CSP has no unexpected violations and Nginx access/error logs do not expose `jscode`.

Rollback removes or disables `MAP_PROVIDER=amap`, restores the previous application image, and may leave the inert Nginx proxy locations in place. Remove the proxy and secret snippet if the provider is abandoned. Rotate the Web JS API key and `securityJsCode` immediately if either was exposed.

Before each release, record:

- previous Git commit;
- previous image tag/digest;
- migration status;
- backup filename.

If rollback does not require reversing a destructive migration:

```bash
cd /root/personal-blog-web
git checkout <previous-known-good-commit>
docker compose build app
docker compose up -d
```

Prefer immutable image tags when the Compose workflow supports them. Verify all health and functional checks after rollback.

Do not automatically reverse database migrations. Restore or write a forward-fix only after understanding data impact.

## Phase 6A text-assistant deployment gate

Deploy the additive `20260718210000_phase_6a_text_assistant` migration with the assistant disabled first. Confirm ordinary article creation, publishing, unpublishing, deletion, restoration, public browsing and `/api/healthz` before adding any provider credential.

Production enablement requires all of the following:

- select a reachable OpenAI-compatible HTTPS gateway and exact generation/embedding model aliases;
- set `AI_ASSISTANT_ENABLED=true`, `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_API_KEY`, `AI_GENERATION_MODEL`, optional `AI_EMBEDDING_MODEL`, and a private random `AI_ACTOR_SALT` only in the server environment;
- set explicit timeout, question/output, retrieval, rate-limit, daily request, concurrency and circuit-breaker limits;
- call authenticated `POST /api/admin/assistant/reindex` and record its post/chunk/embedding counts;
- verify DNS, TLS and provider authentication from the application container without printing the API key;
- test a grounded answer, valid source links, no-evidence behavior, 429 throttling, daily budget exhaustion, timeout, circuit opening and provider outage;
- confirm drafts, recycle-bin posts and admin-only data never appear in chunks, requests, answers or source lists;
- confirm `/api/healthz` reports only non-secret assistant configuration metadata.

Keep `AI_ASSISTANT_ENABLED=false` if any gate fails. Application rollback may retain the additive AI tables and chunks; disabling the flag immediately removes the public provider call path without affecting publishing or browsing. Rotate the provider key if it appears in a shell transcript, log, browser bundle or repository.

## Database restore drill

Always restore to a temporary database first.

High-level sequence:

1. Select and verify a `.sql.gz` backup.
2. Create an isolated temporary database/container.
3. Decompress and restore the dump.
4. Run table-count and application-level validation.
5. Record duration, errors, and backup filename.
6. Remove the temporary environment after evidence is saved.

A production restore requires:

- current database snapshot first;
- approved downtime/maintenance plan;
- verified target backup;
- explicit rollback/abort criteria.

## Upload preservation

Before changing volumes or paths:

```bash
sudo ls -la /var/www/personal-blog/uploads
sudo du -sh /var/www/personal-blog/uploads
```

Verify ownership and that the application can write only to the intended directory. Never mount the entire `/root` directory into Nginx or the application for uploads.

The HTTPS Nginx server should cap request bodies slightly above `MAX_UPLOAD_BYTES` (the checked-in configuration uses `10m` for the default 8 MiB application limit) and serve `/uploads/` from `/var/www/personal-blog/uploads/` with directory listing disabled.

## Routine operations

Documented cron:

```cron
59 19 * * * "/root/.acme.sh"/acme.sh --cron --home "/root/.acme.sh" > /dev/null
30 3 * * * /root/personal-blog-web/scripts/backup-db.sh
0 6 * * * /root/server-ops/scripts/daily-check.sh
```

Weekly checks:

- container state and restart count;
- disk and inode use;
- backup continuity and gzip integrity;
- certificate expiry and renewal logs;
- Nginx/app error trends;
- unexpected listeners and processes;
- upload growth.

Monthly checks:

- database restore drill;
- application rollback drill;
- security group/UFW review;
- dependency and base-image updates;
- off-site backup verification after implemented.

## Incident triage

Collect evidence before restarting repeatedly:

```bash
date
df -h
free -h
uptime
sudo ss -lntp
docker compose ps
docker compose logs --tail=500 app
sudo tail -n 300 /var/log/nginx/error.log
sudo journalctl -u docker --since "30 minutes ago"
```

For AI-only failures, disable the AI feature flag or provider adapter and preserve core blog availability.

## Security cautions

- Do not expose 3000, 5432, or 6379 publicly.
- Do not commit `.env`, certificates, private keys, dumps, or upload content.
- Do not disable TLS verification.
- Do not change SSH/root access until a tested alternative administrator session is open.
- Treat external requests and indexed content as untrusted.
- Review suspicious methods and payloads; public scan traffic is already present.
