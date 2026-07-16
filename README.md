# EastherPhil Blog

A personal publishing application built with Next.js 16, PostgreSQL, Prisma, and Docker Compose.

## Current capabilities

- Public home, searchable and paginated published-post list, and Markdown post pages.
- Category and tag assignment with public filtering and taxonomy links.
- Drafts remain private; published posts receive basic metadata and Open Graph fields.
- Database-backed administrator login with a signed HttpOnly session cookie.
- Protected administration pages for creating, editing, previewing, publishing, unpublishing, soft-deleting, and restoring posts.
- Database-backed login throttling, same-origin mutation checks, JSON size/type validation, and no-store API responses.
- PostgreSQL and Redis services through Docker Compose.
- Database backup and restore-drill scripts.

Media uploads, sitemap/feed generation, and the AI assistant are later milestones.

## Requirements

- Node.js 20.19 or newer.
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

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Unit tests run without external services. Integration tests require `TEST_DATABASE_URL` pointing to a disposable PostgreSQL database; the script applies migrations before running the authenticated article lifecycle. GitHub Actions provisions this database automatically for pull requests.

## Production notes

- Nginx should be the only public application entry point and proxy to `127.0.0.1:3000`.
- PostgreSQL and Redis must not be published on public interfaces.
- The persistent upload directory is `/var/www/personal-blog/uploads` and is mounted into the application container at `/app/uploads`.
- Run `scripts/backup-db.sh` and verify the backup before a production deployment.
- Validate the application with `/api/healthz` after deployment.

See `docs/codex/06_DEPLOYMENT_RUNBOOK.md` for the deployment and rollback procedure.
