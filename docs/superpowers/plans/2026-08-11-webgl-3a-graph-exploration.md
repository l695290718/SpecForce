# WebGL 3A Graph Exploration And Impact Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the bounded React Flow relationship preview with an exact-Scope Sigma.js/WebGL graph workspace that supports cluster overview, focused exploration, and explainable impact analysis without loading a complete application-service graph.

**Architecture:** Keep the existing PostgreSQL-first `ThreeAProjectionQueryService` and exact-Scope API boundary. Add versioned derived graph-analysis summaries and an `overview`/`impact` query contract, then render bounded DTOs in a client-owned Graphology graph through Sigma.js. React remains responsible for controls, inspectors, localization, and semantic list fallback; Graphology and WebGL are presentation/query consumers, never authored-data authorities.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Sigma.js, Graphology, `graphology-layout-forceatlas2`, Web Workers, existing `lucide-react`, in-app Browser acceptance.

## Global Constraints

- Owning Scope is exactly `com.huawei.celon.desiner` with path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored facts, relationship events, Baselines, and published Projection rows; graph analysis summaries and graph stores are derived projections.
- Every request, cursor, continuation, summary, node, edge, score, and cache entry is bound to subject, tenant, exact Scope, Baseline, Projection Manifest, operation, filters, policy version, and expiry.
- The browser must never fetch or retain a complete application-service graph.
- Initial Overview is capped at 250 summary nodes and 500 summary edges; one request is capped at 500 nodes, 1,000 edges, 100 paths, 3 seconds, and 1 MiB; one browser session retains at most 2,000 nodes and 5,000 edges.
- WebGL unavailable, WebGL context loss, Worker failure, partial data, and provider unavailability must preserve a semantic list and impact-summary fallback.
- English is canonical for human-facing design content and Chinese overlays are complete; Web UI remains read-only and all mutations remain MCP-only.
- Before implementation code changes, create a new exact-Scope `DesignChangeSession` through `prepare_design_change` or `pnpm design-context:preflight`; the current design session is for the written Spec and is not the implementation receipt.
- After focused verification, synchronize the implementation ADR/Proposal/Context Pack and close the same implementation session as `CONVERGED`; a blocked MCP write or failed verification blocks completion.
- Do not stage or modify the unrelated existing files `.superpowers/sdd/task-1-report.md` and `.superpowers/sdd/task-3-report.md`.

## Dependency And Parallelism

The backend contract and pure scoring work can begin after Task 1. The WebGL client store can run in parallel with Tasks 2 and 3 once the DTO types are stable. The renderer depends on the store and the query client. Final workspace integration depends on both backend and renderer. The sequence is:

`Task 1 -> {Task 2, Task 3, Task 4} -> {Task 5, Task 6} -> Task 7 -> Task 8`

### Task 1: Open The Implementation Session And Define Graph-Analysis DTOs

**Files:**
- Modify: `packages/knowledge-query/src/types.ts`
- Create: `packages/knowledge-query/src/graph-analysis.ts`
- Create: `packages/knowledge-query/src/graph-analysis.test.ts`
- Modify: `apps/web/lib/3a/query-protocol.ts`
- Modify: `apps/web/lib/3a/query-handler.ts`
- Test: `apps/web/lib/3a/query-handler.test.ts`
- Modify: `apps/web/lib/3a/query-client.ts`

**Interfaces:**
- Consumes: `ArchitectureScopeRef`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, `ThreeABudget`, `QueryResultEnvelope`, and the existing `search`/`trace`/`detail` union.
- Produces: `GraphSummaryNode`, `GraphSummaryEdge`, `OverviewArchitectureInput`, `OverviewArchitectureResult`, `ImpactArchitectureInput`, `ImpactArchitectureResult`, `ImpactScoreFactors`, `ArchitectureGraphQueryProvider`, and validated Web request discriminants.

- [x] **Step 1: Open the implementation preflight in the exact owning Scope**

Run:

```powershell
pnpm design-context:preflight -- --intent "Implement WebGL 3A graph exploration and explainable impact analysis" --affected "adr-webgl-3a-graph-exploration,proposal-webgl-3a-graph-exploration,ctx-webgl-3a-graph-exploration,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "approved-webgl-3a-spec,implementation-plan-review"
```

Expected: a new `DesignChangeSession` receipt for `com.huawei.celon.desiner` with a non-empty design-context digest. Record its session ID in the implementation notes and use the same ID in Task 8.

- [x] **Step 2: Add bounded summary and impact types before implementation**

Add these shapes to `packages/knowledge-query/src/types.ts`:

```ts
export type GraphSummaryKind = "cluster" | "fact";
export type ImpactBand = "DIRECT" | "LIKELY" | "EXTENDED" | "UNRESOLVED";

export interface GraphSummaryNode extends ArchitectureScopeRef {
  id: string;
  kind: GraphSummaryKind;
  label: string;
  layer?: ArchitectureLayer;
  clusterId?: string;
  memberCount: number;
  degree: number;
  criticality: number;
  positionSeed: { x: number; y: number };
  assertionId?: string;
}

export interface GraphSummaryEdge extends ArchitectureScopeRef {
  id: string;
  sourceId: string;
  targetId: string;
  relationCode: string;
  confidence: number;
  bridge: boolean;
}

export interface GraphAnalysisBudget {
  maxNodes: number;
  maxEdges: number;
  maxPaths: number;
  timeoutMs: number;
  maxPayloadBytes: number;
}

export interface OverviewArchitectureInput extends QueryPrincipalInput {
  baselineId: string;
  projectionManifestId: string;
  layers?: ArchitectureLayer[];
  assetTypes?: string[];
  relationTypes?: string[];
  continuation?: string;
  budget?: Partial<GraphAnalysisBudget>;
}

export interface OverviewArchitectureResult extends QueryResultEnvelope {
  nodes: GraphSummaryNode[];
  edges: GraphSummaryEdge[];
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export interface ImpactScoreFactors {
  relationWeight: number;
  confidence: number;
  criticalityWeight: number;
  depthDecay: number;
}

export interface ImpactArchitectureInput extends QueryPrincipalInput {
  baselineId: string;
  projectionManifestId: string;
  focusAssertionId: string;
  direction: TraceDirection;
  layers?: ArchitectureLayer[];
  relationTypes?: string[];
  policyVersion?: string;
  continuation?: string;
  budget?: Partial<GraphAnalysisBudget>;
}

export interface ImpactArchitectureItem extends KnowledgeProjectionNode {
  depth: number;
  band: ImpactBand;
  score: number;
  factors: ImpactScoreFactors;
}

export interface ImpactArchitectureResult extends QueryResultEnvelope {
  focusAssertionId: string;
  policyVersion: string;
  items: ImpactArchitectureItem[];
  paths: ArchitecturePath[];
  cutPointAssertionIds: string[];
  countsByBand: Record<ImpactBand, number>;
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}
```

- [x] **Step 3: Add the query union and safe API routing tests**

Extend `threeAWebQuerySchema` with `overview` and `impact` while retaining the existing discriminants. Normalize arrays in the handler and return `QUERY_BUDGET_INVALID` for budgets above the hard cap.

```ts
z.object({
  operation: z.literal("overview"),
  ...identity,
  layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]),
  assetTypes: z.array(z.string().min(1).max(64)).max(20).default([]),
  relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]),
  continuation: z.string().max(4096).optional()
}),
z.object({
  operation: z.literal("impact"),
  ...identity,
  focusAssertionId: z.string().min(1).max(256),
  direction: z.enum(["upstream", "downstream", "both"]),
  layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).max(3).default([]),
  relationTypes: z.array(z.string().min(1).max(64)).max(20).default([]),
  policyVersion: z.string().max(64).optional(),
  continuation: z.string().max(4096).optional()
})
```

Add tests that prove an unauthorised sibling Scope is denied before the service is constructed, request filters are sorted and deduplicated, and overview/impact requests pass only exact Scope identity and bounded budgets to the service.

- [x] **Step 4: Implement pure impact scoring and band classification**

Create `scoreImpact` and `classifyImpactBand` in `graph-analysis.ts`:

```ts
export function scoreImpact(input: {
  relationWeight: number;
  confidence: number;
  criticalityWeight: number;
  depth: number;
}): { score: number; factors: ImpactScoreFactors } {
  const depthDecay = Math.pow(0.72, Math.max(0, input.depth - 1));
  const score = Math.max(0, Math.min(100, input.relationWeight * input.confidence * input.criticalityWeight * depthDecay));
  return { score, factors: { ...input, depthDecay } };
}

export function classifyImpactBand(depth: number, score: number, partial: boolean): ImpactBand {
  if (partial && depth >= 3) return "UNRESOLVED";
  if (depth === 1) return "DIRECT";
  if (depth === 2 || score >= 60) return "LIKELY";
  return "EXTENDED";
}
```

Test depth decay, clamping, direct/likely/extended/unresolved classification, stable sorting by score then assertion ID, and the exact policy-version requirement. The test must not use random values.

- [x] **Step 5: Run the contract and pure-model tests**

Run:

```powershell
node apps\web\node_modules\vitest\vitest.mjs run --root . packages\knowledge-query\src\graph-analysis.test.ts apps\web\lib\3a\query-handler.test.ts
```

Expected: all new tests pass; existing search, trace, and detail handler tests remain green.

- [x] **Step 6: Commit the stable graph-analysis contracts**

```powershell
git add packages/knowledge-query/src/types.ts packages/knowledge-query/src/graph-analysis.ts packages/knowledge-query/src/graph-analysis.test.ts apps/web/lib/3a/query-protocol.ts apps/web/lib/3a/query-handler.ts apps/web/lib/3a/query-handler.test.ts apps/web/lib/3a/query-client.ts
git commit -m "feat: define 3a graph analysis contracts"
```

### Task 2: Add Derived Graph Summary And Impact Projection Storage

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811_webgl_3a_graph_analysis/migration.sql`
- Create: `packages/knowledge-query/src/graph-analysis-repository.ts`
- Create: `packages/knowledge-query/src/graph-analysis-repository.test.ts`
- Modify: `packages/knowledge-query/src/types.ts`
- Modify: `packages/knowledge-query/src/prisma-repository.ts`
- Modify: `packages/knowledge-query/src/prisma-repository.test.ts`

**Interfaces:**
- Consumes: published `KnowledgeProjectionNode` and `KnowledgeProjectionEdge`, exact Scope identity, graph-analysis DTOs, and the existing projection generation indexes.
- Produces: `GraphAnalysisRepository` with bounded `loadOverview`, `loadImpact`, `loadNodeMetrics`, and `loadClusterMembers` operations; no full-edge read is allowed for interactive requests.

- [x] **Step 1: Write repository contract tests for Scope and generation binding**

Use a fake Prisma client and assert that every query includes `applicationServiceId`, `scopePath`, `generationId`, and the requested Baseline/Projection identity. Add a regression assertion that `loadOverview` does not call the existing unrestricted `listEdges` method.

```ts
it("binds graph summary reads to the exact Scope and generation", async () => {
  const repository = createGraphAnalysisRepository(fakePrisma());
  await repository.loadOverview(scope, manifest, { layers: ["BIZ"], limit: 25 });
  expect(fakePrisma.calls[0].where).toMatchObject({
    applicationServiceId: scope.applicationServiceId,
    scopePath: scope.scopePath,
    generationId: manifest.generationId
  });
});
```

- [x] **Step 2: Add derived summary models and indexes**

Add `KnowledgeGraphAnalysis`, `KnowledgeGraphCluster`, and `KnowledgeGraphNodeMetric` models in `prisma/schema.prisma`. Use composite Scope/generation keys and indexes for cluster lookup, layer filtering, node metric ranking, and impact traversal. Keep all summary tables explicitly derived with an `analysisVersion` and `contentDigest`.

The migration must create the same composite indexes and must not modify authored assertion or relationship tables. Run `pnpm exec prisma validate` and `pnpm exec prisma generate` after the schema edit.

- [x] **Step 3: Implement repository summary reads**

Implement `GraphAnalysisRepository` with methods whose inputs include `ArchitectureScopeRef`, `ProjectionManifestV2`, normalized filters, and a `GraphAnalysisBudget`. Return only the requested page and an opaque analysis continuation; never return all cluster members implicitly.

```ts
export interface GraphAnalysisRepository {
  loadOverview(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: OverviewRepositoryInput): Promise<OverviewRepositoryResult>;
  loadImpact(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: ImpactRepositoryInput): Promise<ImpactRepositoryResult>;
  loadNodeMetrics(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionIds: string[]): Promise<NodeMetric[]>;
}
```

Use parameterized SQL or Prisma typed queries. Validate the returned endpoint Scope before mapping DTOs; a cross-Scope row is a hard `PROJECTION_SCOPE_MISMATCH` failure.

- [x] **Step 4: Test bounded ordering, pagination, and stale analysis behavior**

Add tests for deterministic ordering by score/cluster ID, continuation expiry, mismatched `analysisVersion`, stale Projection Manifest, empty summaries, partial reasons, and Scope mismatch. Verify query limits are applied in SQL/Prisma arguments rather than after an unbounded read.

- [x] **Step 5: Run repository tests and schema validation**

Run:

```powershell
node apps\web\node_modules\vitest\vitest.mjs run --root . packages\knowledge-query\src\graph-analysis-repository.test.ts packages\knowledge-query\src\prisma-repository.test.ts
pnpm exec prisma validate
pnpm exec prisma generate
```

Expected: repository tests pass, Prisma validation exits 0, and the generated client exposes the three derived models.

- [x] **Step 6: Commit derived storage and repository boundaries**

```powershell
git add prisma/schema.prisma prisma/migrations/20260811_webgl_3a_graph_analysis/migration.sql packages/knowledge-query/src/graph-analysis-repository.ts packages/knowledge-query/src/graph-analysis-repository.test.ts packages/knowledge-query/src/types.ts packages/knowledge-query/src/prisma-repository.ts packages/knowledge-query/src/prisma-repository.test.ts
git commit -m "feat: add 3a graph analysis projection reads"
```

### Task 3: Publish Cluster Summaries And Impact Metrics

**Files:**
- Modify: `apps/knowledge-projector/src/repository.ts`
- Modify: `apps/knowledge-projector/src/materializer.ts`
- Create: `apps/knowledge-projector/src/repository.test.ts`
- Create: `apps/knowledge-projector/src/graph-analysis-materializer.ts`
- Create: `apps/knowledge-projector/src/graph-analysis-materializer.test.ts`
- Modify: `apps/knowledge-projector/src/main.ts`

**Interfaces:**
- Consumes: each published `MaterializedProjectionBatch`, exact Scope, projection generation, relationship version, and the deterministic scoring policy.
- Produces: versioned `KnowledgeGraphAnalysis`, cluster rows, node metrics, stable position seeds, bridge edges, and publication metadata visible to the query repository.

- [x] **Step 1: Define analysis materializer input and publication output**

Create an explicit interface:

```ts
export interface GraphAnalysisMaterializer {
  build(input: {
    scope: ArchitectureScopeRef;
    generationId: string;
    baselineId: string;
    projectionManifestId: string;
    nodes: readonly KnowledgeProjectionNode[];
    edges: readonly KnowledgeProjectionEdge[];
    analysisVersion: string;
  }): Promise<GraphAnalysisPublication>;
}
```

`GraphAnalysisPublication` includes counts, digest, cluster rows, node metrics, bridge edges, and the policy version. The implementation must use deterministic sorting and stable seed generation from `contentDigest(scope + generationId + assertionId)`.

- [x] **Step 2: Write materializer tests before wiring the projector**

Test one BIZ-to-SYS-to-TECH fixture and assert stable clusters, dominant layer, degree, bridge detection, criticality, position seeds, and identical output for shuffled input arrays. Test an empty projection and a cross-Scope edge rejection.

- [x] **Step 3: Implement bounded deterministic analysis**

Use a graph-store/provider abstraction for cluster and bridge calculation. The PostgreSQL fallback may use indexed adjacency and deterministic bounded passes; no implementation may call `listEdges` without a generation-bound query and an explicit materialization context. Store summary output in one transaction with the analysis version and digest.

- [x] **Step 4: Wire analysis publication after Projection Manifest publication**

In `ProjectionMaterializer`, only publish `KnowledgeGraphAnalysis` after node/edge batches and the Projection Manifest are committed. If analysis fails, mark the derived analysis unavailable without rolling back authored Projection publication; the query layer must return a typed unavailable/partial state. A retry of the same generation must be idempotent by Scope, generation, and analysis version.

- [x] **Step 5: Verify projector restart and idempotency**

Run the projector unit tests and add a restart test that writes the same generation twice, then confirms one active analysis record and stable digests. Verify a sibling Scope is rejected before any derived row is written.

- [x] **Step 6: Commit projection publication**

```powershell
git add apps/knowledge-projector/src/repository.ts apps/knowledge-projector/src/materializer.ts apps/knowledge-projector/src/repository.test.ts apps/knowledge-projector/src/graph-analysis-materializer.ts apps/knowledge-projector/src/graph-analysis-materializer.test.ts apps/knowledge-projector/src/main.ts
git commit -m "feat: publish 3a graph analysis summaries"
```

### Task 4: Implement Service And API Overview/Impact Operations

**Files:**
- Modify: `packages/knowledge-query/src/service.ts`
- Modify: `packages/knowledge-query/src/service.test.ts`
- Modify: `apps/web/lib/3a/query-handler.ts`
- Modify: `apps/web/lib/3a/query-handler.test.ts`
- Modify: `apps/web/lib/3a/query-client.ts`
- Modify: `apps/web/app/api/architecture/3a/query/route.ts`

**Interfaces:**
- Consumes: `GraphAnalysisRepository`, `scoreImpact`, `GraphAnalysisBudget`, exact principal authorization, and existing cursor/continuation signing.
- Produces: `service.getArchitectureOverview`, `service.getArchitectureImpact`, signed operation continuations, safe error codes, and typed Web responses.

- [x] **Step 1: Add service contract tests for overview and impact**

Write tests for manifest validation, exact Scope authorization, default and hard budgets, overview summary mapping, impact score factors, direct/likely/extended bands, policy version, continuation binding, and partial result preservation. Include a sibling Scope test that returns `SCOPE_ACCESS_DENIED` before repository access.

- [x] **Step 2: Implement operation-specific continuation fingerprints**

Build fingerprints from operation, focus, direction, sorted layers, sorted relation types, policy version, budget, Scope digest, Baseline, and Projection Manifest. Reuse the existing signed cursor primitives but reject a token if any field differs or if it is consumed/expired.

```ts
const fingerprint = contentDigest({
  operation: "impact",
  focusAssertionId: input.focusAssertionId,
  direction: input.direction,
  layers: uniqueSorted(input.layers ?? []),
  relationTypes: uniqueSorted(input.relationTypes ?? []),
  policyVersion,
  budget
});
```

- [x] **Step 3: Implement Overview and Impact service methods**

Resolve the published manifest first, authorize the exact principal Scope, normalize filters, enforce budgets, call the derived repository, and return `QueryResultEnvelope` digests. Impact results must include every score factor and never label a partial path as confirmed business impact.

- [x] **Step 4: Route and sanitize the new Web operations**

Route `overview` and `impact` in `handleThreeAQuery`, add `QUERY_BUDGET_INVALID` and `GRAPH_ANALYSIS_UNAVAILABLE` status mappings, and ensure raw provider errors collapse to safe codes. Add client helpers with typed generics matching existing `runThreeAWebQuery` behavior.

- [x] **Step 5: Run backend service tests**

```powershell
node apps\web\node_modules\vitest\vitest.mjs run --root . packages\knowledge-query\src\service.test.ts apps\web\lib\3a\query-handler.test.ts
```

Expected: existing search/trace/detail tests plus the new overview/impact tests pass.

- [x] **Step 6: Commit query operations**

```powershell
git add packages/knowledge-query/src/service.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.ts apps/web/lib/3a/query-handler.test.ts apps/web/lib/3a/query-client.ts apps/web/app/api/architecture/3a/query/route.ts
git commit -m "feat: expose 3a overview and impact queries"
```

### Task 5: Build The Bounded Graphology Store And Layout Models

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/components/three-a/architecture-graph-store.ts`
- Create: `apps/web/components/three-a/architecture-graph-store.test.ts`
- Create: `apps/web/components/three-a/architecture-graph-layout-worker.ts`
- Create: `apps/web/components/three-a/architecture-graph-layout-worker.test.ts`
- Modify: `apps/web/components/three-a/architecture-graph-state.ts`

**Interfaces:**
- Consumes: `GraphSummaryNode`, `GraphSummaryEdge`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, `ImpactArchitectureItem`, and the existing graph state.
- Produces: `ArchitectureGraphStore`, `mergeOverview`, `mergeNeighborhood`, `mergeImpact`, `retainWithinBudget`, `highlightNeighborhood`, and a Worker message protocol.

- [x] **Step 1: Add pinned graph dependencies**

Add `sigma`, `graphology`, and `graphology-layout-forceatlas2` to `apps/web/package.json`, resolve them through the workspace package manager, and record the resolved versions in `pnpm-lock.yaml`. Do not load a renderer from a CDN.

- [x] **Step 2: Define the store boundary and retention policy**

```ts
export interface ArchitectureGraphStore {
  readonly graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>;
  mergeOverview(result: OverviewArchitectureResult): GraphStoreChange;
  mergeNeighborhood(result: TraceArchitecturePathResult): GraphStoreChange;
  mergeImpact(result: ImpactArchitectureResult): GraphStoreChange;
  retainWithinBudget(): GraphStoreChange;
  select(id?: string): void;
  clear(): void;
}
```

Use stable node IDs (`cluster:${id}` or `fact:${assertionId}`) and stable edge IDs (`relationship:${relationshipIdentity}` or `summary:${id}`). Deduplicate before insertion, preserve the root focus, and return a partial reason when retention would exceed 2,000 nodes or 5,000 edges.

- [x] **Step 3: Write store tests before implementing Graphology mutation**

Test overview merge, fact/cluster ID isolation, neighborhood deduplication, impact score replacement, relation/layer filter reset, focus preservation, retention limits, clear-on-identity-change, and deterministic node/edge counts. Use a fake DTO fixture; do not mount Sigma in these tests.

- [x] **Step 4: Implement semantic zoom and neighborhood reducers**

Expose pure reducer functions for `visibleLabel`, `nodeSize`, `nodeColor`, `edgeOpacity`, and `isHighlighted`. Labels must be hidden or shortened at far zoom, selected/hovered at medium zoom, and bounded nearby labels at near zoom. Edges outside the selected neighborhood must dim without removal.

- [x] **Step 5: Define the layout Worker protocol**

```ts
type LayoutWorkerRequest = {
  type: "refine";
  layout: "overview" | "explore";
  nodes: Array<{ id: string; x: number; y: number; degree: number }>;
  edges: Array<{ source: string; target: string; weight: number }>;
  seed: number;
  maxRuntimeMs: 1500;
};

type LayoutWorkerResponse = {
  type: "complete" | "failed";
  positions: Array<{ id: string; x: number; y: number }>;
  reason?: "WORKER_ERROR" | "TIMEOUT";
};
```

Test shuffled inputs, fixed seed, timeout fallback, reduced-motion bypass, and termination on Scope/Projection identity changes.

- [x] **Step 6: Run store and Worker tests**

```powershell
node apps\web\node_modules\vitest\vitest.mjs run --root . apps/web/components/three-a/architecture-graph-store.test.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts apps/web/components/three-a/architecture-graph-state.test.ts
```

- [x] **Step 7: Commit the Graphology state layer**

```powershell
git add apps/web/package.json pnpm-lock.yaml apps/web/components/three-a/architecture-graph-store.ts apps/web/components/three-a/architecture-graph-store.test.ts apps/web/components/three-a/architecture-graph-layout-worker.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts apps/web/components/three-a/architecture-graph-state.ts
git commit -m "feat: add bounded graphology state"
```

### Task 6: Implement Sigma WebGL Rendering And Fallback Recovery

**Files:**
- Create: `apps/web/components/three-a/sigma-architecture-graph.tsx`
- Create: `apps/web/components/three-a/sigma-architecture-graph.test.tsx`
- Create: `apps/web/components/three-a/architecture-graph-renderer.tsx`
- Create: `apps/web/components/three-a/architecture-graph-renderer.test.tsx`
- Modify: `apps/web/components/three-a/architecture-graph-node.tsx`
- Modify: `apps/web/components/three-a/architecture-relationship-inspector.tsx`
- Modify: `apps/web/components/three-a/architecture-path-list.tsx`

**Interfaces:**
- Consumes: `ArchitectureGraphStore`, Sigma graph DTO reducers, Worker positions, node/edge selection callbacks, and `ArchitectureGraphListFallback` data.
- Produces: a fixed-height WebGL canvas, semantic status/fallback DOM, camera commands, hover neighborhood highlighting, context-loss recovery, and stable renderer lifecycle.

- [x] **Step 1: Write renderer lifecycle tests without a real WebGL context**

Mock Sigma and assert `new Sigma` receives the container and Graphology graph once, `kill()` runs on unmount and identity change, resize observation is disconnected, pointer events call selection callbacks, and WebGL context loss exposes a recovery action.

- [x] **Step 2: Implement the Sigma adapter**

Keep Sigma behind `ArchitectureGraphRenderer`:

```ts
export interface ArchitectureGraphRendererProps {
  store: ArchitectureGraphStore;
  view: "overview" | "explore" | "impact";
  selectedId?: string;
  reducedMotion: boolean;
  onNodeSelect(id: string): void;
  onEdgeSelect(id: string): void;
  onRendererFailure(reason: "WEBGL_UNAVAILABLE" | "WEBGL_CONTEXT_LOST" | "SIGMA_ERROR"): void;
}
```

Use Sigma reducers for semantic zoom, selected/hovered neighborhoods, relation filters, and impact bands. Use one finite camera transition for focus only when reduced motion is off. Do not continuously animate edges.

- [x] **Step 3: Implement Overview, Explore, and Impact layout adapters**

Overview uses cluster position seeds plus the Worker; Explore keeps the focus centered and inserts new neighbors; Impact uses the existing pure direction-by-layer layout semantics but maps positions to Graphology attributes. Unaffected nodes retain their positions after filtering.

- [x] **Step 4: Implement WebGL fallback and context recovery**

When Sigma construction fails or the canvas emits `webglcontextlost`, preserve the store and render the semantic list and impact summary. A `Retry renderer` command creates a new Sigma instance without re-fetching data. If the Worker fails, use deterministic seeds and keep the canvas active.

- [x] **Step 5: Test reduced motion, resize, and bounded canvas**

Assert the canvas height uses `h-[clamp(36rem,calc(100dvh-12rem),52rem)]`, no document-wide horizontal overflow is introduced, the `prefers-reduced-motion` branch does not call camera animation or Worker refinement, and selected relationship details remain available in DOM.

- [x] **Step 6: Run renderer tests and typecheck**

```powershell
node apps\web\node_modules\vitest\vitest.mjs run --root . apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-renderer.test.tsx
pnpm --filter @specforge/web typecheck
```

- [x] **Step 7: Commit the WebGL renderer**

```powershell
git add apps/web/components/three-a/sigma-architecture-graph.tsx apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-renderer.tsx apps/web/components/three-a/architecture-graph-renderer.test.tsx apps/web/components/three-a/architecture-graph-node.tsx apps/web/components/three-a/architecture-relationship-inspector.tsx apps/web/components/three-a/architecture-path-list.tsx
git commit -m "feat: render 3a graph with sigma webgl"
```

### Task 7: Integrate Graph Views, Impact UX, URL State, And Localization

**Files:**
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`
- Create: `apps/web/components/three-a/architecture-graph-workspace.tsx`
- Create: `apps/web/components/three-a/architecture-impact-panel.tsx`
- Create: `apps/web/components/three-a/architecture-graph-search.tsx`
- Modify: `apps/web/components/three-a/baseline-toolbar.tsx`
- Modify: `apps/web/lib/3a/url-state.ts`
- Modify: `apps/web/lib/3a/url-state.test.ts`
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/app/styles/globals.css`
- Modify: `apps/web/components/three-a/three-a-workspace.test.tsx`

**Interfaces:**
- Consumes: overview/trace/detail/impact query client methods, Graphology store, Sigma renderer, URL identity, current detail drawer, path list, and existing bilingual `T` component.
- Produces: integrated `graphView=overview|explore|impact`, search-to-focus, impact panel, browser history, mobile sheets, stable loading/error states, and complete localized copy.

- [x] **Step 1: Extend URL state with `graphView`**

Add a discriminated URL value while preserving existing modes:

```ts
export type ThreeAGraphView = "overview" | "explore" | "impact";
export interface ThreeAUrlState {
  scope: string;
  tab: "architecture" | "alignment" | "drift";
  mode: "lanes" | "graph" | "list";
  graphView: ThreeAGraphView;
  direction: "upstream" | "downstream" | "both";
  baseline?: string;
  projection?: string;
  focus?: string;
}
```

Parse invalid `graphView` as `overview`, preserve legacy URLs, and ensure toolbar links retain Scope, Baseline, Projection, focus, mode, direction, and graphView.

- [x] **Step 2: Add failing workspace integration tests**

Test Overview with no focus, Explore with focus, Impact with selected focus, WebGL fallback, and the existing lane/list/alignment/drift paths. Assert only the active graph view requests its data and no implicit first-node focus is created.

- [x] **Step 3: Implement the graph workspace coordinator**

`ArchitectureGraphWorkspace` owns graph view, search, filters, store, selected node/edge, active continuation, and the renderer. It must clear the store and terminate Workers when identity changes. A node selection updates `focus` through the existing URL event pattern; an impact action sets `graphView=impact` without changing the assertion ID.

- [x] **Step 4: Implement the Overview search and cluster drill-down**

Add a debounced exact-Scope search rail. Search results are DOM buttons; selecting one inserts/focuses a fact and moves to Explore. Cluster double-click issues a bounded overview/detail query and never fetches all members.

- [x] **Step 5: Implement Impact panel and score explanation**

Render counts by band, layer distribution, relation distribution, score factors, policy version, highest-risk paths, cut points, evidence references, continuation, and partial reasons. Use text labels such as `Direct`, `Likely`, `Extended`, and `Unresolved` alongside colors.

- [x] **Step 6: Add bilingual copy and reduced-motion styles**

Add English canonical and Chinese overlay keys for Overview, Explore, Impact, semantic zoom, cluster, policy version, score factors, partial reasons, WebGL fallback, renderer retry, and loading states. Add transitions no longer than 180ms and a reduced-motion branch that disables camera/layout animation.

- [x] **Step 7: Test desktop/mobile DOM behavior**

Extend `three-a-workspace.test.tsx` and add `architecture-graph-workspace.test.tsx` for semantic list equivalence, focus restoration, keyboard commands, mobile sheet state, stable canvas height, no horizontal overflow, and preserved view state across Browser Back/Forward.

- [x] **Step 8: Run the integrated Web test suite**

```powershell
node apps\web\node_modules\vitest\vitest.mjs run --root . apps/web/lib/3a apps/web/components/three-a
pnpm --filter @specforge/web typecheck
```

- [x] **Step 9: Commit the integrated graph workspace**

```powershell
git add apps/web/components/three-a/three-a-workspace.tsx apps/web/components/three-a/architecture-graph-workspace.tsx apps/web/components/three-a/architecture-impact-panel.tsx apps/web/components/three-a/architecture-graph-search.tsx apps/web/components/three-a/baseline-toolbar.tsx apps/web/lib/3a/url-state.ts apps/web/lib/3a/url-state.test.ts apps/web/lib/i18n.ts apps/web/app/styles/globals.css apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.tsx
git commit -m "feat: integrate 3a graph exploration views"
```

### Task 8: Production-Shape Acceptance, Governance Closure, And Documentation

**Files:**
- Modify: `apps/web/app/architecture/3a/loading.tsx`
- Modify: `docs/adr/0024-webgl-3a-graph-exploration.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `scripts/design-fact-manifest.test.ts`
- Modify: `README.md`
- Test: `apps/web/components/three-a/three-a-workspace.test.tsx`

**Interfaces:**
- Consumes: all query, projection, Graphology, Sigma, impact, localization, and fallback outputs from Tasks 1-7.
- Produces: reproducible evidence for local acceptance, implemented design facts, MCP read-back, and a closed exact-Scope implementation session.

- [x] **Step 1: Add source regression checks for bounded behavior**

Assert that the route does not reintroduce `limit: 200`, unconditional full-edge reads, inactive-tab Alignment/Drift requests, or a Graph-mode implicit first-node focus. Assert that default Graph mode uses `overview` without a focus and that Explore/Impact require an explicit focus.

- [x] **Step 2: Run backend, frontend, governance, and build verification**

Run once after all feature tasks:

```powershell
pnpm --filter @specforge/knowledge-query test
node apps\web\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/knowledge-query apps/web/lib/3a apps/web/components/three-a apps/knowledge-projector scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts
pnpm typecheck
$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build
git diff --check
```

Expected: focused suites pass, TypeScript exits 0, Next build generates `/architecture/3a` and `/api/architecture/3a/query`, and the known OneDrive standalone symlink limitation is recorded separately if it recurs.

- [x] **Step 3: Run browser acceptance at desktop and mobile sizes**

At desktop `1280x720`, verify Overview, cluster drill-down, Explore expansion, Impact scoring, path inspection, selection highlighting, semantic zoom, Browser Back/Forward, and renderer recovery. Inspect network requests to confirm no full-Scope query.

At mobile `390x844`, verify bottom search/filter/details sheets, keyboard-equivalent list, no horizontal overflow, stable canvas height, and no continuous motion under `prefers-reduced-motion: reduce`.

Use a sibling Scope principal without the Designer grant and assert Scope denial before counts, labels, graph summaries, or impact items are disclosed.

- [x] **Step 4: Update implemented ADR/Proposal/Context Pack evidence**

Change ADR-0024 and its Chinese overlay from approved design to implemented only after all preceding checks pass. Add exact commands/results, selected Sigma/Graphology versions, browser budget evidence, WebGL fallback evidence, query-shape evidence, Scope-isolation evidence, and the explicit fact that production billion-scale capacity remains separate.

Update `scripts/design-fact-manifest.test.ts` to assert `proposalStatus: "implemented"`, the new query assets/relationships, complete bilingual content, and the implementation evidence list. Keep ADR-0023 as the historical first-increment decision and link it to ADR-0024 as successor.

- [x] **Step 5: Synchronize and read back exact-Scope design facts**

Run:

```powershell
$databaseLine = Get-Content .env -Encoding UTF8 | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
if ($databaseLine) { $env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length).Trim().Trim('"').Trim("'") }
$env:SPECFORGE_DESIGN_FACT_IDS='adr-webgl-3a-graph-exploration'
node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\sync-design-facts.ts
```

Expected: the selected decision returns `complete`. Then run `scripts/reconcile-design-facts.ts`; expected `missing`, `mismatched`, `outOfScope`, and `blocked` are empty.

- [x] **Step 6: Close the same implementation session**

Read the session ID from the newest implementation receipt and close that exact session:

```powershell
$implementationReceipt = Get-ChildItem .specforge\design-context\design-change-session_*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$implementationSessionId = (Get-Content $implementationReceipt.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).receipt.sessionId
pnpm design-context:close -- --session $implementationSessionId --status CONVERGED --evidence "backend-tests=PASS,projector-tests=PASS,web-tests=PASS,typecheck=PASS,build=PASS,desktop-graph=PASS,mobile-a11y-motion=PASS,scope-isolation=PASS,mcp-readback=PASS"
```

A failed check must use `BLOCKED` with the concrete reason and retry trigger; never mark the session converged on partial evidence.

- [x] **Step 7: Update deployment and operator documentation**

Document the optional WebGL capability, browser fallback, analysis-version refresh on Projection publication, PostgreSQL-only deployment behavior, optional graph-provider configuration, budget environment variables, and the exact browser acceptance command in `README.md`.

- [x] **Step 8: Commit the completed acceptance**

```powershell
git add apps/web/app/architecture/3a/loading.tsx docs/adr/0024-webgl-3a-graph-exploration.md docs/design-facts/baseline-manifest.json scripts/design-fact-manifest.test.ts README.md
git commit -m "feat: complete webgl 3a graph acceptance"
```

## Self-Review Checklist

- Spec coverage: Tasks 1 and 4 cover API contracts, exact Scope, continuation, and policy-versioned impact results; Tasks 2 and 3 cover derived storage and Projection publication; Tasks 5 and 6 cover Graphology, Sigma, Worker layout, semantic zoom, context recovery, and bounded retention; Task 7 covers Overview/Explore/Impact UX, URL state, accessibility, localization, and mobile behavior; Task 8 covers browser, performance, governance, MCP, and deployment evidence.
- Scope boundary: no task changes authored asset semantics, MCP write behavior, cross-Scope access, or PostgreSQL authority.
- Type consistency: `GraphSummaryNode`, `GraphSummaryEdge`, `OverviewArchitectureResult`, `ImpactArchitectureResult`, and `GraphAnalysisRepository` are introduced in Task 1 and consumed with the same names in Tasks 2-7.
- Implementation claim: the WebGL 3A graph workspace, bounded analysis, fallback, governance synchronization, verification evidence, and exact-Scope CONVERGED session closure are complete.
- No unfinished design markers remain; the close command reads the implementation session ID from the repository receipt.
