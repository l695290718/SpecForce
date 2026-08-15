# Designer 3A v5 Membership Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved, conservative Designer 3A v5 membership expansion through MCP, preserving the v4 snapshot and making the new 38-member catalog queryable through the normal projection path.

**Architecture:** PostgreSQL remains authoritative for authored architecture facts, revision manifests, review decisions, and relationship events. MCP is the only write boundary. v5 is an immutable snapshot derived from the accepted v4 snapshot plus exactly ten evidence-backed memberships under the existing SYS MCP Governance Gateway unit. Projection build and derived graph analysis remain asynchronous and are verified by scoped readback.

**Tech Stack:** TypeScript, `tsx`, Prisma read-only inventory, local MCP server over stdio, PostgreSQL, Vitest, existing SpecForge design-context and 3A projection commands.

## Global Constraints

- Owning Scope is always `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Use implementation session `design-change-session:87996974-cab9-496d-84cd-9492518f0466`; do not reuse the closed writing-design session.
- All authored v5 facts, review decisions, promotion, reconciliation, baseline publication, and projection requests must go through MCP.
- Direct Prisma access is read-only and is limited to loading the accepted v4 revision snapshot for deterministic carry-forward.
- Preserve v4 IDs, receipts, status, and projection. Never update v4 rows in place and never reuse v4 batch/review/decision/baseline IDs.
- v5 contains four units, thirty-eight memberships, and three mappings. Add exactly ten memberships; create no new unit or mapping.
- The ten additions are the approved API, event, business-rule, integration, and state-machine assets. Exclude the nine Nebula graph verification fixture APIs and defer graph/web/AI/observability assets to later units.
- English canonical fields are required and human-facing fields must include Chinese localization. Every new membership has explicit source evidence and typed-link evidence.
- No application runtime, schema, query, or UI behavior changes are in scope for this increment.

## Task 1: Record the implementation plan

- [x] Open the exact-Scope implementation preflight and capture the session receipt.
- [ ] Commit this plan without staging unrelated `outputs/` or workbook files.

**Evidence:** `design-change-session:87996974-cab9-496d-84cd-9492518f0466` and the approved Spec at `docs/superpowers/specs/2026-08-15-designer-3a-v5-membership-expansion-design.md`.

## Task 2: Build the MCP-only v5 publisher

- [ ] Add `scripts/publish-designer-3a-v5.ts`.
- [ ] Read the exact-Scope asset catalog and typed links through MCP before constructing the snapshot; assert all ten additions have English and Chinese content and the expected link evidence.
- [ ] Read the accepted v4 baseline and revision rows read-only from PostgreSQL, assert v4 is `PUBLISHED`, and derive new v5 revision IDs without mutating v4.
- [ ] Submit a complete v5 snapshot containing four carried-forward unit revisions, thirty-eight membership revisions, and three carried-forward mapping revisions.
- [ ] Create the v5 review bundle with complete declared coverage, approve it, promote it to the existing working stream, reconcile it, and publish `knowledge-baseline:designer:3a:v5` through MCP.
- [ ] Make reruns idempotent by using deterministic v5 IDs and idempotency keys; stop on any Scope, count, evidence, or localization mismatch.

**Focused checks:** publisher must print the session ID, batch/review/decision/promotion/reconciliation/baseline receipts, exact Scope, and `4/38/3` snapshot counts.

## Task 3: Build and verify the v5 projection

- [ ] Add `scripts/process-designer-3a-v5-projection.ts` using the existing projection service and baseline `knowledge-baseline:designer:3a:v5`.
- [ ] Request the v5 projection build through MCP, wait for `READY`, and wait for derived relationship analysis to become `PUBLISHED`.
- [ ] Add `scripts/verify-designer-3a-v5.ts` to read the published baseline and projection through MCP and assert exact Scope, `4` units, `38` memberships, `3` mappings, and zero unclassified memberships in the declared v5 evidence set.
- [ ] Verify the nine excluded fixture APIs are not members of the v5 snapshot and the four deferred assets remain unclassified rather than inferred.

**Focused checks:** v5 baseline readback, projection manifest readback, derived analysis status, exclusion assertions, and exact count assertions.

## Task 4: Synchronize records and close the session

- [ ] Add `docs/evidence/designer-3a-v5-membership-expansion-evidence.md` with exact commands, receipts, counts, projection status, and failure/recovery notes.
- [ ] Update the v5 Spec and ADR with implementation status and evidence while preserving the deferred backlog item for fixture cleanup.
- [ ] Run `pnpm design-facts:sync`, `pnpm design-facts:check`, focused governance tests, `pnpm typecheck`, and `git diff --check`.
- [ ] Close `design-change-session:87996974-cab9-496d-84cd-9492518f0466` through `pnpm design-context:close -- --status CONVERGED` with exact verification evidence, only after all MCP readbacks pass.
- [ ] Commit the implementation and evidence; leave unrelated untracked files untouched.

**Completion gate:** v5 MCP records, projection, repository evidence, and the same implementation session must all be converged. A failed MCP write or verification leaves the session open or closes it as `BLOCKED` with a retry trigger and must not be reported as complete.
