# 3A Graph Resilience and Contract Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the normal 3A Graph reliably render the exact-Scope architecture-unit network while keeping assertion-level analysis explicitly optional.

**Architecture:** The base Graph endpoint reads the existing PostgreSQL architecture-unit projection and returns an identity-qualified `UNIT` graph. Assertion-level graph analysis remains a separate capability. A shared core contract owns the analysis version and persisted publication status so projector and reader agree.

**Tech Stack:** TypeScript, Next.js route handlers, React 19, Prisma/PostgreSQL, Vitest, SpecForge MCP.

## Global Constraints

- Every graph read binds `{ applicationServiceId, scopePath, baselineId, projectionManifestId, generationId }`.
- PostgreSQL is authoritative; graph data is derived and browser reads remain read-only.
- Canonical analysis version: `3a.graph-analysis.v1`; persisted status: `PUBLISHED`.
- Base graph uses `ARCHITECTURE_UNIT_PROJECTION / UNIT`; impact never fabricates assertion scores.
- Close the exact Scope design-change session only after MCP records, evidence, and reconciliation converge.

---

## File Structure

- `packages/core/src/three-a-graph-contract.ts`: shared graph-analysis constants and source/fidelity/readiness vocabulary.
- `packages/knowledge-query/src/graph-analysis-repository.ts`: consume shared version and `PUBLISHED` persistence status.
- `packages/knowledge-query/src/types.ts` and `service.ts`: define and produce the bounded unit graph.
- `apps/web/lib/3a/query-protocol.ts` and `query-handler.ts`: expose `unitGraph`.
- `apps/web/components/three-a/architecture-graph-workspace.tsx`: use the unit graph for normal overview.
- `scripts/verify-designer-3a-unit-graph.ts`: exact-Scope operational verifier.
- `docs/adr/0035-asset-to-3a-mapping-semantics.md` and `docs/design-facts/baseline-manifest.json`: dual records.

### Task 1: Establish the shared analysis contract

**Files:**
- Create: `packages/core/src/three-a-graph-contract.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/knowledge-query/src/graph-analysis-repository.ts`
- Test: `packages/knowledge-query/src/graph-analysis-repository.test.ts`

**Interfaces:**
- Produces `THREE_A_GRAPH_ANALYSIS_VERSION`, `ThreeAGraphAnalysisPublicationStatus`, and `ThreeAGraphAnalysisAvailability`.
- Consumes persisted `KnowledgeGraphAnalysis.status` values `PUBLISHED` and `UNAVAILABLE`.

- [ ] **Step 1: Write the failing contract-alignment test**

```ts
import { THREE_A_GRAPH_ANALYSIS_VERSION } from "@specforge/core";

it("reads the projector's published graph-analysis contract", async () => {
  await repository.loadOverview(scope, manifest, { budget });
  expect(prisma.knowledgeGraphAnalysis.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ analysisVersion: THREE_A_GRAPH_ANALYSIS_VERSION, status: "PUBLISHED" })
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/knowledge-query/src/graph-analysis-repository.test.ts`

Expected: failure because the repository still queries `graph-analysis-v1` and `READY`.

- [ ] **Step 3: Implement the shared contract**

```ts
export const THREE_A_GRAPH_ANALYSIS_VERSION = "3a.graph-analysis.v1" as const;
export type ThreeAGraphAnalysisPublicationStatus = "PUBLISHED" | "UNAVAILABLE";
export type ThreeAGraphAnalysisAvailability = "READY" | "UNAVAILABLE" | "STALE" | "EMPTY";
```

Export this from core. Replace the local query default with the shared constant and query persisted `PUBLISHED`; return `READY` only after scope, version, and digest validation.

- [ ] **Step 4: Run focused verification**

Run: `pnpm exec vitest run packages/knowledge-query/src/graph-analysis-repository.test.ts && pnpm --filter @specforge/core typecheck && pnpm --filter @specforge/knowledge-query typecheck`

Expected: selected tests and both typechecks pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/three-a-graph-contract.ts packages/core/src/index.ts packages/knowledge-query/src/graph-analysis-repository.ts packages/knowledge-query/src/graph-analysis-repository.test.ts
git commit -m "fix: align 3a graph analysis contract"
```

### Task 2: Add the identity-qualified unit graph query

**Files:**
- Modify: `packages/knowledge-query/src/types.ts`
- Modify: `packages/knowledge-query/src/service.ts`
- Test: `packages/knowledge-query/src/service.test.ts`
- Modify: `apps/web/lib/3a/query-protocol.ts`
- Modify: `apps/web/lib/3a/query-handler.ts`
- Test: `apps/web/lib/3a/query-handler.test.ts`

**Interfaces:**
- Produces `UnitGraphResult` with `source: "ARCHITECTURE_UNIT_PROJECTION"`, `fidelity: "UNIT"`, `analysisAvailability`, nodes, edges, and the full identity tuple.
- Consumes `listArchitectureUnits` and `listArchitectureUnitMappings`.

- [ ] **Step 1: Write failing service and route tests**

```ts
const result = await service.unitGraph({ ...identity, generationId, filter: {} });
expect(result).toMatchObject({ source: "ARCHITECTURE_UNIT_PROJECTION", fidelity: "UNIT", analysisAvailability: "EMPTY" });
expect(result.nodes).toHaveLength(8);
expect(result.edges).toHaveLength(6);

const response = await handleThreeAQuery(request({ operation: "unitGraph", ...identity, generationId }), dependencies);
expect(response.status).toBe(200);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts`

Expected: the schema or service rejects `unitGraph`.

- [ ] **Step 3: Implement bounded unit-graph conversion**

```ts
return {
  ...identity,
  source: "ARCHITECTURE_UNIT_PROJECTION",
  fidelity: "UNIT",
  analysisAvailability,
  nodes: units.map((unit) => ({ id: unit.unitIdentity, label: unit.canonicalName, layer: unit.layer, memberCount: unit.memberCount, criticality: unit.criticality })),
  edges: mappings.map((mapping) => ({ id: mapping.mappingIdentity, sourceId: mapping.sourceUnitIdentity, targetId: mapping.targetUnitIdentity, relationCode: mapping.mappingFamily, confidence: mapping.confidence }))
};
```

Validate exact Scope/Baseline/Manifest/Generation before conversion. The normal unit graph must return even when graph analysis is `EMPTY`, `UNAVAILABLE`, or `STALE`.

- [ ] **Step 4: Run focused verification**

Run: `pnpm exec vitest run packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts && pnpm --filter @specforge/knowledge-query typecheck && pnpm --filter @specforge/web typecheck`

Expected: `unitGraph` returns 200 while `impact` stays `GRAPH_ANALYSIS_UNAVAILABLE` without a ready assertion analysis.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge-query/src/types.ts packages/knowledge-query/src/service.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-protocol.ts apps/web/lib/3a/query-handler.ts apps/web/lib/3a/query-handler.test.ts
git commit -m "feat: serve resilient 3a unit graph"
```

### Task 3: Make the 3A Graph workspace consume the unit graph

**Files:**
- Modify: `apps/web/lib/3a/query-client.ts`
- Modify: `apps/web/components/three-a/architecture-graph-workspace.tsx`
- Modify: `apps/web/components/three-a/architecture-graph-store.ts`
- Test: `apps/web/components/three-a/architecture-graph-workspace.test.ts`
- Test: `apps/web/components/three-a/architecture-graph-store.test.ts`

**Interfaces:**
- Consumes `runUnitGraphQuery(input)` and `UnitGraphResult`.
- Produces a normal graph overview sourced from architecture units; assertion-only impact keeps its explicit unavailable state.

- [ ] **Step 1: Write failing UI tests**

```ts
expect(unitGraphSourceLabel({ source: "ARCHITECTURE_UNIT_PROJECTION", fidelity: "UNIT" })).toBe("PostgreSQL architecture units");
expect(selectBaseGraph(unitGraph).nodes).toHaveLength(8);
expect(selectBaseGraph(unitGraph).edges).toHaveLength(6);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts`

Expected: failure because normal overview still calls assertion `overview`.

- [ ] **Step 3: Implement normal-graph query and provenance badge**

```ts
const result = await runUnitGraphQuery({ operation: "unitGraph", ...identity, generationId });
setOverview(toOverviewResult(result));
setDataSource("architecture-unit-projection");
```

Use the existing renderer after converting the unit response to graph-summary nodes and edges. Display source and fidelity. Keep `graphView === "impact"` on its existing analysis request and render a localized availability state for its typed failure.

- [ ] **Step 4: Run focused verification**

Run: `pnpm exec vitest run apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts apps/web/lib/3a/query-handler.test.ts && pnpm --filter @specforge/web typecheck`

Expected: normal graph keeps all six mappings and impact has no silent fallback.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/3a/query-client.ts apps/web/components/three-a/architecture-graph-workspace.tsx apps/web/components/three-a/architecture-graph-store.ts apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts
git commit -m "fix: render 3a graph from unit projection"
```

### Task 4: Verify live data and close governance

**Files:**
- Create: `scripts/verify-designer-3a-unit-graph.ts`
- Create: `scripts/verify-designer-3a-unit-graph.test.ts`
- Modify: `docs/adr/0035-asset-to-3a-mapping-semantics.md`
- Modify: `docs/design-facts/baseline-manifest.json`

**Interfaces:**
- Produces exact-Scope evidence: 8 nodes, 6 mappings, `ARCHITECTURE_UNIT_PROJECTION`, and `UNIT`.

- [ ] **Step 1: Write the failing verifier test**

```ts
expect(verifyUnitGraphResult(result)).toEqual({
  nodes: 8,
  edges: 6,
  source: "ARCHITECTURE_UNIT_PROJECTION",
  fidelity: "UNIT"
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/verify-designer-3a-unit-graph.test.ts`

Expected: failure because the verifier does not exist.

- [ ] **Step 3: Implement live exact-Scope verifier and update records**

The verifier calls the normal graph read path, asserts the complete identity tuple and source/fidelity/counts, and exits nonzero for unavailable or cross-scope data. Update the ADR and manifest with exact evidence before MCP synchronization.

- [ ] **Step 4: Run one consolidated verification pass**

Run: `pnpm exec vitest run packages/core packages/knowledge-query apps/web/components/three-a apps/web/lib/3a scripts/verify-designer-3a-unit-graph.test.ts && pnpm --filter @specforge/web typecheck && SPECFORGE_NEXT_STANDALONE=0 pnpm --filter @specforge/web build && pnpm exec tsx scripts/verify-designer-3a-unit-graph.ts`

Expected: tests, typecheck, build, and exact-Scope verifier pass; normal graph API returns HTTP 200 with 8 nodes and 6 edges.

- [ ] **Step 5: Synchronize MCP records, close session, and commit**

```bash
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'; pnpm design-facts:sync
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'; pnpm design-facts:check
pnpm design-context:close -- --session <prepared-session-id> --status CONVERGED --evidence "unit-graph-verifier=pass,focused-tests=pass,web-typecheck=pass,web-build=pass,mcp-reconciliation=pass"
git add scripts/verify-designer-3a-unit-graph.ts scripts/verify-designer-3a-unit-graph.test.ts docs/adr/0035-asset-to-3a-mapping-semantics.md docs/design-facts/baseline-manifest.json
git commit -m "docs: record resilient 3a graph delivery"
```

Expected: selected design facts reconcile with `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`.

## Self-Review

- Spec coverage: Task 1 repairs the shared contract; Task 2 establishes the identity-qualified unit graph; Task 3 changes the user-facing normal Graph; Task 4 verifies live behavior and closes dual records.
- Placeholder scan: no deferred implementation wording or unspecified paths remain. The prepared session ID is the receipt returned by the required preflight before code changes.
- Type consistency: `UnitGraphResult`, `unitGraph`, and `runUnitGraphQuery` are introduced in Task 2 and consumed after that in Task 3.

