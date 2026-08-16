# Enterprise-Wide 3A Semantic Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an exact-Scope, immutable, bilingual 3A semantic coverage projection that preserves the published v6 architecture baseline, repairs six verified governance links through MCP, and exposes bounded coverage reads in MCP and the existing 3A workspace.

**Architecture:** PostgreSQL remains authoritative for authored revisions, typed relationship events, coverage manifests, and coverage rows. An append-only per-Scope catalog revision stream and the existing relationship waterline pin a reproducible input; a separate asynchronous coverage projector materializes one deterministic row per authored record. The existing 3A architecture-unit projection remains unchanged except for correcting published-build reuse so it cannot return a manifest whose input digest differs from the request.

**Tech Stack:** TypeScript, Prisma, PostgreSQL, MCP SDK, Vitest, Next.js, React, existing `@specforge/core`, `@specforge/knowledge-query`, and the existing `apps/knowledge-projector` runtime.

## Global Constraints

## Implementation Status (2026-08-16)

Tasks 1-8 are implemented for the exact Designer Scope. The final v10 coverage generation is `CURRENT` with `297/297 COVERED`, while the accepted v6 architecture baseline remains `8/42/6`. Continuous legacy scanning, external synchronization, cross-Scope comparison, and external `APPLY` remain deferred by design.

- Owning Scope is exactly `com.huawei.celon.desiner` with path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Published v6 remains `8` units, `42` direct memberships, and `6` mappings; no artificial v7 is created.
- The immutable coverage profile is `generic-system@2`.
- Coverage roles are `MEMBERSHIP`, `TRACEABILITY`, and `EXEMPTION`; statuses are `COVERED`, `BLOCKED`, and `NOT_EVALUATED`.
- Traceability uses only the role-specific directed path grammar in `docs/superpowers/specs/2026-08-16-enterprise-3a-semantic-coverage-design.md`, with a maximum of three relationships.
- PostgreSQL is authoritative; graph stores are derived and unavailable graph services cannot block coverage correctness.
- Every MCP authored write must use the exact Scope and append a catalog revision in the same PostgreSQL transaction as the current-state update.
- Every coverage generation is immutable, exact-Scope, pinned by catalog and relationship waterlines, and published only after endpoint, count, digest, and row-closure checks pass.
- English is canonical and Chinese human-facing localization is complete.
- A failed MCP write or missing MCP closure is `MCP synchronization blocked` and cannot be reported as complete.
- Preserve unrelated user files: `outputs/` and `scripts/build-design-code-challenge-workbook.mjs` remain untouched and untracked.
- The open design session is `design-change-session:3f60911b-4a6e-49d8-977d-0391dcea39f3`; record this session in implementation evidence and close it only after implementation and MCP readback.

## File Map

Files created or changed by the plan:

- `prisma/schema.prisma`: append-only catalog cursor/revision models and immutable coverage manifest/job/row models.
- `apps/mcp-server/src/persistence.ts`: transactional authored-revision append and bootstrap helpers for DesignAsset, Proposal, ContextPack, and deletion paths.
- `apps/mcp-server/src/knowledge/catalog-revision.ts`: exact-Scope catalog waterline and revision snapshot repository.
- `packages/core/src/coverage/types.ts`: coverage roles, statuses, reason codes, path evidence, manifest, row, and report contracts.
- `packages/core/src/coverage/policy.ts`: `generic-system@2` role-specific path grammar and deterministic path selection.
- `packages/core/src/coverage/index.ts`: coverage exports.
- `packages/core/src/knowledge/projection-v2.ts`: input-digest/build-key compatibility correction for existing 3A projection builds.
- `apps/mcp-server/src/knowledge/coverage-build.ts`: coverage build request/status service and exact input pinning.
- `apps/knowledge-projector/src/coverage-materializer.ts`: bounded coverage batch evaluation and publication payload generation.
- `apps/knowledge-projector/src/coverage-repository.ts`: PostgreSQL coverage job, snapshot, row, and manifest persistence.
- `apps/knowledge-projector/src/coverage-runtime.ts`: coverage worker polling and lease processing in the existing projector process.
- `apps/mcp-server/src/knowledge/coverage-report.ts`: bounded exact-Scope MCP coverage report query.
- `apps/mcp-server/src/tools.ts`: MCP registration for coverage build/status/report tools.
- `scripts/repair-enterprise-3a-coverage-links.ts`: MCP-only repair of the six verified relationship gaps.
- `scripts/verify-enterprise-3a-coverage.ts`: exact-Scope operational verification and evidence output.
- `packages/core/src/coverage/*.test.ts`: pure policy and digest tests.
- `apps/mcp-server/src/knowledge/catalog-revision.test.ts`: revision and waterline tests.
- `apps/mcp-server/src/knowledge/coverage-build.test.ts`: build-key and build-status tests.
- `apps/mcp-server/src/knowledge/coverage-report.test.ts`: report authorization and pagination tests.
- `apps/knowledge-projector/src/coverage-materializer.test.ts`: path, determinism, and closure tests.
- `apps/knowledge-projector/src/coverage-repository.test.ts`: persistence and idempotency tests.
- `apps/web/lib/3a/workspace-loader.ts`: load the bounded coverage summary for the existing workspace.
- `apps/web/components/three-a/coverage-summary.tsx`: role/status summary and stale state.
- `apps/web/components/three-a/coverage-detail.tsx`: filtered coverage rows and path/blocker explanation.
- `apps/web/components/three-a/three-a-workspace.tsx`: compose coverage summary/detail without changing existing architecture views.
- `apps/web/lib/i18n.ts`: complete English/Chinese coverage copy.
- `docs/adr/0026-enterprise-3a-semantic-coverage.md`: repository ADR with implementation evidence and the six MCP link repairs.
- `docs/evidence/enterprise-3a-semantic-coverage-evidence.md`: exact commands, MCP receipts, watermarks, counts, and readback.

---

### Task 1: Add the Exact-Scope Authored Catalog Revision Stream

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `apps/mcp-server/src/knowledge/catalog-revision.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Create: `apps/mcp-server/src/knowledge/catalog-revision.test.ts`
- Test: `apps/mcp-server/src/persistence.integration.test.ts`

**Interfaces:**
- Produce `AuthoredCatalogCursor` with `(applicationServiceId, scopePath, catalogVersion)`.
- Produce `AuthoredAssetRevision` with `(applicationServiceId, scopePath, catalogVersion, assetType, assetId, operation, payload, contentDigest, actorType, actorId, channel, correlationId, idempotencyKey)`.
- Produce `appendAuthoredAssetRevision(transaction, input): Promise<{ catalogVersion: bigint; contentDigest: string }>`.
- Produce `readAuthoredCatalogSnapshot(scope, catalogVersion): Promise<{ catalogVersion: bigint; digest: string; revisions: AuthoredAssetRevision[] }>`.

- [ ] **Step 1: Write failing schema/revision tests.**

Add tests proving that two writes in one Scope receive increasing versions, a repeated idempotency key does not append a second revision, and the same asset ID in two Scopes receives independent cursors.

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "../../persistence";
import { appendAuthoredAssetRevision } from "./catalog-revision";

it("appends one monotonic revision per exact-Scope authored write", async () => {
  const architectureScope = {
    applicationServiceId: "com.example.orders",
    scopePath: "org/product/orders/service"
  };
  const revisionInput = (idempotencyKey: string) => ({
    architectureScope,
    assetType: "api" as const,
    assetId: "api-orders-create",
    operation: "UPSERT" as const,
    payload: { id: "api-orders-create", name: "Create order", architectureScope },
    actorType: "agent",
    actorId: "test-agent",
    channel: "mcp",
    correlationId: `test:${idempotencyKey}`,
    idempotencyKey
  });
  const first = await prisma.$transaction((transaction) => appendAuthoredAssetRevision(transaction, revisionInput("asset-1")));
  const second = await prisma.$transaction((transaction) => appendAuthoredAssetRevision(transaction, revisionInput("asset-2")));
  expect(second.catalogVersion).toBe(first.catalogVersion + 1n);
});
```

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/catalog-revision.test.ts`

Expected: FAIL because the models and helper do not exist.

- [ ] **Step 2: Add the append-only Prisma models and exact-Scope indexes.**

Add `AuthoredCatalogCursor` with a unique exact-Scope key and `nextVersion BigInt`. Add `AuthoredAssetRevision` with exact Scope, `catalogVersion BigInt`, `assetType`, `assetId`, `operation`, `payload Json`, `contentDigest`, actor/audit fields, and unique `(applicationServiceId, scopePath, idempotencyKey)`. Add indexes for `(Scope, catalogVersion)` and `(Scope, assetType, assetId, catalogVersion)`.

Run: `pnpm db:push`

Expected: Prisma applies the additive schema with no data loss.

- [ ] **Step 3: Implement the transactional append helper.**

In `catalog-revision.ts`, lock or create the exact-Scope cursor, return the existing revision for a reused idempotency key, otherwise increment the cursor and create one immutable revision. Compute `contentDigest` from canonical English payload plus localized overlay and exact Scope. Never accept a missing Scope.

- [ ] **Step 4: Wire DesignAsset, Proposal, ContextPack, and deletion writes.**

Call `appendAuthoredAssetRevision` inside the existing transaction for `upsertDesignAsset`. Wrap Proposal and ContextPack upserts in the same transaction pattern before appending their revisions. Add tombstone revisions to `deletePersistedDesignData`. Preserve existing graph relationship synchronization and MCP actor checks.

- [ ] **Step 5: Add one-time bootstrap for existing current rows.**

Implement an idempotent bootstrap command that reads current rows by exact Scope, creates only missing initial revisions, verifies each digest against the canonical current payload, and records the cursor watermark. It must not create new authored facts or assign architecture membership.

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/catalog-revision.test.ts apps/mcp-server/src/persistence.integration.test.ts`

Expected: PASS; exact-Scope writes, idempotency, deletion tombstones, and bootstrap digest checks pass.

- [ ] **Step 6: Commit the revision-stream slice.**

```bash
git add prisma/schema.prisma apps/mcp-server/src/knowledge/catalog-revision.ts apps/mcp-server/src/knowledge/catalog-revision.test.ts apps/mcp-server/src/persistence.ts apps/mcp-server/src/persistence.integration.test.ts
git commit -m "feat: add scoped authored catalog revisions"
```

### Task 2: Implement the `generic-system@2` Coverage Policy

**Files:**
- Create: `packages/core/src/coverage/types.ts`
- Create: `packages/core/src/coverage/policy.ts`
- Create: `packages/core/src/coverage/index.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/coverage/policy.test.ts`
- Create: `packages/core/src/coverage/digest.test.ts`

**Interfaces:**
- `CoverageRole = "MEMBERSHIP" | "TRACEABILITY" | "EXEMPTION"`.
- `CoverageStatus = "COVERED" | "BLOCKED" | "NOT_EVALUATED"`.
- `CoveragePathEvidence = { relationshipIdentity: string; relationCode: string; sourceType: string; sourceId: string; targetType: string; targetId: string }[]`.
- `evaluateCoverageCandidate(input: CoverageCandidate, policy: CoveragePolicy): CoverageResult`.
- `selectCoveragePath(paths: CoveragePathEvidence[][], policy: CoveragePolicy): CoveragePathEvidence[] | undefined`.
- `coverageInputDigest(input): string` and `coverageBuildKey(input): string`.

- [ ] **Step 1: Write failing pure policy tests.**

Cover direct membership, every supported Quality/ADR/Evidence/Proposal/Context Pack grammar, wrong direction, invalid endpoint type, cross-Scope path, dangling endpoint, ambiguous membership, deterministic path tie-breaking, and the six reason codes used by the implementation.

```ts
import { expect, it } from "vitest";
import { evaluateCoverageCandidate, genericSystemCoverageProfile } from "./policy";

it("accepts Evidence only through VALIDATES then DECIDES", () => {
  const evidencePath = {
    exactScope: { applicationServiceId: "com.example.orders", scopePath: "org/product/orders/service" },
    source: { assetType: "evidence", assetId: "evidence-1" },
    path: [
      { relationshipIdentity: "link-evidence-adr", relationCode: "VALIDATES", sourceType: "evidence", sourceId: "evidence-1", targetType: "adr", targetId: "adr-1" },
      { relationshipIdentity: "link-adr-api", relationCode: "DECIDES", sourceType: "adr", sourceId: "adr-1", targetType: "api", targetId: "api-orders-create" }
    ],
    directMemberIds: ["api-orders-create"]
  };
  const reversedEvidencePath = { ...evidencePath, path: [...evidencePath.path].reverse() };
  expect(evaluateCoverageCandidate(evidencePath, genericSystemCoverageProfile)).toMatchObject({ role: "TRACEABILITY", status: "COVERED" });
  expect(evaluateCoverageCandidate(reversedEvidencePath, genericSystemCoverageProfile).reasonCode).toBe("RELATION_DIRECTION_INVALID");
});
```

Run: `pnpm exec vitest run packages/core/src/coverage/policy.test.ts packages/core/src/coverage/digest.test.ts`

Expected: FAIL because policy types and evaluator do not exist.

- [ ] **Step 2: Define immutable coverage contracts and reason codes.**

Include exact Scope, generation, source digest, role, status, terminal member, bounded path evidence, diagnostic reference, and row digest. Define reason codes for `AMBIGUOUS_MEMBERSHIP`, `MISSING_TYPED_PATH`, `RELATION_DIRECTION_INVALID`, `ENDPOINT_SCOPE_MISMATCH`, `ENDPOINT_NOT_FOUND`, `UNSUPPORTED_PATH`, `MISSING_LOCALIZATION`, and `SNAPSHOT_UNAVAILABLE`.

- [ ] **Step 3: Implement the role-specific evaluator.**

Implement direct membership first, then role-specific traceability. Reject arbitrary relation sequences. Select multiple valid paths by shortest path, declared profile precedence, terminal member identity, and relationship identity. Permit no shared membership unless the profile explicitly lists the asset type.

- [ ] **Step 4: Implement canonical digests and build keys.**

Canonicalize exact Scope, Baseline generation, profile, catalog/relationship waterlines, and query inputs. Exclude attempts and timestamps. Ensure the same logical input produces the same digest regardless of object key order.

Run: `pnpm --filter @specforge/core typecheck` and `pnpm exec vitest run packages/core/src/coverage/policy.test.ts packages/core/src/coverage/digest.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the policy slice.**

```bash
git add packages/core/src/coverage packages/core/src/index.ts
git commit -m "feat: add governed 3A coverage policy"
```

### Task 3: Add Immutable Coverage Storage and Build Jobs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `apps/mcp-server/src/knowledge/coverage-build.ts`
- Create: `apps/mcp-server/src/knowledge/coverage-build.test.ts`
- Create: `apps/knowledge-projector/src/coverage-repository.ts`
- Create: `apps/knowledge-projector/src/coverage-repository.test.ts`

**Interfaces:**
- `requestCoverageBuild(input: CoverageBuildRequest): Promise<CoverageBuildSubmission>`.
- `getCoverageBuild(input: CoverageBuildStatusInput): Promise<CoverageBuildStatusResult>`.
- `CoverageBuildRepository.claim/renew/loadBatch/writeBatch/publish/fail`.
- Models: `ArchitectureCoverageBuildJob`, `ArchitectureCoverageManifest`, `ArchitectureAssetCoverageProjection`.

- [ ] **Step 1: Write failing repository tests.**

Test exact-Scope composite identities, generation/asset-type/asset-ID uniqueness, idempotent batch writes, row count closure, manifest publication, and rejection when the job input digest does not match the published result.

Run: `pnpm exec vitest run apps/knowledge-projector/src/coverage-repository.test.ts apps/mcp-server/src/knowledge/coverage-build.test.ts`

Expected: FAIL because the models and repository do not exist.

- [ ] **Step 2: Add additive Prisma models.**

Add `ArchitectureCoverageBuildJob` with exact Scope, build key, generation, pinned catalog/relationship waterlines, profile, status, lease, checkpoint, counts, error, and timestamps. Add `ArchitectureCoverageManifest` with immutable digests, counts, publication state, and waterlines. Add `ArchitectureAssetCoverageProjection` with exact Scope, generation, asset type/ID, role/status, member/path/reason fields, source digest, and row digest. Add indexes for exact Scope plus status/role/type and keyset ordering.

Run: `pnpm db:push`

Expected: additive migration succeeds and existing v6 projection tables remain unchanged.

- [ ] **Step 3: Implement build submission with pinned waterlines.**

Authorize exact Scope, load official v6 Baseline and `generic-system@2`, read the current catalog cursor and relationship graph version in one short transaction, compute `coverageBuildKey`, and create/reuse a job only by that key. A published manifest is reusable only when its stored `inputDigest` equals the requested key.

- [ ] **Step 4: Implement manifest and row persistence.**

Use idempotent upserts keyed by exact Scope/generation/asset type/asset ID. Publish in one transaction only after every expected row is present, there are no duplicate keys, all endpoint Scope values match, and computed counts/digests match the manifest. Never mark partial rows `READY`.

- [ ] **Step 5: Run persistence tests and commit.**

Run: `pnpm exec vitest run apps/knowledge-projector/src/coverage-repository.test.ts apps/mcp-server/src/knowledge/coverage-build.test.ts`

Expected: PASS.

```bash
git add prisma/schema.prisma apps/mcp-server/src/knowledge/coverage-build.ts apps/mcp-server/src/knowledge/coverage-build.test.ts apps/knowledge-projector/src/coverage-repository.ts apps/knowledge-projector/src/coverage-repository.test.ts
git commit -m "feat: persist immutable 3A coverage generations"
```

### Task 4: Materialize Coverage Through the Existing Projector

**Files:**
- Create: `apps/knowledge-projector/src/coverage-materializer.ts`
- Create: `apps/knowledge-projector/src/coverage-materializer.test.ts`
- Create: `apps/knowledge-projector/src/coverage-runtime.ts`
- Modify: `apps/knowledge-projector/src/main.ts`
- Modify: `apps/knowledge-projector/src/runtime.ts`
- Modify: `apps/knowledge-projector/src/repository.ts`

**Interfaces:**
- `materializeCoverageBatch(job, snapshot): MaterializedCoverageBatch`.
- `CoverageProjectorRuntime.processNext(): Promise<CoverageProcessResult>`.
- `CoverageSnapshotLoader.load(scope, catalogVersion, relationshipVersion, cursor): Promise<CoverageSnapshotBatch>`.

- [ ] **Step 1: Write failing materializer tests.**

Test the exact 293-record fixture shape: 42 direct members plus 2 covered Quality, 22 covered non-member ADRs, 181 covered Evidence, 20 covered Proposals, 20 covered Context Packs, and 6 blocked records before repair. Test that the selected path is stable when relationship input order changes.

Run: `pnpm exec vitest run apps/knowledge-projector/src/coverage-materializer.test.ts`

Expected: FAIL because coverage materialization is not implemented.

- [ ] **Step 2: Implement bounded snapshot loading.**

Load append-only authored revisions at or before the pinned catalog version, reconstruct the latest non-deleted revision per exact `(assetType, assetId)`, and load relationship events at or before the pinned relationship version. Use keyset pagination by `(assetType, assetId)` and never query another Scope.

- [ ] **Step 3: Implement deterministic batch evaluation.**

For each row, call `evaluateCoverageCandidate`, attach at most three relationship evidence entries, calculate the row digest, and persist a checkpoint containing the last asset key and pinned waterlines. Do not perform unbounded traversal or call a graph database.

- [ ] **Step 4: Implement worker leases and atomic publication.**

Run coverage jobs alongside the existing projector process with separate claim/lease methods. On restart, resume from the checkpoint. At publication, verify catalog and relationship digests against the job waterlines and reject any count, endpoint, or row-digest mismatch.

- [ ] **Step 5: Run materializer tests and commit.**

Run: `pnpm exec vitest run apps/knowledge-projector/src/coverage-materializer.test.ts apps/knowledge-projector/src/materializer.test.ts`

Expected: PASS; existing 3A projection tests remain green.

```bash
git add apps/knowledge-projector/src/coverage-materializer.ts apps/knowledge-projector/src/coverage-materializer.test.ts apps/knowledge-projector/src/coverage-runtime.ts apps/knowledge-projector/src/main.ts apps/knowledge-projector/src/runtime.ts apps/knowledge-projector/src/repository.ts
git commit -m "feat: materialize scoped 3A coverage"
```

### Task 5: Correct Existing Projection Reuse and Synchronize the Six Links

**Files:**
- Modify: `apps/mcp-server/src/knowledge/projection-build.ts`
- Modify: `packages/core/src/knowledge/projection-v2.ts`
- Create: `scripts/repair-enterprise-3a-coverage-links.ts`
- Create: `scripts/repair-enterprise-3a-coverage-links.test.ts`

**Interfaces:**
- Existing 3A `requestProjectionBuild` must only reuse a published manifest when `published.inputDigest === requested buildKey`.
- `repairEnterprise3aCoverageLinks(): Promise<{ created: number; existing: number; blocked: string[] }>` must call MCP `upsert_asset_link` with the exact Scope.

- [ ] **Step 1: Write failing reuse and repair tests.**

Test that a published manifest with the same Baseline/profile/schema but a different input digest queues a new build. Test the exact repair set: four `DECIDES` links from the v6 ADR, three `IMPACTS` links from `proposal-agent-service-workspace`, and four `IMPACTS` links from `proposal-mcp-native-scoped-seeding`. Replaying the script must be idempotent.

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/projection-build.test.ts scripts/repair-enterprise-3a-coverage-links.test.ts`

Expected: FAIL before the lookup and MCP repair changes.

- [ ] **Step 2: Fix published-manifest reuse.**

Add the requested input digest to the published-manifest predicate and keep the existing Serializable job transaction. Add a regression test for changed input waterlines and query input.

- [ ] **Step 3: Implement the MCP-only repair script.**

Use the existing MCP client pattern from `scripts/sync-design-facts.ts`. Send only exact-Scope `upsert_asset_link` commands, preserve stable idempotency keys, validate the returned relation type and endpoint Scope, and fail on any `isError` response. Do not insert into `AssetLink` directly.

- [ ] **Step 4: Run repair in the exact Designer Scope.**

Run: `pnpm exec tsx scripts/repair-enterprise-3a-coverage-links.ts`

Expected: a JSON receipt showing 11 relationship commands accepted or already present and zero blocked writes.

- [ ] **Step 5: Commit the reuse fix and MCP repair script.**

```bash
git add apps/mcp-server/src/knowledge/projection-build.ts packages/core/src/knowledge/projection-v2.ts scripts/repair-enterprise-3a-coverage-links.ts scripts/repair-enterprise-3a-coverage-links.test.ts
git commit -m "fix: enforce projection input identity and repair coverage links"
```

### Task 6: Expose the Bounded MCP Coverage Report

**Files:**
- Create: `apps/mcp-server/src/knowledge/coverage-report.ts`
- Create: `apps/mcp-server/src/knowledge/coverage-report.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/knowledge/coverage-build.ts`

**Interfaces:**
- `get3aCoverageReport(input: Get3aCoverageReportInput): Promise<Get3aCoverageReportResult>`.
- Tool name: `get_3a_coverage_report`.
- Optional build tools: `request_3a_coverage_build` and `get_3a_coverage_build`.

- [ ] **Step 1: Write failing report tests.**

Cover exact Scope authorization, default latest manifest, selected historical generation, filters for role/status/asset type/unit/reason, maximum page size, keyset continuation, `CURRENT` versus `STALE`, and no cross-Scope data.

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/coverage-report.test.ts`

Expected: FAIL because the report service and MCP registration do not exist.

- [ ] **Step 2: Implement the bounded repository query.**

Query only `ArchitectureAssetCoverageProjection` by exact Scope and generation. Order by `(assetType, assetId)`, fetch `limit + 1`, return an opaque continuation token, and never resolve paths from live relationships.

- [ ] **Step 3: Implement manifest freshness.**

Compare the manifest waterlines and profile version with the current exact-Scope cursor/relationship state. Return historical data with `STALE` when any input differs; never mutate the manifest.

- [ ] **Step 4: Register MCP schemas and permissions.**

Register the read report with `knowledge:read`; register build/status with the existing projection write/read permissions. Require `architectureScope` in every input and sanitize diagnostics to the authorized Scope.

- [ ] **Step 5: Run MCP tests and commit.**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/coverage-report.test.ts apps/mcp-server/src/tools.test.ts`

Expected: PASS; the MCP server starts and the report is available only in the requested Scope.

```bash
git add apps/mcp-server/src/knowledge/coverage-report.ts apps/mcp-server/src/knowledge/coverage-report.test.ts apps/mcp-server/src/knowledge/coverage-build.ts apps/mcp-server/src/tools.ts
git commit -m "feat: expose bounded 3A coverage report"
```

### Task 7: Add Coverage to the Existing 3A Workspace

**Files:**
- Modify: `apps/web/lib/3a/workspace-loader.ts`
- Create: `apps/web/components/three-a/coverage-summary.tsx`
- Create: `apps/web/components/three-a/coverage-detail.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Create: `apps/web/components/three-a/coverage-summary.test.tsx`
- Create: `apps/web/components/three-a/coverage-detail.test.tsx`

**Interfaces:**
- Extend `ThreeAWorkspaceData` with optional `coverage?: ThreeACoverageReport`.
- `CoverageSummary({ report, locale }): JSX.Element` renders role/status totals and freshness.
- `CoverageDetail({ rows, filters, onFilterChange }): JSX.Element` renders bounded rows, path evidence, blocker reason, and continuation state.

- [ ] **Step 1: Write failing component and loader tests.**

Test that a stale report is visibly labeled, all counts are rendered, a blocker shows its reason/path state, filters remain within the current Scope, and the existing architecture map receives no changed `unclassifiedCount` semantics.

Run: `pnpm exec vitest run apps/web/components/three-a/coverage-summary.test.tsx apps/web/components/three-a/coverage-detail.test.tsx apps/web/lib/3a/workspace-loader.test.ts`

Expected: FAIL because coverage data and components do not exist.

- [ ] **Step 2: Load the report through the existing server-side workspace loader.**

After selecting the current Baseline/Projection, call the bounded report service for the same exact Scope. Keep coverage independent from architecture map tabs and return a safe error code when the report is unavailable.

- [ ] **Step 3: Implement the compact summary.**

Show direct membership, traceability, blockers, exemptions, not-evaluated, and `CURRENT`/`STALE` using the existing card and typography conventions. Keep existing BIZ/SYS/TECH values unchanged.

- [ ] **Step 4: Implement filterable detail.**

Render asset type/ID, role, status, terminal unit/member, reason, and bounded relationship path. Use URL-safe state or local component state consistent with the existing 3A workspace; do not add a new route.

- [ ] **Step 5: Add complete bilingual copy.**

Add English canonical and Chinese localized keys for coverage title, roles, statuses, freshness, empty state, blocker, path evidence, filters, and continuation. Do not leave user-facing fallback English in the Chinese locale.

- [ ] **Step 6: Run web tests and commit.**

Run: `pnpm exec vitest run apps/web/components/three-a/coverage-summary.test.tsx apps/web/components/three-a/coverage-detail.test.tsx apps/web/lib/3a/workspace-loader.test.ts`

Expected: PASS; the existing `/architecture/3a` route still renders all current modes.

```bash
git add apps/web/lib/3a/workspace-loader.ts apps/web/components/three-a/coverage-summary.tsx apps/web/components/three-a/coverage-detail.tsx apps/web/components/three-a/three-a-workspace.tsx apps/web/lib/i18n.ts apps/web/components/three-a/coverage-summary.test.tsx apps/web/components/three-a/coverage-detail.test.tsx
git commit -m "feat: show 3A coverage in architecture workspace"
```

### Task 8: Publish, Verify, and Record the Design Facts

**Files:**
- Create: `scripts/verify-enterprise-3a-coverage.ts`
- Create: `docs/adr/0026-enterprise-3a-semantic-coverage.md`
- Create: `docs/evidence/enterprise-3a-semantic-coverage-evidence.md`
- Modify through MCP only: the matching ADR, Proposal, Context Pack, Evidence, and typed links in the Designer Scope.

**Interfaces:**
- `verifyEnterprise3aCoverage(): Promise<{ scope; baseline; manifest; counts; repairedLinks; staleState; checks }>`.
- Verification output must include exact command strings and results, session ID, catalog/relationship watermarks, manifest ID, input/content digests, and MCP readback IDs.

- [ ] **Step 1: Write the failing operational verification assertions.**

Assert v6 `8/42/6`, exactly 293 coverage rows, `287 COVERED + 6 BLOCKED` before repair, `287 COVERED + 0 BLOCKED + 0 NOT_EVALUATED` after repair, and no cross-Scope rows. Assert the existing v5 Baseline remains readable.

Run: `pnpm exec tsx scripts/verify-enterprise-3a-coverage.ts`

Expected: FAIL until the repair, build, and report are complete.

- [ ] **Step 2: Run the exact MCP repair and request the coverage build.**

Run the repair script from Task 5, then request `generic-system@2` for the official v6 Baseline through MCP. Poll the status until `READY` or fail with the returned diagnostic reference.

- [ ] **Step 3: Run the verification script and capture evidence.**

Run: `pnpm exec tsx scripts/verify-enterprise-3a-coverage.ts`

Expected: JSON reports exact Scope, repaired links, v6 `8/42/6`, 293 coverage rows, zero blockers, zero unevaluated rows, current manifest state, and v5 regression readability.

- [ ] **Step 4: Write repository ADR and bilingual evidence.**

Record the architecture decision, catalog revision stream, path grammar, projection boundary, scale behavior, failure semantics, and exact verification results. The ADR must distinguish implemented behavior, locally verified behavior, and deferred production capabilities. The evidence file must contain English canonical facts and complete Chinese localization.

- [ ] **Step 5: Synchronize matching MCP design facts.**

Use MCP `upsert_proposal`, `upsert_design_asset` for ADR/Evidence where applicable, `upsert_context_pack`, and `upsert_asset_link` in the exact Scope. Link Proposal to ADR with `IMPLEMENTS_DECISION`, Context Pack to Proposal with `IMPLEMENTS_CONTEXT_FOR`, Evidence to ADR with `VALIDATES`, and ADR to affected classified assets with `DECIDES`. Never write these records directly with Prisma.

- [ ] **Step 6: Close the same Design Change Session.**

Run:

```bash
pnpm design-context:close -- --session design-change-session:3f60911b-4a6e-49d8-977d-0391dcea39f3 --status CONVERGED --evidence "pnpm exec tsx scripts/repair-enterprise-3a-coverage-links.ts=passed,pnpm exec tsx scripts/verify-enterprise-3a-coverage.ts=passed,pnpm exec vitest run=passed,git diff --check=passed"
```

Expected: MCP returns a `CONVERGED` closure for the exact Designer Scope. If any MCP write or verification fails, record `MCP synchronization blocked`, the failure reason, owner, and retry trigger; do not close as converged.

- [ ] **Step 7: Run final checks and commit governance records.**

Run:

```bash
pnpm --filter @specforge/core typecheck
pnpm exec vitest run packages/core/src/coverage apps/mcp-server/src/knowledge/coverage apps/knowledge-projector/src/coverage-materializer.test.ts apps/knowledge-projector/src/coverage-repository.test.ts apps/web/components/three-a
git diff --check
```

Expected: all focused tests pass, exact Scope readback agrees with repository records, and no unrelated user file is staged.

```bash
git add docs/adr/0026-enterprise-3a-semantic-coverage.md docs/evidence/enterprise-3a-semantic-coverage-evidence.md scripts/verify-enterprise-3a-coverage.ts
git commit -m "docs: record enterprise 3A coverage evidence"
```

## Self-Review Checklist

- [x] Spec coverage: catalog revision waterlines map to Task 1; policy and three-hop grammar map to Task 2; manifest/row storage maps to Task 3; deterministic worker behavior maps to Task 4; projection reuse and six MCP repairs map to Task 5; bounded MCP reads map to Task 6; bilingual UI map to Task 7; ADR/evidence/session closure map to Task 8.
- [x] No placeholder language remains in the plan; every task names files, interfaces, commands, expected results, and commit boundaries.
- [x] Type consistency: `coverageBuildKey`, `CoverageBuildRepository`, `evaluateCoverageCandidate`, `get3aCoverageReport`, and `ThreeAWorkspaceData.coverage` are introduced before their consumers.
- [x] Scale constraint is explicit: immutable waterlines, keyset pagination, bounded paths, batch checkpoints, and materialized reads are required before publication.
- [x] Existing v6 architecture queries remain backward-compatible and retain their current `unclassifiedCount` meaning.
- [x] The final task distinguishes implementation, local verification, MCP synchronization, and deferred external capabilities.
