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
