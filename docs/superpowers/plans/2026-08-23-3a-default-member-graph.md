# 3A Default Member Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all governed 3A units and direct members in the initial Network view through one bounded exact-Scope query, with local unit collapse and no TRACE coverage noise.

**Architecture:** Extend `unitGraph` additively with `includeMembers` and a dedicated `UnitGraphBudget.maxMembers`. Read members with one batched PostgreSQL query, return member facts and `ARCHITECTURE_MEMBERSHIP` edges in the existing summary graph envelope, then hide or reveal member subgraphs locally through Sigma reducers.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, Next.js 15, React 19, Graphology, Sigma/WebGL, Vitest, Docker Compose, SpecForge MCP design governance.

## Global Constraints

- Exact owning Scope: `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- `includeMembers` defaults to `false`; existing callers remain compatible.
- Hard limits: 12 units per layer, 500 members, 60 unit mappings, 500 membership edges, 2,000 ms, and 524,288 bytes.
- Member mode returns `source=ARCHITECTURE_UNIT_PROJECTION` and `fidelity=UNIT_WITH_MEMBERS`.
- TRACE coverage assets never enter the default graph.
- PostgreSQL remains authoritative; the browser graph remains read-only.
- No Prisma migration is required.
- Complete matching English canonical and Chinese localized design records are required.
- Implementation is incomplete until MCP synchronization, read-back, and Design Change Session closure converge.

---

### Task 1: Open the Exact-Scope Session and Add Shared Contracts

**Files:**
- Modify: `packages/core/src/three-a-graph-contract.ts`
- Modify: `packages/core/src/architecture-map/types.ts`
- Modify: `packages/core/src/architecture-map/types.test.ts`
- Modify: `packages/knowledge-query/src/types.ts`

**Interfaces:**
- Produces: `ThreeAGraphFidelity = "UNIT" | "UNIT_WITH_MEMBERS" | "ASSERTION"`.
- Produces: `UnitGraphBudget extends ArchitectureMapBudget { maxMembers: number }`.
- Produces: `DEFAULT_UNIT_GRAPH_BUDGET` with `maxMembers: 500`.
- Produces: `MEMBER_BUDGET_EXCEEDED` as an architecture-map partial reason.
- Produces: `UnitGraphQueryInput.includeMembers?: boolean` and `UnitGraphQueryInput.budget?: Partial<UnitGraphBudget>`.

- [ ] **Step 1: Open the implementation session before code changes**

Run:

```powershell
$preflightOutput = pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Render governed 3A direct members by default through one bounded unitGraph query with local cluster collapse." --affected "adr-readable-3a-architecture-mapping,proposal-readable-3a-architecture-mapping,ctx-readable-3a-architecture-mapping,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "approved-spec:docs/superpowers/specs/2026-08-23-3a-default-member-graph-design.md,approved-plan:docs/superpowers/plans/2026-08-23-3a-default-member-graph.md" | Out-String
$sessionId = [regex]::Match($preflightOutput, 'design-change-session:[0-9a-f-]+').Value
$preflightOutput
$sessionId
```

Expected: an `OPEN` receipt in the exact Designer Scope with no blocked reconciliation. Record its emitted session ID in ADR 0025.

- [ ] **Step 2: Add failing contract tests**

Add assertions equivalent to:

```ts
expect(DEFAULT_UNIT_GRAPH_BUDGET).toEqual({
  maxUnitsPerLayer: 12,
  maxMembers: 500,
  maxMappings: 60,
  timeoutMs: 2_000,
  maxPayloadBytes: 524_288
});
expect(validateUnitGraphBudget(DEFAULT_UNIT_GRAPH_BUDGET)).toEqual(DEFAULT_UNIT_GRAPH_BUDGET);
expect(() => validateUnitGraphBudget({ ...DEFAULT_UNIT_GRAPH_BUDGET, maxMembers: 501 })).toThrow("UNIT_GRAPH_MEMBER_BUDGET_INVALID");
```

- [ ] **Step 3: Run the contract test and verify failure**

Run: `pnpm exec vitest run packages/core/src/architecture-map/types.test.ts`

Expected: FAIL because the member-aware budget and fidelity do not exist.

- [ ] **Step 4: Implement the additive shared types and validators**

Define the exact interfaces above. Keep `ArchitectureMapBudget` unchanged for Map and neighborhood callers. Add `validateUnitGraphBudget` that first validates the map fields and then requires integer `maxMembers` in `1..500`.

- [ ] **Step 5: Run the contract tests**

Run: `pnpm exec vitest run packages/core/src/architecture-map/types.test.ts`

Expected: PASS.

### Task 2: Add One Batched PostgreSQL Member Read

**Files:**
- Modify: `packages/knowledge-query/src/types.ts`
- Modify: `packages/knowledge-query/src/prisma-repository.ts`
- Modify: `packages/knowledge-query/src/prisma-repository.test.ts`

**Interfaces:**
- Consumes: `ArchitectureMapIdentity`, selected unit identities, and `maxMembers`.
- Produces: `listArchitectureUnitMembersByUnits(identity, unitIdentities, limit): Promise<{ members; hasMore }>`.

- [ ] **Step 1: Add failing repository tests**

Assert one Prisma `findMany` call with:

```ts
expect(findMany).toHaveBeenCalledWith({
  where: {
    applicationServiceId: identity.applicationServiceId,
    scopePath: identity.scopePath,
    generationId: identity.generationId,
    baselineId: identity.baselineId,
    projectionManifestId: identity.projectionManifestId,
    unitIdentity: { in: ["unit:biz:design", "unit:sys:design"] }
  },
  orderBy: [{ unitIdentity: "asc" }, { assertionId: "asc" }],
  take: 501
});
```

Also assert deterministic truncation to 500 and `hasMore=true` when 501 rows are returned.

- [ ] **Step 2: Run the repository test and verify failure**

Run: `pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts`

Expected: FAIL because the batch method does not exist.

- [ ] **Step 3: Implement the batch repository operation**

Return an empty complete page for no unit identities. Otherwise de-duplicate and sort the identities, execute one `findMany`, map rows with the existing member mapper, slice to the limit, and report `hasMore` from the extra row.

- [ ] **Step 4: Run the repository test**

Run: `pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts`

Expected: PASS with one batched query and exact identity predicates.

### Task 3: Aggregate Members in `unitGraph`

**Files:**
- Modify: `packages/knowledge-query/src/service.ts`
- Modify: `packages/knowledge-query/src/architecture-map.test.ts`
- Modify: `packages/knowledge-query/src/service.test.ts`
- Modify: `apps/web/lib/3a/query-protocol.ts`
- Modify: `apps/web/lib/3a/query-handler.ts`
- Modify: `apps/web/lib/3a/query-handler.test.ts`

**Interfaces:**
- Consumes: `includeMembers`, `UnitGraphBudget`, and the batched repository operation.
- Produces: compatible `UNIT` responses or member-rich `UNIT_WITH_MEMBERS` responses.

- [ ] **Step 1: Add failing service tests**

For compatibility mode, assert no batch member call and the existing 8/6 unit graph shape. For member mode, assert two sample units and three members produce 5 nodes and 4 edges, including:

```ts
expect(result.fidelity).toBe("UNIT_WITH_MEMBERS");
expect(result.nodes.filter((node) => node.kind === "fact")).toHaveLength(3);
expect(result.edges.filter((edge) => edge.relationCode === "ARCHITECTURE_MEMBERSHIP")).toHaveLength(3);
```

Add a 501-member fixture and assert deterministic 500-member output with `MEMBER_BUDGET_EXCEEDED` and `CONTINUATION_REQUIRED`.

- [ ] **Step 2: Add failing Web protocol tests**

Assert `includeMembers=true` and `budget.maxMembers=500` parse for `unitGraph`; assert 501 is rejected; assert the handler forwards both values.

- [ ] **Step 3: Run focused query tests and verify failure**

Run:

```powershell
pnpm exec vitest run packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts
```

Expected: FAIL on the missing member mode and protocol fields.

- [ ] **Step 4: Implement member aggregation**

Normalize `UnitGraphBudget` separately from Map. After `architectureMap` returns units and mappings, call the batch member operation only when `includeMembers=true`. Convert members into fact summary nodes and `ARCHITECTURE_MEMBERSHIP` edges with stable IDs `membership:<unitIdentity>:<assertionId>`. Seed member positions deterministically around the owning unit and preserve exact identity fields.

- [ ] **Step 5: Implement Web validation and forwarding**

Add a `unitGraphBudget` Zod schema with `maxMembers.max(500)`, add optional `includeMembers`, and forward them in the handler.

- [ ] **Step 6: Run focused query tests**

Run the command from Step 3.

Expected: PASS for compatibility, complete member mode, partial member mode, validation, and forwarding.

### Task 4: Render and Collapse Member Subgraphs

**Files:**
- Modify: `apps/web/components/three-a/architecture-graph-workspace.tsx`
- Modify: `apps/web/components/three-a/architecture-graph-workspace.test.ts`
- Modify: `apps/web/components/three-a/architecture-graph-renderer.tsx`
- Modify: `apps/web/components/three-a/sigma-architecture-graph.tsx`
- Modify: `apps/web/components/three-a/sigma-architecture-graph.test.tsx`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: a member-rich `UnitGraphQueryResult`.
- Produces: initial 50-node/48-edge Designer graph and `collapsedClusterIds: ReadonlySet<string>` renderer state.

- [ ] **Step 1: Add failing workspace and renderer tests**

Assert the overview request includes:

```ts
includeMembers: true,
budget: {
  maxUnitsPerLayer: 12,
  maxMembers: 500,
  maxMappings: 60,
  timeoutMs: 2_000,
  maxPayloadBytes: 524_288
}
```

Add reducer tests proving a collapsed cluster hides a member node whose `clusterId` matches and hides its `ARCHITECTURE_MEMBERSHIP` edge, while the cluster and all unit mappings remain visible.

- [ ] **Step 2: Run focused Web graph tests and verify failure**

Run:

```powershell
pnpm --filter @specforge/web test -- apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx
```

Expected: FAIL because member mode and collapse reducers are absent.

- [ ] **Step 3: Switch the default request to member mode**

Request `includeMembers=true`, remove the initial dependency on click-time neighborhood fetching, keep the abort behavior, and retain fact detail selection. The count rail continues to derive 8 units and 42 direct members from cluster metadata while loaded counts report 50 nodes and 48 edges.

- [ ] **Step 4: Add local collapse state**

Initialize `collapsedClusterIds` empty. Cluster selection toggles its unit identity. Fact selection removes its owning cluster from the collapsed set before focusing it. Clear the set whenever the graph identity or graph view reloads.

- [ ] **Step 5: Hide collapsed members in Sigma reducers**

Thread a read-only collapsed-cluster set through `ArchitectureGraphRenderer` and `SigmaArchitectureGraph`. In `nodeReducer`, return `hidden: true` for fact nodes whose `clusterId` is collapsed. In `edgeReducer`, return `hidden: true` only for `ARCHITECTURE_MEMBERSHIP` edges whose unit endpoint is collapsed. Add localized cluster interaction status without adding mutation controls.

- [ ] **Step 6: Run focused Web graph tests**

Run the command from Step 2.

Expected: PASS.

### Task 5: Verify, Synchronize Design Facts, Deploy, and Commit

**Files:**
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `scripts/design-fact-manifest.test.ts`

**Interfaces:**
- Consumes: the session receipt from Task 1 and all focused evidence.
- Produces: converged repository and MCP ADR, Proposal, Context Pack, API, read-model, and typed-link records.

- [ ] **Step 1: Run the unified code verification batch**

Run:

```powershell
pnpm exec vitest run packages/core/src/architecture-map/types.test.ts packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/knowledge-query typecheck
pnpm --filter @specforge/web typecheck
git diff --check
```

Expected: all tests and typechecks exit 0; diff check reports no whitespace errors.

- [ ] **Step 2: Update bilingual design records**

Record the optional compatibility flag, `UNIT_WITH_MEMBERS`, 500-member bound, one batched PostgreSQL query, exact 50/48 Designer v6 topology, collapse semantics, test commands, and results in ADR 0025 and the matching manifest decision.

- [ ] **Step 3: Validate and synchronize the selected design fact**

Run:

```powershell
pnpm exec vitest run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'; pnpm design-facts:sync
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'; pnpm design-facts:check
```

Expected: design tests pass, synchronization returns `complete`, and reconciliation returns empty missing, mismatched, out-of-Scope, and blocked lists.

- [ ] **Step 4: Validate port 3000 once**

Confirm the initial graph loads 50 nodes and 48 edges, all eight units begin expanded, cluster collapse hides only its members, member search expands a collapsed parent, camera controls work, 307 TRACE assets remain absent, and no console or request errors occur.

- [ ] **Step 5: Rebuild and validate port 3010 once**

Run:

```powershell
docker compose -f deploy/compose.yaml build web
docker compose -f deploy/compose.yaml up -d --no-deps web
(Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3010/healthz' -TimeoutSec 20).StatusCode
```

Expected: the production build passes, only `deploy-web-1` is replaced, health returns 200, and browser acceptance repeats the 50/48 and collapse checks.

- [ ] **Step 6: Close the exact emitted session and resynchronize closure evidence**

Use the exact session ID emitted in Task 1:

```powershell
pnpm design-context:close -- --session $sessionId --status CONVERGED --evidence "core-and-query-tests=passed,web-graph-tests=passed,typechecks=passed,browser-3000-default-members-and-collapse=passed,docker-web-build=passed,browser-3010-default-members-and-collapse=passed,mcp-sync-and-readback=passed"
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'; pnpm design-facts:sync
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'; pnpm design-facts:check
```

Expected: the session closes `CONVERGED` in the exact Designer Scope and final read-back remains clean.

- [ ] **Step 7: Commit only task files**

Leave `.tmp/`, `outputs/`, and `scripts/build-design-code-challenge-workbook.mjs` untouched. Commit with:

```powershell
git commit -m "feat: show governed members in 3a graph"
```
