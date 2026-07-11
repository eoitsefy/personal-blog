# Complete Codex Context Bundle

> Generated from the project context documents. The split files remain the canonical editable form.


---

<!-- SOURCE: CODEX_CONTEXT.md -->

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

---

<!-- SOURCE: docs/codex/README.md -->

# Codex Documentation Index

This directory provides stable project context for Codex and human maintainers. It consolidates the production audits, task lists, script inventory, and the recorded setup conversation.

## Documents

- `01_PRODUCT_SCOPE.md`: product vision, users, functional scope, and non-goals.
- `02_CURRENT_STATE.md`: verified repository, local environment, server, database, operations, and known risks.
- `03_TARGET_ARCHITECTURE.md`: target application, storage, AI, and deployment architecture.
- `04_VOICE_ASSISTANT_SPEC.md`: detailed behavior, API boundaries, data contracts, privacy, security, and acceptance criteria for the AI voice assistant.
- `05_IMPLEMENTATION_PLAN.md`: phased roadmap with priorities and completion checks.
- `06_DEPLOYMENT_RUNBOOK.md`: safe production deployment, validation, backup, rollback, and incident procedures.
- `07_CODEX_WORKFLOW.md`: instructions and reusable prompts for Codex.
- `08_SOURCE_NOTES.md`: source provenance, precedence, and known conflicts.

## Evidence rules

Use the following labels in plans and status updates:

- `[VERIFIED]`: confirmed by code, command output, or audit evidence.
- `[CHECK]`: must be verified in the repository or live environment.
- `[PLANNED]`: desired future behavior.
- `[BLOCKED]`: cannot proceed until an external dependency is resolved.

Do not convert `[CHECK]` or `[PLANNED]` into `[VERIFIED]` without evidence.

## Update policy

When code or deployment changes:

1. Update the relevant document in the same pull request.
2. Record commands that were actually run and their result.
3. Replace stale point-in-time values with a dated note rather than silently deleting historical context.
4. Never place secrets or real credentials in these files.

## Suggested repository placement

Place `CODEX_CONTEXT.md` at the repository root and this directory at `docs/codex/`. Keep the existing `AGENTS.md` unchanged unless the project owner explicitly requests an update.

---

<!-- SOURCE: docs/codex/01_PRODUCT_SCOPE.md -->

# Product Scope

## Product vision

Create a personal publishing platform that is straightforward to operate, secure enough for public internet exposure, and enhanced by an AI voice assistant that answers questions from the author's published content.

The project should remain maintainable by one owner. Prefer conventional, documented solutions over unnecessary distributed infrastructure.

## Primary users

- **Visitor**: reads, searches, filters, shares, and asks questions about published content.
- **Administrator/author**: signs in, creates and manages posts, uploads media, previews changes, publishes content, and reviews operational status.
- **Maintainer**: deploys, backs up, restores, audits, and rolls back the system.

## MVP scope

### Public site

- Home page with recent or featured posts.
- Post detail page with readable typography and stable URLs.
- Category and tag navigation.
- Pagination or cursor-based browsing.
- Search across published posts.
- About page and configurable site identity.
- Responsive desktop/mobile layout.
- Light/dark theme with system preference support.
- Accessible keyboard navigation, focus states, form labels, and sufficient contrast.
- SEO metadata: title, description, canonical URL, Open Graph, social card data.
- `sitemap.xml`, `robots.txt`, RSS/Atom feed if consistent with the existing codebase.
- Friendly 404 and error states.

### Administration

- Secure administrator authentication and session handling.
- Post CRUD with draft and published states.
- Slug generation and uniqueness validation.
- Preview before publish.
- Markdown or rich-text editor based on the existing implementation; do not introduce a second editor without a migration plan.
- Category/tag management.
- Media upload and selection.
- Server-side input validation and clear error messages.
- Basic audit fields such as author, created time, updated time, and published time.

### Media

- MVP storage: local filesystem.
- Public path: `/uploads/...`; server directory currently documented as `/var/www/personal-blog/uploads`.
- Validate MIME type, extension, size, and image dimensions where applicable.
- Generate collision-resistant filenames; never trust the uploaded filename as a path.
- Persist metadata such as hash, MIME, byte size, owner, and references.
- Known database table names include `Asset` and `PostAssetRef`; inspect Prisma before changing them.
- Prevent deletion of referenced assets, or use soft deletion/recycle-bin semantics.

### AI assistant

- Text question input available to all supported browsers.
- Optional microphone input after explicit permission.
- Answers grounded in published blog content, with linked sources.
- Optional speech playback of the answer.
- Clear states: idle, listening, transcribing, thinking, speaking, stopped, and error.
- Text fallback when audio permissions or AI services are unavailable.
- Rate limits, usage caps, timeout handling, and privacy notice.

## Later enhancements

- OSS/object storage as primary media storage and off-site backup.
- RAG indexing pipeline with automatic re-indexing on publish/update/unpublish.
- Comments or reactions, only after moderation and abuse controls are defined.
- Scheduled publishing, revisions, and richer editorial workflow.
- Full observability, external alerts, and product analytics with privacy controls.
- PostgreSQL PITR/WAL archiving after storage and recovery requirements are agreed.

## Non-goals for the first milestone

- Multi-tenant blogging platform.
- Arbitrary user registration or public content creation.
- Training a custom foundation model.
- Storing raw voice recordings indefinitely.
- Exposing PostgreSQL, Redis, or the Next.js application port directly to the internet.
- Large infrastructure rewrites before the current repository is audited.

## Product quality gates

A feature is not complete until:

1. server-side validation is implemented;
2. loading, empty, permission-denied, and error states exist;
3. relevant automated checks pass;
4. secrets are not exposed to client code;
5. operational and rollback implications are documented;
6. the feature works through Nginx in the production-like Docker setup.

---

<!-- SOURCE: docs/codex/02_CURRENT_STATE.md -->

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
- `[PLANNED]` Standardize development and CI on a repository-declared Node version, preferably Node.js 22 LTS unless code inspection indicates otherwise.
- `[CHECK]` Confirm whether both `package-lock.json` and `pnpm-lock.yaml` remain in the repository. Select one package manager and remove ambiguity through an explicit migration decision.

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

---

<!-- SOURCE: docs/codex/03_TARGET_ARCHITECTURE.md -->

# Target Architecture

## Principles

- Keep the application deployable as a single Docker Compose stack.
- Keep PostgreSQL and Redis private to the host/container network.
- Treat Nginx as the only public application entry point.
- Separate business logic from provider-specific storage and AI SDKs.
- Build text assistant capability before voice input/output.
- Preserve a non-AI path for all core blog functions.

## Logical components

```text
Browser
  -> Nginx :80/:443
      -> Next.js application :3000
          -> PostgreSQL
          -> Redis
          -> LocalStorageAdapter -> /var/www/personal-blog/uploads
          -> future OssStorageAdapter
          -> AiProviderAdapter
              -> reachable LLM / embedding / STT / TTS services
```

## Next.js application boundaries

Recommended modules, adapted to the existing repository rather than imposed blindly:

```text
src/
  app/
    (public)/
    admin/
    api/
  components/
  features/
    posts/
    taxonomy/
    media/
    search/
    assistant/
  lib/
    auth/
    db/
    redis/
    storage/
    ai/
    validation/
    observability/
  server/
    services/
    repositories/
```

If the repository already uses a different coherent structure, extend it rather than performing a broad reorganization.

## Data model direction

Existing names observed: `User`, `Post`, `Asset`, `PostAssetRef`.

Codex must inspect the Prisma schema before proposing migrations. Expected concepts include:

- `Post`: title, slug, summary, content, status, author, publish timestamps, SEO fields.
- taxonomy: category and tag relations if not already present.
- `Asset`: storage key/path, original name, MIME, size, hash, dimensions, owner, lifecycle status.
- `PostAssetRef`: explicit link between post and asset.
- AI indexing records: post/version, chunk text, chunk order, embedding reference, index status, updated time.
- AI usage records: request ID, anonymous/session identifier, model/provider, latency, token or billing units, result status, source IDs, no raw secret values.

Avoid storing raw audio by default. If temporary files are required, delete them promptly and document retention.

## Caching

Redis can support:

- rate-limit counters;
- short-lived AI response caching keyed by normalized question and content index version;
- session or revocation data if required by the existing auth design;
- lightweight background job coordination.

Do not make page correctness depend on Redis availability without a fallback.

## Search and RAG

MVP search can use PostgreSQL text search or the existing implementation. RAG should index only published, non-deleted content.

Suggested RAG flow:

1. A post is published or updated.
2. A background or deferred task extracts normalized text.
3. Text is split into stable chunks with post and heading metadata.
4. Embeddings are generated through a provider adapter.
5. Query retrieval returns top relevant chunks with thresholds.
6. The answer is generated only from retrieved evidence and includes source links.
7. If evidence is weak, the assistant says it could not find a reliable answer.

The initial implementation can store embeddings in PostgreSQL if the chosen extension/provider is supported. Do not add a separate vector database until scale or operational requirements justify it.

## AI provider abstraction

Use server-only interfaces such as:

```ts
interface TextGenerationProvider {
  answer(input: GroundedAnswerInput): Promise<GroundedAnswerResult>;
}

interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

interface SpeechToTextProvider {
  transcribe(audio: AudioInput): Promise<TranscriptResult>;
}

interface TextToSpeechProvider {
  synthesize(text: string, options: VoiceOptions): Promise<AudioResult>;
}
```

Provider selection must come from server-side configuration. Client code must never receive provider API keys.

## Request flow for the assistant

Prefer ordinary HTTPS and streaming responses where supported:

```text
mic/text input
 -> validation and rate limit
 -> transcription when needed
 -> retrieval
 -> grounded generation
 -> response with sources
 -> optional text-to-speech
```

WebSocket support may be added later for realtime experiences, but it should not be required for the first reliable release. The recorded environments have experienced WebSocket fallback and network instability.

## Deployment architecture

- Nginx: TLS, redirect, proxying, body-size limits, static uploads, rate limits, and secure headers.
- App container: non-root runtime where feasible, health endpoint, bounded memory, read-only filesystem except explicit writable paths.
- PostgreSQL: persistent volume, regular dumps, later off-site copy and PITR decision.
- Redis: persistent volume only if required by chosen usage; otherwise document acceptable cache loss.
- Upload directory: explicit host mount with least required ownership and permissions.
- Logs: structured application logs to stdout/stderr, collected by Docker/journald; Nginx logs retained and rotated.

## Health endpoints

Recommended endpoints:

- `/api/health/live`: process is running; no external dependency checks.
- `/api/health/ready`: verifies required database connectivity and optionally Redis with strict timeout.
- `/api/health/ai`: optional internal/admin-only provider connectivity diagnostic; never expose credentials or provider responses.

## Observability

Each request should have a correlation/request ID. Log:

- route and status;
- latency;
- authenticated user ID when appropriate, not sensitive session values;
- AI provider, model alias, duration, usage units, cache hit, retrieval count, and error category;
- upload validation result and asset ID;
- deployment version/commit SHA.

---

<!-- SOURCE: docs/codex/04_VOICE_ASSISTANT_SPEC.md -->

# AI Voice Assistant Specification

## Goal

Provide an optional assistant that helps visitors explore the author's published blog content using text or voice. It must not present ungrounded general knowledge as if it came from the blog.

## User experience

### Entry point

- A clearly labeled assistant button, not an ambiguous microphone-only icon.
- Keyboard accessible and usable on mobile.
- Opening the assistant must not immediately request microphone permission.

### Interaction states

1. `idle`: input box and optional microphone button.
2. `requesting_permission`: browser permission prompt is pending.
3. `listening`: visible timer, waveform/indicator, stop and cancel controls.
4. `transcribing`: audio upload/processing in progress.
5. `thinking`: retrieval and answer generation in progress.
6. `answer_ready`: text answer and source links are visible.
7. `speaking`: audio playback with pause/stop.
8. `error`: concise explanation and retry/text fallback.

### Required behavior

- Text input always remains available.
- The visitor can stop recording and playback.
- Never autoplay voice on page load.
- Show that answers are generated and may be incomplete.
- Cite the blog posts used, linking to canonical post URLs.
- If retrieval confidence is insufficient, state that no reliable answer was found.
- Do not answer questions about unpublished drafts or admin-only content.

## MVP limits

Suggested defaults, configurable server-side:

- audio duration: maximum 60 seconds;
- accepted input: browser-recorded audio formats explicitly supported by the selected STT provider;
- text question length: maximum 1,000 characters;
- answer length: bounded for cost and usability;
- per-IP/session rate limits with stricter anonymous limits;
- hard provider timeout and one controlled retry for transient failures;
- circuit breaker or temporary disable flag after repeated provider failures.

Codex must verify provider limits rather than copying these values into code without configuration.

## API boundaries

Exact routes should follow existing repository conventions. A simple design is:

### `POST /api/assistant/query`

Input:

```json
{
  "question": "这篇博客如何部署？",
  "conversationId": "optional-client-session-id",
  "responseMode": "text"
}
```

Output:

```json
{
  "requestId": "uuid",
  "answer": "...",
  "sources": [
    {
      "postId": "...",
      "title": "...",
      "url": "/posts/example",
      "excerpt": "..."
    }
  ],
  "confidence": "high|medium|low",
  "cached": false,
  "usage": {
    "provider": "configured-provider",
    "inputUnits": 0,
    "outputUnits": 0
  }
}
```

### `POST /api/assistant/transcribe`

- Multipart audio upload.
- Validate content type, size, duration, and request limits.
- Return transcript and detected language if available.
- Use temporary storage only when required; delete it after processing.

### `POST /api/assistant/speech`

- Accept only assistant-generated or bounded text.
- Return audio bytes or a short-lived URL.
- Do not allow arbitrary large text-to-speech jobs.

A unified endpoint is acceptable if it remains testable and does not mix client secrets with server logic.

## Retrieval requirements

- Index only `PUBLISHED` content.
- Store post ID, slug, title, heading, chunk order, and content version with each chunk.
- Re-index on publish and meaningful content changes.
- Remove or deactivate chunks when a post is unpublished or deleted.
- Apply a similarity threshold and maximum number of chunks.
- Avoid passing entire posts when a small evidence set is sufficient.
- Return sources actually used in the answer, not merely retrieved candidates.

## Grounding rules for the generation prompt

The server-side prompt should instruct the model to:

- answer from supplied context only;
- distinguish quoted blog facts from general suggestions;
- avoid inventing URLs, titles, commands, or author opinions;
- respond in the user's language when supported;
- say when evidence is absent or contradictory;
- keep output appropriate for speech playback;
- include machine-readable source identifiers outside the prose answer.

Version the prompt and record the prompt version in usage logs.

## Privacy and consent

- Explain why microphone access is requested.
- Do not record until the visitor explicitly starts.
- Do not retain raw audio by default.
- Document any third-party processing and retention policy.
- Avoid sending cookies, authentication tokens, IP addresses, or unrelated page data to AI providers.
- Provide a visible way to clear the local conversation.
- Do not place full conversation content in ordinary access logs.

## Security

- Keep all provider keys server-side.
- Validate multipart boundaries, MIME type, file signature, size, and duration.
- Use CSRF protections where applicable to the auth/session architecture.
- Rate-limit by IP and anonymous session; protect against distributed abuse with global budget controls.
- Sanitize rendered Markdown/HTML in answers.
- Prevent prompt injection in blog content from changing system instructions; treat indexed content as untrusted data.
- Never allow the model to execute tools, shell commands, database writes, or admin actions for public visitors.
- Enforce published-content authorization in retrieval, not only in the prompt.

## Resilience and fallback

- If STT fails, preserve the UI and invite text input.
- If retrieval fails, do not call generation with empty context unless the product explicitly supports general chat.
- If generation fails, show a non-technical message and request ID.
- If TTS fails, retain the text answer.
- If the provider is disabled or unreachable, hide/disable voice controls while leaving the blog fully functional.

## Cost controls

- Configurable daily and monthly budgets.
- Per-session request caps.
- Cache safe, repeated public questions against a content-index version.
- Use smaller/cheaper models for classification, rewriting, or TTS when quality is adequate.
- Limit retrieved chunks, input context, output tokens, audio duration, and speech length.
- Log usage by anonymous/session bucket without storing unnecessary personal data.

## Connectivity gate

The current ECS could not reach OpenAI endpoints during the recorded session. The voice assistant is `[BLOCKED]` for production until the selected STT/LLM/TTS path is reachable and tested from the deployment environment.

Required pre-production check:

1. DNS resolution works.
2. TLS connection succeeds.
3. Provider authentication succeeds using a server-side secret.
4. End-to-end transcription, retrieval, generation, and speech fit within configured timeouts.
5. Failure behavior is tested with the provider unavailable.

## Acceptance criteria

- Visitor can ask a text question and receive a grounded answer with valid post links.
- Voice recording requires explicit action and can be canceled.
- Transcript is shown before or with the answer.
- Raw audio is not retained after processing under the default configuration.
- Unpublished content cannot be retrieved.
- Weak evidence produces an explicit “not found reliably” response.
- Provider outage does not break blog browsing.
- Abuse limits return a controlled 429 response.
- All API responses include a request ID and stable error shape.
- Integration tests cover successful text flow, no-evidence flow, invalid audio, limits, and provider timeout.

---

<!-- SOURCE: docs/codex/05_IMPLEMENTATION_PLAN.md -->

# Implementation Plan

## Priority definitions

- **P0**: required to avoid data loss, security exposure, or an unreleasable build.
- **P1**: required for the complete MVP.
- **P2**: valuable enhancement after MVP stability.

## Phase 0 — Repository audit and baseline

Priority: P0

Tasks:

- Read `AGENTS.md`, `package.json`, all lockfiles, TypeScript config, Next config, Prisma schema/migrations, Docker files, Nginx-related files, auth code, upload routes, and current tests.
- Map actual routes and features against `01_PRODUCT_SCOPE.md`.
- Resolve package-manager ambiguity if both npm and pnpm lockfiles exist.
- Declare supported Node version through `.nvmrc`, `.node-version`, Volta, or `engines` consistent with CI/deployment.
- Run current lint, type-check, tests, and production build without making functional changes.
- Create a dated gap report.

Acceptance:

- Clean reproducible install and build.
- No undocumented destructive migration.
- Status labels in these docs reflect repository evidence.

## Phase 1 — Stabilize core blog

Priority: P0/P1

Tasks:

- Verify or implement home, post detail, category/tag pages, pagination, and search.
- Verify admin login, session security, authorization checks, post CRUD, draft/publish, preview, and slug validation.
- Standardize server-side validation and API error shapes.
- Add or repair 404/error/loading/empty states.
- Add unit/integration tests for validators, authentication boundaries, post lifecycle, and critical API routes.
- Ensure only published posts appear publicly.

Acceptance:

- Admin can create, preview, publish, edit, unpublish, and delete/soft-delete a post.
- Anonymous users cannot access admin routes or drafts.
- Production build passes.

## Phase 2 — Media pipeline

Priority: P1

Tasks:

- Inspect existing `Asset` and `PostAssetRef` schema and code.
- Implement authenticated upload endpoint with MIME, signature, size, and path validation.
- Store files under the configured local storage root, not arbitrary application paths.
- Persist hash, MIME, size, owner, storage key, and dimensions.
- Add media selection and references in post editing.
- Prevent unsafe deletion; implement soft-delete/recycle-bin or reference checks.
- Add a storage interface so OSS can be introduced later.

Acceptance:

- Valid image upload works through local dev, Docker, and Nginx.
- Invalid files and oversized files are rejected.
- Public URL is stable and cannot traverse directories.
- Deleting a referenced asset is safely blocked or deferred.

## Phase 3 — SEO, accessibility, and performance

Priority: P1

Tasks:

- Implement page metadata, canonical URLs, Open Graph/social data.
- Add sitemap, robots, and feed if appropriate.
- Verify responsive behavior and dark mode.
- Audit keyboard access, semantic headings, forms, focus, contrast, and reduced-motion behavior.
- Configure image optimization and caching without breaking local uploads.
- Choose SSR/SSG/ISR behavior per route and document revalidation.

Acceptance:

- Key public pages have unique metadata.
- Lighthouse/accessibility checks have no critical defects.
- Published content appears in sitemap and unpublished content does not.

## Phase 4 — Text RAG assistant

Priority: P1

Prerequisite: reachable production AI provider/gateway.

Tasks:

- Implement provider-neutral embedding and generation interfaces.
- Build published-post extraction, chunking, indexing, update, and removal flow.
- Implement retrieval with thresholds and source metadata.
- Add `/api/assistant/query` or repository-consistent equivalent.
- Add rate limiting, caching, timeouts, stable errors, usage logging, and feature flag.
- Build text chat UI with citations and clear no-evidence behavior.
- Test prompt-injection resistance at the retrieval and authorization layers.

Acceptance:

- Answers cite only valid published posts.
- No-evidence questions fail safely.
- Provider outage leaves the blog operational.
- Usage and latency are observable without logging secrets.

## Phase 5 — Voice input and speech output

Priority: P1/P2

Tasks:

- Implement browser recording with explicit permission and cancellation.
- Add validated transcription endpoint.
- Show transcript and allow text correction/retry where practical.
- Add TTS endpoint and playback controls.
- Add audio limits, privacy notice, temporary-file cleanup, and provider fallback behavior.
- Test mobile browsers and unsupported-format handling.

Acceptance:

- Voice question completes end-to-end under normal conditions.
- Text fallback works for denied permission, unsupported audio, and provider failure.
- Raw audio retention is disabled by default and verified.

## Phase 6 — Deployment, security, and operations

Priority: P0/P1

Tasks:

- Add health checks and version/commit reporting.
- Run app as non-root where feasible and apply container resource/privilege limits.
- Add Nginx secure headers and endpoint-specific rate limits.
- Reconcile cloud security group and UFW rules.
- Replace routine root administration with a named sudo user; preserve emergency access and test it before changing SSH settings.
- Add alerts for disk >80%, backup failure, unhealthy/exited containers, certificate renewal failure, and repeated app errors.
- Copy backups off-host; document retention and restore.
- Perform and record application rollback and database restore drills.
- Resolve the unexplained port 3002 process.

Acceptance:

- Deployment and rollback are repeatable from the runbook.
- A fresh backup can be restored to a temporary database and validated.
- Only intended public ports are exposed.
- Alerts are tested, not only configured.

## Suggested first Codex milestone

Start with Phase 0 and produce:

1. repository map;
2. actual feature matrix;
3. build/test result;
4. schema and API summary;
5. top five risks;
6. a pull-request-sized Phase 1 task.

---

<!-- SOURCE: docs/codex/06_DEPLOYMENT_RUNBOOK.md -->

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
curl -fsS https://eastherphil.cn/api/health/live
curl -fsS https://eastherphil.cn/api/health/ready

docker compose ps
docker compose logs --tail=200 app
sudo tail -n 100 /var/log/nginx/error.log
```

Functional checks:

- home and post pages load;
- HTTP redirects to HTTPS;
- admin login works;
- create/edit/preview/publish flow works;
- uploaded image is stored and served;
- database and cache operations succeed;
- AI feature flag is disabled if provider connectivity is not healthy;
- no repeated errors appear in application or Nginx logs.

## Application rollback

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

---

<!-- SOURCE: docs/codex/07_CODEX_WORKFLOW.md -->

# Codex Workflow

## Start every repository session

Use this prompt:

```text
Read AGENTS.md, CODEX_CONTEXT.md, and docs/codex/README.md. Inspect package.json, lockfiles, Prisma schema/migrations, Docker Compose, Next.js configuration, and relevant routes before proposing changes. Distinguish verified, needs-verification, planned, and blocked items. Do not modify files yet. Return a concise repository map, current feature matrix, risks, and the smallest safe next task.
```

## Rules for Codex

- Do not overwrite `AGENTS.md`.
- Do not invent scripts that are absent from `package.json`.
- Do not assume the historical server audit equals the current live state.
- Do not edit production server files from a feature task.
- Do not use `git push --force`, destructive resets, or database deletion without explicit owner instruction.
- Do not expose provider keys to browser bundles or logs.
- Do not make the public AI assistant capable of executing tools or server commands.
- Preserve backward compatibility unless a migration is explicitly planned.
- Keep changes scoped enough to review in one pull request.

## Required response before coding

For each task, Codex should state:

1. files and existing behavior inspected;
2. assumptions requiring verification;
3. implementation plan;
4. database/API compatibility impact;
5. security and privacy impact;
6. commands/tests to run;
7. rollback approach.

For a small obvious fix, this can be brief.

## Required response after coding

Report:

- files changed;
- behavior implemented;
- migrations created;
- tests/commands run and results;
- known limitations;
- documentation updated;
- manual verification steps.

Never claim a command passed if it was not run successfully.

## Task prompt: repository audit

```text
Audit the repository against docs/codex/01_PRODUCT_SCOPE.md and docs/codex/02_CURRENT_STATE.md. Do not change code. Produce a table of implemented, partial, absent, risky, and unclear capabilities. Include exact file paths and evidence. Identify package-manager and Node-version issues. Propose one pull-request-sized next milestone.
```

## Task prompt: core blog

```text
Implement the next missing core-blog milestone from docs/codex/05_IMPLEMENTATION_PLAN.md. First inspect existing routes, Prisma schema, validators, auth, tests, and package scripts. Reuse existing conventions. Keep public drafts inaccessible. Add tests and update the Codex documents with evidence-based status changes.
```

## Task prompt: uploads

```text
Audit and complete the local media upload flow. Inspect Asset/PostAssetRef models and existing upload/static-serving code. Implement authenticated upload validation, safe filenames, metadata persistence, reference protection, and tests. Use a storage adapter so OSS can be added later. Do not expose arbitrary filesystem paths.
```

## Task prompt: text assistant

```text
Implement only the text RAG assistant described in docs/codex/04_VOICE_ASSISTANT_SPEC.md. Do not add voice yet. Use provider-neutral server-only interfaces, published-content-only retrieval, source citations, no-evidence behavior, rate limits, timeouts, feature flags, usage logs, and tests. Confirm the selected provider is reachable from the target deployment before marking the feature deployable.
```

## Task prompt: voice layer

```text
Add voice input and speech output on top of the working text assistant. Require explicit microphone permission, enforce audio limits, delete temporary audio, retain text fallback, add playback controls, and test provider timeout/unsupported-format behavior. Do not store raw audio by default.
```

## Task prompt: deployment review

```text
Review Dockerfile, docker-compose.yml, environment handling, Nginx assumptions, Prisma deployment, volumes, health checks, and rollback behavior against docs/codex/06_DEPLOYMENT_RUNBOOK.md. Do not deploy. Propose a patch that improves repeatability and least privilege without exposing PostgreSQL, Redis, or port 3000 publicly.
```

## Handling interrupted Codex sessions

The recorded Codex session sometimes failed after WebSocket-to-HTTPS fallback. To reduce lost work:

- ask for one bounded task at a time;
- request analysis before edits;
- avoid combining repository audit, implementation, deployment, and documentation in one prompt;
- commit locally after a verified milestone;
- rerun `git status` and inspect diffs after an interruption;
- never assume a partially displayed command completed.

## Recommended Git sequence

```bash
git status
git switch -c feat/<short-scope>
# make and verify changes
git diff --check
git status
git add <specific-files>
git commit -m "<descriptive message>"
git push -u origin feat/<short-scope>
```

Avoid `git add .` when generated files, uploads, environment files, or unrelated changes may be present.

---

<!-- SOURCE: docs/codex/08_SOURCE_NOTES.md -->

# Source Notes and Conflict Resolution

## Inputs consolidated

This documentation set was derived from:

1. `production-baseline-v1.1.docx` — detailed server audit based mainly on 2026-05-10 observations.
2. `个人博客服务器部署说明.docx` — later deployment and database summary based mainly on 2026-05-13 observations.
3. `任务清单.docx` — implementation and operations status list.
4. `文件脚本.docx` — directory, script, cron, and archive inventory.
5. The recorded setup conversation through 2026-07-10 — GitHub creation/synchronization, local Windows setup, Codex setup, Node warning, and server AI-network tests.

The original files are historical snapshots, not live monitoring sources.

## Precedence

When facts conflict, use this order unless live inspection proves otherwise:

1. Current repository and live server command output.
2. The 2026-07-10 conversation for Git/local/Codex/network facts.
3. Later dated deployment/task/script documents.
4. The earlier `production-baseline-v1.1` audit.
5. Planned architecture statements.

A later statement is not automatically correct if it is only a recommendation. Status must still be verified.

## Known conflicts and handling

### Database backup command

The older audit recorded:

```cron
20 3 * * * /usr/local/bin/blog-pg-backup.sh >> /var/log/blog-pg-backup.log 2>&1
```

Later documents record the active standard as:

```cron
30 3 * * * /root/personal-blog-web/scripts/backup-db.sh
```

The latter is treated as the current documented standard, but Codex/maintainers must run `sudo crontab -l` before relying on it.

### Backup directories

Several historical backup directories appeared. The later standard is `/root/backups`; `/srv/blog/backups/postgres` is historical. Do not delete old backups until retention, ownership, and restore value are reviewed.

### Restore drill

An older document said a restore drill was not evidenced. The later task list marks the restore drill completed. Treat the completion as `[CHECK]` until the actual runbook/log/result is found.

### Disk usage

Audits recorded different usage levels on the 40 GB disk. This is time-dependent, so no old percentage should be treated as current. Use `df -h` and check Docker/image/upload growth.

### Container image naming

Historical output includes image names such as `blog-blog-app` and `personal-blog-web-app`, while container/service names are documented as `blog-app`, `blog-postgres`, and `blog-redis`. Inspect `docker-compose.yml` and `docker compose ps` rather than depending on an old image label.

### Redis status

The earliest baseline text called Redis incompletely confirmed, while later deployment documents record a running Redis 7 container. Treat the later container record as historical verification and re-check live state.

### Certificate dates

The audit certificate was valid through 2026-08-07 and had an automatic renewal configuration. That date is close to the consolidation date and must be checked live. Automatic renewal configuration alone is not proof of successful renewal.

### Recovery and PITR

Ordinary dump backup/restore and PostgreSQL PITR are different capabilities. The documents indicate dump backups are working, while `archive_mode=off` means PITR is not enabled.

### AI connectivity

The production server was able to install Codex through npm but timed out connecting to OpenAI service endpoints. Successful package installation or cached login does not prove model/API connectivity. This is a hard deployment dependency for an OpenAI-backed assistant.

## Sensitive-data policy

The consolidated documents intentionally omit:

- API keys and tokens;
- SSH private keys;
- passwords and database connection strings;
- OAuth authorization URLs and temporary state values;
- raw database dumps;
- user-uploaded media contents.

Codex must preserve this policy when updating the documentation.
