# Designer 3A v7 Structural Semantic Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an exact-Scope, Agent-initiated, evidence-bound 3A Candidate Set workflow that can publish a balanced Designer v7 Baseline while preserving v6 and repairing the known asset-identity mismatch.

**Architecture:** Reuse the existing `ArchitectureFactBatch` as the physical Candidate Set record and extend it with the source snapshot, candidate status, exclusions, and validation metadata. The MCP server owns candidate generation and readback; the existing ReviewBundle, promotion, reconciliation, Baseline, and projection services remain the only authoritative publication path. PostgreSQL remains authoritative, while graph and Web projections stay derived.

**Tech Stack:** TypeScript, Zod, `@specforge/core`, Prisma 6, PostgreSQL, MCP SDK, Vitest, `tsx`, existing 3A projection and design-context tooling.

## Global Constraints

- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- English canonical fields are mandatory; complete Chinese human-facing overlays are mandatory.
- MCP is the only write boundary for ADRs, Proposals, Context Packs, architecture facts, and typed links.
- PostgreSQL remains authoritative for authored assets, architecture revisions, relationships, Candidate Sets, and publication state.
- v6 remains immutable and queryable as 8 units, 42 memberships, and 6 mappings.
- Candidate analysis is explicit and Agent-initiated; an ordinary asset write never publishes 3A structure.
- Candidate counts of 6 BIZ, 12 SYS, and 5 TECH are ceilings and balance targets, not quotas.
- Every published unit, membership, and mapping requires exact-Scope evidence and a deterministic identity.
- Cross-Scope reads require authorization; this increment does not publish a cross-Scope aggregate Baseline.
- A failed candidate, promotion, reconciliation, Baseline, or projection step fails closed to v6.
- The known 14 terminal/member identity mismatches are repaired without mutating historical v6 revisions or authored asset IDs.
- Every implementation session must use exact-Scope preflight and close the same session with command-level evidence.

---

## File Map

Create the following focused files:

- `packages/core/src/architecture-authoring/candidate-analysis.ts`: Candidate Set request, snapshot, candidate, exclusion, status, and readback types plus pure state-transition helpers.
- `packages/core/src/architecture-authoring/candidate-analysis.test.ts`: Candidate state and request validation tests.
- `apps/mcp-server/src/knowledge/candidate-analysis.ts`: Exact-Scope snapshot capture, deterministic evidence-bound candidate assembly, Candidate Set persistence adapter, and readback service.
- `apps/mcp-server/src/knowledge/candidate-analysis.test.ts`: Persistence, authorization, idempotency, stale-waterline, and failure-closed tests.
- `scripts/analyze-designer-3a-v7.ts`: Explicit local MCP client used to request the Designer v7 candidate analysis and print the Candidate Set receipt.
- `scripts/publish-designer-3a-v7.ts`: Explicit local MCP client that reviews, promotes, reconciles, publishes, and projects the approved Candidate Set.
- `scripts/verify-designer-3a-v7.ts`: Exact-Scope v7/v6 readback, identity-repair, unit-closure, and projection verification.
- `scripts/sync-designer-3a-v7-design-facts.ts`: MCP-only ADR, Proposal, Context Pack, evidence, and typed-link synchronization.
- `docs/adr/0042-designer-3a-v7-structural-semantic-expansion.md`: Reviewable engineering decision and implementation evidence.
- `docs/evidence/designer-3a-v7-structural-semantic-expansion-evidence.md`: Exact command outputs and MCP readback evidence.

Modify the following existing files:

- `packages/core/src/architecture-authoring/types.ts`: Export the Candidate Set contract alongside existing architecture-fact contracts.
- `packages/core/src/architecture-authoring/validation.ts`: Validate Candidate Set scope, source snapshot, candidate ceilings, evidence, bilingual fields, primary-membership uniqueness, and BIZ/SYS/TECH closure.
- `packages/core/src/architecture-authoring/index.ts`: Export candidate-analysis types and validators.
- `packages/core/src/architecture-authoring/validation.test.ts`: Add regression cases for closure and identity rules.
- `prisma/schema.prisma`: Add Candidate Set metadata and candidate-state columns to `ArchitectureFactBatch`.
- `apps/mcp-server/src/knowledge/architecture-authoring.ts`: Persist and read the extended Candidate Set metadata through the existing architecture-fact batch transaction.
- `apps/mcp-server/src/tools.ts`: Register `analyze_3a_architecture_candidates` and `get_3a_architecture_candidate_set` with exact Scope schemas and MCP audit behavior.
- `apps/mcp-server/src/knowledge/persistence.ts`: Ensure ReviewBundle and Baseline reads enforce the Candidate Set source digest and v7 state.
- `apps/mcp-server/src/knowledge/architecture-map-adapter.ts`: Make v7 candidate publication and identity-normalized membership readback use canonical `(assetType, assetId)` pairs.
- `apps/mcp-server/src/knowledge/identity-persistence.ts`: Add the versioned canonical asset-identity resolver used by coverage-to-membership reconciliation.
- `apps/mcp-server/src/knowledge/candidate-persistence.test.ts`: Add Candidate Set read and stale-state coverage.
- `apps/mcp-server/src/tools.test.ts`: Add MCP tool registration, scope mismatch, idempotency, and non-disclosure coverage.
- `prisma/three-a-schema.test.ts`: Add the schema assertion for Candidate Set metadata and indexes.
- `package.json`: Add `designer-3a:v7:analyze`, `designer-3a:v7:publish`, and `designer-3a:v7:verify` scripts.
- `docs/TODO.md`: Record deferred cross-Scope aggregation, continuous legacy synchronization, and external APPLY as explicit backlog facts if they are not already present.

## Task 1: Add the Pure Candidate Set Contract

**Files:**
- Create: `packages/core/src/architecture-authoring/candidate-analysis.ts`
- Create: `packages/core/src/architecture-authoring/candidate-analysis.test.ts`
- Modify: `packages/core/src/architecture-authoring/index.ts`
- Modify: `packages/core/src/architecture-authoring/validation.test.ts`

**Interfaces:**
- `ThreeACandidateSetStatus = "GENERATING" | "READY" | "BLOCKED" | "STALE" | "APPROVED" | "REJECTED" | "PROMOTED"`.
- `ThreeACandidateAnalysisRequest { architectureScope, sourceBaselineId, intent, assetIds, idempotencyKey, evidenceRefs }`.
- `ThreeACandidateSnapshot { sourceBaselineId, catalogDigest, relationshipVersion, designContextDigest, capturedAt }`.
- `ThreeACandidateSet { id, architectureScope, status, snapshot, batchId, candidateCounts, excludedCandidates, blockingIssues, evidenceRefs, contentDigest }`.
- `validateCandidateSetTransition(from, to)` and `candidateSetIsStale(candidate, currentSnapshot)`.

- [ ] **Step 1: Write failing tests for legal and illegal state transitions**

```ts
it("allows READY to become STALE when a source waterline changes", () => {
  expect(validateCandidateSetTransition("READY", "STALE")).toBe(true);
});

it("rejects a direct READY to PROMOTED transition", () => {
  expect(() => validateCandidateSetTransition("READY", "PROMOTED")).toThrow("CANDIDATE_SET_TRANSITION_INVALID");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/architecture-authoring/candidate-analysis.test.ts`

Expected: FAIL because the Candidate Set contract and transition helper do not exist.

- [ ] **Step 3: Implement the contract and pure helpers**

Use the existing `ArchitectureScopeRef`, `ArchitectureFactBatchSubmission`, `ArchitectureUnitRevisionInput`, `ArchitectureUnitMembershipRevisionInput`, and `ArchitectureUnitMappingRevisionInput` types. Keep candidate payloads bounded to the existing architecture batch limits. Compute Candidate Set `contentDigest` from the normalized Scope, source snapshot, candidate revision IDs, exclusions, issues, and evidence references.

- [ ] **Step 4: Add request and closure validation**

Reject an empty intent, missing exact Scope, missing source Baseline, missing idempotency key, empty evidence references, more than 6 BIZ candidates, more than 12 SYS candidates, more than 5 TECH candidates, missing English or Chinese content, duplicate primary asset pairs, unsupported mapping direction, or a SYS candidate with no BIZ realization evidence. Return stable error codes beginning with `THREE_A_CANDIDATE_`.

- [ ] **Step 5: Run the focused tests**

Run: `pnpm exec vitest run packages/core/src/architecture-authoring/candidate-analysis.test.ts packages/core/src/architecture-authoring/validation.test.ts`

Expected: PASS with transition, ceiling, bilingual, duplicate-membership, evidence, and closure cases covered.

- [ ] **Step 6: Commit the pure contract**

```bash
git add packages/core/src/architecture-authoring/candidate-analysis.ts packages/core/src/architecture-authoring/candidate-analysis.test.ts packages/core/src/architecture-authoring/index.ts packages/core/src/architecture-authoring/validation.test.ts
git commit -m "feat: add governed 3A candidate set contract"
```

## Task 2: Persist Candidate Set Snapshot and State

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260830_designer_3a_v7_candidate_sets/migration.sql`
- Modify: `apps/mcp-server/src/knowledge/architecture-authoring.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Modify: `prisma/three-a-schema.test.ts`
- Modify: `apps/mcp-server/src/knowledge/candidate-persistence.test.ts`

**Interfaces:**
- Extend `ArchitectureFactBatch` with `candidateStatus`, `sourceBaselineId`, `catalogDigest`, `relationshipVersion`, `designContextDigest`, `analysisIntent`, `candidateCounts`, `excludedCandidates`, `blockingIssues`, and `snapshotCapturedAt`.
- Add indexes on `(applicationServiceId, scopePath, candidateStatus, createdAt)` and `(applicationServiceId, scopePath, sourceBaselineId, catalogDigest)`.
- `createOrGetCandidateSet(input): Promise<ThreeACandidateSet>`.
- `readCandidateSet(scope, id): Promise<ThreeACandidateSet>`.
- `markCandidateSetStale(scope, id, currentSnapshot): Promise<ThreeACandidateSet>`.

- [ ] **Step 1: Extend the Prisma model and migration**

Use nullable metadata columns with safe defaults for pre-existing architecture batches. Store candidate counts and excluded candidates as JSONB; store digests and source identity as indexed scalar columns. Do not alter the status or content of historical v6 batches.

- [ ] **Step 2: Add the schema regression test**

Assert that the generated Prisma schema exposes the new fields and that the migration creates the exact-Scope indexes. The test must also verify that a legacy v6 batch can be read with `candidateStatus = null` without being interpreted as a Candidate Set.

- [ ] **Step 3: Implement transactional create/read/state persistence**

Reuse `ensureMcpPersistenceSchema`, `resolveWritableScope`, `writableActor`, and the existing serializable transaction pattern. A retry with the same Scope and idempotency key returns the same Candidate Set only when `contentDigest` matches; a different digest throws `THREE_A_CANDIDATE_IDEMPOTENCY_CONFLICT`. State transitions update the durable audit/Outbox event and never overwrite the candidate content digest.

- [ ] **Step 4: Add persistence tests**

Cover exact-Scope create, sibling-Scope rejection, identical retry, digest conflict, stale marking, legacy batch readability, and preservation of v6 rows.

- [ ] **Step 5: Run database-focused tests**

Run: `pnpm db:generate`

Expected: Prisma client generation succeeds.

Run: `pnpm exec vitest run prisma/three-a-schema.test.ts apps/mcp-server/src/knowledge/candidate-persistence.test.ts`

Expected: PASS against the configured PostgreSQL database.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add prisma/schema.prisma prisma/migrations/20260830_designer_3a_v7_candidate_sets apps/mcp-server/src/knowledge/architecture-authoring.ts apps/mcp-server/src/knowledge/persistence.ts prisma/three-a-schema.test.ts apps/mcp-server/src/knowledge/candidate-persistence.test.ts
git commit -m "feat: persist scoped 3A candidate snapshots"
```

## Task 3: Implement the MCP Candidate Analysis and Readback Tools

**Files:**
- Create: `apps/mcp-server/src/knowledge/candidate-analysis.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/knowledge/candidate-analysis.test.ts`

**Interfaces:**
- `analyze3aArchitectureCandidates(input: ThreeACandidateAnalysisRequest): Promise<ThreeACandidateSet>`.
- `get3aArchitectureCandidateSet(input: { architectureScope: ArchitectureScopeRef; candidateSetId: string }): Promise<ThreeACandidateSet>`.
- MCP tool names: `analyze_3a_architecture_candidates` and `get_3a_architecture_candidate_set`.

- [ ] **Step 1: Add failing MCP tool tests**

```ts
it("rejects a candidate analysis whose Scope differs from the writable principal", async () => {
  await expect(callTool("analyze_3a_architecture_candidates", { architectureScope: siblingScope, sourceBaselineId: v6BaselineId, intent: "test", idempotencyKey: "case-1", evidenceRefs: ["test"] })).rejects.toThrow("SCOPE_MISMATCH");
});

it("returns the same Candidate Set for an identical retry", async () => {
  const first = await analyze3aArchitectureCandidates(request);
  const retry = await analyze3aArchitectureCandidates(request);
  expect(retry).toMatchObject({ id: first.id, contentDigest: first.contentDigest });
});
```

- [ ] **Step 2: Implement exact-Scope snapshot capture**

Read the official source Baseline, published projection identity, current design catalog waterline, current relationship version, and latest reconciliation status. Fail closed when the source Baseline is not `PUBLISHED`, projection is not `READY`, reconciliation is not usable, or any request Scope differs from the principal Scope. Compute one `designContextDigest` from the exact read set.

- [ ] **Step 3: Implement evidence-bound candidate assembly**

Build candidate revisions from accepted design assets and typed relationships only. Each unit carries English and Chinese content and evidence references. Each membership resolves through the canonical `(assetType, assetId)` pair. Each mapping lists its exact relationship identities. Exclusions carry `assetType`, `assetId`, reason code, evidence references, and retry trigger.

- [ ] **Step 4: Register the tools with bounded schemas**

The analysis request must require `architectureScope`, `sourceBaselineId`, `intent`, `idempotencyKey`, and `evidenceRefs`; `assetIds` is optional and bounded. The read tool accepts only one Candidate Set ID and one exact Scope. Both tools use the existing audited `registerJsonTool` path and never return records outside the authorized Scope.

- [ ] **Step 5: Add tool and persistence tests**

Cover missing Baseline, wrong Scope, no disclosure of sibling assets, missing evidence, incomplete bilingual content, idempotent retry, candidate readback, and source-waterline staleness.

- [ ] **Step 6: Run MCP tests and typecheck**

Run: `pnpm exec vitest run apps/mcp-server/src/tools.test.ts apps/mcp-server/src/knowledge/candidate-analysis.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit the MCP workflow**

```bash
git add apps/mcp-server/src/knowledge/candidate-analysis.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/knowledge/candidate-analysis.test.ts
git commit -m "feat: expose scoped 3A candidate analysis through MCP"
```

## Task 4: Repair Canonical Asset Identity and Build the Designer v7 Candidate

**Files:**
- Modify: `apps/mcp-server/src/knowledge/identity-persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/architecture-map-adapter.ts`
- Create: `scripts/analyze-designer-3a-v7.ts`
- Modify: `scripts/designer-3a-v6-contract.ts`
- Modify: `package.json`
- Modify: `apps/mcp-server/src/knowledge/candidate-analysis.test.ts`

**Interfaces:**
- `canonicalAssetKey(assetType: string, assetId: string): string` returns `${assetType}:${assetId}`.
- `resolveCoverageTerminal(scope, terminalId): Promise<{ assetType: string; assetId: string }>` resolves legacy display forms without rewriting authored IDs.
- `buildDesigner3aV7Candidate(input): Promise<ThreeACandidateSet>` calls `analyze_3a_architecture_candidates` through MCP.

- [ ] **Step 1: Add identity regression tests for the 14 known mismatches**

For every known terminal/member pair, assert that the resolver returns the same canonical asset pair and reason `IDENTITY_ALIAS_RESOLVED`. Assert that unknown, ambiguous, and cross-Scope pairs return distinct blocking reasons.

- [ ] **Step 2: Implement versioned canonical identity resolution**

Accept canonical `assetType:assetId`, legacy `dataModel:<id>` display aliases, and existing coverage terminal IDs only when the exact Scope contains one unambiguous matching asset. Do not update historical membership rows or authored IDs. Emit the resolver version and alias used in evidence metadata.

- [ ] **Step 3: Encode the v7 candidate catalog**

Use the approved maximum candidate structure: six BIZ identities, twelve SYS identities, and five TECH identities from the specification. Retain semantically valid v6 identities; issue new identities for new responsibilities. For each candidate, collect evidence from exact-Scope assets, typed relationships, existing v6 memberships, and the identity resolver. Exclude candidates without evidence and record the reason.

- [ ] **Step 4: Write the explicit MCP analysis script**

The script must use the same MCP client pattern as `scripts/publish-designer-3a-v6.ts`, target the exact Designer Scope, require the official v6 Baseline, use a stable idempotency key, call `analyze_3a_architecture_candidates`, print the Candidate Set ID/digest/status/counts, and exit non-zero on any blocked result.

- [ ] **Step 5: Add package commands**

Add:

```json
"designer-3a:v7:analyze": "tsx scripts/analyze-designer-3a-v7.ts"
```

- [ ] **Step 6: Run the candidate analysis once**

Run: `pnpm designer-3a:v7:analyze`

Expected: one exact-Scope Candidate Set receipt with a stable digest, explicit exclusions, and no known identity-format `BLOCKED` rows. Do not publish the Candidate Set in this task.

- [ ] **Step 7: Commit identity repair and candidate assembly**

```bash
git add apps/mcp-server/src/knowledge/identity-persistence.ts apps/mcp-server/src/knowledge/architecture-map-adapter.ts scripts/analyze-designer-3a-v7.ts scripts/designer-3a-v6-contract.ts package.json apps/mcp-server/src/knowledge/candidate-analysis.test.ts
git commit -m "feat: build identity-safe Designer 3A v7 candidates"
```

## Task 5: Publish v7 Through Review, Promotion, Reconciliation, and Projection

**Files:**
- Create: `scripts/publish-designer-3a-v7.ts`
- Modify: `apps/mcp-server/src/knowledge/persistence.ts`
- Modify: `apps/mcp-server/src/knowledge/architecture-authoring.ts`
- Create: `apps/mcp-server/src/knowledge/v7-publication.test.ts`
- Modify: `package.json`

**Interfaces:**
- Script calls existing MCP operations in this exact order: `get_3a_architecture_candidate_set`, `create_knowledge_review_bundle`, `decide_knowledge_review_bundle`, `promote_3a_architecture_facts`, `reconcile_3a_architecture_facts`, `publish_knowledge_baseline`, `request_3a_projection_build`.
- New Baseline ID: `knowledge-baseline:designer:3a:v7`.
- New review/batch IDs are content-addressed and include the Candidate Set digest.

- [ ] **Step 1: Add failing publication tests**

Cover incomplete review, stale Candidate Set, missing identity evidence, non-converged reconciliation, immutable publication retry, and v6 fallback. Assert that no v7 Baseline becomes `PUBLISHED` when any prerequisite fails.

- [ ] **Step 2: Enforce source snapshot and candidate status at review**

Before creating the ReviewBundle, compare the Candidate Set snapshot with the current catalog, relationship, Baseline, and reconciliation waterlines. Transition to `STALE` on mismatch and reject review. Require `READY` Candidate Set status and complete candidate counts/closure before review.

- [ ] **Step 3: Publish the complete v7 snapshot**

Carry forward accepted v6 revisions into new v7 revision IDs without changing their semantics; add approved candidate unit, membership, and mapping revisions. Require the exact v7 complete revision lists in the Baseline manifest. Never create a runtime delta that depends on reading v6 at query time.

- [ ] **Step 4: Preserve atomic fallback**

Use the existing immutable Baseline and projection publication contracts. If promotion, reconciliation, Baseline, or projection fails, leave v6 as the current official Baseline and return a stable failure reason. A retry with the same content must be idempotent; a changed content digest must fail with an immutable conflict.

- [ ] **Step 5: Write the publication script and package command**

Add:

```json
"designer-3a:v7:publish": "tsx scripts/publish-designer-3a-v7.ts"
```

The script must print Candidate Set, ReviewBundle, decision, promotion, reconciliation, Baseline, projection, and content-digest identities and stop immediately on a blocked gate.

- [ ] **Step 6: Run focused publication tests**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge/v7-publication.test.ts apps/mcp-server/src/knowledge/promotion.test.ts apps/mcp-server/src/knowledge/projection-build.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit publication flow**

```bash
git add scripts/publish-designer-3a-v7.ts apps/mcp-server/src/knowledge/persistence.ts apps/mcp-server/src/knowledge/architecture-authoring.ts apps/mcp-server/src/knowledge/v7-publication.test.ts package.json
git commit -m "feat: publish Designer 3A v7 through governed lifecycle"
```

## Task 6: Verify v7/v6 Readback and Derived Projections

**Files:**
- Create: `scripts/verify-designer-3a-v7.ts`
- Modify: `scripts/verify-designer-3a-v6.ts`
- Modify: `apps/web/lib/3a/query-client.ts`
- Modify: `apps/web/components/three-a/architecture-map-workspace.tsx`
- Create: `apps/web/components/three-a/architecture-v7-readback.test.tsx`
- Modify: `package.json`

**Interfaces:**
- `verifyDesigner3aV7(): Promise<{ v7: V7Readback; v6Regression: V6Readback; identityRepair: IdentityReadback }>`.
- Package command: `designer-3a:v7:verify`.

- [ ] **Step 1: Add failing readback tests**

Assert that v7 reports exact Scope, published Baseline, READY projection, counts within 6/12/5 ceilings, zero known identity-format blocks, SYS-to-BIZ closure, TECH-to-SYS usage, and complete bilingual content. Assert v6 remains 8/42/6 and fixture-free.

- [ ] **Step 2: Implement MCP and PostgreSQL readback**

Read v7 via `list_3a_published_baselines`, `list_3a_projection_manifests`, `search_3a_architecture_map`, unit neighborhoods, coverage, and mapping queries. Compare the result with direct PostgreSQL authoritative rows and Candidate Set digests. Use bounded query budgets and fail if any response Scope differs.

- [ ] **Step 3: Keep the Web reader Baseline-aware**

Make the existing 3A workspace select the published v7 identity when available and retain explicit v6 selection. Preserve loading/error states and prevent a candidate or stale projection from being rendered as official architecture. Do not add a write control to the Web UI.

- [ ] **Step 4: Run readback tests**

Run: `pnpm exec vitest run apps/web/components/three-a/architecture-v7-readback.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run the verification script**

Run: `pnpm designer-3a:v7:verify`

Expected: a JSON report showing the exact Designer Scope, v7 published/READY state, actual BIZ/SYS/TECH counts, zero known identity-format blocks, v6 regression `8/42/6`, and no graph-verification fixture hits.

- [ ] **Step 6: Commit readback verification**

```bash
git add scripts/verify-designer-3a-v7.ts scripts/verify-designer-3a-v6.ts apps/web/lib/3a/query-client.ts apps/web/components/three-a/architecture-map-workspace.tsx apps/web/components/three-a/architecture-v7-readback.test.tsx package.json
git commit -m "test: verify Designer 3A v7 and v6 compatibility"
```

## Task 7: Synchronize the Dual Design Records

**Files:**
- Create: `docs/adr/0042-designer-3a-v7-structural-semantic-expansion.md`
- Create: `docs/evidence/designer-3a-v7-structural-semantic-expansion-evidence.md`
- Create: `scripts/sync-designer-3a-v7-design-facts.ts`
- Modify: `docs/TODO.md`
- Modify: `package.json`

**Interfaces:**
- ADR ID: `adr-designer-3a-v7-structural-semantic-expansion`.
- Proposal ID: `proposal-designer-3a-v7-structural-semantic-expansion`.
- Context Pack ID: `ctx-designer-3a-v7-structural-semantic-expansion`.
- Evidence ID: `evidence-designer-3a-v7-structural-semantic-expansion`.

- [ ] **Step 1: Write the ADR, Proposal, Context Pack, and evidence templates**

The English sections must state the v7 decision, alternatives, exact Scope, candidate lifecycle, identity repair, compatibility, implementation status, and deferred production capabilities. Chinese sections must fully cover all human-facing decision content. Evidence must reserve fields for exact commands, outputs, MCP receipts, Baseline IDs, projection IDs, and reconciliation results.

- [ ] **Step 2: Implement MCP-only synchronization**

Use the existing synchronization script patterns and MCP `upsert_design_asset`/typed-link operations. Write all four asset types and their directed links under the exact Designer Scope. Never insert these records directly through Prisma. Use stable IDs and content digests so reruns are idempotent.

- [ ] **Step 3: Record deferred work explicitly**

Ensure the backlog records owner, trigger, and rationale for cross-Scope aggregate architecture views, continuous legacy synchronization, external connector delivery, and external `APPLY`. Do not mark deferred work as implemented.

- [ ] **Step 4: Run design-fact synchronization and reconciliation**

Run: `pnpm exec tsx scripts/sync-designer-3a-v7-design-facts.ts`

Expected: MCP writes complete for the exact Scope.

Run: `pnpm design-facts:check`

Expected: `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]` for the synchronized v7 facts.

- [ ] **Step 5: Commit dual records**

```bash
git add docs/adr/0042-designer-3a-v7-structural-semantic-expansion.md docs/evidence/designer-3a-v7-structural-semantic-expansion-evidence.md scripts/sync-designer-3a-v7-design-facts.ts docs/TODO.md package.json
git commit -m "docs: synchronize Designer 3A v7 design facts"
```

## Task 8: Run the Single End-to-End Verification and Close the Session

**Files:**
- Modify: `docs/adr/0042-designer-3a-v7-structural-semantic-expansion.md`
- Modify: `docs/evidence/designer-3a-v7-structural-semantic-expansion-evidence.md`

- [ ] **Step 1: Run focused typechecks and tests**

Run:

```bash
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm --filter @specforge/web typecheck
pnpm exec vitest run packages/core/src/architecture-authoring/candidate-analysis.test.ts apps/mcp-server/src/knowledge/candidate-analysis.test.ts apps/mcp-server/src/knowledge/v7-publication.test.ts apps/web/components/three-a/architecture-v7-readback.test.tsx
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the v7 analysis, publication, readback, and design-fact checks**

Run:

```bash
pnpm designer-3a:v7:analyze
pnpm designer-3a:v7:publish
pnpm designer-3a:v7:verify
pnpm enterprise-3a:verify
pnpm design-facts:check
git diff --check
```

Expected: Candidate Set is evidence-complete, v7 is `PUBLISHED`, projection is `READY`, v6 regression is `8/42/6`, known identity-format blocks are zero, enterprise coverage remains independently reported, design-fact reconciliation is empty, and whitespace validation passes.

- [ ] **Step 3: Record exact evidence**

Copy the exact command lines, exit status, compact JSON receipts, Candidate Set digest, ReviewBundle ID, promotion receipt, reconciliation ID, Baseline ID, projection manifest ID, v6 regression, and identity-repair summary into the ADR and evidence record. Distinguish implemented behavior, locally verified behavior, and deferred production capabilities.

- [ ] **Step 4: Close the implementation Design Change Session**

Run:

```bash
pnpm design-context:close -- --session <implementation-session-id> --status CONVERGED --evidence "pnpm designer-3a:v7:verify=passed,pnpm design-facts:check=passed,pnpm enterprise-3a:verify=passed,pnpm typecheck=passed,focused vitest=passed,git diff --check=passed"
```

Expected: the same preflight session returns `CONVERGED`. If any required command fails or MCP synchronization is unavailable, record `MCP synchronization blocked`, the reason, owner, and retry trigger, and close the session as `BLOCKED`.

- [ ] **Step 5: Commit final evidence**

```bash
git add docs/adr/0042-designer-3a-v7-structural-semantic-expansion.md docs/evidence/designer-3a-v7-structural-semantic-expansion-evidence.md
git commit -m "chore: record Designer 3A v7 verification evidence"
```

## Self-Review Checklist

- [ ] Every goal and non-goal in `docs/superpowers/specs/2026-08-30-designer-3a-v7-structural-semantic-expansion-design.md` maps to at least one task.
- [ ] Candidate Set storage reuses the existing architecture-fact authority and does not create a second authored-data store.
- [ ] MCP analysis is explicit, exact-Scope, audited, idempotent, and readback-capable.
- [ ] v6 remains immutable and independently verifiable.
- [ ] The 14 known identity mismatches are repaired through a versioned resolver, not by mutating historical rows.
- [ ] Candidate counts are ceilings, and evidence failure excludes or blocks candidates.
- [ ] BIZ/SYS/TECH closure, bilingual content, primary membership uniqueness, and typed mapping evidence are tested.
- [ ] Cross-Scope aggregate views, continuous legacy synchronization, connector delivery, and external APPLY remain deferred.
- [ ] Every code task has a focused test and an exact command with an expected result.
- [ ] The plan contains no unresolved implementation placeholders.
