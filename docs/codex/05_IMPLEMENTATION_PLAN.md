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

Status: `[COMPLETE 2026-07-16]` Secure local image upload, media management, article references, deletion protection, storage abstraction, CI coverage, persistent upload mounting, and production verification are complete.

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

Status: `[DEPLOYED 2026-07-17; BROWSER AUDIT PENDING]` Canonical metadata, Open Graph/Twitter sharing data, article JSON-LD, published-only sitemap, robots policy, RSS discovery/feed, skip navigation, reduced-motion preservation, static hero image metadata, and baseline browser security headers are deployed at `b767eb4`. Automated production checks passed; Lighthouse, full keyboard navigation, and screen-reader sampling remain.

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

## Phase 4A — General media, audio, and controlled video

Priority: P1

Status: `[DEPLOYED AND VERIFIED 2026-07-17]` Typed assets, validated local audio, protected media references, native playback, allowlisted Bilibili/YouTube structured embeds, controlled PDF/TXT/Markdown documents, reference-state filtering, and serialized total-storage quota protection are deployed at `25743e5`. Migration, Nginx MIME, CSP, quota, public routes, recycle-bin behavior, and browser workflows passed production verification.

Tasks:

- Add explicit asset kinds and forward-only migrations.
- Validate audio by declared MIME, extension, and real file structure.
- Add media type/name filters, audio playback, structured insertion, and reference protection.
- Add controlled trusted video embeds without arbitrary HTML or iframe support.
- Add document/other-file policy, storage quotas, and operational usage reporting.

Current document policy intentionally allows only passive PDF and UTF-8 TXT/Markdown. HTML, SVG, Office documents, archives, executables, and PDFs with obvious script/attachment actions are rejected rather than stored as generic files. The configured total quota counts recycle-bin assets until permanent deletion removes the physical file.

Acceptance:

- Images and audio can be uploaded, reused, restored, and safely purged.
- Referenced assets cannot be deleted.
- Unsupported, spoofed, oversized, or unsafe files are rejected.
- Audio and allowed video embeds are keyboard accessible and fail with a usable fallback link.

## Phase 4B — Registered users and comments

Priority: P1

Status: `[COMPLETE 2026-07-18]` The session foundation is deployed at `e2865a5`, the invited-user lifecycle at `ced7432e`, and moderated comments at `e51b390`. PostgreSQL CI, forward migration, automated production checks, and browser acceptance passed. Self-service registration intentionally remains disabled.

Tasks:

- `[COMPLETE]` Deploy and verify the account/session migration; confirm the one-time administrator sign-in reset and disabled-account enforcement.
- `[COMPLETE]` Add invited verified-user registration, login, reset, suspension, and role boundaries.
- `[COMPLETE]` Add authenticated comments, first-level replies, moderation, reporting, locking, recycle-bin operations, and anti-spam controls.
- `[COMPLETE FOR INVITE-ONLY V1]` Publish comment participation, moderation, and minimum-data rules. A broader privacy policy remains required before self-service registration or AI/voice features open.

## Phase 5 — Places and public map

Priority: P2

Status: `[COMPLETE — PHASE 5A AND PHASE 5B DEPLOYED AND VERIFIED 2026-07-18]` Phase 5A is running in production at `0176f5b`; Phase 5B is running at `3395d9d`. 高德地图 JavaScript API 2.0, the provider adapter, safe runtime configuration, coordinate conversion, clustered map, text fallback, bounded client telemetry, same-origin secret proxy and CSP compatibility have all passed production acceptance without committing credentials.

Tasks:

- Add place records, article relations, privacy precision, and provider adapters.
- Provide a public clustered map plus an accessible text-list fallback.

Phase 5A production acceptance verified that hidden, draft-only, deleted, and internal-coordinate data never appears in `/api/places` or `/places`. Phase 5B sends only the already-serialized public coordinate to AMap, converts WGS84/BD09 in batches of at most 40, retains the local coordinate preview and text list on every failure path, and requires the AMap `securityJsCode` to remain in the Nginx `/_AMapService` proxy.

Phase 5B production acceptance verified the provider credential pair, Nginx secret permissions, CSP compatibility, real map rendering, Marker-to-card navigation, and the privacy-safe `loader_ready`/`map_ready` event sequence. The temporary deployment credential and handoff artifacts were removed after acceptance.

## Phase 6A — Text RAG assistant

Priority: P1/P2

Prerequisite: reachable production AI provider/gateway.

Status: `[DEPLOYED AND ACCEPTED 2026-07-19]` The provider-neutral foundation and additive migration were deployed at `f724027`. The final DeepSeek adapter was merged and deployed at `e5646d2`, then enabled after DNS, TLS, authentication, model-list and bounded JSON probes passed from the ECS. Production uses `deepseek-v4-flash`, explicit non-thinking mode, local lexical retrieval and conservative request/output limits.

Tasks:

- `[DONE]` Implement provider-neutral embedding and generation interfaces.
- `[DONE]` Index only published content and return source citations.
- `[DONE]` Add rate limits, budgets, timeouts, logging, feature flags, safe no-evidence behavior and zero-provider-cost local greetings.
- `[DONE]` Use the DeepSeek Chat Completions API with JSON Output, validated grounded citations and conservative defaults.
- `[DONE]` Install the server-side key, verify ECS connectivity, rebuild the local published-content index and pass grounded-answer, local-conversation, usage-audit and throttling acceptance gates.
- Keep article publishing independent from provider availability by synchronizing local chunks transactionally. DeepSeek enablement uses lexical ranking; any future embedding provider must remain an explicit, separately tested administrator rebuild operation.

## Phase 6B — Voice input and speech output

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

## Phase 7 — Deployment, security, and operations

Priority: P0/P1

Status: `[IN PROGRESS — Phase 7A]`. A read-only production audit completed on 2026-07-19. Repository-side container, backup, restore-drill, retention, and alerting changes are being implemented; server hardening is intentionally staged to preserve emergency access.

Tasks:

- `[IN PROGRESS]` Add health checks and version/commit reporting.
- `[IN PROGRESS]` Run app as non-root and apply container resource, log, PID, and privilege limits.
- Add Nginx secure headers and endpoint-specific rate limits.
- `[COMPLETE]` Port 3002 has no listener and its stale IPv4/IPv6 UFW rules were removed on 2026-07-19. The attached Alibaba Cloud security group had no 3002 rule, and the unused RDP 3389 rule was removed while preserving 22/80/443.
- `[COMPLETE]` Replace routine root administration with the verified `blogops` sudo user and disable password SSH with rollback-protected acceptance; retain temporary public-key emergency access for the remaining Phase 7A rollout.
- `[IN PROGRESS]` Add alerts for disk/inode use, backup freshness, unhealthy containers, application health, and certificate expiry, including a forced-failure acceptance path.
- Copy backups off-host; document retention and restore.
- Perform and record application rollback and database restore drills.
- `[RESOLVED]` The historical port 3002 has no listener and no longer has a host-firewall allowance.

Acceptance:

- Deployment and rollback are repeatable from the runbook.
- A fresh backup can be restored to a temporary database and validated.
- Only intended public ports are exposed.
- Alerts are tested, not only configured.

Current milestone: `[IN PROGRESS — Phase 7A]` certificate ownership, the named `blogops` operator, rollback-protected SSH password hardening, and host/cloud port reconciliation passed production acceptance on 2026-07-19. Next, deploy container limits, Docker retention and alerts, configure off-host backup credentials, and record rollback/restore evidence before expanding to Phase 6B voice features.

## Suggested first Codex milestone

Start with Phase 0 and produce:

1. repository map;
2. actual feature matrix;
3. build/test result;
4. schema and API summary;
5. top five risks;
6. a pull-request-sized Phase 1 task.
