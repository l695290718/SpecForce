# Designer 3A v6 Semantic Unit Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an exact-Scope, bilingual, immutable Designer 3A v6 Baseline with four explicit semantic units, four new memberships, and three evidence-backed SYS-to-TECH mappings while preserving v5.

**Architecture:** Read the accepted v5 snapshot and the four candidate assets through the existing MCP/query boundary, build a complete v6 fact batch in a pure deterministic builder, submit it through the existing MCP architecture-fact governance flow, then publish and verify a new Baseline and projection. PostgreSQL remains authoritative; Map exposes only cross-layer mappings and Network retains same-layer calls.

**Tech Stack:** TypeScript, pnpm, Vitest, Prisma read models, MCP stdio client, PostgreSQL, existing architecture-authoring validators, 3A projection and query tools.

## Global Constraints

- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- All authored architecture facts are submitted through MCP; PostgreSQL is the authoritative store and graph stores are derived projections.
- v6 is a complete immutable snapshot: `8 units / 42 memberships / 6 mappings`; v5 remains readable as `4/38/3`.
- English fields are canonical and Chinese `localizedContent.zh.name` and `localizedContent.zh.description` are required.
- No fixture, naming heuristic, same-layer Map mapping, cross-Scope write, or enterprise-wide completeness claim is allowed.
- Open a new exact-Scope `prepare_design_change` session before implementation and close that same session only after MCP readback and focused verification.
- Preserve the user’s existing untracked `outputs/` directory and `scripts/build-design-code-challenge-workbook.mjs`.

## File Map

- Create `scripts/designer-3a-v6-contract.ts`: pure v5-to-v6 snapshot builder and candidate evidence contract.
- Create `scripts/designer-3a-v6-contract.test.ts`: deterministic unit tests for identities, counts, evidence, and rejection rules.
- Create `scripts/publish-designer-3a-v6.ts`: MCP-only batch, review, approval, promotion, reconciliation, Baseline, and projection orchestration.
- Create `scripts/process-designer-3a-v6-projection.ts`: request and materialize the v6 projection with the 8/42/6 source-count guard.
- Create `scripts/verify-designer-3a-v6.ts`: read-only MCP verification for v6 and pinned v5 regression.
- Modify `docs/adr/0025-readable-3a-architecture-mapping.md`: record the v6 semantic-unit decision and implementation evidence after execution.
- Create `docs/evidence/designer-3a-v6-semantic-unit-expansion-evidence.md`: exact commands, MCP receipts, counts, and readback evidence.
- Modify `docs/TODO.md`: move the selected enterprise-wide 3A expansion item to its residual backlog state after the four-source slice is published.
- Modify MCP records through the existing `upsert_design_asset` and `link_assets` tools for the matching ADR/Proposal/Context Pack/Evidence records.

### Task 1: Build the deterministic v6 snapshot contract

**Files:**
- Create: `scripts/designer-3a-v6-contract.ts`
- Create: `scripts/designer-3a-v6-contract.test.ts`
- Read: `packages/core/src/architecture-authoring/types.ts`
- Read: `packages/core/src/architecture-authoring/validation.ts`
- Read: `scripts/publish-designer-3a-v5.ts`

**Interfaces:**
- Consumes `ArchitectureUnitRevisionInput`, `ArchitectureUnitMembershipRevisionInput`, and `ArchitectureUnitMappingRevisionInput` from `@specforge/core`.
- Produces a complete `Designer3aV6Snapshot` with `units`, `memberships`, `mappings`, `evidenceRefs`, and fixed counts.

- [ ] **Step 1: Write the failing contract tests**

Add tests with these exact assertions:

```ts
import { describe, expect, it } from "vitest";
import { buildDesigner3aV6Snapshot, V6_UNIT_IDENTITIES } from "./designer-3a-v6-contract";

describe("Designer 3A v6 contract", () => {
  it("carries v5 and adds exactly four units, four memberships, and three mappings", () => {
    const result = buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates() });
    expect(result.units).toHaveLength(8);
    expect(result.memberships).toHaveLength(42);
    expect(result.mappings).toHaveLength(6);
    expect(result.units.map((item) => item.unitIdentity)).toEqual(expect.arrayContaining(Object.values(V6_UNIT_IDENTITIES)));
  });

  it("keeps Web Console calls out of cross-layer mappings", () => {
    const result = buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates() });
    expect(result.mappings.some((item) => item.sourceUnitIdentity === V6_UNIT_IDENTITIES.webConsole)).toBe(false);
  });

  it("rejects a missing relationship or missing target membership", () => {
    expect(() => buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates({ omitGraphEvidence: true }) })).toThrow("V6_REQUIRED_EVIDENCE_MISSING");
  });

  it("requires complete bilingual unit content and stable direct membership", () => {
    const result = buildDesigner3aV6Snapshot({ v5: fixtureV5Snapshot(), candidates: fixtureCandidates() });
    for (const unit of result.units.slice(-4)) {
      expect(unit.canonicalName).toBeTruthy();
      expect(unit.localizedContent.zh.name).toBeTruthy();
      expect(unit.localizedContent.zh.description).toBeTruthy();
    }
    expect(result.memberships.filter((item) => item.assetId === "api-specforge-web-console")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the contract tests and verify they fail**

Run:

```text
pnpm exec vitest run scripts/designer-3a-v6-contract.test.ts
```

Expected: FAIL because the v6 builder and constants do not exist.

- [ ] **Step 3: Implement the pure builder**

Define the stable identities and public function:

```ts
export const V6_UNIT_IDENTITIES = {
  webConsole: "unit:sys:specforge-web-console",
  aiGeneration: "unit:sys:specforge-ai-generation-service",
  graphQuery: "unit:sys:specforge-asset-graph-query-service",
  auditObservability: "unit:sys:specforge-mcp-audit-observability-service"
} as const;

export interface Designer3aV6BuildInput {
  v5: Designer3aV5Snapshot;
  candidates: readonly Designer3aCandidateEvidence[];
}

export function buildDesigner3aV6Snapshot(input: Designer3aV6BuildInput): Designer3aV6Snapshot {
  // carry accepted v5 revisions, append four explicit units/memberships, and append only the three evidence-backed mappings
}
```

The implementation must version carried revisions without changing their semantic identities, add the four parents to `unit:biz:specforge-governed-design-facts`, and create these exact mapping families: `SERVICE_TO_TECHNOLOGY` from AI generation to PostgreSQL, graph query to PostgreSQL, and audit observability to PostgreSQL. It must throw `V6_REQUIRED_EVIDENCE_MISSING` before returning when a required typed relationship, target membership, bilingual field, or exact candidate is missing. It must reject any fixture ID and any candidate outside the four approved IDs.

- [ ] **Step 4: Run the contract tests and typecheck**

Run:

```text
pnpm exec vitest run scripts/designer-3a-v6-contract.test.ts
pnpm --filter @specforge/core typecheck
```

Expected: the contract tests pass and the core typecheck exits 0.

- [ ] **Step 5: Commit the deterministic contract**

```text
git add scripts/designer-3a-v6-contract.ts scripts/designer-3a-v6-contract.test.ts
git commit -m "feat: define Designer 3A v6 snapshot contract"
```

### Task 2: Publish v6 through MCP governance

**Files:**
- Create: `scripts/publish-designer-3a-v6.ts`
- Create: `scripts/process-designer-3a-v6-projection.ts`
- Read: `scripts/publish-designer-3a-v5.ts`
- Read: `apps/mcp-server/src/tools.ts`
- Read: `apps/mcp-server/src/knowledge/architecture-authoring.ts`

**Interfaces:**
- Consumes `buildDesigner3aV6Snapshot()` and the exact Scope session receipt.
- Produces MCP receipts for batch, review bundle, promotion, reconciliation, Baseline, and projection.

- [ ] **Step 1: Open and record the implementation preflight session**

Run before the publisher or any MCP write:

```text
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Publish Designer 3A v6 semantic unit expansion" --affected "adr-readable-3a-architecture-mapping,api-specforge-ai-generation,api-specforge-graph-query,api-specforge-web-console,obs-specforge-mcp-audit" --evidence "docs/superpowers/specs/2026-08-15-designer-3a-v6-semantic-unit-expansion-design.md,v5-baseline-readback,typed-link-evidence-matrix"
```

Record the returned session ID in the publisher output and implementation evidence. Do not reuse `design-change-session:09030b6d-8552-45a6-aab4-0c12a81d7b44`.

- [ ] **Step 2: Write publisher tests for MCP call order and identifiers**

Test the publisher’s pure request builder or mocked MCP client with these exact invariants:

```ts
expect(batch.id).toBe("architecture-fact-batch:designer:3a:coverage:v6");
expect(batch.idempotencyKey).toBe("architecture-fact-batch:designer:3a:coverage:v6");
expect(batch.units).toHaveLength(8);
expect(batch.memberships).toHaveLength(42);
expect(batch.mappings).toHaveLength(6);
expect(review.riskTier).toBe("T1");
expect(decision.approvedArchitectureFactRevisionIds).toHaveLength(56);
expect(baseline.id).toBe("knowledge-baseline:designer:3a:v6");
```

- [ ] **Step 3: Implement the MCP publisher**

Follow the v5 publisher’s stdio `Client` transport and call this exact sequence: `list_3a_published_baselines`, read the v5 manifest and source assets/links, `buildDesigner3aV6Snapshot`, `submit_3a_architecture_fact_batch`, `create_knowledge_review_bundle`, `decide_knowledge_review_bundle`, `create_working_stream`, `promote_3a_architecture_facts`, `reconcile_3a_architecture_facts`, and `publish_knowledge_baseline`. Every tool argument must carry the exact Designer Scope and the preflight session ID. Abort on any count other than 8/42/6 or reconciliation status other than `CONVERGED`. The publisher then invokes `scripts/process-designer-3a-v6-projection.ts`, which requests the projection build through MCP and materializes only the published v6 Baseline.

The batch must use:

```ts
const batchId = "architecture-fact-batch:designer:3a:coverage:v6";
const baselineId = "knowledge-baseline:designer:3a:v6";
const runId = "designer-3a-semantic-unit-expansion-v6";
```

Create `scripts/process-designer-3a-v6-projection.ts` from the existing v5 projection runner’s flow. Set `baselineId` to `knowledge-baseline:designer:3a:v6`, request `profileId: "generic-system"`, `profileVersion: "1"`, and `projectionSchemaVersion: "3a.v2"` through `request_3a_projection_build`. Its `architectureUnitSource` must read the published Baseline’s `architectureFactRevisionIds`, require exactly 8 accepted units, 42 accepted memberships, and 6 accepted mappings, and pass the exact generation/Baseline/Scope identity into `ProjectionMaterializer`. It must exit nonzero for any source-count mismatch.

- [ ] **Step 4: Run publisher unit tests and MCP server typecheck**

Run:

```text
pnpm exec vitest run scripts/designer-3a-v6-contract.test.ts apps/mcp-server/src/tools.test.ts
pnpm --filter @specforge/mcp-server typecheck
pnpm --filter @specforge/knowledge-projector typecheck
```

Expected: all selected tests pass and the MCP server typecheck exits 0.

- [ ] **Step 5: Commit the publisher**

```text
git add scripts/publish-designer-3a-v6.ts scripts/process-designer-3a-v6-projection.ts
git commit -m "feat: publish Designer 3A v6 through MCP"
```

### Task 3: Add v6 readback and regression verification

**Files:**
- Create: `scripts/verify-designer-3a-v6.ts`
- Read: `scripts/verify-designer-3a-v5.ts`
- Test: `scripts/designer-3a-v6-contract.test.ts`

**Interfaces:**
- Consumes the published v6 Baseline and projection manifest through MCP.
- Produces a machine-readable result with `scopeMatches`, `units`, `members`, `mappings`, `totalByLayer`, `unclassifiedCount`, `v5Regression`, and `fixtureHits`.

- [ ] **Step 1: Implement read-only v6 verification**

Use `search_3a_architecture_map` and both public neighborhood tools. Assert:

```ts
expect(result.scopeMatches).toBe(true);
expect(result.units).toBe(8);
expect(result.members).toBe(42);
expect(result.mappings).toBe(6);
expect(result.totalByLayer).toEqual({ BIZ: 1, SYS: 6, TECH: 1 });
expect(result.unclassifiedCount).toBe(0);
expect(result.fixtureHits).toEqual([]);
expect(result.v5Regression).toEqual({ units: 4, members: 38, mappings: 3 });
```

Verify the four direct members and the three mapping relationship identities. Do not modify the v5 verifier’s pinned behavior.

- [ ] **Step 2: Run the live readback**

```text
pnpm exec tsx scripts/verify-designer-3a-v6.ts
```

Expected: `status=READY`, exact Designer Scope, `8/42/6`, `unclassifiedCount=0`, empty fixture hits, and v5 regression `4/38/3`.

- [ ] **Step 3: Commit the verifier**

```text
git add scripts/verify-designer-3a-v6.ts
git commit -m "test: verify Designer 3A v6 readback"
```

### Task 4: Synchronize design records and close the session

**Files:**
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Create: `docs/evidence/designer-3a-v6-semantic-unit-expansion-evidence.md`
- Modify: `docs/TODO.md`
- MCP records: ADR, Proposal, Context Pack, Evidence, and typed links in the exact Designer Scope.

**Interfaces:**
- Consumes the publisher receipts and verifier output.
- Produces repository evidence and matching MCP records with the same stable IDs and relationship targets.

- [ ] **Step 1: Record exact operational evidence**

Write the exact commands and outputs for preflight, publisher, v6 verifier, v5 verifier, focused tests, typechecks, `pnpm design-facts:sync`, `pnpm design-facts:check`, and `git diff --check`. Include the MCP batch, Review Bundle, decision, promotion, reconciliation, Baseline, and projection IDs.

- [ ] **Step 2: Update and synchronize design facts through MCP**

Update ADR `adr-readable-3a-architecture-mapping` with the v6 decision and evidence. Update its linked Proposal and Context Pack, create the Evidence record, and use typed links `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `VALIDATES`, and `IMPACTS` through MCP. English canonical fields and complete Chinese overlays must match the repository records.

- [ ] **Step 3: Run design-fact reconciliation**

```text
pnpm design-facts:sync
pnpm design-facts:check
git diff --check
```

Expected: sync `complete`; check returns empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists; diff check exits 0.

- [ ] **Step 4: Close the same implementation session**

```text
$session = (Get-ChildItem .specforge/design-context/design-change-session_*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Raw | ConvertFrom-Json).receipt.sessionId
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session $session --status CONVERGED --evidence "v6-publisher=8-42-6-PASS,v6-readback=READY,v5-regression=4-38-3-PASS,focused-tests=PASS,design-facts-check=missing-0-mismatched-0-outOfScope-0-blocked-0,git-diff-check=PASS"
```

If any MCP write or readback fails, close as `BLOCKED` with the exact reason and retry trigger, update the backlog fact, and do not claim v6 complete.

- [ ] **Step 5: Commit the synchronized evidence**

```text
git add docs/adr/0025-readable-3a-architecture-mapping.md docs/evidence/designer-3a-v6-semantic-unit-expansion-evidence.md docs/TODO.md
git commit -m "docs: record Designer 3A v6 evidence"
```

## Self-Review Checklist

- Every spec goal maps to Tasks 1-4.
- The only new Map mappings are three SYS-to-TECH mappings with existing typed relationship evidence.
- The v5 Baseline is pinned and never overwritten.
- All MCP writes use the exact application-service Scope and one new implementation session.
- The implementation session is read from the newest committed preflight receipt immediately before closure; no session ID is hardcoded in the plan.
