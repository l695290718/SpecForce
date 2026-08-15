# Governed 3A Architecture Fact Authoring Implementation Plan

> **Execution status (2026-08-15): COMPLETE for the generic capability and the first Designer Scope slice.** The implementation session `design-change-session:fa68fdd5-8d04-4e64-a111-8e4c71f69a54` covered the additive Prisma models, bounded bilingual validators, MCP batch/review/promotion/reconciliation tools, Baseline references, deterministic projector loader, and focused verification. Enterprise-wide connector, continuous synchronization, and production-scale graph work remains in `docs/TODO.md`.

Evidence: `docs/evidence/designer-3a-onboarding-evidence.md`, `docs/evidence/designer-3a-candidate-review.md`, ADR-0025, `pnpm db:push`, the typechecks, `pnpm exec prisma validate`, `pnpm exec tsx scripts/bootstrap-designer-3a.ts`, and `pnpm exec tsx scripts/process-designer-3a-projection.ts`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an exact-Scope, bilingual, idempotent MCP authoring path for governed architecture units, memberships, and mappings, then publish them through the existing review, ChangeSet, Baseline, and deterministic projection lifecycle.

**Architecture:** First-class immutable architecture fact revisions remain distinct from scan-derived `KnowledgeAssertion` rows. The existing governance envelope gains additive architecture revision references, while a dedicated architecture promotion service handles authored provenance. PostgreSQL is authoritative; current architecture projection tables remain rebuildable and generation-bound.

**Tech Stack:** TypeScript, pnpm workspaces, Zod, Prisma/PostgreSQL, MCP SDK, Vitest, existing knowledge governance and projector services.

## Global Constraints

- Exact Scope is `applicationServiceId` plus full `scopePath`; every write, endpoint lookup, decision, ChangeSet, Baseline, and projection query includes both fields.
- MCP is the only runtime authoring boundary; Web remains read-only.
- English canonical name and description are required, with complete Chinese `zh` overlays for all human-facing content.
- PostgreSQL is authoritative; `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, and `ArchitectureUnitMappingProjection` remain derived.
- Candidate content is immutable after submission; semantic changes create a new revision.
- Submission is bounded to 100 units, 1,000 memberships, 500 mappings, and 4 MiB canonical bytes per batch.
- No approval, promotion, Baseline publication, or design-session closure is automatic.
- Existing scan-based assertion promotion and old Baselines must remain compatible.
- Begin implementation with a new exact-Scope `prepare_design_change` session; the written-design session does not authorize code changes.

---

### Task 0: Open the exact-Scope implementation session

**Files:**
- Read: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Read: `docs/superpowers/specs/2026-08-15-governed-3a-architecture-fact-authoring-design.md`

**Interfaces:**
- Consumes: the approved written design and current exact-Scope design catalog.
- Produces: `$architectureAuthoringSessionId`, the OPEN design-change session used by every later task.

- [ ] **Step 1: Run preflight and capture the session ID before editing code**

```powershell
$preflightOutput = pnpm design-context:preflight -- --intent "Implement first-class MCP-governed 3A architecture fact authoring, promotion, Baseline publication, and deterministic projection loading" --affected "adr-readable-3a-architecture-mapping,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "approved-spec:2026-08-15-governed-3a-architecture-fact-authoring-design"
$architectureAuthoringSessionId = [regex]::Match(($preflightOutput -join "`n"), '"sessionId":\s*"([^"]+)"').Groups[1].Value
if (-not $architectureAuthoringSessionId) { throw "DESIGN_CHANGE_SESSION_RECEIPT_MISSING" }
```

Expected: the output contains one OPEN session in the exact Designer Scope, reconciliation is not blocked, and `$architectureAuthoringSessionId` is non-empty.

- [ ] **Step 2: Record the exact receipt in the implementation notes**

Record the session ID, design-context digest, relationship digest, read asset count, and receipt path in ADR-0025 before the first code commit. If Scope is mismatched or reconciliation is blocked, stop implementation and close the session as `BLOCKED` with the reported reason.

### Task 1: Define canonical architecture authoring contracts and persistence

**Files:**
- Create: `packages/core/src/architecture-authoring/types.ts`
- Create: `packages/core/src/architecture-authoring/validation.ts`
- Create: `packages/core/src/architecture-authoring/validation.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/knowledge/types.ts`
- Modify: `packages/core/src/knowledge/service.ts`
- Modify: `packages/core/src/knowledge/service.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260815_governed_3a_architecture_facts/migration.sql`
- Modify: `prisma/three-a-schema.test.ts`

**Interfaces:**
- Consumes: `ArchitectureScopeRef`, `ArchitectureLayer`, `ArchitectureUnitKind`, `ReviewBundle`, `KnowledgePromotionDecision`, `ChangeSet`, and `BaselineManifest`.
- Produces: `ArchitectureFactBatch`, `ArchitectureUnitRevision`, `ArchitectureUnitMembershipRevision`, `ArchitectureUnitMappingRevision`, `ArchitectureFactBatchSubmission`, and additive architecture revision arrays on shared governance types.

- [ ] **Step 1: Write failing contract tests**

Add fixtures for one bilingual BIZ capability, one SYS service, one TECH platform, two memberships, and two mappings. Assert acceptance of the valid batch and named failures for missing English description, missing Chinese overlay, invalid layer-kind pair, same-layer mapping, TECH-to-BIZ mapping, unresolved parent, duplicate logical identity, cross-Scope member target, and canonical payload above 4 MiB.

```ts
const submission: ArchitectureFactBatchSubmission = {
  id: "architecture-fact-batch:designer:001",
  idempotencyKey: "designer-initial-3a-v1",
  designChangeSessionId: "design-change-session:implementation",
  architectureScope,
  provenance: { actor: "agent:codex", tool: "specforge-mcp", runId: "run-001" },
  evidenceRefs: ["design-asset:api-specforge-3a-architecture-query"],
  units: [{
    unitIdentity: "unit:biz:architecture-governance",
    revision: 1,
    layer: "BIZ",
    kind: "CAPABILITY",
    canonicalName: "Architecture Governance",
    canonicalDescription: "Govern governed architecture facts and their publication lifecycle.",
    localizedContent: { zh: { name: "架构治理", description: "治理架构事实及其发布生命周期。" } },
    aliases: [],
    criticality: 0.9,
    evidenceRefs: ["design-asset:adr-readable-3a-architecture-mapping"]
  }],
  memberships: [],
  mappings: []
};
```

- [ ] **Step 2: Run the focused tests and confirm the contracts are missing**

Run: `pnpm exec vitest run packages/core/src/architecture-authoring/validation.test.ts packages/core/src/knowledge/service.test.ts prisma/three-a-schema.test.ts`

Expected: FAIL because the authoring types, additive governance arrays, and canonical tables do not exist.

- [ ] **Step 3: Implement types, normalization, digests, and validation**

Export these entry points:

```ts
export const ARCHITECTURE_FACT_BATCH_LIMITS = {
  maxUnits: 100,
  maxMemberships: 1_000,
  maxMappings: 500,
  maxCanonicalBytes: 4 * 1024 * 1024
} as const;

export function validateArchitectureFactBatch(
  submission: ArchitectureFactBatchSubmission,
  resolved: ArchitectureFactResolution
): ValidatedArchitectureFactBatch;

export function architectureFactBatchDigest(
  batch: ValidatedArchitectureFactBatch
): string;
```

Normalize text trimming, aliases, evidence references, provenance, and all revision arrays before hashing. Enforce exact Scope, bilingual content, layer-kind compatibility, BIZ-to-SYS or SYS-to-TECH direction, unique logical identities, parent existence and same layer, and exactly one resolvable membership selector.

- [ ] **Step 4: Add canonical Prisma models and additive governance fields**

Add `ArchitectureFactBatch`, `ArchitectureUnitRevision`, `ArchitectureUnitMembershipRevision`, and `ArchitectureUnitMappingRevision`. Every unique key and index starts with `applicationServiceId` and `scopePath`. Add `architectureFactRevisionIds Json @default("[]")` to `KnowledgeReviewBundle`, `KnowledgePromotionDecision`, `KnowledgePromotionReceipt`, and `KnowledgeChangeSet`. Baseline manifests remain JSON but their Core type and digest include the same sorted array.

The migration must create only additive tables, columns, indexes, and foreign-key-safe constraints. It must not update or delete existing rows.

- [ ] **Step 5: Run contract, schema, and compatibility checks**

Run: `pnpm exec vitest run packages/core/src/architecture-authoring/validation.test.ts packages/core/src/knowledge/service.test.ts prisma/three-a-schema.test.ts; pnpm --filter @specforge/core typecheck; pnpm exec prisma validate`

Expected: PASS; an empty architecture revision array preserves existing review/decision/ChangeSet digest behavior and Prisma validates.

- [ ] **Step 6: Commit the canonical contract boundary**

```powershell
git add packages/core/src/architecture-authoring packages/core/src/index.ts packages/core/src/knowledge prisma/schema.prisma prisma/migrations/20260815_governed_3a_architecture_facts prisma/three-a-schema.test.ts
git commit -m "feat: add governed 3A architecture fact contracts"
```

### Task 2: Add idempotent MCP batch submission and shared review support

**Files:**
- Create: `apps/mcp-server/src/knowledge/architecture-authoring.ts`
- Create: `apps/mcp-server/src/knowledge/architecture-authoring.test.ts`
- Create: `apps/mcp-server/src/knowledge/architecture-authoring.integration.test.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.integration.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`

**Interfaces:**
- Consumes: Task 1 validators and Prisma models, current writable actor and exact-Scope resolution, `createKnowledgeReviewBundle`, and `decideKnowledgeReviewBundle`.
- Produces: `submitArchitectureFactBatch(input): Promise<ArchitectureFactBatchReceipt>` and additive architecture revision handling in shared review tools.

- [ ] **Step 1: Write failing submission and isolation tests**

Cover first submission, identical retry, conflicting retry, closed design session, sibling Scope, unresolved member selector, cross-Scope parent/mapping, missing evidence, payload limits, transaction rollback, and redacted MCP failure output. Add a real PostgreSQL integration test guarded by `SPECFORGE_ARCHITECTURE_AUTHORING_INTEGRATION=1`.

- [ ] **Step 2: Run tests and confirm the MCP tool is absent**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/architecture-authoring.test.ts apps/mcp-server/src/tools.test.ts`

Expected: FAIL because `submit_3a_architecture_fact_batch` is not registered and persistence is missing.

- [ ] **Step 3: Implement atomic idempotent submission**

Implement:

```ts
export interface SubmitArchitectureFactBatchInput {
  architectureScope: ArchitectureScopeRef;
  submission: ArchitectureFactBatchSubmission;
}

export async function submitArchitectureFactBatch(
  input: SubmitArchitectureFactBatchInput
): Promise<ArchitectureFactBatchReceipt>;
```

Resolve the writable actor and exact Scope, verify the open design-change session, load all referenced assertions/assets and existing unit revisions using Scope-prefixed predicates, validate the entire normalized batch, lock on Scope plus idempotency key, and persist the batch plus candidate revisions in one transaction. Return existing receipt only when the digest matches.

- [ ] **Step 4: Extend shared review and decision tools additively**

Add optional `architectureFactRevisionIds` to `create_knowledge_review_bundle` and optional `approvedArchitectureFactRevisionIds` to `decide_knowledge_review_bundle`. Verify every revision belongs to the exact Scope, one submitted batch, and the same design session. Include sorted IDs in digests and status transitions. Existing callers that omit the arrays must remain unchanged.

- [ ] **Step 5: Register the MCP contract**

Register `submit_3a_architecture_fact_batch` with `knowledge:write`, `readOnly: false`, exact Zod bounds, and no `z.record(z.unknown())` for the architecture payload. The handler returns stable IDs, digest, candidate counts, blockers, and `idempotent` without returning source excerpts.

- [ ] **Step 6: Run focused and integration verification**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/architecture-authoring.test.ts apps/mcp-server/src/knowledge/persistence.integration.test.ts apps/mcp-server/src/tools.test.ts; pnpm --filter @specforge/mcp-server typecheck`

With the integration flag and canonical `DATABASE_URL`, run: `pnpm exec vitest run apps/mcp-server/src/knowledge/architecture-authoring.integration.test.ts`

Expected: unit tests and typecheck PASS; PostgreSQL integration proves first write, idempotent retry, conflict rejection, sibling-Scope isolation, and cleanup.

- [ ] **Step 7: Commit the submission and review increment**

```powershell
git add apps/mcp-server/src/knowledge/architecture-authoring.ts apps/mcp-server/src/knowledge/architecture-authoring.test.ts apps/mcp-server/src/knowledge/architecture-authoring.integration.test.ts apps/mcp-server/src/knowledge/persistence.ts apps/mcp-server/src/knowledge/persistence.integration.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts
git commit -m "feat: add MCP 3A architecture fact submission"
```

### Task 3: Add governed architecture promotion and Baseline references

**Files:**
- Create: `apps/mcp-server/src/knowledge/architecture-promotion.ts`
- Create: `apps/mcp-server/src/knowledge/architecture-promotion.test.ts`
- Create: `apps/mcp-server/src/knowledge/architecture-promotion.integration.test.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/promotion.ts`
- Modify: `apps/mcp-server/src/knowledge/promotion.integration.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `packages/core/src/knowledge/service.ts`

**Interfaces:**
- Consumes: an approved shared Review Bundle, `KnowledgePromotionDecision`, active Working Stream, candidate architecture revisions, and Task 1 digests.
- Produces: `promoteArchitectureFacts(input): Promise<ArchitectureFactPromotionReceipt>`, accepted immutable revisions, additive ChangeSet references, governance events, and Baseline manifest support.

- [ ] **Step 1: Write failing promotion policy tests**

Test rejection of READY-but-unapproved bundles, mismatched approved revision sets, reviewer policy violations, mixed batches, changed candidate digest, inactive streams, cross-Scope decisions, and conflicting retries. Test successful atomic acceptance, receipt reuse, ChangeSet sequence increment, architecture revision references, governance events, and rollback when any revision fails.

- [ ] **Step 2: Run tests and confirm dedicated promotion is absent**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/architecture-promotion.test.ts apps/mcp-server/src/knowledge/promotion.integration.test.ts`

Expected: FAIL because the dedicated promotion service and additive ChangeSet behavior do not exist.

- [ ] **Step 3: Implement dedicated authored-fact promotion**

Implement:

```ts
export async function promoteArchitectureFacts(input: {
  architectureScope: ArchitectureScopeRef;
  promotionDecisionId: string;
  architectureFactBatchId: string;
  streamId: string;
}): Promise<ArchitectureFactPromotionReceipt>;
```

In one transaction, lock the decision and batch, verify APPROVE status, session equality, exact approved revision set, reviewer policy, candidate status, and input digest. Mark only approved revisions `ACCEPTED`, leave rejected/unselected candidates unchanged until an explicit rejection decision, create the promotion receipt, create or reuse a monotonic ChangeSet with architecture IDs, update the Working Stream head, and append durable governance/outbox events.

- [ ] **Step 4: Extend reconciliation and Baseline publication**

Make reconciliation compare architecture revision IDs and digests in addition to asset and relationship revisions. Make `publishKnowledgeBaseline` include sorted `architectureFactRevisionIds` in the immutable manifest. Existing Baselines without the field normalize it to `[]`.

- [ ] **Step 5: Register and verify the promotion tool**

Register `promote_3a_architecture_facts` with `knowledge:write` and `governance:run`. Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/architecture-promotion.test.ts apps/mcp-server/src/knowledge/architecture-promotion.integration.test.ts apps/mcp-server/src/knowledge/promotion.integration.test.ts apps/mcp-server/src/knowledge/persistence.integration.test.ts apps/mcp-server/src/tools.test.ts; pnpm --filter @specforge/mcp-server typecheck`

Expected: PASS with atomic promotion, idempotency, review policy, exact-Scope reconciliation, and legacy flow compatibility.

- [ ] **Step 6: Commit promotion and Baseline governance**

```powershell
git add apps/mcp-server/src/knowledge/architecture-promotion.ts apps/mcp-server/src/knowledge/architecture-promotion.test.ts apps/mcp-server/src/knowledge/architecture-promotion.integration.test.ts apps/mcp-server/src/knowledge/persistence.ts apps/mcp-server/src/knowledge/promotion.ts apps/mcp-server/src/knowledge/promotion.integration.test.ts apps/mcp-server/src/tools.ts packages/core/src/knowledge/service.ts
git commit -m "feat: govern 3A architecture fact promotion"
```

### Task 4: Load Baseline architecture facts into deterministic projections

**Files:**
- Create: `apps/knowledge-projector/src/architecture-unit-source-loader.ts`
- Create: `apps/knowledge-projector/src/architecture-unit-source-loader.test.ts`
- Modify: `apps/knowledge-projector/src/repository.ts`
- Modify: `apps/knowledge-projector/src/repository.test.ts`
- Modify: `apps/knowledge-projector/src/materializer.ts`
- Modify: `apps/knowledge-projector/src/materializer.test.ts`
- Modify: `apps/knowledge-projector/src/architecture-unit-materializer.ts`
- Modify: `apps/knowledge-projector/src/architecture-unit-materializer.test.ts`

**Interfaces:**
- Consumes: published Baseline manifest `architectureFactRevisionIds` and accepted canonical revisions.
- Produces: `loadArchitectureUnitSource(job, baseline): Promise<ArchitectureUnitMaterializationInput>` wired into the final projection batch.

- [ ] **Step 1: Write failing source-loader tests**

Test a Baseline with accepted unit, membership, and mapping revisions; legacy Baseline with no architecture IDs; declared but missing revision; candidate or rejected revision; duplicate logical revision; cross-Scope row; unresolved member; unresolved mapping; and repeated deterministic load.

- [ ] **Step 2: Run tests and reproduce the current empty-source behavior**

Run: `pnpm exec vitest run apps/knowledge-projector/src/architecture-unit-source-loader.test.ts apps/knowledge-projector/src/materializer.test.ts`

Expected: FAIL for non-empty source loading while the legacy empty Baseline test still documents current behavior.

- [ ] **Step 3: Implement exact-Baseline source loading**

Load the published Baseline once, normalize missing `architectureFactRevisionIds` to `[]`, then fetch exact accepted revisions using Scope-prefixed predicates and the listed IDs. Assign `generationId`, `baselineId`, and `projectionManifestId` from the build job. Resolve membership assertion/asset selectors against accepted projection sources and mapping endpoints against loaded units.

Throw named errors for declared-but-missing, non-accepted, out-of-Scope, duplicate, or unresolved records. Do not convert these failures into an empty map.

- [ ] **Step 4: Wire the loader into the final projection batch**

Extend `ProjectionSourceBatch` with optional `architectureUnitFacts`. `PrismaProjectionBuildRepository.loadBatch` attaches it only when `complete === true`; resumed earlier batches must not write partial architecture projections. Include sorted architecture source digests in the projection publication input digest.

- [ ] **Step 5: Run projector and deterministic rebuild checks**

Run: `pnpm exec vitest run apps/knowledge-projector/src/architecture-unit-source-loader.test.ts apps/knowledge-projector/src/architecture-unit-materializer.test.ts apps/knowledge-projector/src/materializer.test.ts apps/knowledge-projector/src/repository.test.ts apps/knowledge-projector/src/architecture-unit-repository.test.ts; pnpm --filter @specforge/knowledge-projector typecheck; pnpm exec prisma validate`

Expected: PASS; accepted Baseline facts produce non-empty deterministic projection rows and legacy Baselines retain explicit empty results.

- [ ] **Step 6: Commit the projection-source integration**

```powershell
git add apps/knowledge-projector/src/architecture-unit-source-loader.ts apps/knowledge-projector/src/architecture-unit-source-loader.test.ts apps/knowledge-projector/src/repository.ts apps/knowledge-projector/src/repository.test.ts apps/knowledge-projector/src/materializer.ts apps/knowledge-projector/src/materializer.test.ts apps/knowledge-projector/src/architecture-unit-materializer.ts apps/knowledge-projector/src/architecture-unit-materializer.test.ts
git commit -m "feat: project governed 3A architecture facts"
```

### Task 5: Verify the complete generic lifecycle and synchronize design facts

**Files:**
- Create: `apps/mcp-server/src/knowledge/architecture-lifecycle.e2e.test.ts`
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: one tested exact-Scope submit-to-projection lifecycle, implementation evidence, synchronized ADR/Proposal/Context Pack, and a closed implementation session.

- [ ] **Step 1: Add the end-to-end lifecycle test**

The test must execute: open design session fixture, submit architecture batch, idempotent retry, create Review Bundle, approve, promote, reconcile, publish Baseline, request/process projection, query Map and neighborhood, and assert the same exact Scope, IDs, and digests at every stage. Add a sibling-Scope attempt that returns no leaked identity.

- [ ] **Step 2: Run one consolidated verification stage**

Run:

```powershell
pnpm exec vitest run packages/core/src/architecture-authoring/validation.test.ts packages/core/src/knowledge/service.test.ts apps/mcp-server/src/knowledge/architecture-authoring.test.ts apps/mcp-server/src/knowledge/architecture-promotion.test.ts apps/mcp-server/src/knowledge/architecture-lifecycle.e2e.test.ts apps/knowledge-projector/src/architecture-unit-source-loader.test.ts apps/knowledge-projector/src/architecture-unit-materializer.test.ts apps/knowledge-projector/src/materializer.test.ts apps/mcp-server/src/tools.test.ts
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm --filter @specforge/knowledge-projector typecheck
pnpm exec prisma validate
git diff --check
```

Expected: all focused tests pass, all three packages type-check, Prisma validates, and the diff check exits 0.

- [ ] **Step 3: Update governance records with exact evidence**

Update ADR-0025 and its manifest record with the implementation session ID, exact commands/results, supported MCP contracts, compatibility status, and any deferred production work. Add a backlog fact only for work genuinely deferred by this increment, with owner, trigger, and rationale.

- [ ] **Step 4: Synchronize, read back, and close the implementation session**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'
pnpm design-facts:sync
pnpm design-facts:check
pnpm design-context:close -- --session $architectureAuthoringSessionId --status CONVERGED --evidence "focused-tests=pass; typechecks=pass; prisma-validate=pass; lifecycle-e2e=pass; design-facts-sync=complete; design-facts-check=clean; git-diff-check=0"
```

Expected: sync is `complete`; `missing`, `mismatched`, `outOfScope`, and `blocked` are empty; the same exact-Scope implementation session closes as `CONVERGED`.

- [ ] **Step 5: Commit governance evidence**

```powershell
git add apps/mcp-server/src/knowledge/architecture-lifecycle.e2e.test.ts docs/adr/0025-readable-3a-architecture-mapping.md docs/design-facts/baseline-manifest.json docs/TODO.md
git commit -m "docs: record governed 3A authoring evidence"
```

## Coverage Review

- Exact-Scope implementation preflight and receipt: Task 0.
- First-class typed facts and bilingual rules: Task 1.
- Exact-Scope idempotent MCP submission and shared review: Task 2.
- Approval, promotion, ChangeSet, reconciliation, and Baseline: Task 3.
- Deterministic projection loading and legacy compatibility: Task 4.
- Full lifecycle, evidence, MCP synchronization, and session closure: Task 5.
- Web editing, cross-Scope portfolios, and AI auto-classification remain deferred exactly as specified.

## Execution Handoff

This plan is complete but must not be executed until the user explicitly approves implementation. Execution begins with a new exact-Scope design preflight session and proceeds task by task with a review and commit after each independently testable increment.
