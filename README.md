# EastherPhil Blog

A personal publishing application built with Next.js 16, PostgreSQL, Prisma, and Docker Compose.

## Current capabilities

- Public home, searchable and paginated published-post list, and Markdown post pages.
- Category and tag assignment with public filtering and taxonomy links.
- Drafts remain private; published posts receive basic metadata and Open Graph fields.
- Database-backed administrator login with a revocable, hashed session and HttpOnly cookie.
- Protected administration pages for creating, editing, previewing, publishing, unpublishing, soft-deleting, and restoring posts.
- Authenticated JPEG, PNG, and WebP uploads with signature, size, dimension, and path validation.
- A media library and recycle bin with article-reference tracking, deletion protection, restoration, and permanent deletion.
- Database-backed login throttling, same-origin mutation checks, JSON size/type validation, and no-store API responses.
- PostgreSQL and Redis services through Docker Compose.
- Database backup and restore-drill scripts.

Sitemap/RSS, moderated comments, invited users, AMap places and the bounded DeepSeek text assistant are implemented. Voice remains planned.

The chibi assistant uses full-figure drawings, not the withdrawn layered rig. Selected v5 inbetweens share the original neutral start/end, stable sole registration and a persistent HiDPI canvas. Changing drawings are spaced at 15 fps with intentional neutral holds; repeated holds are not counted as new artwork. The original 84 PNG drawings are unchanged. See `docs/codex/13_ASSISTANT_CHARACTER_WORKFLOW.md` for material provenance, reusable motion briefs and current acceptance status. Runtime pixel checks: `node --import tsx scripts/verify-character-integration.mjs`.

PR #27 adds administrator-only working-copy autosave, window recovery, up to 20 saved versions, image paste/upload, live Markdown preview and complete mobile navigation. Autosave never publishes. It was deployed on 2026-10-03 with the additive `20261003090000_post_working_copies` migration; new installations must also apply migrations. Production evidence and remaining acceptance limits are tracked in `docs/codex/09_COMPLETED_FEATURES.md` and `12_WRITING_EXPERIENCE.md`.

## Requirements

- Node.js 22.13 or newer; Docker and CI use Node.js 24 LTS.
- npm 10.5 or newer.
- PostgreSQL 16, either local or through Docker Compose.

## Local setup

1. Copy `.env.example` to `.env` and replace every placeholder.
2. Install dependencies with `npm ci`.
3. Apply production-safe migrations with `npx prisma migrate deploy`.
4. Create or rotate the single administrator with `npm run admin:create`.
5. Start the development server with `npm run dev`.

The administrator command requires `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. The password must contain at least 12 characters. Do not retain `ADMIN_PASSWORD` in long-lived production environment files after initialization.

The administration interface is available at `/admin/login`.

### UI preview without PostgreSQL

Public list and article layouts can be reviewed with deterministic sample content when PostgreSQL is unavailable. Preview data requires an explicit flag and is ignored whenever `DATABASE_URL` is configured, so it never replaces a configured database.

PowerShell:

```powershell
$env:UI_PREVIEW_MODE="true"
npm run dev
```

Then open `/posts` and select any preview article. Unset `UI_PREVIEW_MODE` or restart the shell to return to database-backed content.

## Music

The `/music` page is available without a blog account. Search by song title or artist to view up to 10 results with metadata and official song links, then load a selection in the official embedded player. The collapsible link form also accepts a complete NetEase Cloud Music song, playlist, or album share link. For a short link, open it first and copy the full address. If the embedded player cannot play a selection, use **在网易云打开** to open it on NetEase Cloud Music. Use the official controls for playback; **关闭并停止** closes the player and stops playback. For the selected music, the browser stores only the resource type and ID; no music App ID or RSA key is required. Search uses a public webpage metadata adapter whose interface is not confirmed as an official open API and may change; a search result does not guarantee that the official player can play it. The adapter is part of the existing server, with no separate daemon, port, or new dependency; its cache and rate limits are per process.

Choose one of four appearances: 金色呼吸, 星轨留声, 页边音律, or 助手共鸣. Decorative ambience is controlled by its own manual switch and is off by default; the appearance and switch preference are remembered in the browser. Reduced-motion settings disable the decorative motion, and **关闭并停止** also turns ambience off. The decoration is independent of the official player and does not follow its playback or audio.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Unit tests run without external services. Integration tests require `TEST_DATABASE_URL` pointing to a disposable PostgreSQL database; the script applies migrations before running the authenticated article and media lifecycles. GitHub Actions provisions this database automatically for pull requests.

## Production notes

- Nginx should be the only public application entry point and proxy to `127.0.0.1:3000`.
- PostgreSQL and Redis must not be published on public interfaces.
- The persistent upload directory is `/var/www/personal-blog/uploads` and is mounted into the application container at `/app/uploads`.
- Run `scripts/backup-db.sh` and verify the backup before a production deployment.
- Validate the application with `/api/healthz` after deployment.

See `docs/codex/06_DEPLOYMENT_RUNBOOK.md` for the deployment and rollback procedure.

The pending security/writing release, including its additive database migration and production rollout gates, is documented in `docs/codex/12_WRITING_EXPERIENCE.md`. Run `npm audit --omit=dev --registry=https://registry.npmjs.org` when verifying production dependencies.
