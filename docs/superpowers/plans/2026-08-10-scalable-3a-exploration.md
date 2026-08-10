# Scalable 3A Exploration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eager, page-length 3A catalog with independently paginated fixed-height lanes and add a bounded focus-first relationship graph without loading all nodes or edges.

**Architecture:** Keep PostgreSQL and the existing `@specforge/knowledge-query` service authoritative. Add indexed frontier adjacency reads, an exact-Scope Web query boundary, active-view-only server loading, and two client surfaces over the same published Baseline: a paginated Lane Catalog and a continuation-based Relationship Graph. Reuse `@xyflow/react` with a deterministic BIZ/SYS/TECH plus upstream/focus/downstream layout.

**Tech Stack:** TypeScript, Next.js 15 App Router, React 19, Tailwind CSS, `@xyflow/react`, Prisma/PostgreSQL, Vitest, SpecForge MCP design governance.

## Global Constraints

- Owning application service is exactly `com.huawei.celon.desiner`.
- Owning scope path is exactly `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Open a new exact-Scope Design Change Session before the first implementation edit and record its receipt.
- PostgreSQL remains authoritative; WebGL, React Flow, and graph databases are derived presentation or query runtimes only.
- Client components must not import Prisma or bypass `@specforge/knowledge-query` authorization.
- Page initialization must not issue an unfiltered 200-node request or unconditional Trace, Alignment, or Drift queries.
- Initial Lane Catalog page size is 20 nodes per BIZ, SYS, and TECH layer.
- Initial graph request defaults are depth 1, 100 nodes, 200 edges, 100 paths, 2 seconds, and 512 KiB.
- Individual requests are finite, but the product has no total-hop ceiling; repeated expansion uses bound continuation state.
- `mode=lanes`, `mode=graph`, and legacy `mode=list` URLs remain valid.
- Changing Scope, Baseline, or Projection invalidates lane pages, graph pages, continuations, focus detail, filters, and stale responses.
- English is canonical and all new human-facing copy has a complete Chinese overlay.
- The Web remains read-only; formal authored mutations continue through MCP.
- Do not add Sigma.js, Graphology, Dagre, ELK, or another graph/layout dependency in this increment.
- Preserve unrelated modifications in `.superpowers/sdd/task-1-report.md` and `.superpowers/sdd/task-3-report.md`.

## File Structure

### Query package

- Modify `packages/knowledge-query/src/types.ts`: additive trace filters and bounded repository adjacency contracts.
- Modify `packages/knowledge-query/src/service.ts`: asynchronous frontier walk and filtered continuation fingerprint.
- Modify `packages/knowledge-query/src/prisma-repository.ts`: exact-Scope indexed adjacency and batch node reads.
- Modify `packages/knowledge-query/src/service.test.ts`: service contract, continuation, filter, and no-full-edge assertions.
- Create `packages/knowledge-query/src/prisma-repository.test.ts`: Prisma query-shape tests for adjacency reads.

### Web query and initial loading

- Create `apps/web/lib/3a/workspace-loader.ts`: active-tab and active-mode server data orchestration.
- Create `apps/web/lib/3a/workspace-loader.test.ts`: call-isolation tests.
- Create `apps/web/lib/3a/query-protocol.ts`: Zod request union and safe response/error contracts.
- Create `apps/web/lib/3a/query-handler.ts`: authorized query dispatcher with injected dependencies.
- Create `apps/web/lib/3a/query-handler.test.ts`: exact-Scope and operation dispatch tests.
- Create `apps/web/lib/3a/query-client.ts`: browser fetch wrapper with abort support.
- Create `apps/web/app/api/architecture/3a/query/route.ts`: thin POST route.
- Modify `apps/web/app/architecture/3a/page.tsx`: delegate data loading and stop eager queries.

### Navigation and catalog

- Modify `apps/web/lib/3a/url-state.ts` and `url-state.test.ts`: add graph mode and preserve list compatibility.
- Modify `apps/web/components/three-a/baseline-toolbar.tsx`: Lanes/Graph primary mode switch and List fallback.
- Create `apps/web/components/three-a/architecture-node-card.tsx`: shared stable node card.
- Create `apps/web/components/three-a/catalog-state.ts` and `catalog-state.test.ts`: independent layer state reducer.
- Create `apps/web/components/three-a/architecture-lane.tsx`: one fixed-height paginated lane.
- Create `apps/web/components/three-a/architecture-catalog.tsx`: three-lane orchestration, server search, and mobile layer switch.
- Remove `apps/web/components/three-a/architecture-lanes.tsx` after all imports move to the focused files above.

### Relationship graph

- Create `apps/web/components/three-a/architecture-graph-state.ts` and `.test.ts`: bounded merge and continuation-key logic.
- Create `apps/web/components/three-a/architecture-graph-layout.ts` and `.test.ts`: deterministic architecture positioning.
- Create `apps/web/components/three-a/architecture-graph-node.tsx`: accessible custom React Flow node.
- Create `apps/web/components/three-a/architecture-graph-canvas.tsx`: React Flow rendering and camera controls.
- Create `apps/web/components/three-a/architecture-relationship-inspector.tsx`: selected edge detail.
- Create `apps/web/components/three-a/architecture-graph-explorer.tsx`: filters, expansion, selection, partial states, and list fallback.
- Modify `apps/web/app/globals.css`: bounded graph entry motion and reduced-motion override.

### Workspace, localization, and governance

- Modify `apps/web/components/three-a/three-a-workspace.tsx` and `.test.tsx`: integrate catalog and graph while preserving focus.
- Modify `apps/web/components/three-a/architecture-detail-drawer.tsx`: localized labels and focus restoration hook.
- Modify `apps/web/components/three-a/architecture-path-list.tsx`: graph list fallback semantics.
- Modify `apps/web/app/architecture/3a/loading.tsx`: stable-height catalog skeleton.
- Modify `apps/web/lib/i18n.ts`: complete English and Chinese copy.
- Modify `docs/adr/0023-scalable-3a-exploration.md`: implementation evidence and final status.
- Modify `docs/design-facts/baseline-manifest.json`: implemented Proposal state, query API contract, Context Pack, and evidence.
- Modify `scripts/design-fact-manifest.test.ts`: implemented fact assertions.

---

### Task 1: Bounded Frontier Adjacency Query

**Files:**
- Modify: `packages/knowledge-query/src/types.ts`
- Modify: `packages/knowledge-query/src/service.ts`
- Modify: `packages/knowledge-query/src/prisma-repository.ts`
- Modify: `packages/knowledge-query/src/service.test.ts`
- Create: `packages/knowledge-query/src/prisma-repository.test.ts`

**Interfaces:**
- Consumes: existing `ArchitectureScopeRef`, `ProjectionManifestV2`, signed traversal cursor, and `TraceContinuationStore`.
- Produces: additive `relationTypes` and `layers` filters, `listAdjacentEdges`, `getFactsByIds`, and a trace service that never calls an unfiltered full-edge read.

- [ ] **Step 1: Open the implementation Design Change Session**

Run from the repository root:

```powershell
node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\design-context.ts preflight --intent "Implement scalable 3A lane pagination and bounded relationship graph exploration" --affected "adr-scalable-3a-exploration,proposal-scalable-3a-exploration,ctx-scalable-3a-exploration,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "focused-query-tests,active-view-loader-tests,desktop-mobile-browser-acceptance,mcp-readback"
```

Expected: exit 0 with an `OPEN` session ID matching `^design-change-session:[0-9a-f-]{36}$` in the exact Designer Scope. Stop implementation if the receipt is missing, Scope differs, or reconciliation is blocked.

- [ ] **Step 2: Write failing service tests for filtered adjacency traversal**

Add focused fixtures and assertions to `packages/knowledge-query/src/service.test.ts`:

```ts
const biz = node("biz-1", "BIZ", "orders.intent");
const sys = node("sys-1", "SYS", "orders.api");
const tech = node("tech-1", "TECH", "orders.postgres");

it("walks only bounded adjacency and binds filters to continuation state", async () => {
  repository.listAdjacentEdges = vi.fn().mockResolvedValue({
    edges: [edge(biz, sys, "REALIZED_BY"), edge(sys, tech, "DEPENDS_ON")],
    hasMore: false
  });
  repository.getFactsByIds = vi.fn().mockResolvedValue([source(biz), source(sys), source(tech)]);

  const result = await service.traceArchitecturePath({
    principal,
    architectureScope: scope,
    baselineId: manifest.baselineId,
    projectionManifestId: manifest.id,
    startAssertionId: biz.assertionId,
    direction: "downstream",
    relationTypes: ["REALIZED_BY"],
    layers: ["BIZ", "SYS"],
    budget: { maxDepth: 1, maxNodes: 100, maxEdges: 200 }
  });

  expect(repository.listAdjacentEdges).toHaveBeenCalledWith(scope, manifest, {
    frontierAssertionIds: [biz.assertionId],
    direction: "downstream",
    relationTypes: ["REALIZED_BY"],
    limit: 200
  });
  expect(repository.listEdges).not.toHaveBeenCalled();
  expect(result.nodes.map((item) => item.assertionId)).toEqual(["biz-1", "sys-1"]);
  expect(result.edges.map((item) => item.relationCode)).toEqual(["REALIZED_BY"]);
});

it("rejects a continuation when relation or layer filters change", async () => {
  const first = await service.traceArchitecturePath(traceInput({ relationTypes: ["REALIZED_BY"], layers: ["BIZ", "SYS"] }));
  await expect(service.traceArchitecturePath({
    ...traceInput({ relationTypes: ["DEPENDS_ON"], layers: ["SYS", "TECH"] }),
    continuation: first.continuation
  })).rejects.toMatchObject({ code: "CURSOR_INVALID" });
});
```

Add helpers in the same test file with complete required projection fields:

```ts
function node(assertionId: string, layer: "BIZ" | "SYS" | "TECH", semanticIdentity: string): KnowledgeProjectionNode {
  return { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, assertionId, layer, semanticIdentity, sortKey: `${layer}|${semanticIdentity}`, contentDigest: `digest-${assertionId}` };
}

function edge(sourceNode: KnowledgeProjectionNode, targetNode: KnowledgeProjectionNode, relationCode: string): KnowledgeProjectionEdge {
  return { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, relationshipIdentity: `${sourceNode.assertionId}:${relationCode}:${targetNode.assertionId}`, sourceAssertionId: sourceNode.assertionId, targetAssertionId: targetNode.assertionId, sourceSemanticIdentity: sourceNode.semanticIdentity, targetSemanticIdentity: targetNode.semanticIdentity, relationCode, confidence: 1, relationshipVersion: manifest.relationshipVersion, contentDigest: `digest-${relationCode}` };
}
```

- [ ] **Step 3: Run the service tests and verify the new contract fails**

Run:

```powershell
pnpm --filter @specforge/knowledge-query test -- src/service.test.ts
```

Expected: FAIL because `listAdjacentEdges`, `getFactsByIds`, `relationTypes`, and `layers` are not defined.

- [ ] **Step 4: Add the repository and trace input contracts**

Update `packages/knowledge-query/src/types.ts` with these exact additive contracts:

```ts
export type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
export type TraceDirection = "upstream" | "downstream" | "both";

export interface TraceArchitecturePathInput extends QueryPrincipalInput {
  baselineId: string;
  projectionManifestId: string;
  startAssertionId: string;
  direction?: TraceDirection;
  relationTypes?: string[];
  layers?: ArchitectureLayer[];
  budget?: Partial<ThreeABudget>;
  continuation?: string;
}

export interface AdjacentEdgeQuery {
  frontierAssertionIds: string[];
  direction: TraceDirection;
  relationTypes?: string[];
  limit: number;
}

export interface ThreeAQueryRepository {
  listOfficialBaselines(scope: ArchitectureScopeRef): Promise<PublishedBaselineSummary[]>;
  listPublishedManifests(scope: ArchitectureScopeRef, baselineId: string): Promise<ProjectionManifestV2[]>;
  searchNodes(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: { query?: string; layer?: ArchitectureLayer; afterSortKey?: string; limit: number }): Promise<{ nodes: KnowledgeProjectionNode[]; hasMore: boolean }>;
  getFact(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionId: string): Promise<ArchitectureFactSource | undefined>;
  getFactsByIds(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionIds: string[]): Promise<ArchitectureFactSource[]>;
  listAdjacentEdges(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: AdjacentEdgeQuery): Promise<{ edges: KnowledgeProjectionEdge[]; hasMore: boolean }>;
  listEdges(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input?: { assertionId?: string }): Promise<KnowledgeProjectionEdge[]>;
}
```

Normalize filters before using them:

```ts
function normalizedFilters(input: TraceArchitecturePathInput) {
  const relationTypes = [...new Set((input.relationTypes ?? []).map((item) => item.trim()).filter(Boolean))].sort();
  const layers = [...new Set(input.layers ?? [])].sort();
  if (relationTypes.length > 20 || relationTypes.some((item) => item.length > 64)) throw new ThreeAQueryError("QUERY_FILTER_INVALID");
  return { relationTypes, layers };
}
```

- [ ] **Step 5: Implement indexed adjacency and batch node reads**

Add to `PrismaThreeAQueryRepository`:

```ts
async getFactsByIds(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionIds: string[]): Promise<ArchitectureFactSource[]> {
  const uniqueIds = [...new Set(assertionIds)].sort();
  if (!uniqueIds.length) return [];
  const nodes = await this.prisma.knowledgeProjectionNode.findMany({
    where: { ...scope, generationId: manifest.generationId, assertionId: { in: uniqueIds } },
    orderBy: [{ sortKey: "asc" }, { assertionId: "asc" }]
  });
  const assertions = await this.prisma.knowledgeAssertion.findMany({
    where: { ...scope, id: { in: nodes.map((item) => item.assertionId) } }
  });
  const assertionById = new Map(assertions.map((item) => [item.id, item]));
  return nodes.map((item) => factSource(nodeFromRow(item), assertionById.get(item.assertionId)));
}

async listAdjacentEdges(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: AdjacentEdgeQuery): Promise<{ edges: KnowledgeProjectionEdge[]; hasMore: boolean }> {
  const frontier = [...new Set(input.frontierAssertionIds)].sort();
  if (!frontier.length) return { edges: [], hasMore: false };
  const directional = input.direction === "downstream"
    ? { sourceAssertionId: { in: frontier } }
    : input.direction === "upstream"
      ? { targetAssertionId: { in: frontier } }
      : { OR: [{ sourceAssertionId: { in: frontier } }, { targetAssertionId: { in: frontier } }] };
  const rows = await this.prisma.knowledgeProjectionEdge.findMany({
    where: { ...scope, generationId: manifest.generationId, ...directional, ...(input.relationTypes?.length ? { relationCode: { in: input.relationTypes } } : {}) },
    orderBy: [{ sourceAssertionId: "asc" }, { targetAssertionId: "asc" }, { relationshipIdentity: "asc" }],
    take: input.limit + 1
  });
  return { edges: rows.slice(0, input.limit).map(edgeFromRow), hasMore: rows.length > input.limit };
}
```

Extract a private `factSource(node, assertion)` helper and make existing `getFact` use it so detail and batch reads cannot diverge.

- [ ] **Step 6: Replace the in-memory full-edge walk with an asynchronous frontier walk**

In `traceArchitecturePath`, include normalized filters in the fingerprint and call `walkFrontier`:

```ts
const filters = normalizedFilters(input);
const queryFingerprint = contentDigest({
  startAssertionId: input.startAssertionId,
  direction: input.direction ?? "both",
  relationTypes: filters.relationTypes,
  layers: filters.layers,
  budget
});

const result = await walkFrontier(repository, scope, manifest, {
  frontier: state?.frontier ?? [input.startAssertionId],
  visitedIds: state?.visitedIds ?? [],
  direction: input.direction ?? "both",
  relationTypes: filters.relationTypes,
  layers: filters.layers,
  budget
});
```

Implement the bounded walk as an async function. It must query each depth frontier once, batch-load candidate nodes, retain the focus, and filter expansion targets by layer:

```ts
async function walkFrontier(repository: ThreeAQueryRepository, scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: FrontierWalkInput) {
  const visited = new Set(input.visitedIds);
  let frontier = [...new Set(input.frontier)].sort();
  const acceptedNodes = new Map<string, KnowledgeProjectionNode>();
  const acceptedEdges = new Map<string, KnowledgeProjectionEdge>();
  const reasons = new Set<ThreeAPartialReason>();
  const started = Date.now();
  const seedFacts = await repository.getFactsByIds(scope, manifest, frontier);
  seedFacts.forEach((fact) => acceptedNodes.set(fact.node.assertionId, fact.node));

  for (let depth = 0; frontier.length && depth < input.budget.maxDepth; depth += 1) {
    if (Date.now() - started > input.budget.timeoutMs) { reasons.add("TIMEOUT"); break; }
    const remainingEdges = input.budget.maxEdges - acceptedEdges.size;
    if (remainingEdges <= 0) { reasons.add("MAX_EDGES"); break; }
    const page = await repository.listAdjacentEdges(scope, manifest, { frontierAssertionIds: frontier, direction: input.direction, ...(input.relationTypes.length ? { relationTypes: input.relationTypes } : {}), limit: remainingEdges });
    if (page.hasMore) reasons.add("MAX_EDGES");
    const candidateIds = [...new Set(page.edges.flatMap((edge) => [edge.sourceAssertionId, edge.targetAssertionId]))];
    const facts = await repository.getFactsByIds(scope, manifest, candidateIds);
    const factById = new Map(facts.map((fact) => [fact.node.assertionId, fact]));
    const next = new Set<string>();

    for (const edge of page.edges) {
      const source = factById.get(edge.sourceAssertionId)?.node;
      const target = factById.get(edge.targetAssertionId)?.node;
      if (!source || !target) continue;
      const nextId = frontier.includes(edge.sourceAssertionId) ? edge.targetAssertionId : edge.sourceAssertionId;
      const nextNode = nextId === source.assertionId ? source : target;
      if (input.layers.length && !input.layers.includes(nextNode.layer)) continue;
      acceptedNodes.set(source.assertionId, source);
      acceptedNodes.set(target.assertionId, target);
      acceptedEdges.set(edge.relationshipIdentity, edge);
      if (!visited.has(nextId)) next.add(nextId);
      if (acceptedNodes.size >= input.budget.maxNodes) { reasons.add("MAX_NODES"); break; }
    }

    frontier.forEach((id) => visited.add(id));
    frontier = [...next].sort();
    if (reasons.has("MAX_NODES") || reasons.has("MAX_EDGES")) break;
  }

  if (frontier.length) reasons.add("MAX_DEPTH");
  return { nodes: [...acceptedNodes.values()], edges: [...acceptedEdges.values()], visitedIds: [...visited].sort(), frontier, reasons: [...reasons] };
}
```

Build the service envelope directly from `result.nodes`, `result.edges`, and bounded `result.paths`; remove the old post-walk `Promise.all(repository.getFact(...))` node reconstruction. The seed batch guarantees that a no-edge trace still returns the focused node.

- [ ] **Step 7: Add Prisma query-shape tests**

Create `packages/knowledge-query/src/prisma-repository.test.ts` with a mocked Prisma client and assert exact Scope, generation, frontier, relation filter, order, and `limit + 1`:

```ts
it("queries only exact-Scope downstream adjacency", async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const repository = new PrismaThreeAQueryRepository({ knowledgeProjectionEdge: { findMany } } as never);
  await repository.listAdjacentEdges(scope, manifest, { frontierAssertionIds: ["sys-1"], direction: "downstream", relationTypes: ["DEPENDS_ON"], limit: 25 });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { ...scope, generationId: manifest.generationId, sourceAssertionId: { in: ["sys-1"] }, relationCode: { in: ["DEPENDS_ON"] } },
    take: 26
  }));
});
```

- [ ] **Step 8: Run focused query tests and typecheck**

Run:

```powershell
pnpm --filter @specforge/knowledge-query test
pnpm --filter @specforge/knowledge-query typecheck
```

Expected: all Knowledge Query tests pass and TypeScript exits 0. Confirm the trace test explicitly reports that `listEdges` was not called.

- [ ] **Step 9: Commit the bounded query increment**

```powershell
git add packages/knowledge-query/src/types.ts packages/knowledge-query/src/service.ts packages/knowledge-query/src/prisma-repository.ts packages/knowledge-query/src/service.test.ts packages/knowledge-query/src/prisma-repository.test.ts
git commit -m "feat: bound 3a adjacency traversal"
```

### Task 2: Active-View Server Loader

**Files:**
- Create: `apps/web/lib/3a/workspace-loader.ts`
- Create: `apps/web/lib/3a/workspace-loader.test.ts`
- Modify: `apps/web/app/architecture/3a/page.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`

**Interfaces:**
- Consumes: `ThreeAProjectionQueryService`, resolved exact-Scope principal, `ThreeAUrlState`.
- Produces: `loadThreeAWorkspaceData` and a `ThreeAWorkspaceData` shape with optional initial catalog, graph, Alignment, or Drift data, never eager combinations.

- [ ] **Step 1: Write failing loader tests for tab and mode isolation**

Create `workspace-loader.test.ts`:

```ts
it("loads three 20-node layer pages for lane mode and nothing else", async () => {
  const result = await loadThreeAWorkspaceData(service, request, state({ tab: "architecture", mode: "lanes" }));
  expect(service.searchArchitectureFacts).toHaveBeenCalledTimes(3);
  expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "BIZ", limit: 20 }));
  expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "SYS", limit: 20 }));
  expect(service.searchArchitectureFacts).toHaveBeenCalledWith(expect.objectContaining({ layer: "TECH", limit: 20 }));
  expect(service.traceArchitecturePath).not.toHaveBeenCalled();
  expect(service.getArchitectureAlignment).not.toHaveBeenCalled();
  expect(service.comparePublishedBaselines).not.toHaveBeenCalled();
  expect(result.initialCatalog).toBeDefined();
});

it("loads no architecture facts for graph mode without focus", async () => {
  await loadThreeAWorkspaceData(service, request, state({ tab: "architecture", mode: "graph", focus: undefined }));
  expect(service.searchArchitectureFacts).not.toHaveBeenCalled();
  expect(service.traceArchitecturePath).not.toHaveBeenCalled();
});

it("loads one bounded trace and detail for graph mode with focus", async () => {
  await loadThreeAWorkspaceData(service, request, state({ tab: "architecture", mode: "graph", focus: "biz-1" }));
  expect(service.getArchitectureFactDetail).toHaveBeenCalledWith(expect.objectContaining({ assertionId: "biz-1" }));
  expect(service.traceArchitecturePath).toHaveBeenCalledWith(expect.objectContaining({ startAssertionId: "biz-1", budget: expect.objectContaining({ maxDepth: 1, maxNodes: 100, maxEdges: 200 }) }));
  expect(service.getArchitectureAlignment).not.toHaveBeenCalled();
  expect(service.comparePublishedBaselines).not.toHaveBeenCalled();
});
```

Add separate tests proving Alignment calls only `getArchitectureAlignment` and Drift calls only the comparison path.

- [ ] **Step 2: Run the loader test and verify it fails**

Run:

```powershell
pnpm exec vitest run apps/web/lib/3a/workspace-loader.test.ts
```

Expected: FAIL because `loadThreeAWorkspaceData` does not exist.

- [ ] **Step 3: Define the initial page DTOs**

In `workspace-loader.ts`, define:

```ts
export type LayerPages = Record<ArchitectureLayer, SearchArchitectureFactsResult>;

export interface InitialGraphPage {
  focusId: string;
  detail: ArchitectureFactDetail;
  trace: TraceArchitecturePathResult;
}

export interface ThreeAWorkspaceData {
  state: ThreeAUrlState;
  baselines: BaselineOption[];
  manifests: ManifestOption[];
  initialCatalog?: LayerPages;
  initialGraph?: InitialGraphPage;
  alignmentEdges?: KnowledgeProjectionEdge[];
  drift?: PublishedBaselineDrift;
  errorCode?: string;
}
```

- [ ] **Step 4: Implement active-view-only loading**

Implement the dispatch after Baseline and Manifest resolution:

```ts
if (state.tab === "alignment") {
  const alignment = await service.getArchitectureAlignment(queryIdentity);
  return { ...base, alignmentEdges: alignment.edges };
}

if (state.tab === "drift") {
  return { ...base, drift: await loadPublishedDrift(service, request, selectedBaseline, baselines, selectedManifest.id) };
}

if (state.mode === "graph") {
  if (!state.focus) return base;
  const [detail, trace] = await Promise.all([
    service.getArchitectureFactDetail({ ...queryIdentity, assertionId: state.focus }),
    service.traceArchitecturePath({ ...queryIdentity, startAssertionId: state.focus, direction: state.direction, budget: { maxDepth: 1, maxNodes: 100, maxEdges: 200, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 } })
  ]);
  return { ...base, initialGraph: { focusId: state.focus, detail, trace } };
}

const [BIZ, SYS, TECH] = await Promise.all((["BIZ", "SYS", "TECH"] as const).map((layer) =>
  service.searchArchitectureFacts({ ...queryIdentity, layer, limit: 20 })
));
return { ...base, initialCatalog: { BIZ, SYS, TECH } };
```

Treat `mode=list` as catalog loading so legacy URLs receive the same bounded pages.

- [ ] **Step 5: Make the page a thin resolver**

Replace the eager search/trace/alignment/drift block in `page.tsx` with:

```ts
const data = await loadThreeAWorkspaceData(service, request, state);
return <ThreeAFrame><ThreeAWorkspace data={data} /></ThreeAFrame>;
```

Keep Scope and principal resolution before the loader. Keep `safeErrorCode` at the server boundary.

- [ ] **Step 6: Run loader tests and Web typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/lib/3a/workspace-loader.test.ts
pnpm --filter @specforge/web typecheck
```

Expected: loader tests pass, TypeScript exits 0, and no code path contains `limit: 200` under `apps/web/app/architecture/3a`.

- [ ] **Step 7: Commit the active-view loader**

```powershell
git add apps/web/lib/3a/workspace-loader.ts apps/web/lib/3a/workspace-loader.test.ts apps/web/app/architecture/3a/page.tsx apps/web/components/three-a/three-a-workspace.tsx
git commit -m "refactor: isolate 3a view queries"
```

### Task 3: Exact-Scope Browser Query Boundary

**Files:**
- Create: `apps/web/lib/3a/query-protocol.ts`
- Create: `apps/web/lib/3a/query-handler.ts`
- Create: `apps/web/lib/3a/query-handler.test.ts`
- Create: `apps/web/lib/3a/query-client.ts`
- Create: `apps/web/app/api/architecture/3a/query/route.ts`

**Interfaces:**
- Consumes: exact-Scope principal resolver and `ThreeAProjectionQueryService`.
- Produces: one authenticated POST endpoint and typed abortable client for `search`, `trace`, and `detail` reads.

- [ ] **Step 1: Write failing protocol and handler tests**

Create tests covering valid search, valid trace filters, malformed input, and denied sibling Scope:

```ts
it("denies an unknown or unauthorized Scope before service dispatch", async () => {
  const response = await handleThreeAQuery(request({ operation: "search", scope: "com.huawei.celon.policyhub", baselineId: "b1", projectionManifestId: "p1", layer: "BIZ", limit: 20 }), dependencies);
  expect(response.status).toBe(403);
  expect(service.searchArchitectureFacts).not.toHaveBeenCalled();
});

it("passes normalized trace filters through the authorized service", async () => {
  const response = await handleThreeAQuery(request({ operation: "trace", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1", startAssertionId: "sys-1", direction: "upstream", relationTypes: ["CALLS", "CALLS"], layers: ["BIZ", "SYS"] }), dependencies);
  expect(response.status).toBe(200);
  expect(service.traceArchitecturePath).toHaveBeenCalledWith(expect.objectContaining({ relationTypes: ["CALLS"], layers: ["BIZ", "SYS"] }));
});
```

- [ ] **Step 2: Run the handler test and verify it fails**

Run:

```powershell
pnpm exec vitest run apps/web/lib/3a/query-handler.test.ts
```

Expected: FAIL because the protocol and handler modules do not exist.

- [ ] **Step 3: Define a discriminated request union**

In `query-protocol.ts`:

```ts
const identity = {
  scope: z.string().min(1).max(256),
  baselineId: z.string().min(1).max(256),
  projectionManifestId: z.string().min(1).max(256)
};

export const threeAWebQuerySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("search"), ...identity, layer: z.enum(["BIZ", "SYS", "TECH"]), query: z.string().max(256).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("trace"), ...identity, startAssertionId: z.string().min(1).max(256), direction: z.enum(["upstream", "downstream", "both"]), relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]), layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]), continuation: z.string().max(4096).optional() }),
  z.object({ operation: z.literal("detail"), ...identity, assertionId: z.string().min(1).max(256) })
]);

export type ThreeAWebQuery = z.infer<typeof threeAWebQuerySchema>;
```

- [ ] **Step 4: Implement the injected handler and safe errors**

The handler must resolve `scopeById`, require an application-service scope, call `resolveThreeARequest`, then dispatch. Normalize arrays with sorted uniqueness before calling the service. Map errors to safe status/code pairs:

```ts
const statusByCode: Record<string, number> = {
  SCOPE_ACCESS_DENIED: 403,
  ARCHITECTURE_FACT_NOT_FOUND: 404,
  FOCUS_NOT_IN_BASELINE: 404,
  CURSOR_INVALID: 409,
  QUERY_FILTER_INVALID: 400
};

export async function handleThreeAQuery(request: Request, dependencies: ThreeAQueryHandlerDependencies): Promise<Response> {
  try {
    const parsed = threeAWebQuerySchema.parse(await request.json());
    const catalogScope = scopeById(parsed.scope);
    if (!catalogScope || catalogScope.level !== "applicationService") return jsonError("SCOPE_ACCESS_DENIED", 403);
    const architectureScope = { applicationServiceId: catalogScope.id, scopePath: catalogScope.scopePath };
    const resolved = await dependencies.resolveRequest(request, architectureScope);
    const service = dependencies.createService();
    const identity = { ...resolved, baselineId: parsed.baselineId, projectionManifestId: parsed.projectionManifestId };
    if (parsed.operation === "search") return Response.json(await service.searchArchitectureFacts({ ...identity, layer: parsed.layer, query: parsed.query, limit: parsed.limit, cursor: parsed.cursor }));
    if (parsed.operation === "detail") return Response.json(await service.getArchitectureFactDetail({ ...identity, assertionId: parsed.assertionId }));
    return Response.json(await service.traceArchitecturePath({ ...identity, startAssertionId: parsed.startAssertionId, direction: parsed.direction, relationTypes: unique(parsed.relationTypes), layers: unique(parsed.layers), continuation: parsed.continuation, budget: { maxDepth: 1, maxNodes: 100, maxEdges: 200, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 } }));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("INVALID_REQUEST", 400);
    const code = safeThreeAErrorCode(error);
    return jsonError(code, statusByCode[code] ?? 503);
  }
}
```

Never serialize an exception message, stack, raw authorization header, database URL, or cursor signing key.

- [ ] **Step 5: Add the thin route and abortable client**

`route.ts` calls `handleThreeAQuery` with production dependencies. `query-client.ts` exposes:

```ts
export async function runThreeAWebQuery<T>(input: ThreeAWebQuery, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/architecture/3a/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
  const payload = await response.json() as T | { code: string };
  if (!response.ok) throw new ThreeAClientError((payload as { code?: string }).code ?? "UNAVAILABLE", response.status);
  return payload as T;
}
```

- [ ] **Step 6: Run handler tests and Web typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/lib/3a/query-handler.test.ts
pnpm --filter @specforge/web typecheck
```

Expected: all handler tests pass, TypeScript exits 0, and denied Scope tests make zero service calls.

- [ ] **Step 7: Commit the Web query boundary**

```powershell
git add apps/web/lib/3a/query-protocol.ts apps/web/lib/3a/query-handler.ts apps/web/lib/3a/query-handler.test.ts apps/web/lib/3a/query-client.ts apps/web/app/api/architecture/3a/query/route.ts
git commit -m "feat: add scoped 3a web queries"
```

### Task 4: Graph-Compatible Navigation And Copy

**Files:**
- Modify: `apps/web/lib/3a/url-state.ts`
- Modify: `apps/web/lib/3a/url-state.test.ts`
- Modify: `apps/web/components/three-a/baseline-toolbar.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/components/three-a/three-a-workspace.test.tsx`

**Interfaces:**
- Consumes: existing URL state and localization provider.
- Produces: `mode: "lanes" | "graph" | "list"`, focus-preserving links, and complete bilingual interaction copy.

- [ ] **Step 1: Write failing URL and toolbar tests**

Add:

```ts
it("accepts graph mode and preserves focus during serialization", () => {
  const parsed = parseThreeAUrlState(new URLSearchParams("scope=com.huawei.celon.desiner&mode=graph&focus=sys-1&direction=downstream"));
  expect(parsed.mode).toBe("graph");
  expect(serializeThreeAUrlState(parsed)).toContain("focus=sys-1");
});

it("continues to accept the legacy list mode", () => {
  expect(parseThreeAUrlState(new URLSearchParams("mode=list")).mode).toBe("list");
});
```

Add a static toolbar assertion that both `threeA.lanes` and `threeA.graph` links retain `focus=sys-1`.

- [ ] **Step 2: Run the URL and workspace tests and verify failure**

Run:

```powershell
pnpm exec vitest run apps/web/lib/3a/url-state.test.ts apps/web/components/three-a/three-a-workspace.test.tsx
```

Expected: FAIL because graph mode and graph copy are absent.

- [ ] **Step 3: Extend URL state additively**

Change the mode contract and parser enum:

```ts
export interface ThreeAUrlState {
  scope: string;
  baseline?: string;
  projection?: string;
  focus?: string;
  tab: "architecture" | "alignment" | "drift";
  mode: "lanes" | "graph" | "list";
  direction: "upstream" | "downstream" | "both";
}
```

Use `serializeThreeAUrlState` from all toolbar link builders so no component reconstructs a partial parameter list.

- [ ] **Step 4: Make Lanes and Graph the primary segmented modes**

In `baseline-toolbar.tsx`, render Lanes and Graph in the segmented control and keep List as a secondary compact link with a list icon and tooltip. Every mode link uses:

```ts
function modeHref(mode: ThreeAUrlState["mode"]): string {
  return `/architecture/3a?${serializeThreeAUrlState({ ...state, mode })}`;
}
```

Baseline or Projection changes must still clear `focus`; mode and direction changes preserve it.

- [ ] **Step 5: Add complete bilingual copy**

Add matching keys in both locale blocks, including:

```ts
"threeA.graph": "关系图谱",
"threeA.loadMore": "加载更多",
"threeA.loadedCount": "已加载 {count} 条",
"threeA.moreAvailable": "还有更多",
"threeA.selectGraphFocus": "搜索并选择一个架构事实以开始关系探索",
"threeA.expandUpstream": "展开上游",
"threeA.expandDownstream": "展开下游",
"threeA.continueExpansion": "继续展开",
"threeA.fitGraph": "适配图谱",
"threeA.resetGraph": "重置图谱",
"threeA.partialResult": "结果受查询预算限制，可继续展开。",
"threeA.relationshipDetail": "关系详情"
```

The English block contains the exact semantic equivalents. Use interpolation through the existing localization helper or render the numeric count separately if `T` does not support variables.

- [ ] **Step 6: Run tests and localization parity check**

Run:

```powershell
pnpm exec vitest run apps/web/lib/3a/url-state.test.ts apps/web/components/three-a/three-a-workspace.test.tsx apps/web/lib/__tests__/locale.test.ts
pnpm --filter @specforge/web typecheck
```

Expected: all tests pass and English/Chinese key sets remain equal.

- [ ] **Step 7: Commit navigation and copy**

```powershell
git add apps/web/lib/3a/url-state.ts apps/web/lib/3a/url-state.test.ts apps/web/components/three-a/baseline-toolbar.tsx apps/web/lib/i18n.ts apps/web/components/three-a/three-a-workspace.test.tsx
git commit -m "feat: add 3a graph navigation"
```

### Task 5: Independent Fixed-Height Lane Catalog

**Files:**
- Create: `apps/web/components/three-a/architecture-node-card.tsx`
- Create: `apps/web/components/three-a/catalog-state.ts`
- Create: `apps/web/components/three-a/catalog-state.test.ts`
- Create: `apps/web/components/three-a/architecture-lane.tsx`
- Create: `apps/web/components/three-a/architecture-catalog.tsx`
- Delete: `apps/web/components/three-a/architecture-lanes.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.test.tsx`

**Interfaces:**
- Consumes: initial `LayerPages`, `runThreeAWebQuery`, exact query identity, and focus callback.
- Produces: independent `CatalogState`, one bounded scroll container per layer, debounced server search, explicit page append, and one-layer mobile mode.

- [ ] **Step 1: Write failing reducer tests**

Create `catalog-state.test.ts`:

```ts
it("appends only the requested layer page", () => {
  const before = initialCatalogState(initialPages);
  const after = catalogReducer(before, { type: "pageLoaded", layer: "TECH", requestKey: before.layers.TECH.requestKey, page: page([tech2], "next-tech") });
  expect(after.layers.BIZ.nodes).toEqual(before.layers.BIZ.nodes);
  expect(after.layers.SYS.nodes).toEqual(before.layers.SYS.nodes);
  expect(after.layers.TECH.nodes.map((item) => item.assertionId)).toEqual(["tech-1", "tech-2"]);
  expect(after.layers.TECH.nextCursor).toBe("next-tech");
});

it("ignores a stale search response", () => {
  const searching = catalogReducer(initialCatalogState(initialPages), { type: "queryChanged", query: "orders", requestKey: "scope:b1:p1:orders" });
  const after = catalogReducer(searching, { type: "pageLoaded", layer: "BIZ", requestKey: "scope:b1:p1:old", page: page([biz1]) });
  expect(after.layers.BIZ.nodes).toEqual([]);
});

it("resets all layers when Scope Baseline or Projection identity changes", () => {
  const after = catalogReducer(initialCatalogState(initialPages), { type: "identityChanged", identity: nextIdentity, requestKey: key(nextIdentity, "") });
  expect(after.query).toBe("");
  expect(after.layers.BIZ.nodes).toEqual([]);
  expect(after.layers.SYS.nodes).toEqual([]);
  expect(after.layers.TECH.nodes).toEqual([]);
});
```

- [ ] **Step 2: Run reducer tests and verify failure**

Run:

```powershell
pnpm exec vitest run apps/web/components/three-a/catalog-state.test.ts
```

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Implement normalized independent layer state**

Use these state contracts:

```ts
export interface CatalogLayerState {
  nodes: KnowledgeProjectionNode[];
  nextCursor?: string;
  loading: boolean;
  errorCode?: string;
  requestKey: string;
}

export interface CatalogState {
  identity: ThreeAQueryIdentity;
  query: string;
  activeMobileLayer: ArchitectureLayer;
  layers: Record<ArchitectureLayer, CatalogLayerState>;
}
```

Deduplicate appended nodes by `assertionId`, preserve server ordering, and ignore any page whose request key differs from the current layer key.

- [ ] **Step 4: Extract the shared stable node card**

Move `NodeCard` to `architecture-node-card.tsx`. Give the button a stable minimum height, two-line title clamp, `aria-pressed` focus state, and localized type fallback. Keep `data-testid="three-a-node-${assertionId}"` for compatibility.

- [ ] **Step 5: Build one independently scrollable lane**

`ArchitectureLane` receives one `CatalogLayerState` and renders:

```tsx
<section className={`flex min-h-0 flex-col rounded-lg border ${tone}`} aria-labelledby={`lane-${layer}`}>
  <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-inherit px-3 py-3">
    <h2 id={`lane-${layer}`} className="flex items-center gap-2 text-sm font-bold"><Icon size={16} />{title}</h2>
    <span className="text-xs text-muted">{state.nodes.length}{state.nextCursor ? "+" : ""}</span>
  </header>
  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" data-testid={`three-a-lane-scroll-${layer}`}>
    <div className="grid gap-2">{cards}</div>
    {state.nextCursor ? <button type="button" onClick={onLoadMore} disabled={state.loading}>{loadMoreLabel}</button> : null}
  </div>
</section>
```

Lane errors render retry inside the same section. They must not replace sibling lanes.

- [ ] **Step 6: Build the catalog orchestrator**

`ArchitectureCatalog` uses `useReducer`, one `AbortController` per layer, and a 300ms debounced query effect. First pages come from SSR. Search resets all cursors and calls three `search` operations concurrently. `Load more` calls only one layer with its cursor.

Desktop container:

```tsx
<div className="grid h-[clamp(32rem,calc(100dvh-16rem),48rem)] min-h-0 gap-4 lg:grid-cols-3" data-testid="architecture-catalog">
  {layers.map(renderLane)}
</div>
```

Below `lg`, render a BIZ/SYS/TECH segmented control and only the active lane. Do not render three stacked mobile lanes.

- [ ] **Step 7: Add markup tests for stable layout and legacy list fallback**

Extend `three-a-workspace.test.tsx`:

```ts
it("renders bounded independent lanes instead of one page-height grid", () => {
  const markup = renderToStaticMarkup(<ThreeAWorkspace data={laneData} />);
  expect(markup).toContain("architecture-catalog");
  expect(markup).toContain("three-a-lane-scroll-BIZ");
  expect(markup).toContain("three-a-lane-scroll-SYS");
  expect(markup).toContain("three-a-lane-scroll-TECH");
  expect(markup).not.toContain("min-h-64");
});
```

List mode renders the same bounded initial pages grouped by layer and does not request an unbounded catalog.

- [ ] **Step 8: Run catalog tests and Web typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/components/three-a/catalog-state.test.ts apps/web/components/three-a/three-a-workspace.test.tsx
pnpm --filter @specforge/web typecheck
```

Expected: all tests pass. Static markup contains one scroll region per desktop layer and one mobile layer selector.

- [ ] **Step 9: Commit the Lane Catalog**

```powershell
git add apps/web/components/three-a/architecture-node-card.tsx apps/web/components/three-a/catalog-state.ts apps/web/components/three-a/catalog-state.test.ts apps/web/components/three-a/architecture-lane.tsx apps/web/components/three-a/architecture-catalog.tsx apps/web/components/three-a/architecture-lanes.tsx apps/web/components/three-a/three-a-workspace.tsx apps/web/components/three-a/three-a-workspace.test.tsx
git commit -m "feat: paginate 3a architecture lanes"
```

### Task 6: Deterministic Graph State And Layout

**Files:**
- Create: `apps/web/components/three-a/architecture-graph-state.ts`
- Create: `apps/web/components/three-a/architecture-graph-state.test.ts`
- Create: `apps/web/components/three-a/architecture-graph-layout.ts`
- Create: `apps/web/components/three-a/architecture-graph-layout.test.ts`

**Interfaces:**
- Consumes: bounded `KnowledgeProjectionNode[]`, `KnowledgeProjectionEdge[]`, focus, selected node, direction, filters, and continuation.
- Produces: deterministic merged graph state and renderer-neutral positioned graph nodes and edges.

- [ ] **Step 1: Write failing graph merge tests**

```ts
it("merges expansion pages by stable identity without losing the root focus", () => {
  const first = graphStateFromInitial("sys-1", trace([sys1, tech1], [depends], "continue-1"));
  const next = mergeGraphExpansion(first, expansionKey("tech-1", "downstream", filters), trace([tech1, tech2], [calls], undefined));
  expect([...next.nodesById.keys()].sort()).toEqual(["sys-1", "tech-1", "tech-2"]);
  expect([...next.edgesById.keys()].sort()).toEqual([calls.relationshipIdentity, depends.relationshipIdentity].sort());
  expect(next.rootFocusId).toBe("sys-1");
});

it("stores continuations per selected node direction and filter key", () => {
  const firstKey = expansionKey("sys-1", "upstream", { relationTypes: ["REALIZED_BY"], layers: ["BIZ", "SYS"] });
  const secondKey = expansionKey("sys-1", "downstream", { relationTypes: ["DEPENDS_ON"], layers: ["SYS", "TECH"] });
  expect(firstKey).not.toBe(secondKey);
});
```

- [ ] **Step 2: Write failing deterministic layout tests**

```ts
it("places upstream left focus center downstream right and layers in stable bands", () => {
  const layout = layoutArchitectureGraph({ focusId: "sys-1", nodes: [biz1, sys1, tech1], edges: [realizedBy, dependsOn] });
  const byId = new Map(layout.nodes.map((item) => [item.id, item.position]));
  expect(byId.get("biz-1")!.x).toBeLessThan(byId.get("sys-1")!.x);
  expect(byId.get("tech-1")!.x).toBeGreaterThan(byId.get("sys-1")!.x);
  expect(byId.get("biz-1")!.y).toBeLessThan(byId.get("sys-1")!.y);
  expect(byId.get("sys-1")!.y).toBeLessThan(byId.get("tech-1")!.y);
  expect(layoutArchitectureGraph({ focusId: "sys-1", nodes: [tech1, biz1, sys1], edges: [dependsOn, realizedBy] })).toEqual(layout);
});
```

- [ ] **Step 3: Run graph model tests and verify failure**

Run:

```powershell
pnpm exec vitest run apps/web/components/three-a/architecture-graph-state.test.ts apps/web/components/three-a/architecture-graph-layout.test.ts
```

Expected: FAIL because state and layout modules do not exist.

- [ ] **Step 4: Implement bounded normalized graph state**

Use maps internally and serialized arrays at render boundaries:

```ts
export interface ArchitectureGraphState {
  rootFocusId: string;
  selectedId: string;
  nodesById: Map<string, KnowledgeProjectionNode>;
  edgesById: Map<string, KnowledgeProjectionEdge>;
  continuations: Map<string, string>;
  partialReasons: ThreeAPartialReason[];
  loadingKey?: string;
  errorCode?: string;
}

export function expansionKey(assertionId: string, direction: TraceDirection, filters: GraphFilters): string {
  return JSON.stringify([assertionId, direction, [...filters.relationTypes].sort(), [...filters.layers].sort()]);
}
```

`mergeGraphExpansion` deduplicates by assertion and relationship identity, updates only the matching continuation, preserves root focus, and caps client retention at 500 nodes and 1,000 edges. When the cap would be exceeded, preserve the previous state and add `MAX_NODES` or `MAX_EDGES` partial reason.

- [ ] **Step 5: Implement deterministic direction-by-layer layout**

Compute shortest upstream and downstream distances from the root. Resolve a node reachable both ways by the smaller distance, using downstream on an equal-distance tie. Sort each `(direction, depth, layer)` bucket by `sortKey` then `assertionId`.

Use constants:

```ts
const FOCUS_X = 0;
const DEPTH_GAP_X = 320;
const LAYER_Y = { BIZ: 0, SYS: 240, TECH: 480 } as const;
const NODE_GAP_Y = 132;
```

Expose renderer-neutral output types so the pure layout test does not depend on React callbacks:

```ts
export interface PositionedArchitectureNode {
  id: string;
  fact: KnowledgeProjectionNode;
  role: "upstream" | "focus" | "downstream";
  depth: number;
  position: { x: number; y: number };
}

export interface PositionedArchitectureEdge {
  id: string;
  edge: KnowledgeProjectionEdge;
}
```

Position each bucket around its layer center:

```ts
const x = role === "focus" ? FOCUS_X : (role === "upstream" ? -1 : 1) * depth * DEPTH_GAP_X;
const y = LAYER_Y[node.layer] + (index - (bucket.length - 1) / 2) * NODE_GAP_Y;
```

Return `PositionedArchitectureNode[]` and `PositionedArchitectureEdge[]`. Task 7 maps them to React Flow nodes with `draggable: false`, deterministic edge IDs, and no default animation.

- [ ] **Step 6: Run model tests and typecheck**

Run:

```powershell
pnpm exec vitest run apps/web/components/three-a/architecture-graph-state.test.ts apps/web/components/three-a/architecture-graph-layout.test.ts
pnpm --filter @specforge/web typecheck
```

Expected: graph state and layout tests pass and repeated input permutations return identical output.

- [ ] **Step 7: Commit graph state and layout**

```powershell
git add apps/web/components/three-a/architecture-graph-state.ts apps/web/components/three-a/architecture-graph-state.test.ts apps/web/components/three-a/architecture-graph-layout.ts apps/web/components/three-a/architecture-graph-layout.test.ts
git commit -m "feat: add deterministic 3a graph model"
```

### Task 7: Relationship Graph Explorer

**Files:**
- Create: `apps/web/components/three-a/architecture-graph-node.tsx`
- Create: `apps/web/components/three-a/architecture-graph-canvas.tsx`
- Create: `apps/web/components/three-a/architecture-relationship-inspector.tsx`
- Create: `apps/web/components/three-a/architecture-graph-explorer.tsx`
- Modify: `apps/web/components/three-a/architecture-path-list.tsx`
- Modify: `apps/web/components/three-a/architecture-detail-drawer.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.test.tsx`

**Interfaces:**
- Consumes: initial graph page, graph state/layout modules, typed Web query client, and route identity.
- Produces: fixed-height graph canvas, filters, node/edge selection, bounded expansion, continuation, details, and accessible list fallback.

- [ ] **Step 1: Add failing graph workspace markup tests**

```ts
it("shows a focus prompt instead of choosing the first node", () => {
  const markup = renderToStaticMarkup(<ThreeAWorkspace data={graphDataWithoutFocus} />);
  expect(markup).toContain("threeA.selectGraphFocus");
  expect(markup).not.toContain("architecture-graph-canvas");
});

it("renders the bounded graph and list fallback for an explicit focus", () => {
  const markup = renderToStaticMarkup(<ThreeAWorkspace data={graphDataWithFocus} />);
  expect(markup).toContain("architecture-graph-canvas");
  expect(markup).toContain("threeA.expandUpstream");
  expect(markup).toContain("threeA.expandDownstream");
  expect(markup).toContain("architecture-paths-title");
});
```

- [ ] **Step 2: Run workspace tests and verify failure**

Run:

```powershell
pnpm exec vitest run apps/web/components/three-a/three-a-workspace.test.tsx
```

Expected: FAIL because graph components are absent.

- [ ] **Step 3: Implement the accessible custom graph node**

`ArchitectureGraphNode` uses `Handle` on left and right, a real focusable button, layer icon, two-line title, and non-color role text:

```tsx
export type ArchitectureGraphFlowNode = Node<{
  fact: KnowledgeProjectionNode;
  role: "upstream" | "focus" | "downstream";
  roleLabel: string;
  onSelect: () => void;
}, "architecture">;

export function ArchitectureGraphNode({ data, selected }: NodeProps<ArchitectureGraphFlowNode>) {
  return <div className={nodeClass(data.fact.layer, data.role, selected)}>
    <Handle type="target" position={Position.Left} className="opacity-60" />
    <button type="button" className="w-56 p-3 text-left" aria-pressed={selected} onClick={data.onSelect}>
      <span className="font-mono text-[11px] font-bold">{data.fact.layer} · {data.roleLabel}</span>
      <span className="mt-1 line-clamp-2 block min-h-10 text-sm font-semibold">{data.fact.semanticIdentity}</span>
      <span className="mt-2 block truncate text-[11px] text-muted">#{data.fact.assertionId.slice(0, 8)}</span>
    </button>
    <Handle type="source" position={Position.Right} className="opacity-60" />
  </div>;
}
```

- [ ] **Step 4: Implement the fixed-height React Flow canvas**

Render three non-interactive horizontal band labels behind React Flow. Use a stable canvas:

```tsx
<section className="relative h-[clamp(32rem,calc(100dvh-16rem),48rem)] min-h-0 overflow-hidden rounded-lg border border-border bg-white" data-testid="architecture-graph-canvas">
  <ArchitectureBands />
  <ReactFlow nodes={flow.nodes} edges={flow.edges} nodeTypes={nodeTypes} fitView nodesDraggable={false} minZoom={0.2} maxZoom={1.8} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}>
    <Controls showInteractive={false} />
    {flow.nodes.length > 30 ? <MiniMap pannable zoomable /> : null}
  </ReactFlow>
</section>
```

Use custom icon buttons with tooltips for fit and reset when React Flow's built-in control labels do not match bilingual copy.

- [ ] **Step 5: Implement graph filters and expansion**

`ArchitectureGraphExplorer` keeps root focus, selected node, layers, relation types, direction, and one abort controller per expansion key. `Expand upstream` and `Expand downstream` start a new trace from the selected node. `Continue` reuses the token stored under the matching expansion key.

```ts
async function expand(direction: TraceDirection, continueExisting: boolean) {
  const selectedId = state.selectedId;
  const key = expansionKey(selectedId, direction, filters);
  dispatch({ type: "loading", key });
  const trace = await runThreeAWebQuery<TraceArchitecturePathResult>({
    operation: "trace",
    scope: identity.scope,
    baselineId: identity.baselineId,
    projectionManifestId: identity.projectionManifestId,
    startAssertionId: selectedId,
    direction,
    relationTypes: filters.relationTypes,
    layers: filters.layers,
    ...(continueExisting && state.continuations.get(key) ? { continuation: state.continuations.get(key) } : {})
  }, controller.signal);
  dispatch({ type: "expanded", key, trace });
}
```

Changing layer, relation, or direction filters clears graph expansion state back to the initial focus page before issuing a new request.

- [ ] **Step 6: Implement node and relationship inspection**

Selecting a node sets `selectedId`, highlights its incident edges, and opens `ArchitectureDetailDrawer`. Selecting an edge opens `ArchitectureRelationshipInspector` with source, relation code, target, direction, confidence, relationship version, and Evidence reference when present. Close buttons restore focus to the invoking node or edge control.

- [ ] **Step 7: Keep the graph list fallback equivalent**

Update `ArchitecturePathList` to consume the currently loaded graph edges and node selection callback. Add a visible `List` command in Graph that reveals or focuses the fallback below the canvas. It must contain every currently rendered edge and remain keyboard navigable.

- [ ] **Step 8: Add bounded motion with reduced-motion fallback**

Use CSS transitions no longer than 180ms for newly merged nodes and edge opacity. Add or reuse a global reduced-motion rule:

```css
@media (prefers-reduced-motion: reduce) {
  [data-testid="architecture-graph-canvas"] * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Do not continuously animate edges. Use one finite focus pulse only when motion is allowed.

- [ ] **Step 9: Run graph and workspace tests**

Run:

```powershell
pnpm exec vitest run apps/web/components/three-a/architecture-graph-state.test.ts apps/web/components/three-a/architecture-graph-layout.test.ts apps/web/components/three-a/three-a-workspace.test.tsx
pnpm --filter @specforge/web typecheck
```

Expected: all tests pass, TypeScript exits 0, Graph without focus makes no implicit selection, and Graph with focus renders canvas plus list fallback.

- [ ] **Step 10: Commit the graph explorer**

```powershell
git add apps/web/components/three-a/architecture-graph-node.tsx apps/web/components/three-a/architecture-graph-canvas.tsx apps/web/components/three-a/architecture-relationship-inspector.tsx apps/web/components/three-a/architecture-graph-explorer.tsx apps/web/components/three-a/architecture-path-list.tsx apps/web/components/three-a/architecture-detail-drawer.tsx apps/web/components/three-a/three-a-workspace.tsx apps/web/components/three-a/three-a-workspace.test.tsx apps/web/app/globals.css
git commit -m "feat: add 3a relationship explorer"
```

### Task 8: Responsive, Accessibility, Performance, And Governance Acceptance

**Files:**
- Modify: `apps/web/app/architecture/3a/loading.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/components/three-a/three-a-workspace.test.tsx`
- Modify: `docs/adr/0023-scalable-3a-exploration.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `scripts/design-fact-manifest.test.ts`

**Interfaces:**
- Consumes: completed query, catalog, and graph increments plus the implementation Design Change Session.
- Produces: verified desktop/mobile UX, Scope isolation evidence, implemented Proposal/ADR/Context Pack state, MCP read-back, and a closed `CONVERGED` session.

- [ ] **Step 1: Update stable loading and error presentation**

Make `loading.tsx` use the same bounded height as the catalog and render three desktop skeleton lanes plus one mobile skeleton lane. Ensure lane retry, graph retry, cursor reset, partial result, focus missing, and safe unavailable states all use localized copy and do not leak raw errors.

- [ ] **Step 2: Add final source-level regression assertions**

Extend workspace and loader tests with:

```ts
it("does not regress to eager full-catalog or inactive-view loading", async () => {
  const page = await readFile("apps/web/app/architecture/3a/page.tsx", "utf8");
  expect(page).not.toContain("limit: 200");
  expect(page).not.toContain("const alignment = await service.getArchitectureAlignment");
  expect(page).not.toContain("const drift = await loadDrift");
});
```

The loader behavior tests remain the authoritative functional proof; this source assertion protects the original regression signature.

- [ ] **Step 3: Run focused and package verification once for the completed phase**

Run:

```powershell
pnpm --filter @specforge/knowledge-query test
pnpm exec vitest run apps/web/lib/3a apps/web/components/three-a
pnpm typecheck
pnpm build
git diff --check
```

Expected: all focused tests pass, all five package typechecks pass, production build generates `/architecture/3a`, and diff check exits 0. If the known Windows standalone symlink restriction recurs after successful compilation, rerun the established `SPECFORGE_NEXT_STANDALONE=0` build and record both results accurately.

- [ ] **Step 4: Start or reuse the Web service for browser acceptance**

Run:

```powershell
pnpm --filter @specforge/web dev -- --port 3000
```

Expected: `http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner` returns HTTP 200. Reuse an existing healthy port 3000 process instead of starting a duplicate.

- [ ] **Step 5: Verify desktop Lane Catalog behavior in the in-app browser**

At `1280x720`:

1. Open Lanes with the Designer Scope.
2. Record `document.documentElement.scrollHeight` and the catalog bounding height.
3. Confirm BIZ, SYS, and TECH each render at most 20 initial cards and have independent internal scroll containers.
4. Activate TECH `Load more`.
5. Confirm TECH node count increases while BIZ and SYS counts and scroll positions remain unchanged.
6. Confirm document scroll height and catalog bounding height do not increase by more than 2 CSS pixels.
7. Search a known term and confirm all lane cursors reset without stale cards returning.

Expected: page height remains stable, no full catalog is rendered, and each layer is independently usable.

- [ ] **Step 6: Verify desktop Relationship Graph behavior**

1. Switch to Graph without `focus` and confirm the selection prompt appears with no graph request.
2. Select a lane fact, switch to Graph, and confirm the same `focus` remains in the URL.
3. Confirm the canvas height stays within 32rem to 48rem, BIZ/SYS/TECH bands are visible, upstream is left, and downstream is right.
4. Expand upstream, downstream, and continuation; confirm new nodes merge without replacing the root focus.
5. Filter one relation type and one layer; confirm hidden nodes and edges leave the canvas and a changed filter does not reuse the old continuation.
6. Select a node and edge; confirm the detail and relationship inspectors open, close, and restore focus.
7. Confirm the list fallback contains the same loaded relationships.

Expected: graph requests remain bounded, typed, and progressively expandable.

- [ ] **Step 7: Verify mobile, keyboard, and reduced motion**

At `390x844`:

1. Confirm Lanes shows a BIZ/SYS/TECH segmented control and only one lane at a time.
2. Confirm Graph uses a stable canvas and collapsible filters without horizontal page overflow.
3. Tab through view controls, lane cards, load-more controls, graph controls, nodes, list fallback, and close buttons.
4. Emulate `prefers-reduced-motion: reduce` and confirm no continuous edge animation or focus pulse runs.
5. Confirm layer, direction, selection, loading, and impact remain understandable without color alone.

Expected: no overlap, clipped controls, inaccessible graph-only information, or incoherent focus movement.

- [ ] **Step 8: Verify exact-Scope isolation and query shape**

Open `?scope=com.huawei.celon.policyhub` with a principal lacking that grant. Expected: Scope access denied, zero Designer node labels, zero Designer counts, and no query endpoint payload containing Designer IDs.

Inspect browser network requests for the authorized Designer Scope. Expected: three initial search operations with layer and limit 20 in Lanes; no initial trace in Graph without focus; one bounded trace in Graph with focus; Alignment and Drift requests only after their tabs are selected.

- [ ] **Step 9: Update canonical design facts to implemented state**

In `baseline-manifest.json`:

- change `proposal-scalable-3a-exploration` from `approved` to `implemented`;
- update `api-specforge-3a-architecture-query` description and request schema with per-layer pagination, relation/layer filters, and bounded adjacency traversal;
- add exact focused test, build, desktop, mobile, reduced-motion, Scope-isolation, and query-shape evidence;
- keep PostgreSQL authority and deferred billion-scale certification explicit.

Update `scripts/design-fact-manifest.test.ts` to assert implemented status and the additive API fields. Update ADR-0023 in English and Chinese with the exact commands and results.

- [ ] **Step 10: Run design governance tests**

Run:

```powershell
pnpm exec vitest run scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts
git diff --check
```

Expected: manifest and synchronization tests pass, no unfinished markers exist, and diff check exits 0.

- [ ] **Step 11: Synchronize and read back the implemented design facts through MCP**

Run:

```powershell
$databaseLine = Get-Content .env -Encoding UTF8 | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
if ($databaseLine) { $env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length).Trim().Trim('"').Trim("'") }
$env:SPECFORGE_DESIGN_FACT_IDS='adr-3a-architecture-navigation-workspace,adr-scalable-3a-exploration'
node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\sync-design-facts.ts
node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\reconcile-design-facts.ts
```

Expected: both selected records return `complete`; read-back has empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.

- [ ] **Step 12: Close the implementation Design Change Session**

Resolve the newest open implementation receipt and close that exact session:

```powershell
$implementationReceipt = Get-ChildItem .specforge\design-context\design-change-session_*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$implementationSessionId = (Get-Content $implementationReceipt.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).receipt.sessionId
node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\design-context.ts close --session $implementationSessionId --status CONVERGED --evidence "knowledge-query-tests=PASS,web-3a-tests=PASS,typecheck=PASS,build=PASS,desktop-lanes=PASS,desktop-graph=PASS,mobile-a11y-motion=PASS,scope-isolation=PASS,mcp-readback=PASS"
```

Expected: exit 0 and the exact implementation session becomes `CONVERGED`. A failed verification must close as `BLOCKED` with a concrete reason and retry trigger instead.

- [ ] **Step 13: Commit the acceptance and governance closure**

```powershell
git add apps/web/app/architecture/3a/loading.tsx apps/web/lib/i18n.ts apps/web/components/three-a/three-a-workspace.test.tsx docs/adr/0023-scalable-3a-exploration.md docs/design-facts/baseline-manifest.json scripts/design-fact-manifest.test.ts
git commit -m "docs: close scalable 3a exploration"
```

Final repository status may still show the two unrelated `.superpowers/sdd` modifications; do not stage, revert, or rewrite them.
