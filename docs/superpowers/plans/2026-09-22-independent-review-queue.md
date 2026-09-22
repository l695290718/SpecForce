# Independent Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the governed, read-only Independent Review Queue for brownfield semantic candidates in the exact `com.specforge.designcenter` Scope, with readiness-gated access, durable receipts, bounded disclosure, deterministic pagination, snapshot staleness detection, and independent reviewer enforcement.

**Architecture:** Add a read-only MCP tool backed by PostgreSQL-authoritative review/session/assertion/decision data. The tool validates a `DESIGN_CATALOG_CURATION` readiness receipt for the `independent-semantic-review` purpose, computes a deterministic review-set snapshot digest, persists an immutable queue-read receipt, and returns either bundle summaries or an allowlisted candidate projection. HMAC-signed cursors bind Scope, actor, readiness, snapshot, filters, projection, and page size. Reviewer decisions remain the existing write path and reject scan actors or candidate generators for T1-T3 decisions.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, `@specforge/scoped-read` cursor signing, Vitest, MCP tool registry, repository ADR plus SpecForge MCP synchronization.

## Global Constraints

- [x] Use the existing open design-change session `design-change-session:fa2e895e-5961-45ba-a8b3-970bc3869287` and exact Scope `com.specforge.designcenter`.
- [x] PostgreSQL is authoritative; do not add graph writes or treat graph projections as a review source.
- [x] Preserve English canonical fields and complete Chinese overlays for human-facing candidate projections.
- [x] Never expose raw candidate `value`, credentials, unrestricted source payloads, or arbitrary nested JSON through the queue.
- [x] Do not stage `.specforge/backups/`, `.specforge/baselines/`, or `.specforge/scans/` runtime-private directories.
- [x] Record exact focused verification commands/results in ADR and close the same MCP design-change session only after synchronization succeeds.

## Tasks

### 1. Add durable queue-receipt persistence

- [x] Add `KnowledgeReviewQueueReceipt` to Prisma with exact Scope, actor, readiness/session, projection/filter binding, review-set digests, expiry, and exposure metadata.
- [x] Add an additive migration and update MCP runtime schema bootstrap where required for environments that use bootstrap SQL.
- [x] Generate Prisma client and verify migration status without destructive reset.

### 2. Implement readiness-bound queue contracts and snapshot cursor

- [x] Add typed request/response/error contracts for `BUNDLES` and `CANDIDATES`, including completeness metadata and `CURRENT|STALE|BLOCKED` freshness.
- [x] Add a readiness-receipt validation helper that uses the existing readiness policy and receipt revalidation path for `DESIGN_CATALOG_CURATION` and the queue purpose.
- [x] Implement HMAC cursor encoding/decoding with version, key version, issued/expiry timestamps, exact Scope, actor, readiness receipt, review-set digest, projection/filter/page-size binding, and the two projection-specific order keys.
- [x] Implement deterministic review-set digest calculation from finalized scan data, terminal semantic batch receipts, bundle digests, and decision digests.

### 3. Implement `read_knowledge_review_queue`

- [x] Read finalized sessions and exact-Scope bundles/assertions/decisions inside a repeatable-read transaction.
- [x] Enforce readiness, `knowledge:read` plus `governance:run`, finalized-session status, projection/page-size limits, cursor binding, and the 256 KiB response cap.
- [x] Persist an immutable queue-read receipt for the first page and require it for continuation pages.
- [x] Return bundle summaries and global completeness for `BUNDLES`.
- [x] Return the bounded, bilingual, allowlisted candidate projection and completeness for `CANDIDATES`.
- [x] Return explicit stale/blocked/access/disclosure errors without leaking candidate payloads.

### 4. Register the MCP tool

- [x] Add the Zod input schema and tool metadata in `apps/mcp-server/src/tools.ts`.
- [x] Require `knowledge:read` and `governance:run`, mark the tool read-only, and ensure exact Scope authorization is preserved.
- [x] Add routing/metadata tests.

### 5. Enforce independent review decisions

- [x] Reject T1-T3 decisions when the reviewer is the scan-session actor or any candidate assertion generator in the bundle.
- [x] Preserve T0 behavior and require non-empty evidence for T2/T3 at the server boundary.
- [x] Add focused tests for same-actor, generator-actor, T0 exception, evidence, and Scope isolation cases.

### 6. Verify, document, and synchronize design facts

- [x] Run focused queue, persistence, tool, typecheck, migration, and lint tests; capture exact commands/results.
- [x] Update ADR `adr-system-owned-full-asset-repository-discovery` with the implemented queue increment, evidence, limits, and deferred production boundaries.
- [x] Synchronize ADR/Proposal/Context Pack and typed links through MCP, then run design-fact consistency checks.
- [x] Close `design-change-session:fa2e895e-5961-45ba-a8b3-970bc3869287` as `CONVERGED` only after all records and evidence agree.
- [x] Commit tracked implementation and documentation changes without staging runtime-private directories.

## Verification Commands

```powershell
pnpm db:generate
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
pnpm typecheck
pnpm test -- apps/mcp-server/src/knowledge/review-queue.test.ts apps/mcp-server/src/knowledge/persistence.test.ts apps/mcp-server/src/tools.test.ts
pnpm lint
pnpm design-facts:sync
pnpm design-facts:check
pnpm design-context:close -- --session design-change-session:fa2e895e-5961-45ba-a8b3-970bc3869287 --status CONVERGED --evidence "..."
```
