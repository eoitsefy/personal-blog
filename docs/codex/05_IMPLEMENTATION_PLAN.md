# Implementation Plan

## Priority definitions

- **P0**: required to avoid data loss, security exposure, or an unreleasable build.
- **P1**: required for the complete MVP.
- **P2**: valuable enhancement after MVP stability.

## Phase 0 — Repository audit and baseline

Priority: P0

Status: `[VERIFIED 2026-07-12]` Router consolidation, npm/Node declaration, baseline authorization tests, and canonical documentation restoration completed. Full command results are recorded in the implementation handoff; live production remains outside this verification.

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

Status: `[COMPLETE 2026-07-16]` Phase 1A and 1B provide unified administrator authentication, protected article management, taxonomy, search/filter pagination, soft deletion/restoration, request hardening, and PostgreSQL integration coverage in CI.

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

Phase 1A verification:

- Administrator login uses the database password hash and a signed HttpOnly cookie.
- Administrator initialization is an explicit CLI operation; there is no public registration route.
- Protected pages support create, edit, preview, publish, unpublish, and delete.
- Public post responses no longer expose the administrator email address.
- Lint, direct TypeScript compilation, eight tests, and the Next.js production build passed on 2026-07-16.

Phase 1B verification:

- Category and tag relations are covered by a forward-only Prisma migration.
- Public list/API filters preserve pagination and always require published, non-deleted content.
- Deletion moves posts to a recoverable recycle bin and forces restored posts to remain drafts.
- Recycle-bin posts can be permanently deleted with explicit confirmation; active posts are protected from purge requests.
- Login throttling is persisted in PostgreSQL; mutation requests validate origin, JSON type, and size.
- GitHub Actions runs unit checks plus a PostgreSQL-backed authenticated article lifecycle.

## Phase 2 — Media pipeline

Priority: P1

Status: `[IMPLEMENTED 2026-07-16; PENDING CI AND PRODUCTION VERIFICATION]` Secure local image upload, media management, article references, deletion protection, storage abstraction, and automated coverage are present on the Phase 2 branch.

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

Verification notes:

- Unit tests cover image signature/type/size validation and storage path containment.
- The PostgreSQL integration lifecycle covers upload, article attachment, blocked deletion, detachment, recycle-bin restore, and permanent deletion.
- Docker and Nginx retain `/var/www/personal-blog/uploads` as the persistent host directory mounted at `/app/uploads`.

## Phase 3 — SEO, accessibility, and performance

Priority: P1

Status: `[IMPLEMENTED 2026-07-17; PENDING PR AND PRODUCTION VERIFICATION]` Canonical metadata, Open Graph/Twitter sharing data, article JSON-LD, published-only sitemap, robots policy, RSS discovery/feed, skip navigation, reduced-motion preservation, static hero image metadata, and baseline browser security headers are implemented on the Phase 3B branch.

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

Verification notes:

- Filtered and paginated archive URLs point to the canonical archive and are excluded from indexing when query parameters are active.
- Sitemap and RSS routes are generated at request time so Docker builds do not require a live database; both query only published, non-deleted posts.
- Administrator routes remain `noindex`; `robots.txt` blocks administrator and API crawling.
- Unit tests, ESLint, direct TypeScript checking, the Next.js production build, and database-free preview route checks passed locally.
- Production Lighthouse/accessibility measurements and post-deployment header checks remain required before this phase is marked complete.

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
