# Personal Blog + AI Voice Assistant — Codex Master Context

> Last consolidated: 2026-07-10. This file is the primary entry point for Codex.

## 1. Working rules

1. Read this file, then `docs/codex/README.md`, before making changes.
2. `AGENTS.md` already exists in the repository. Do not overwrite it. Read it and follow it.
3. Distinguish three statuses:
   - **Verified**: confirmed by repository output, deployment audit, or the recorded terminal session.
   - **Needs verification**: likely present, but Codex must inspect the repository or live environment.
   - **Planned**: target behavior; do not describe it as implemented.
4. Inspect `package.json`, lockfiles, Prisma schema, Docker Compose, Nginx-related files, tests, and Git history before editing.
5. Never commit secrets, `.env*`, private keys, production database dumps, runtime uploads, or authentication tokens.
6. Do not run destructive database, Git, Docker, or server commands without explicitly describing the impact and rollback path.
7. Prefer small, reviewable changes. After each change, run the relevant lint, type-check, tests, and build commands available in the repository.

## 2. Product objective

Build and deploy a production-ready personal blog with complete conventional blog features and an AI voice assistant. The current priority is a reliable MVP that is usable, recoverable, reversible, and auditable. Local file storage is acceptable for the MVP; object storage, stronger observability, and advanced RAG are later enhancements.

Core target capabilities:

- Public blog: home, post detail, categories, tags, pagination, search, responsive layout, dark mode, SEO metadata, sitemap, robots, social previews, and accessible navigation.
- Admin: secure login, post CRUD, draft/publish workflow, media management, validation, audit-friendly changes, and preview.
- Media: validated local uploads, metadata records, post-to-asset references, safe public delivery, and later migration to OSS-compatible storage.
- AI assistant: text and voice input, answers grounded in published blog content, source citations, speech output, graceful fallback, rate limits, privacy controls, usage logging, and cost controls.
- Operations: Docker Compose, Nginx, HTTPS, PostgreSQL, Redis, backups, health checks, rollback, logs, alerts, and documented deployment changes.

## 3. Repository and local development — verified from conversation

- GitHub repository: `eoitsefy/personal-blog`
- Default branch: `main`
- Windows working directory: `C:\Users\Administrator\personal-blog`
- Production project directory: `/root/personal-blog-web`
- The repository was pushed successfully to GitHub and local cloning succeeded.
- `npm install` completed and `npm run dev` started Next.js successfully at `http://localhost:3000`.
- Observed application version output: Next.js `16.2.6`, package name `personal-blog-web@0.1.0`.
- Local Node.js `20.13.1` produced an engine warning requiring at least `20.19.0`, `22.13.0`, or `>=24` for one dependency. Prefer Node.js 22 LTS or verify the repository's exact engine requirement.
- Codex CLI runs locally. `AGENTS.md` exists.
- Codex requests have intermittently timed out when falling back from WebSockets to HTTPS. Keep Codex tasks scoped and retry from a stable connection.

Typical local commands, subject to `package.json` verification:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Do not assume a test command exists. Inspect `package.json` first.

## 4. Production baseline — verified from May 2026 audits

- Server: Alibaba Cloud ECS, Ubuntu 22.04.5 LTS.
- Hostname: `iZf8z12q8e2gi80cbi44eqZ`.
- Domain: `eastherphil.cn`; historical audit IP: `47.120.39.130`.
- Public ports: 22, 80, 443.
- Nginx terminates HTTPS and proxies the application to `127.0.0.1:3000`.
- Docker Compose services: `blog-app`, `blog-postgres` (PostgreSQL 16), `blog-redis` (Redis 7 Alpine).
- PostgreSQL and Redis are not intended to be publicly exposed.
- Current formal backup path: `/root/backups`.
- Upload delivery path: `/var/www/personal-blog/uploads`.
- Active operational scripts include database backup, daily checks, operation logging, and `acme.sh` certificate renewal.
- A previous process on public port 3001 was closed; a local process on 127.0.0.1:3002 still requires verification.
- Production logs show routine internet scanning. Input validation, rate limiting, secure headers, and least-privilege deployment are mandatory.

The deployment snapshot is historical. Re-check all live values before changing production, especially certificate validity, disk use, running containers, listening ports, and cron entries.

## 5. Critical AI connectivity constraint

On 2026-07-10, the ECS timed out connecting to both `api.openai.com:443` and `chatgpt.com:443`. Codex could be installed on the server but could not perform model requests there.

Therefore, the production AI voice assistant must not assume direct OpenAI connectivity from the current ECS. Before implementation is considered deployable, choose and verify one compliant option:

- an AI/STT/TTS provider reachable from the ECS;
- an approved outbound network path;
- a separately hosted AI gateway in a reachable region;
- or a provider-agnostic architecture allowing deployment-specific adapters.

Do not hardcode provider credentials or undocumented network workarounds.

## 6. Read order for detailed work

1. `docs/codex/01_PRODUCT_SCOPE.md`
2. `docs/codex/02_CURRENT_STATE.md`
3. `docs/codex/03_TARGET_ARCHITECTURE.md`
4. `docs/codex/04_VOICE_ASSISTANT_SPEC.md`
5. `docs/codex/05_IMPLEMENTATION_PLAN.md`
6. `docs/codex/06_DEPLOYMENT_RUNBOOK.md`
7. `docs/codex/07_CODEX_WORKFLOW.md`
8. `docs/codex/08_SOURCE_NOTES.md`

## 7. First task for Codex

Before implementing features:

1. Audit the repository and compare actual code with these documents.
2. Produce a short gap report with: implemented, partially implemented, absent, risky, and undocumented items.
3. Update only the status sections in these documents when evidence is found.
4. Propose the smallest next milestone with file-level changes and acceptance criteria.
