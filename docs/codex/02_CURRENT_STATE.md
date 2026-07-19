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
- `[CHECK]` The `npm test` script intentionally names the three current test files explicitly for reliable Windows/npm execution. Future test files must be added to that script, or the project must adopt a reliable cross-platform test discovery mechanism.

## Core blog Phase 1A evidence — 2026-07-16

- `[VERIFIED]` Administrator authentication is consolidated on database credentials and a signed HttpOnly cookie.
- `[VERIFIED]` Public administrator registration and duplicate login/token paths were removed.
- `[VERIFIED]` The protected administration interface supports article listing, create, edit, preview, publish, unpublish, and delete.
- `[VERIFIED]` Public article pages reject drafts and no longer expose the administrator email address.
- `[VERIFIED]` Administrator creation/password rotation is an explicit `npm run admin:create` operation.
- `[VERIFIED]` ESLint, direct TypeScript compilation, eight tests, and a Next.js production build passed.
- `[CHECK]` Run login and full article-lifecycle integration checks against a production-like PostgreSQL instance before deployment.

## Core blog Phase 1B evidence — 2026-07-16

- `[VERIFIED]` Posts support one category and up to ten normalized tags; the editor can reuse or create taxonomy terms.
- `[VERIFIED]` Public articles support keyword, category, tag, and page filters while excluding drafts and soft-deleted content.
- `[VERIFIED]` Administration supports search, status filters, pagination, a recycle bin, and draft-only restoration.
- `[IMPLEMENTED]` Recycle-bin posts support explicit permanent deletion, with active-post protection and media reference-count maintenance; PostgreSQL integration verification is pending CI.
- `[VERIFIED]` Login failures are throttled in PostgreSQL; JSON mutations validate origin, content type, and payload size.
- `[VERIFIED]` Unit coverage includes visibility, taxonomy normalization, query construction, request guards, authentication, and validators.
- `[AUTOMATED]` GitHub Actions provisions PostgreSQL 16 and runs the authenticated login/create/search/delete/restore integration lifecycle on pull requests.

## Application stack

- `[VERIFIED]` Next.js App Router and TypeScript strict mode are documented as the intended stack.
- `[VERIFIED]` PostgreSQL 16 and Redis 7 Alpine run in Docker.
- `[VERIFIED]` Prisma is present in the project context; tables observed in the audit include `Post`, `User`, `Asset`, `PostAssetRef`, and `_prisma_migrations`.
- `[VERIFIED 2026-07-16]` Prisma schema, migrations, authentication, route organization, tests, and editor implementation were inspected for Phase 1.
- `[CHECK]` The task inventory marks public blog pages, admin CRUD, SEO, responsiveness, dark mode, accessibility, and caching as needing code verification.

## Phase 4B account and comments evidence — 2026-07-18

- `[VERIFIED]` Production runs database-backed revocable sessions, closed USER/ADMIN roles, account status, invitation registration, one-time password reset, user suspension, and administrator user management.
- `[VERIFIED]` Published articles support moderated comments and one reply level; visitors are read-only and public comment payloads do not expose account email addresses.
- `[VERIFIED]` Users can edit or soft-delete their own comments and report public comments; edits return to pending review.
- `[VERIFIED]` Administrators can publish, hide, mark spam, restore, permanently delete, inspect reports, and lock each article's comment area.
- `[VERIFIED]` Comment input limits length, link count, active content, duplicate content, and submission frequency. Comment participation and minimum-data rules are publicly documented.
- `[AUTOMATED AND BROWSER VERIFIED]` PostgreSQL CI and production checks cover anonymous rejection, pending visibility, approval, reply depth, reports, edit review, locking, recycle-bin restore, and purge. Production commit: `e51b390`.

## Production infrastructure

- `[VERIFIED]` Alibaba Cloud ECS with Ubuntu 22.04.5 LTS.
- `[VERIFIED]` Historical hostname: `iZf8z12q8e2gi80cbi44eqZ`.
- `[VERIFIED]` Domain: `eastherphil.cn`; historical DNS target `47.120.39.130`.
- `[VERIFIED]` Public listeners are intended to be 22, 80, and 443 only.
- `[VERIFIED]` Nginx reverse proxies to `127.0.0.1:3000` and terminates TLS.
- `[VERIFIED]` Nginx configuration previously passed `nginx -t`.
- `[VERIFIED]` Docker containers recorded: `blog-app`, `blog-postgres`, `blog-redis`.
- `[VERIFIED]` PostgreSQL and Redis were mapped to loopback in the earlier audit.
- `[VERIFIED 2026-07-16]` An unmanaged Next.js 16.2.6 process was listening on public port 3001 from `/root/personal-blog-web`; identify and remove it before deployment.
- `[VERIFIED 2026-07-16]` The Nginx-targeted `blog-app` container was still using an image created on 2026-05-17 while the server working tree was at `2b1e80e`, two commits behind `origin/main`.
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
- `[IMPLEMENTED 2026-07-16]` Authenticated image uploads validate request size, MIME declaration, file signature, extension, dimensions, pixel count, and animation before writing to storage.
- `[IMPLEMENTED 2026-07-16]` Asset metadata includes the original name, SHA-256, MIME, size, dimensions, owner, stable storage key, and public URL.
- `[IMPLEMENTED 2026-07-16]` The administrator media library supports selection, Markdown insertion, reference-aware soft deletion, restoration, and guarded permanent deletion.
- `[AUTOMATED]` Unit coverage validates images and storage paths; PostgreSQL integration coverage exercises upload, article references, blocked deletion, detach, restore, and purge. CI verification is pending for this branch.
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
- `[COMPLETE — Phase 7A]` UFW now exposes only SSH 22 and HTTP/HTTPS 80/443; the stale IPv4/IPv6 3002 rules were removed with a verified backup and application/HTTPS checks. The attached Alibaba Cloud security group had no 3002 rule, and its unused RDP 3389 rule was removed.
- `[COMPLETE — Phase 7A]` Routine administration now uses the locked-password `blogops` account with an independent Ed25519 key and verified sudo. Password SSH is disabled and root is temporarily limited to public-key emergency access.
- `[CHECK]` Confirm fail2ban or equivalent controls.
- `[PLANNED]` Add container least-privilege settings, secure headers, application rate limits, health checks, and external alerts.
- `[PLANNED]` Add off-site backups; current backups are local to the same server.

## AI and Codex connectivity

- `[VERIFIED]` On 2026-07-10 the ECS timed out connecting to `api.openai.com:443` and `chatgpt.com:443`.
- `[DEPLOYED AND ACCEPTED]` Phase 6A local indexing, retrieval, limits, usage records and provider isolation were deployed at `f724027`; the DeepSeek enablement increment was merged and deployed at `e5646d2`, then enabled and accepted on 2026-07-19.
- `[VERIFIED BLOCKER]` The disabled OpenAI adapter was deployed at `df224f5`, but a direct ECS call to `api.openai.com:443` timed out with HTTP status `000`; no authenticated request or billable model call occurred.
- `[VERIFIED]` The ECS resolved and reached `api.deepseek.com`, authenticated successfully, listed `deepseek-v4-flash` and `deepseek-v4-pro`, and completed non-thinking JSON calls with the selected `deepseek-v4-flash` model.
- `[ENABLED]` Production uses server-only credentials, local lexical retrieval, bounded JSON generation and no embedding calls. Acceptance verified three published posts/three chunks, grounded citations, zero-provider-token local greetings, first-four/fifth-request `200/429` throttling, usage audit records and temporary-data cleanup.
