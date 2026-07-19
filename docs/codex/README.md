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
- `09_COMPLETED_FEATURES.md`: production feature inventory and explicit current limitations.
- `10_PENDING_REQUIREMENTS.md`: agreed default decisions, pending requirements, dependencies, and acceptance criteria.
- `11_PHASE_7A_OPERATIONS_BASELINE.md`: dated production audit evidence, staged hardening scope, rollback boundaries, and acceptance criteria.

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
