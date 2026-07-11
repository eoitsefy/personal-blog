# Current State

> This is a consolidated snapshot. Verify live systems before making decisions.

## Repository and Git

- `[VERIFIED]` GitHub repository: `eoitsefy/personal-blog`.
- `[VERIFIED]` Active branch: `main`, tracking `origin/main`.
- `[VERIFIED]` Server working tree: `/root/personal-blog-web`.
- `[VERIFIED]` Windows working tree: `C:\Users\Administrator\personal-blog`.
- `[VERIFIED]` Existing `AGENTS.md`; Codex must not overwrite it.
- `[CHECK]` Review current Git history because an earlier `git log -5` invocation inside Codex returned no output.

## Local development

- `[VERIFIED]` `npm install` completed.
- `[VERIFIED]` `npm run dev` launched Next.js at `http://localhost:3000`.
- `[VERIFIED]` Observed Next.js version: `16.2.6`.
- `[VERIFIED]` Local Node.js `20.13.1` generated an engine warning for a dependency requiring `^20.19.0 || ^22.13.0 || >=24`.
- `[VERIFIED 2026-07-12]` `package.json` declares Node.js `>=20.19.0` and npm as the package manager.
- `[VERIFIED 2026-07-12]` npm is authoritative through `package-lock.json`; the obsolete `pnpm-lock.yaml` was removed.

## Repository stabilization evidence — 2026-07-12

- `[VERIFIED]` `src/app` is the single App Router tree; the conflicting root `app` tree was removed.
- `[VERIFIED]` Home, published post list/detail, global layout/styles, not-found handling, and `/api/healthz` are consolidated under `src/app`.
- `[VERIFIED]` Public post detail rejects missing and draft posts.
- `[VERIFIED]` Draft preview requires the configured administrator session cookie.
- `[VERIFIED]` Public diagnostic routes were removed.
- `[VERIFIED]` Minimal automated checks cover published visibility, draft rejection, and preview authorization.
- `[CHECK]` The Phase 0 `npm test` script intentionally names the two current test files explicitly for reliable Windows/npm execution. Future test files must be added to that script, or the project must adopt a reliable cross-platform test discovery mechanism.

## Application stack

- `[VERIFIED]` Next.js App Router and TypeScript strict mode are documented as the intended stack.
- `[VERIFIED]` PostgreSQL 16 and Redis 7 Alpine run in Docker.
- `[VERIFIED]` Prisma is present in the project context; tables observed in the audit include `Post`, `User`, `Asset`, `PostAssetRef`, and `_prisma_migrations`.
- `[CHECK]` Inspect the actual Prisma schema, migrations, authentication implementation, route organization, upload APIs, tests, and editor implementation.
- `[CHECK]` The task inventory marks public blog pages, admin CRUD, SEO, responsiveness, dark mode, accessibility, and caching as needing code verification.

## Production infrastructure

- `[VERIFIED]` Alibaba Cloud ECS with Ubuntu 22.04.5 LTS.
- `[VERIFIED]` Historical hostname: `iZf8z12q8e2gi80cbi44eqZ`.
- `[VERIFIED]` Domain: `eastherphil.cn`; historical DNS target `47.120.39.130`.
- `[VERIFIED]` Public listeners are intended to be 22, 80, and 443 only.
- `[VERIFIED]` Nginx reverse proxies to `127.0.0.1:3000` and terminates TLS.
- `[VERIFIED]` Nginx configuration previously passed `nginx -t`.
- `[VERIFIED]` Docker containers recorded: `blog-app`, `blog-postgres`, `blog-redis`.
- `[VERIFIED]` PostgreSQL and Redis were mapped to loopback in the earlier audit.
- `[CHECK]` A historical public Next.js process on port 3001 was closed; a local process on port 3002 requires confirmation.
- `[CHECK]` Re-check disk usage. Different audit dates recorded approximately 28% and 57% use on a 40 GB disk.

## Nginx and HTTPS

Historical site behavior:

- HTTP redirects to HTTPS.
- HTTPS proxies requests to the app on port 3000.
- `client_max_body_size 20m` was configured.
- Upgrade headers and a 60-second proxy read timeout were present.
- Certificate files were recorded under `/etc/nginx/ssl/eastherphil.cn/`.
- `acme.sh` uses DNS-based renewal and reloads Nginx.

The audit certificate expired on 2026-08-07 unless renewed. This is not a current certificate assertion. Run a live check before deployment.

## Uploads

- `[VERIFIED]` Static upload delivery through Nginx was reported working with HTTP 200.
- `[VERIFIED]` Current standard directory: `/var/www/personal-blog/uploads`.
- `[CHECK]` Application upload API, authorization, MIME/size validation, metadata persistence, post references, cleanup, and recycle-bin behavior were incomplete or unverified.
- `[PLANNED]` Move to OSS-compatible storage later without changing application-level storage interfaces.

## Database

May 2026 audit snapshot:

- PostgreSQL 16.13, database `blogdb`, user `blog`.
- Database size approximately 7.7 MB.
- Tables were small and showed no meaningful dead-tuple pressure.
- Existing indexes with low observed use should not be removed based on the small dataset.
- `archive_mode=off`; PITR is not available.
- A recent gzip-compressed dump passed integrity checks.

Always inspect the live schema and database before generating migrations.

## Backup, cron, and operational directories

Current standard paths documented:

- Project: `/root/personal-blog-web`
- Backup: `/root/backups`
- Operations: `/root/server-ops`
- Audit archive: `/root/server-audit`
- Historical audit: `/root/ops-audit`
- Certificate tooling: `/root/.acme.sh`

Active cron entries documented:

```cron
59 19 * * * "/root/.acme.sh"/acme.sh --cron --home "/root/.acme.sh" > /dev/null
30 3 * * * /root/personal-blog-web/scripts/backup-db.sh
0 6 * * * /root/server-ops/scripts/daily-check.sh
```

Backup behavior:

- `docker exec blog-postgres pg_dump` for `blogdb`.
- Output: `/root/backups/blogdb-YYYY-MM-DD-HHMMSS.sql.gz`.
- Log: `/root/backups/backup.log`.
- Retention: seven days.
- Historical old backup path `/srv/blog/backups/postgres` should not be treated as the active standard.

Active scripts documented:

- `/root/personal-blog-web/scripts/backup-db.sh`
- `/root/server-ops/scripts/daily-check.sh`
- `/root/server-ops/scripts/ops-log.sh`
- `/root/.acme.sh/acme.sh`

Historical scripts to archive or verify:

- `/root/deploy_audit.sh`
- `/root/https-healthcheck.sh`
- `/root/ops-check-safe.sh`

## Security and reliability risks

- `[VERIFIED]` Public logs contain automated scanning and malicious-looking requests.
- `[CHECK]` One suspicious request to `/` historically returned HTTP 200; verify routing, method handling, and input validation.
- `[CHECK]` Confirm UFW and Alibaba Cloud security group alignment.
- `[CHECK]` SSH used key authentication, but root login was historically allowed. Establish a non-root administrator and hardening plan.
- `[CHECK]` Confirm fail2ban or equivalent controls.
- `[PLANNED]` Add container least-privilege settings, secure headers, application rate limits, health checks, and external alerts.
- `[PLANNED]` Add off-site backups; current backups are local to the same server.

## AI and Codex connectivity

- `[VERIFIED]` On 2026-07-10 the ECS timed out connecting to `api.openai.com:443` and `chatgpt.com:443`.
- `[BLOCKED]` Direct production use of an unreachable AI provider.
- `[PLANNED]` Use a provider adapter and verify egress connectivity before enabling the AI assistant in production.
