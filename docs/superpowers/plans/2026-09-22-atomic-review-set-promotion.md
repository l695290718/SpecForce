# Atomic Review-Set Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote all approved risk/domain Review Bundles from one finalized scan as one complete PostgreSQL ChangeSet and Baseline, with no partial publication.

**Architecture:** Add an aggregate review-set boundary above the existing single-bundle promotion path. The server derives the approved assertion and identity sets from persisted decisions, validates exact Scope/session/coverage closure, then materializes the complete set in one serializable PostgreSQL transaction. Existing single-bundle promotion remains compatible only for explicitly non-partitioned complete workflows.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, MCP stdio tools, Vitest, `@specforge/core` contracts, existing relationship command service and federation outbox.

**Execution status (2026-09-22):** Implemented inline after exact-Scope preflight session `design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de`. The aggregate contract, additive PostgreSQL migration, serializable persistence path, MCP operation, reconciliation/publication compatibility, bilingual workflow documentation, and PostgreSQL integration evidence are complete. The 6,078-observation semantic authoring/review run remains a separate pending operational action; this implementation does not claim production candidate promotion.

## Global Constraints

- PostgreSQL remains authoritative for candidates, decisions, canonical assets, relationships, ChangeSets, reconciliation, and Baselines; graph stores remain derived projections.
- Every read and write uses the exact `applicationServiceId` and `scopePath` from the owning Scope.
- English is canonical and human-facing accepted content requires a complete Chinese overlay.
- Aggregate promotion must validate every expected Review Bundle and cannot accept caller-supplied partial approved IDs.
- Any missing, duplicate, rejected, stale, cross-Scope, cross-session, or coverage-incomplete partition fails closed with zero canonical writes.
- Same aggregate digest retries are idempotent; changed bundle, decision, evidence, policy, or coverage inputs fail with an idempotency conflict.
- A partial Baseline is forbidden; only the aggregate ChangeSet and its converged reconciliation receipt may be published.
- Private `.specforge/backups`, `.specforge/baselines`, `.specforge/scans`, and `.specforge/design-context` runtime artifacts are not committed.

---

### Task 1: Extend the Aggregate Promotion Contract

**Files:**
- Modify: `packages/core/src/knowledge/types.ts`
- Modify: `packages/core/src/knowledge/service.ts`
- Test: `packages/core/src/knowledge/aggregate-promotion.test.ts`

**Interfaces:**
- Produces `KnowledgeReviewSetPromotionInput`, `KnowledgeReviewSetCoverage`, and aggregate fields on `KnowledgePromotionReceipt`.
- Produces `promotionReviewSetDigest(input): string`, which sorts every ID collection before hashing.

- [ ] **Step 1: Write failing contract tests**

Add tests for deterministic ordering and strict coverage closure:

```ts
it("hashes the same review set regardless of input ordering", () => {
  const base = aggregateInput({
    expectedReviewBundleIds: ["bundle-b", "bundle-a"],
    promotionDecisionIds: ["decision-b", "decision-a"],
    approvedAssertionIds: ["assertion-b", "assertion-a"]
  });
  expect(promotionReviewSetDigest(base)).toBe(promotionReviewSetDigest({
    ...base,
    expectedReviewBundleIds: [...base.expectedReviewBundleIds].reverse(),
    promotionDecisionIds: [...base.promotionDecisionIds].reverse(),
    approvedAssertionIds: [...base.approvedAssertionIds].reverse()
  }));
});

it("does not report complete coverage when an observation is missing", () => {
  expect(reviewSetCoverage({ expected: ["source-a", "source-b"], approved: ["source-a"] }).complete).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/knowledge/aggregate-promotion.test.ts`

Expected: FAIL because the aggregate types and digest helper do not exist.

- [ ] **Step 3: Implement the contract**

Add the aggregate input/coverage types and implement:

```ts
export function promotionReviewSetDigest(input: KnowledgeReviewSetPromotionInput): string {
  return contentDigest({
    architectureScope: input.architectureScope,
    reviewSetId: input.reviewSetId,
    scanSessionId: input.scanSessionId,
    designChangeSessionId: input.designChangeSessionId,
    streamId: input.streamId,
    expectedReviewBundleIds: [...input.expectedReviewBundleIds].sort(),
    promotionDecisionIds: [...input.promotionDecisionIds].sort(),
    approvedAssertionIds: [...input.approvedAssertionIds].sort(),
    approvedIdentityCandidateIds: [...input.approvedIdentityCandidateIds].sort(),
    sourceObservationIds: [...input.sourceObservationIds].sort(),
    evidenceRefs: [...input.evidenceRefs].sort()
  });
}
```

Extend `KnowledgePromotionReceipt` with optional aggregate metadata: `reviewSetId`, `reviewBundleIds`, `promotionDecisionIds`, `sourceObservationIds`, and `coverage`.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `pnpm exec vitest run packages/core/src/knowledge/aggregate-promotion.test.ts` and `pnpm --filter @specforge/core typecheck`

Expected: all aggregate contract tests pass and Core typecheck exits `0`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/knowledge/types.ts packages/core/src/knowledge/service.ts packages/core/src/knowledge/aggregate-promotion.test.ts
git commit -m "feat: add aggregate promotion contract"
```

### Task 2: Add Exact-Scope Aggregate Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/promotion.ts`
- Create: `apps/mcp-server/src/knowledge/aggregate-promotion.ts`
- Test: `apps/mcp-server/src/knowledge/promotion.integration.test.ts` (aggregate cases run with `SPECFORGE_KNOWLEDGE_INTEGRATION=1`)

**Interfaces:**
- Produces `promoteKnowledgeReviewSet(input): Promise<KnowledgePromotionReceipt>`.
- Consumes persisted `KnowledgeReviewBundle`, `KnowledgePromotionDecision`, `KnowledgeAssertion`, `IdentityCandidate`, `KnowledgeScanSession`, and `WorkingStream` rows.
- Reuses `mapKnowledgeAssertionForPromotion`, `persistImmutableAsset`, relationship command execution, and the existing outbox conventions.

- [ ] **Step 1: Add failing persistence tests**

Cover these cases in the existing mocked persistence style:

```ts
it("rejects a review set with one missing expected bundle", async () => {
  await expect(promoteKnowledgeReviewSet(input({ expectedReviewBundleIds: ["bundle-a", "bundle-b"], loadedBundles: ["bundle-a"] })))
    .rejects.toThrow("REVIEW_SET_BUNDLE_COVERAGE_MISMATCH");
});

it("rejects partial source coverage before writing canonical assets", async () => {
  await expect(promoteKnowledgeReviewSet(input({ sessionSources: ["source-a", "source-b"], approvedSources: ["source-a"] })))
    .rejects.toThrow("REVIEW_SET_SOURCE_COVERAGE_INCOMPLETE");
  expect(prisma.designAsset.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add the receipt persistence fields and schema migration**

Add nullable `reviewSetId`, JSON `reviewBundleIds`, JSON `promotionDecisionIds`, JSON `sourceObservationIds`, and JSON `coverage` to `KnowledgePromotionReceipt`. Make `promotionDecisionId` nullable for aggregate receipts while preserving the existing unique Scope/id key. Add matching columns to the runtime `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` path in `apps/mcp-server/src/persistence.ts`. Generate the Prisma client and create a named migration; do not reset the canonical database.

Run: `pnpm db:generate` and `pnpm exec prisma migrate dev --name add_aggregate_review_set_promotion`

Expected: Prisma client generation succeeds and the migration contains only additive receipt columns.

- [ ] **Step 3: Implement aggregate loading and closure validation**

Inside one serializable transaction:

1. resolve the authenticated writable exact Scope;
2. lock the review-set id and load all expected bundles;
3. require unique expected bundle IDs, same Scope, same design-change session, `APPROVED` status, complete coverage, and no blockers;
4. load decisions by persisted bundle ID and require one approved decision per bundle;
5. derive approved assertion and identity IDs from decisions and reject duplicate ownership;
6. load the finalized scan session and verify the scan session, policy digests, source observation IDs, and complete coverage;
7. compute `promotionReviewSetDigest` and return the existing aggregate receipt only for an exact retry;
8. materialize all assets, evidence, relationships, relationship outbox rows, one ChangeSet, one aggregate receipt, and one promotion outbox event in the same transaction.

The aggregate ChangeSet must contain the sorted complete asset, relationship, architecture-fact, and evidence sets. The Working Stream head advances only after every write succeeds.

- [ ] **Step 4: Run persistence tests and typechecks**

Run: `pnpm --dir apps/mcp-server exec vitest run src/knowledge/aggregate-promotion.test.ts src/knowledge/promotion.test.ts` and `pnpm --filter @specforge/mcp-server typecheck`

Expected: aggregate closure, idempotency, rollback, and compatibility tests pass; typecheck exits `0`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations apps/mcp-server/src/persistence.ts apps/mcp-server/src/knowledge/aggregate-promotion.ts apps/mcp-server/src/knowledge/aggregate-promotion.test.ts apps/mcp-server/src/knowledge/promotion.ts
git commit -m "feat: persist atomic aggregate promotion"
```

### Task 3: Expose MCP Operation and Enforce Publication Boundary

**Files:**
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/knowledge/promotion.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Test: `apps/mcp-server/src/knowledge/promotion.integration.test.ts` (aggregate reconciliation/publication cases)

**Interfaces:**
- Produces MCP tool `promote_knowledge_review_set` with `knowledge:write` and `governance:run` permissions.
- `reconcileKnowledgeBaseline` and `publishKnowledgeBaseline` accept the aggregate receipt/ChangeSet without accepting partial source IDs.

- [ ] **Step 1: Write failing routing and publication tests**

```ts
it("registers and routes promote_knowledge_review_set", async () => {
  const result = await callTool("promote_knowledge_review_set", aggregateToolInput);
  expect(aggregatePromotion.promoteKnowledgeReviewSet).toHaveBeenCalledWith(aggregateToolInput);
  expect(result.isError).not.toBe(true);
});

it("rejects publication when source IDs are not the aggregate receipt set", async () => {
  await expect(publishKnowledgeBaseline({ ...baselineInput, sourceRevisionIds: ["one-partition-only"] }))
    .rejects.toThrow("BASELINE_RECONCILIATION_ASSET_MISMATCH");
});
```

- [ ] **Step 2: Register the MCP schema and handler**

Add the exact input schema, audit action, permission metadata, and handler routing. The handler must pass the authenticated principal through the existing request context and must not accept caller-provided approved assertion IDs.

- [ ] **Step 3: Enforce aggregate-only publication**

Update reconciliation and publication validation so an aggregate receipt carries the complete source observation coverage and complete ChangeSet arrays. Keep existing single-bundle behavior for non-partitioned workflows, but reject a partitioned bundle when the caller attempts to publish it independently.

- [ ] **Step 4: Run routing, integration, and type checks**

Run: `pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts src/knowledge/aggregate-promotion.integration.test.ts src/knowledge/promotion.integration.test.ts` and `pnpm --filter @specforge/mcp-server typecheck`

Expected: the new tool is registered, publication rejects partial arrays, aggregate promotion reconciles, and all existing promotion integration tests remain green.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/knowledge/promotion.ts apps/mcp-server/src/knowledge/persistence.ts apps/mcp-server/src/knowledge/aggregate-promotion.integration.test.ts
git commit -m "feat: expose aggregate promotion through MCP"
```

### Task 4: Update Agent Workflow and Repository Evidence

**Files:**
- Modify: `skills/specforge-repository-scan/SKILL.md`
- Modify: `docs/agent-integration/repository-scan-skill.md`
- Modify: `docs/operations/legacy-baseline-discovery.md`
- Modify: `docs/adr/0049-system-owned-full-asset-repository-discovery.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`
- Modify: `docs/evidence/governed-full-asset-repository-scan.md`

**Interfaces:**
- Documents the workflow: submit all candidate pages, assemble all review partitions, obtain independent decisions, call `promote_knowledge_review_set` once, reconcile once, then publish once.
- Records that a partition with a missing or rejected decision leaves the active Baseline unchanged.

- [ ] **Step 1: Update the Skill sequence**

Replace any instruction that promotes each Review Bundle independently with the exact sequence:

```text
assemble_knowledge_review_bundles -> decide every expected bundle -> promote_knowledge_review_set once -> reconcile_knowledge_baseline once -> publish_knowledge_baseline once
```

Document that the Agent must persist the expected bundle ID set and never infer completeness from the number of bundles returned by one page.

- [ ] **Step 2: Update bilingual ADR, backlog, and evidence**

Record the aggregate session ID, receipt digest, test commands, exact Scope, and the explicit no-partial-Baseline invariant in both English and Chinese human-facing sections. Change TODO item 16 from blocked to implemented only after live or integration evidence proves the aggregate path; otherwise retain the pending candidate-authoring status.

- [ ] **Step 3: Run repository consistency checks**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/design-facts/baseline-manifest.json','utf8'))"` and `git diff --check`

Expected: JSON parses and `git diff --check` exits `0`.

- [ ] **Step 4: Commit documentation**

```bash
git add skills/specforge-repository-scan docs/agent-integration docs/operations docs/adr/0049-system-owned-full-asset-repository-discovery.md docs/design-facts/baseline-manifest.json docs/TODO.md docs/evidence/governed-full-asset-repository-scan.md
git commit -m "docs: record aggregate promotion workflow"
```

### Task 5: Full Verification, MCP Synchronization, and Session Closure

**Files:**
- Modify: `docs/superpowers/plans/2026-09-22-atomic-review-set-promotion.md`
- Modify: `.specforge/design-context/design-change-session_35824fd1-d0df-4849-a3b1-db0c1ba340de.json` only if the local receipt is intentionally retained; never commit it.

**Interfaces:**
- Consumes all prior task outputs and the exact Scope.
- Produces a converged MCP design session or a persisted blocked closure with an actionable reason and retry trigger.

- [ ] **Step 1: Run the complete focused verification set**

Run:

```powershell
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm exec vitest run packages/core/src/knowledge/aggregate-promotion.test.ts packages/core/src/knowledge/semantic-candidates.test.ts
pnpm --dir apps/mcp-server exec vitest run src/knowledge/aggregate-promotion.test.ts src/knowledge/aggregate-promotion.integration.test.ts src/knowledge/candidate-persistence.test.ts src/knowledge/promotion.test.ts src/tools.test.ts
```

Expected: all listed tests pass, no partial canonical rows remain after rollback tests, and both typechecks exit `0`.

- [ ] **Step 2: Synchronize the exact design records through MCP**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync
$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:check
```

Expected: sync returns `complete`; check returns empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.

- [ ] **Step 3: Close the same MCP design session**

Run:

```powershell
pnpm design-context:close -- --session design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de --status CONVERGED --evidence "aggregate-contract=pass,aggregate-persistence=pass,aggregate-mcp=pass,aggregate-integration=pass,core-typecheck=exit-0,mcp-typecheck=exit-0,design-facts-sync=complete,design-facts-check=verified,no-partial-baseline=pass"
```

Expected: MCP returns the same session ID with `status: CONVERGED`. If any gate fails, close as `BLOCKED` with the exact failure and retry trigger; do not claim the feature complete.

- [ ] **Step 4: Mark plan progress and commit final evidence**

Update the checkboxes in this plan and append exact command results to the evidence record. Commit only tracked source, migration, documentation, and test files:

```bash
git add packages/core apps/mcp-server prisma/migrations prisma/schema.prisma skills/specforge-repository-scan docs
git commit -m "feat: complete atomic review set promotion"
```

## Self-Review Checklist

- Every design requirement maps to Tasks 1-5: aggregate contract, exact Scope validation, complete coverage, atomic transaction, idempotency, rollback, MCP routing, publication protection, bilingual documentation, and session closure.
- No task authorizes partial Baseline publication or direct PostgreSQL authored writes outside the MCP service boundary.
- All aggregate identifiers are sorted before digesting; all persisted records retain the exact Scope.
- Existing single-bundle promotion remains source-compatible but cannot be used to publish a partitioned scan.
- The plan leaves candidate generation and semantic interpretation to the authorized Agent; it only makes their complete promotion safe.
