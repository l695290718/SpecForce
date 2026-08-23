# 3A Readable Member Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make the 3A Network graph show bounded direct member relationships, use a deterministic 36-member visible default, and provide unambiguous expand/select/collapse behavior.

**Architecture:** \`unitGraph\` remains the exact-Scope PostgreSQL read boundary. It gets an additive member-relationship option and a dedicated batched query that requires both endpoints be returned direct members. Graphology retains the complete bounded response; a pure selector derives the visible graph for Sigma and layout.

**Tech Stack:** TypeScript, pnpm, Prisma/PostgreSQL, Zod, Vitest, React/Next.js, Graphology, Sigma/WebGL, MCP.

## Global Constraints

- Use \`com.huawei.celon.desiner\` with scope path \`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner\` for every MCP operation.
- PostgreSQL is authoritative. Graph data is derived only.
- \`includeMemberRelations\` defaults to \`false\`; existing callers remain compatible.
- Network overview requests \`maxMembers: 500\`, \`maxMemberRelations: 120\`, and initially shows at most 36 direct members.
- A returned member relation has both endpoints in the returned member assertion set. Exclude TRACE, inferred, and cross-Scope facts.
- New UI labels have English canonical and Chinese localized values.
- Do not alter unrelated untracked files: \`.tmp/\`, \`outputs/\`, or \`scripts/build-design-code-challenge-workbook.mjs\`.

---

### Task 1: Open preflight and extend the additive query contract

**Files:**
- Modify: \`packages/core/src/three-a-graph-contract.ts\`
- Modify: \`packages/core/src/architecture-map/types.ts\`
- Modify: \`packages/knowledge-query/src/types.ts\`
- Modify: \`apps/web/lib/3a/query-protocol.ts\`
- Modify: \`apps/web/lib/3a/query-handler.ts\`
- Test: \`packages/core/src/architecture-map/types.test.ts\`
- Test: \`apps/web/lib/3a/query-handler.test.ts\`

**Produces:** \`UNIT_WITH_MEMBERS_AND_RELATIONS\`, \`includeMemberRelations\`, \`maxMemberRelations\`, and \`MEMBER_RELATION_BUDGET_EXCEEDED\`.

- [ ] **Step 1: Open the design session before code changes**

Run:
\`\`\`powershell
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Implement bounded readable 3A member relationships and deterministic member expansion." --affected "adr-readable-3a-architecture-mapping,adr-webgl-3a-graph-exploration,proposal-webgl-3a-graph-exploration,ctx-webgl-3a-graph-exploration,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "approved-spec:2026-08-23-3a-readable-member-relationships-design,existing-unitGraph-contract"
\`\`\`
Expected: an exact-Scope \`OPEN\` \`design-change-session:*\` receipt. Save its ID in Task 6 evidence.

- [ ] **Step 2: Write failing tests**

Add:
\`\`\`ts
expect(() => validateUnitGraphBudget({ ...DEFAULT_UNIT_GRAPH_BUDGET, maxMemberRelations: 0 })).toThrow("UNIT_GRAPH_MEMBER_RELATION_BUDGET_INVALID");
expect(service.unitGraph).toHaveBeenCalledWith(expect.objectContaining({
  includeMembers: true, includeMemberRelations: true,
  budget: { maxMembers: 500, maxMemberRelations: 120 }
}));
\`\`\`

- [ ] **Step 3: Run failing tests**

Run: \`pnpm test -- packages/core/src/architecture-map/types.test.ts apps/web/lib/3a/query-handler.test.ts\`

Expected: failures for the missing budget and option.

- [ ] **Step 4: Implement the minimum contract**

Use:
\`\`\`ts
export type ThreeAGraphFidelity = "UNIT" | "UNIT_WITH_MEMBERS" | "UNIT_WITH_MEMBERS_AND_RELATIONS" | "ASSERTION";
export interface UnitGraphBudget extends ArchitectureMapBudget {
  maxMembers: number;
  maxMemberRelations: number;
}
export interface UnitGraphQueryInput extends QueryPrincipalInput {
  includeMembers?: boolean;
  includeMemberRelations?: boolean;
}
\`\`\`

Set the core default to 120, validate a positive \`maxMemberRelations\`, add the new partial reason, cap the Zod request value at 120, and forward the option from \`handleThreeAQuery\`.

- [ ] **Step 5: Verify and commit**

Run:
\`\`\`powershell
pnpm test -- packages/core/src/architecture-map/types.test.ts apps/web/lib/3a/query-handler.test.ts
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/web typecheck
git add packages/core/src/three-a-graph-contract.ts packages/core/src/architecture-map/types.ts packages/knowledge-query/src/types.ts apps/web/lib/3a/query-protocol.ts apps/web/lib/3a/query-handler.ts apps/web/lib/3a/query-handler.test.ts packages/core/src/architecture-map/types.test.ts
git commit -m "feat: bound 3a member relationship queries"
\`\`\`
Expected: focused tests and typechecks pass.

### Task 2: Add exact-Scope, both-endpoint PostgreSQL retrieval

**Files:**
- Modify: \`packages/knowledge-query/src/types.ts\`
- Modify: \`packages/knowledge-query/src/prisma-repository.ts\`
- Test: \`packages/knowledge-query/src/prisma-repository.test.ts\`

**Produces:** \`listArchitectureUnitMemberRelationships(identity, assertionIds, limit)\`.

- [ ] **Step 1: Write a failing repository test**

Assert the call has the exact identity, no manifest field, both filters, and \`limit + 1\`:
\`\`\`ts
expect(call.where).toEqual(expect.objectContaining({
  ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId,
  sourceAssertionId: { in: ["assertion-a", "assertion-b"] },
  targetAssertionId: { in: ["assertion-a", "assertion-b"] }
}));
expect(call.where).not.toHaveProperty("projectionManifestId");
expect(call.take).toBe(121);
\`\`\`

- [ ] **Step 2: Run the test and implement**

Run: \`pnpm test -- packages/knowledge-query/src/prisma-repository.test.ts\`

Add:
\`\`\`ts
listArchitectureUnitMemberRelationships(
  identity: ArchitectureMapIdentity, assertionIds: string[], limit: number
): Promise<{ edges: KnowledgeProjectionEdge[]; hasMore: boolean }>;
\`\`\`

Normalize IDs with \`new Set(...).sort()\`; query \`knowledgeProjectionEdge\` with \`sourceAssertionId IN ids AND targetAssertionId IN ids\`; order by \`confidence desc\`, \`relationCode asc\`, source ID, target ID, and relationship ID; read \`limit + 1\`.

- [ ] **Step 3: Verify and commit**

Run:
\`\`\`powershell
pnpm test -- packages/knowledge-query/src/prisma-repository.test.ts
pnpm --filter @specforge/knowledge-query typecheck
git add packages/knowledge-query/src/types.ts packages/knowledge-query/src/prisma-repository.ts packages/knowledge-query/src/prisma-repository.test.ts
git commit -m "feat: read bounded 3a member relationships"
\`\`\`

### Task 3: Compose member relationships in \`unitGraph\`

**Files:**
- Modify: \`packages/knowledge-query/src/service.ts\`
- Test: \`packages/knowledge-query/src/service.test.ts\`

**Consumes:** Task 2 method and the member page from the existing \`unitGraph\`.

**Produces:** bounded relation edges with compatibility-preserving fidelity and partial state.

- [ ] **Step 1: Write failing service tests**

Cover complete, overflow, and compatibility:
\`\`\`ts
const result = await service.unitGraph(unitGraphInput({
  includeMembers: true, includeMemberRelations: true,
  budget: { maxMembers: 10, maxMemberRelations: 1 }
}));
expect(result.fidelity).toBe("UNIT_WITH_MEMBERS_AND_RELATIONS");
expect(result.edges.filter((edge) => edge.relationCode === "CALLS")).toHaveLength(1);
expect(result.partial?.reasons).toContain("MEMBER_RELATION_BUDGET_EXCEEDED");
\`\`\`
Also prove relation mode without member mode calls no relationship repository and returns existing \`UNIT\` behavior.

- [ ] **Step 2: Run failing service tests**

Run: \`pnpm test -- packages/knowledge-query/src/service.test.ts\`

- [ ] **Step 3: Implement bounded composition**

After \`memberPage\`, call:
\`\`\`ts
const relationPage = input.includeMembers && input.includeMemberRelations
  ? await mapRepository.listArchitectureUnitMemberRelationships!(identity, members.map((member) => member.assertionId), unitBudget.maxMemberRelations)
  : { edges: [], hasMore: false };
\`\`\`
Convert only edges whose stable fact endpoints are already present. Set \`UNIT_WITH_MEMBERS_AND_RELATIONS\` only in active relation mode. Add \`MEMBER_RELATION_BUDGET_EXCEEDED\` and \`CONTINUATION_REQUIRED\` when \`hasMore\`.

- [ ] **Step 4: Verify and commit**

Run:
\`\`\`powershell
pnpm test -- packages/knowledge-query/src/service.test.ts packages/knowledge-query/src/prisma-repository.test.ts
pnpm --filter @specforge/knowledge-query typecheck
git add packages/knowledge-query/src/service.ts packages/knowledge-query/src/service.test.ts
git commit -m "feat: compose 3a member relations into unit graph"
\`\`\`

### Task 4: Derive visible graph state and one-way cluster expansion

**Files:**
- Create: \`apps/web/components/three-a/architecture-graph-visibility.ts\`
- Create: \`apps/web/components/three-a/architecture-graph-visibility.test.ts\`
- Modify: \`apps/web/components/three-a/architecture-graph-workspace.tsx\`
- Modify: \`apps/web/components/three-a/architecture-graph-renderer.tsx\`
- Modify: \`apps/web/components/three-a/sigma-architecture-graph.tsx\`
- Modify: \`apps/web/components/three-a/architecture-graph-controls.tsx\`
- Modify: \`apps/web/lib/i18n.ts\`
- Test: \`apps/web/components/three-a/sigma-architecture-graph.test.tsx\`
- Test: \`apps/web/components/three-a/architecture-graph-workspace.test.tsx\`

**Produces:** \`defaultExpandedClusterIds\`, \`deriveVisibleArchitectureGraph\`, explicit collapse, and visible-only layout input.

- [ ] **Step 1: Write failing visibility tests**

Define the pure interfaces:
\`\`\`ts
export function defaultExpandedClusterIds(
  nodes: readonly GraphSemanticNode[], edges: readonly GraphSemanticEdge[], maxVisibleMembers?: number
): ReadonlySet<string>;
export function deriveVisibleArchitectureGraph(
  snapshot: GraphSnapshot, expandedClusterIds: ReadonlySet<string>
): VisibleArchitectureGraph;
\`\`\`

Assert every layer contributes a relation-bearing cluster before tie-breaking by relationship degree, member count, then unit ID; assert at most 36 facts; assert visible edges have both endpoints visible.

- [ ] **Step 2: Run failing Web tests**

Run:
\`\`\`powershell
pnpm test -- apps/web/components/three-a/architecture-graph-visibility.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.tsx
\`\`\`

- [ ] **Step 3: Implement pure visibility and workspace behavior**

Request:
\`\`\`ts
includeMembers: true,
includeMemberRelations: true,
budget: { maxUnitsPerLayer: 12, maxMembers: 500, maxMemberRelations: 120, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
\`\`\`

Replace \`collapsedClusterIds\` with \`expandedClusterIds\`. A click expands a cluster only when it is absent; an already-expanded cluster only selects and focuses. Add \`onCollapseSelection\` to the graph controls, enable it only for a selected expanded cluster, and add bilingual \`threeA.collapseSelectedUnit\`. Reset the set only on Scope, Baseline, Projection, generation, or graph-view changes.

- [ ] **Step 4: Make Sigma and layout use visibility**

Pass \`visibleNodeIds\` and \`visibleEdgeIds\` through renderer props. Sigma reducers hide outside IDs. Update \`createLayoutRequest\` to send only visible nodes and edges to the worker. On expansion restart the short cancellable layout; do not refetch data.

- [ ] **Step 5: Verify and commit**

Run:
\`\`\`powershell
pnpm test -- apps/web/components/three-a/architecture-graph-visibility.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.tsx
pnpm --filter @specforge/web typecheck
git add apps/web/components/three-a/architecture-graph-visibility.ts apps/web/components/three-a/architecture-graph-visibility.test.ts apps/web/components/three-a/architecture-graph-workspace.tsx apps/web/components/three-a/architecture-graph-renderer.tsx apps/web/components/three-a/sigma-architecture-graph.tsx apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.tsx apps/web/components/three-a/architecture-graph-controls.tsx apps/web/lib/i18n.ts
git commit -m "feat: make 3a member graph visibility deterministic"
\`\`\`

### Task 5: Run one consolidated local and Docker validation

**Files:**
- Modify: \`apps/web/components/three-a/architecture-graph-workspace.test.tsx\`
- Create: \`docs/evidence/designer-3a-readable-member-relationships-evidence.md\`

- [ ] **Step 1: Add the graph count and legend test**

Keep the sample rail at \`8 / 42 / 307 / 6\`; assert the legend contains \`ARCHITECTURE_MEMBERSHIP\` and a direct relation code such as \`CALLS\`.

- [ ] **Step 2: Run focused checks once**

Run:
\`\`\`powershell
pnpm test -- packages/core/src/architecture-map/types.test.ts packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/components/three-a/architecture-graph-visibility.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.tsx
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/knowledge-query typecheck
pnpm --filter @specforge/web typecheck
git diff --check
\`\`\`
Expected: all pass.

- [ ] **Step 3: Rebuild only the Web service and browser-check once**

Run:
\`\`\`powershell
docker compose -f deploy/compose.yaml build web
docker compose -f deploy/compose.yaml up -d --no-deps web
Invoke-WebRequest http://localhost:3010/healthz -UseBasicParsing
\`\`\`
Expected: HTTP 200. Verify one overview request with \`includeMemberRelations=true\`, no more than 36 initially visible members, typed legend entries, collapsed click expands once, expanded click selects, explicit collapse works, and no console/API errors.

- [ ] **Step 4: Record evidence and commit**

Record exact preflight session ID, commands/results, browser URL/counts, click observations, and the distinction between local verification and deferred production-scale evidence in bilingual form.

\`\`\`powershell
git add apps/web/components/three-a/architecture-graph-workspace.test.tsx docs/evidence/designer-3a-readable-member-relationships-evidence.md
git commit -m "test: verify readable 3a member relationships"
\`\`\`

### Task 6: Synchronize design facts and close the exact-Scope session

**Files:**
- Modify: \`docs/adr/0025-readable-3a-architecture-mapping.md\`
- Modify: \`docs/design-facts/baseline-manifest.json\`
- Modify: \`docs/TODO.md\` only if a deferred production item is discovered

- [ ] **Step 1: Update ADR and manifest facts**

Add English and Chinese decisions for the 120-edge bound, 36-member visibility policy, both-endpoint predicate, one-way expansion, explicit collapse, and Task 5 evidence.

- [ ] **Step 2: Write authoritative facts only through MCP**

Run:
\`\`\`powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping,proposal-webgl-3a-graph-exploration,ctx-webgl-3a-graph-exploration,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model'
pnpm design-facts:sync
pnpm design-facts:check
\`\`\`
Expected: no missing, mismatched, out-of-scope, or blocked facts.

- [ ] **Step 3: Close the preflight session and commit**

Run:
\`\`\`powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session <Task-1-session-id> --status CONVERGED --evidence "focused-tests=PASS,core-typecheck=PASS,knowledge-query-typecheck=PASS,web-typecheck=PASS,docker-web-health=200,browser-member-relations=PASS,design-facts-sync=COMPLETE,design-facts-check=VERIFIED"
git add docs/adr/0025-readable-3a-architecture-mapping.md docs/design-facts/baseline-manifest.json docs/TODO.md
git commit -m "docs: govern readable 3a member relationships"
\`\`\`
Expected: the exact same session is \`CONVERGED\`. If synchronization or read-back fails, close it as \`BLOCKED\` with reason and retry trigger, record a backlog fact, and do not claim completion.

## Plan Self-Review

- Spec coverage: Tasks 1-3 implement bounded and isolated reads; Task 4 implements default visibility, click semantics, and visible-subgraph layout; Task 5 validates the user-visible result once; Task 6 completes ADR/MCP reconciliation.
- Placeholder scan: every task names files, interfaces, test assertions, commands, and results. \`<Task-1-session-id>\` is the runtime receipt generated by mandatory preflight.
- Type consistency: \`maxMemberRelations\`, \`includeMemberRelations\`, \`UNIT_WITH_MEMBERS_AND_RELATIONS\`, \`MEMBER_RELATION_BUDGET_EXCEEDED\`, \`listArchitectureUnitMemberRelationships\`, \`defaultExpandedClusterIds\`, and \`deriveVisibleArchitectureGraph\` are defined before use.
