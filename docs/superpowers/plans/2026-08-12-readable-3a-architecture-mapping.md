# Readable 3A Architecture Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a governed, readable BIZ-to-SYS-to-TECH architecture map as the default 3A representation while preserving the existing bounded WebGL Network for detailed relationship exploration.

**Architecture:** PostgreSQL remains authoritative for authored design facts and relationship events. The projector adds immutable, rebuildable architecture-unit, membership, and cross-layer-mapping read models owned by the published Baseline and Projection generation. The query layer exposes additive `architectureMap` and `architectureUnitNeighborhood` operations; the Web adds a deterministic Map workspace beside the existing Network workspace.

**Tech Stack:** TypeScript, pnpm workspaces, Prisma/PostgreSQL, Vitest, Next.js/React, existing Sigma.js/Graphology WebGL Network, Zod query validation, bilingual i18n, MCP design-fact synchronization.

## Global Constraints

- Every read and write is bound to the exact `applicationServiceId` and full `scopePath`; cross-Scope units, memberships, mappings, and query results are rejected.
- PostgreSQL remains authoritative for authored facts and relationship events; graph stores and browser graphs remain replaceable derived consumers.
- Architecture-unit semantics and membership facts are authored through MCP; the Web remains read-only.
- English canonical fields are required, with complete Chinese overlays for human-facing names, descriptions, labels, warnings, and inspector content.
- The default Map returns at most 12 units per layer and 60 cross-layer mappings; returned-versus-total counts, continuation, and partial reasons are explicit.
- The default overview contains only cross-layer mappings and no raw design-asset nodes; same-layer dependencies appear only in bounded unit drill-down.
- The Map uses deterministic structured layout and no ambient force motion. The existing Force, Tree, Circles, Impact, and WebGL fallback controls remain Network-only.
- No implementation task is complete until focused tests, exact-Scope checks, MCP synchronization, read-back, and the matching design session closure are recorded.

---

### Task 1: Define the architecture-unit contracts and migration boundary

**Files:**
- Create: `packages/core/src/architecture-map/types.ts`
- Create: `packages/core/src/architecture-map/types.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `prisma/schema.prisma:785-928`
- Create: `prisma/migrations/20260812_readable_3a_architecture_units/migration.sql`
- Test: `prisma/three-a-schema.test.ts`

**Interfaces:**
- Consumes: `ArchitectureScopeRef`, `ArchitectureLayer`, `ProjectionManifestV2`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge` from `@specforge/core`.
- Produces: `ArchitectureUnitKind`, `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, `ArchitectureUnitMappingProjection`, `ArchitectureMapIdentity`, `ArchitectureUnitFilter`, and `ArchitectureMapBudget` for projector, query, and Web packages.

- [ ] **Step 1: Write failing contract tests**

Add tests in `packages/core/src/architecture-map/types.test.ts` that construct one valid BIZ capability, SYS service, TECH platform, membership, and mapping with the exact scope fields. Add rejection tests for an invalid kind/layer pair, an empty English canonical name, a mapping with a missing endpoint, and a cross-Scope target.

Use these invariants in the test fixture:

```ts
const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const unit = {
  ...scope,
  generationId: "generation-1",
  baselineId: "baseline-1",
  projectionManifestId: "projection-manifest:generation-1",
  unitIdentity: "unit:biz:policy-evaluation",
  layer: "BIZ" as const,
  kind: "CAPABILITY" as const,
  parentUnitIdentity: undefined,
  canonicalName: "Policy Evaluation",
  localizedName: "策略评估",
  aliases: ["policy decision"],
  memberCount: 2,
  criticality: 0.8,
  completeness: 1,
  evidenceCount: 2,
  unclassifiedMemberCount: 0,
  contentDigest: "unit-digest"
};
```

Expected result: the valid fixture type-checks and validation returns a stable unit identity; invalid layer-kind, empty-English, missing-endpoint, and cross-Scope fixtures fail with named errors.

- [ ] **Step 2: Run the contract test and confirm the missing types fail**

Run: `node .\node_modules\vitest\vitest.mjs run packages/core/src/architecture-map/types.test.ts`

Expected: FAIL because the new architecture-map module and validators do not exist.

- [ ] **Step 3: Add the typed contracts and validators**

Define the following in `packages/core/src/architecture-map/types.ts`:

```ts
export type ArchitectureUnitKind =
  | "CAPABILITY" | "PROCESS" | "BUSINESS_OBJECT"
  | "APPLICATION" | "SERVICE" | "COMPONENT" | "DATA_DOMAIN"
  | "PLATFORM" | "RUNTIME" | "INFRASTRUCTURE" | "TECHNOLOGY_SERVICE";

export interface ArchitectureUnitProjection extends ArchitectureScopeRef {
  generationId: string; baselineId: string; projectionManifestId: string;
  unitIdentity: string; layer: ArchitectureLayer; kind: ArchitectureUnitKind;
  parentUnitIdentity?: string; canonicalName: string; localizedName?: string;
  aliases: string[]; memberCount: number; criticality: number;
  completeness: number; evidenceCount: number; unclassifiedMemberCount: number;
  contentDigest: string;
}

export interface ArchitectureUnitMemberProjection extends ArchitectureScopeRef {
  generationId: string; baselineId: string; projectionManifestId: string;
  unitIdentity: string; assertionId: string; assetType?: string;
  semanticIdentity: string; contentDigest: string;
}

export interface ArchitectureUnitMappingProjection extends ArchitectureScopeRef {
  generationId: string; baselineId: string; projectionManifestId: string;
  mappingIdentity: string; sourceUnitIdentity: string; targetUnitIdentity: string;
  sourceLayer: ArchitectureLayer; targetLayer: ArchitectureLayer;
  mappingFamily: string; relationshipCount: number; evidenceCount: number;
  confidence: number; contentDigest: string;
}

export interface ArchitectureMapIdentity extends ArchitectureScopeRef {
  generationId: string; baselineId: string; projectionManifestId: string;
}

export interface ArchitectureUnitFilter {
  layers?: ArchitectureLayer[]; kinds?: ArchitectureUnitKind[]; mappingFamilies?: string[];
  minCriticality?: number; minCompleteness?: number; includeUnclassified?: boolean; query?: string;
}

export interface ArchitectureUnitProjectionPage {
  units: ArchitectureUnitProjection[]; totalByLayer: Record<ArchitectureLayer, number>;
  unclassifiedCount: number; nextContinuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export interface ArchitectureMapBudget { maxUnitsPerLayer: number; maxMappings: number; timeoutMs: number; maxPayloadBytes: number; }
```

Add `validateArchitectureUnit`, `validateArchitectureUnitMember`, and `validateArchitectureUnitMapping` with explicit Scope equality, allowed layer-kind table, required English fields, and endpoint checks. Export the module from `packages/core/src/index.ts`.

Add Prisma models with compound unique keys and indexes beginning with `applicationServiceId`, `scopePath`, and `generationId`. Store localized name and aliases as JSON only for derived read data; authored semantic facts remain source inputs.

- [ ] **Step 4: Run the contract, schema, and type checks**

Run: `node .\node_modules\vitest\vitest.mjs run packages/core/src/architecture-map/types.test.ts prisma/three-a-schema.test.ts`

Expected: PASS with all validation cases covered and the migration containing Scope/generation-safe unique keys and endpoint indexes.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add packages/core/src/architecture-map packages/core/src/index.ts prisma/schema.prisma prisma/migrations/20260812_readable_3a_architecture_units prisma/three-a-schema.test.ts
git commit -m "feat: add readable 3A architecture unit contracts"
```

### Task 2: Materialize governed units, memberships, and mappings

**Files:**
- Create: `apps/knowledge-projector/src/architecture-unit-materializer.ts`
- Create: `apps/knowledge-projector/src/architecture-unit-materializer.test.ts`
- Modify: `apps/knowledge-projector/src/repository.ts:1-470`
- Modify: `apps/knowledge-projector/src/materializer.ts:90-145`
- Modify: `apps/knowledge-projector/src/index.ts`
- Modify: `apps/mcp-server/src/tools.ts:620-760`
- Create: `apps/mcp-server/src/knowledge/architecture-map-adapter.ts`
- Create: `apps/mcp-server/src/knowledge/architecture-map-adapter.test.ts`

**Interfaces:**
- Consumes: `KnowledgeAssertion` source facts, accepted relationship events, `ProjectionBuildJob`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, and the Task 1 validators.
- Produces: `materializeArchitectureUnits(input): ArchitectureUnitMaterialization`, repository methods `writeArchitectureUnitBatch` and `listArchitectureUnit*`, and MCP read tools `search_3a_architecture_map` and `get_3a_architecture_unit_neighborhood`.

- [ ] **Step 1: Write failing materialization tests**

Create source fixtures for explicit `architectureUnit`, `architectureUnitMember`, and `architectureUnitMapping` facts. Assert that a published generation contains deterministic units, memberships, and mappings sorted by parent, criticality, canonical English name, and stable identity.

Add tests that expect `ARCHITECTURE_UNIT_SCOPE_MISMATCH`, `ARCHITECTURE_UNIT_ENDPOINT_UNRESOLVED`, `ARCHITECTURE_UNIT_INVALID_KIND`, and `ARCHITECTURE_UNIT_ENGLISH_REQUIRED` for the corresponding invalid inputs. Add a repeated-build test asserting equal content digests and row ordering.

- [ ] **Step 2: Run projector tests and confirm the materializer is absent**

Run: `node .\node_modules\vitest\vitest.mjs run apps/knowledge-projector/src/architecture-unit-materializer.test.ts`

Expected: FAIL because the materializer and repository persistence methods do not exist.

- [ ] **Step 3: Implement deterministic materialization**

Implement `materializeArchitectureUnits` as a pure function. Read only explicit architecture-unit facts and their typed membership/mapping links. Reject cross-Scope facts before grouping. Validate every endpoint and layer-kind pair. Aggregate member counts, counts by asset type, evidence counts, unclassified counts, mapping family, relationship count, confidence, and completeness. Hash the normalized sorted JSON for `contentDigest`.

Extend the projector batch contract so the existing generation transaction writes architecture-unit rows after projection nodes and edges, before publishing the manifest. Delete or replace only the current generation rows; never mutate a published generation. Keep graph-analysis materialization independent and optional.

- [ ] **Step 4: Implement repository persistence and MCP read adapters**

Add Prisma repository methods that require the full identity object on every query:

```ts
listArchitectureUnits(identity: ArchitectureMapIdentity, filter: ArchitectureUnitFilter, budget: ArchitectureMapBudget): Promise<ArchitectureUnitProjectionPage>;
listArchitectureUnitMembers(identity: ArchitectureMapIdentity, unitIdentity: string, limit: number): Promise<ArchitectureUnitMemberProjection[]>;
listArchitectureUnitMappings(identity: ArchitectureMapIdentity, unitIdentities: string[], limit: number): Promise<ArchitectureUnitMappingProjection[]>;
```

Register MCP read-only tools with exact Scope validation. The tools may query the derived PostgreSQL read model, but they must not create or mutate architecture semantics. Include English and Chinese output fields and explicit partial reasons.

- [ ] **Step 5: Run projector, adapter, and Scope-isolation checks**

Run: `node .\node_modules\vitest\vitest.mjs run apps/knowledge-projector/src/architecture-unit-materializer.test.ts apps/knowledge-projector/src/materializer.test.ts apps/mcp-server/src/knowledge/architecture-map-adapter.test.ts apps/mcp-server/src/tools.test.ts`

Expected: PASS with deterministic digests, invalid input rejection, exact-Scope predicates, and MCP tool registration/read behavior covered.

- [ ] **Step 6: Commit the projection increment**

```bash
git add apps/knowledge-projector apps/mcp-server/src/tools.ts apps/mcp-server/src/knowledge/architecture-map-adapter.ts
git commit -m "feat: materialize governed 3A architecture units"
```

### Task 3: Add bounded Map query contracts and API operations

**Files:**
- Modify: `packages/knowledge-query/src/types.ts:1-180`
- Modify: `packages/knowledge-query/src/service.ts:1-100`
- Modify: `packages/knowledge-query/src/prisma-repository.ts:1-180`
- Create: `packages/knowledge-query/src/architecture-map.test.ts`
- Modify: `apps/web/lib/3a/query-protocol.ts:1-40`
- Modify: `apps/web/lib/3a/query-handler.ts:1-125`
- Modify: `apps/web/lib/3a/query-client.ts:1-80`
- Modify: `apps/mcp-server/src/knowledge/query-adapter.ts:1-120`

**Interfaces:**
- Consumes: Task 1 typed projections and Task 2 repository methods.
- Produces: `ArchitectureMapQueryInput`, `ArchitectureMapQueryResult`, `ArchitectureUnitNeighborhoodInput`, `ArchitectureUnitNeighborhoodResult`, `runArchitectureMapQuery`, and `runArchitectureUnitNeighborhoodQuery`.

- [ ] **Step 1: Write failing query-service tests**

Test `architectureMap` for exact identity, default limits of 12 units per layer and 60 mappings, deterministic ordering, returned-versus-total counts, unclassified counts, completeness, evidence coverage, continuation, and `RESULT_PARTIAL` reasons.

Test `architectureUnitNeighborhood` for selected-unit detail, adjacent units, member facts, same-layer dependencies, contributing relationships, finite depth, and identity-bound continuation. Add a negative test proving a unit from another Scope returns `SCOPE_ACCESS_DENIED` or `ARCHITECTURE_UNIT_NOT_FOUND` without leaking data.

- [ ] **Step 2: Run the query tests and confirm the new operations fail**

Run: `node .\node_modules\vitest\vitest.mjs run packages/knowledge-query/src/architecture-map.test.ts apps/web/lib/3a/query-handler.test.ts`

Expected: FAIL because the query types, service methods, and discriminated-union operations are not yet present.

- [ ] **Step 3: Add typed service operations**

Extend `ArchitectureGraphQueryProvider` only through a separate `ArchitectureMapQueryProvider` so the existing `overview`, `impact`, `search`, `detail`, and `trace` meanings remain unchanged:

```ts
export interface ArchitectureMapQueryInput extends QueryPrincipalInput, ArchitectureMapIdentity {
  filter: ArchitectureUnitFilter; budget?: Partial<ArchitectureMapBudget>; continuation?: string;
}

export interface ArchitectureMapQueryResult extends QueryResultEnvelope {
  units: ArchitectureUnitProjection[]; mappings: ArchitectureUnitMappingProjection[];
  totalByLayer: Record<ArchitectureLayer, number>; returnedByLayer: Record<ArchitectureLayer, number>;
  unclassifiedCount: number; mappingCompleteness: number; evidenceCoverage: number;
  continuation?: string; partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export interface ArchitectureUnitNeighborhoodInput extends QueryPrincipalInput, ArchitectureMapIdentity {
  unitIdentity: string; direction: TraceDirection; depth: number;
  memberAssetTypes?: string[]; mappingFamilies?: string[]; continuation?: string;
  budget?: Partial<ArchitectureMapBudget>;
}

export interface ArchitectureUnitNeighborhoodResult extends QueryResultEnvelope {
  unit: ArchitectureUnitProjection; adjacentUnits: ArchitectureUnitProjection[];
  members: ArchitectureUnitMemberProjection[]; mappings: ArchitectureUnitMappingProjection[];
  sameLayerDependencies: KnowledgeProjectionEdge[]; evidenceRefs: string[];
  continuation?: string; partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export interface ArchitectureMapQueryProvider {
  architectureMap(input: ArchitectureMapQueryInput): Promise<ArchitectureMapQueryResult>;
  architectureUnitNeighborhood(input: ArchitectureUnitNeighborhoodInput): Promise<ArchitectureUnitNeighborhoodResult>;
}
```

Implement identity validation, filter normalization, signed continuation fingerprints, payload budgets, deterministic ordering, and digest generation in the query service. Return explicit `partial.reasons` when a budget is hit. Never substitute raw graph nodes or algorithmic clusters when no governed units exist; return `NO_GOVERNED_ARCHITECTURE_UNITS` metadata for the UI.

- [ ] **Step 4: Add versioned web and MCP protocol operations**

Add discriminated-union Zod branches named `architectureMap` and `architectureUnitNeighborhood` to `threeAWebQuerySchema`. Require `scope`, `baselineId`, and `projectionManifestId`; bound all text, filter arrays, depth, and budgets. Route both operations through `handleThreeAQuery` after the existing exact-Scope principal resolution. Add status mappings for `ARCHITECTURE_UNIT_NOT_FOUND`, `NO_GOVERNED_ARCHITECTURE_UNITS`, `ARCHITECTURE_MAP_QUERY_INVALID`, and `ARCHITECTURE_MAP_UNAVAILABLE`.

Expose client helpers with typed return values and `AbortSignal` support. Register matching MCP read operations through `apps/mcp-server/src/knowledge/query-adapter.ts`.

- [ ] **Step 5: Run query, API, compatibility, and type checks**

Run: `node .\node_modules\vitest\vitest.mjs run packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/lib/3a/url-state.test.ts apps/mcp-server/src/tools.test.ts; pnpm --filter @specforge/knowledge-query typecheck; pnpm --filter @specforge/web typecheck`

Expected: PASS; existing graph operation tests remain green, new operations enforce exact identity and budgets, and both packages type-check.

- [ ] **Step 6: Commit the query boundary**

```bash
git add packages/knowledge-query apps/web/lib/3a/query-protocol.ts apps/web/lib/3a/query-handler.ts apps/web/lib/3a/query-client.ts apps/mcp-server/src/knowledge/query-adapter.ts
git commit -m "feat: add bounded 3A architecture map queries"
```

### Task 4: Implement the deterministic Map overview and URL state

**Files:**
- Create: `apps/web/components/three-a/architecture-map-workspace.tsx`
- Create: `apps/web/components/three-a/architecture-map-layout.ts`
- Create: `apps/web/components/three-a/architecture-map-layout.test.ts`
- Create: `apps/web/components/three-a/architecture-map-renderer.tsx`
- Create: `apps/web/components/three-a/architecture-map-renderer.test.tsx`
- Create: `apps/web/components/three-a/architecture-map-filter-bar.tsx`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx:15-80`
- Modify: `apps/web/lib/3a/url-state.ts:1-220`
- Modify: `apps/web/lib/3a/workspace-loader.ts:1-260`
- Modify: `apps/web/lib/i18n.ts:180-620`
- Modify: `apps/web/app/architecture/3a/page.tsx`

**Interfaces:**
- Consumes: Task 3 `runArchitectureMapQuery`, `ArchitectureMapQueryResult`, `ArchitectureUnitFilter`, and existing Scope/Baseline/Projection state.
- Produces: `graphRepresentation=map|network`, `unit`, and `transition=BIZ_SYS|SYS_TECH` URL state; a bounded, keyboard-accessible Map overview that can be embedded by `ThreeAWorkspace`.

- [ ] **Step 1: Write failing layout and URL tests**

Test that `layoutArchitectureMap` places BIZ, SYS, and TECH in deterministic ordered columns, keeps mapping endpoints in the same stable coordinates across repeated calls, and switches to one transition at a time for narrow widths. Test URL parsing/serialization defaults `graphRepresentation` to `map`, preserves `network`, `unit`, and `transition`, and clears incompatible unit state when Scope, Baseline, Projection, or server filters change.

Use this assertion shape:

```ts
expect(layoutArchitectureMap(result, { width: 1200, height: 620 })).toEqual(layoutArchitectureMap(result, { width: 1200, height: 620 }));
expect(parseThreeAUrlState("scope=x&mode=graph").graphRepresentation).toBe("map");
expect(parseThreeAUrlState("scope=x&mode=graph&graphRepresentation=network").graphRepresentation).toBe("network");
```

- [ ] **Step 2: Run the layout and URL tests to confirm the new state is absent**

Run: `node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-map-layout.test.ts apps/web/lib/3a/url-state.test.ts`

Expected: FAIL because Map layout and representation state do not exist.

- [ ] **Step 3: Implement deterministic layout, filters, and URL state**

Implement `layoutArchitectureMap(result, viewport)` with fixed layer columns on desktop, top-down transition slices on mobile, ordering by parent hierarchy, criticality, canonical name, and stable identity. Do not invoke Sigma, ForceAtlas2, or a force simulation. Implement filters for layer, unit kind, mapping family, criticality, completeness, unclassified status, and text query. All filter values are encoded in the existing URL serializer and bounded before the request is sent.

Add complete English/Chinese labels for Map, Network, unit kinds, counts, partial reasons, unclassified facts, missing mappings, completeness, stale projection, and retry states.

- [ ] **Step 4: Implement the Map overview renderer**

Render always-visible unit names, kind, member count, completeness indicator, and bundled cross-layer mapping edges. Use redundant layer labels plus amber BIZ, blue SYS, and teal TECH accents. Keyboard focus and pointer focus highlight the selected unit chain while dimming unrelated units. Use `aria-label`, `aria-current`, and a focusable unit list fallback so Map works when WebGL is unavailable.

Add a segmented `Map`/`Network` representation switch. Network renders the existing `ArchitectureGraphWorkspace` unchanged except for receiving `graphRepresentation=network`; Map owns no Force/Tree/Circles controls. Keep the loaded result on selection-only and layout-only changes.

- [ ] **Step 5: Integrate Map into the 3A workspace**

In `ThreeAWorkspace`, route `mode=graph` and `graphRepresentation=map` to `ArchitectureMapWorkspace`; route `graphRepresentation=network` to the existing `ArchitectureGraphWorkspace`. Preserve Alignment and Drift tabs, exact Scope, Baseline, Projection, existing Network URLs, and projection guidance states.

- [ ] **Step 6: Run focused UI checks**

Run: `node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-map-layout.test.ts apps/web/components/three-a/architecture-map-renderer.test.tsx apps/web/lib/3a/url-state.test.ts apps/web/components/three-a/three-a-workspace.test.tsx; pnpm --filter @specforge/web typecheck`

Expected: PASS with deterministic desktop/mobile layout, readable labels, URL-compatible representation switching, reduced-motion behavior, and no regression in Network rendering.

- [ ] **Step 7: Commit the Map overview**

```bash
git add apps/web/components/three-a/architecture-map-workspace.tsx apps/web/components/three-a/architecture-map-layout.ts apps/web/components/three-a/architecture-map-layout.test.ts apps/web/components/three-a/architecture-map-renderer.tsx apps/web/components/three-a/architecture-map-renderer.test.tsx apps/web/components/three-a/architecture-map-filter-bar.tsx apps/web/components/three-a/three-a-workspace.tsx apps/web/lib/3a/url-state.ts apps/web/lib/3a/workspace-loader.ts apps/web/lib/i18n.ts apps/web/app/architecture/3a/page.tsx
git commit -m "feat: add readable 3A architecture map overview"
```

### Task 5: Add bounded unit drill-down and bilingual inspector

**Files:**
- Create: `apps/web/components/three-a/architecture-unit-inspector.tsx`
- Create: `apps/web/components/three-a/architecture-unit-inspector.test.tsx`
- Create: `apps/web/components/three-a/architecture-map-neighborhood.tsx`
- Create: `apps/web/components/three-a/architecture-map-neighborhood.test.tsx`
- Modify: `apps/web/components/three-a/architecture-map-workspace.tsx`
- Modify: `apps/web/components/three-a/architecture-map-renderer.tsx`
- Modify: `apps/web/components/three-a/architecture-detail-drawer.tsx`
- Modify: `apps/web/lib/3a/query-client.ts`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: `ArchitectureUnitNeighborhoodResult`, URL `unit`, `transition`, filters, and existing fact-detail navigation.
- Produces: bounded local graph, `3A Map > selected unit` breadcrumb, desktop inspector, mobile bottom sheet, and member-fact handoff to existing detail behavior.

- [ ] **Step 1: Write failing drill-down and inspector tests**

Test that selecting a unit creates a neighborhood request with the exact identity and selected `unitIdentity`, displays adjacent units, members, same-layer dependencies, contributing relationships, and evidence, and does not request the full graph. Test breadcrumb return restores the prior filters, transition, and selected overview state. Test keyboard activation and mobile bottom-sheet semantics.

Test inspector localization with English canonical fields and Chinese overlay, plus explicit states for missing mappings, unclassified members, partial results, and stale projection.

- [ ] **Step 2: Run drill-down tests and confirm missing behavior**

Run: `node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-unit-inspector.test.tsx apps/web/components/three-a/architecture-map-neighborhood.test.tsx`

Expected: FAIL because the neighborhood components and client operation do not exist.

- [ ] **Step 3: Implement bounded neighborhood loading and state transitions**

On unit selection, set `unit=<unitIdentity>` and preserve all existing Map filters. Load only `architectureUnitNeighborhood` with finite depth and member/edge budgets. Keep the previous overview result in memory while loading; show it as stale if the request fails with the same exact identity. On breadcrumb return, remove `unit` and keep the overview without refetching.

Render adjacent units and same-layer dependencies in a compact structured local graph. Use the existing fact-detail route when a member fact is activated. Do not expose Network layout controls inside the neighborhood surface.

- [ ] **Step 4: Implement the inspector and responsive presentation**

The inspector must show canonical English name, active Chinese overlay, unit kind, parent, member counts by asset type, cross-layer mappings, evidence coverage, unresolved gaps, Baseline, Projection, and result digest. Use a right-side panel on desktop and a bottom sheet on mobile. Use focus trapping only while the mobile sheet is open; provide an explicit close button and keyboard escape.

- [ ] **Step 5: Run the drill-down and accessibility checks**

Run: `node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-unit-inspector.test.tsx apps/web/components/three-a/architecture-map-neighborhood.test.tsx apps/web/components/three-a/architecture-map-renderer.test.tsx apps/web/lib/3a/url-state.test.ts; pnpm --filter @specforge/web typecheck`

Expected: PASS with no whole-Scope request, breadcrumb restoration, keyboard operation, bilingual fields, explicit gaps, and mobile transition state.

- [ ] **Step 6: Commit bounded drill-down**

```bash
git add apps/web/components/three-a/architecture-unit-inspector.tsx apps/web/components/three-a/architecture-unit-inspector.test.tsx apps/web/components/three-a/architecture-map-neighborhood.tsx apps/web/components/three-a/architecture-map-neighborhood.test.tsx apps/web/components/three-a/architecture-map-workspace.tsx apps/web/components/three-a/architecture-map-renderer.tsx apps/web/components/three-a/architecture-detail-drawer.tsx apps/web/lib/3a/query-client.ts apps/web/lib/i18n.ts
git commit -m "feat: add 3A architecture unit drill-down"
```

### Task 6: Verify compatibility, Scope isolation, visual acceptance, and design governance

**Files:**
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `scripts/design-fact-manifest.test.ts`
- Create: `apps/web/components/three-a/architecture-map-acceptance.test.ts`
- Create: `apps/knowledge-projector/src/architecture-unit-isolation.test.ts`
- Create: `packages/knowledge-query/src/architecture-map-scope.test.ts`

**Interfaces:**
- Consumes: all outputs from Tasks 1-5 and the open exact-Scope design-change session created immediately before implementation.
- Produces: implementation evidence, updated ADR/Proposal/Context Pack, MCP read-back, reconciliation, and a converged implementation session.

- [ ] **Step 1: Add regression tests for the acceptance contract**

Assert all of the following in focused tests:

```ts
expect(map.nodes.every((node) => node.unitIdentity.startsWith("unit:"))).toBe(true);
expect(map.edges.every((edge) => edge.sourceLayer !== edge.targetLayer)).toBe(true);
expect(map.nodes.length).toBeLessThanOrEqual(36);
expect(map.edges.length).toBeLessThanOrEqual(60);
expect(networkUrl).toContain("graphRepresentation=network");
expect(otherScopeResult.nodes).toHaveLength(0);
```

Add a browser-oriented test that renders one complete BIZ-to-SYS-to-TECH chain with visible labels at desktop and one transition at mobile width. Add a reduced-motion test that disables path drawing/camera interpolation while retaining focus and hierarchy.

- [ ] **Step 2: Run the full focused verification set**

Run:

```powershell
node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/core/src/architecture-map/types.test.ts apps/knowledge-projector/src/architecture-unit-materializer.test.ts apps/knowledge-projector/src/architecture-unit-isolation.test.ts packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/architecture-map-scope.test.ts apps/web/components/three-a/architecture-map-layout.test.ts apps/web/components/three-a/architecture-map-renderer.test.tsx apps/web/components/three-a/architecture-map-neighborhood.test.tsx apps/web/components/three-a/architecture-unit-inspector.test.tsx apps/web/components/three-a/architecture-map-acceptance.test.ts apps/web/lib/3a/url-state.test.ts apps/web/components/three-a/three-a-workspace.test.tsx
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/knowledge-query typecheck
pnpm --filter @specforge/knowledge-projector typecheck
pnpm exec prisma validate
git diff --check
```

Expected: all focused tests pass, all three packages type-check, Prisma validates, and the diff is clean.

- [ ] **Step 3: Perform one exact-Scope browser acceptance pass**

At `http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner&tab=architecture&mode=graph&graphRepresentation=map`, verify the following in one pass: no raw asset nodes in the default Map; visible BIZ/SYS/TECH labels; one readable complete chain; returned-versus-total counts; no same-layer overview edges; unit selection opens local neighborhood and inspector; breadcrumb restores filters; Network switch preserves existing Sigma behavior; mobile has no horizontal page overflow; no new console errors.

- [ ] **Step 4: Close and synchronize the implementation session**

Run the same exact-Scope `pnpm design-context:close` session with `CONVERGED` only after the focused tests and browser checks pass. Include exact command/result evidence for projection materialization, query isolation, web typecheck, Prisma validation, browser acceptance, and `git diff --check`. Update ADR-0025 English and Chinese Evidence/MCP sections with the session ID, test counts, browser result, and implementation status. Update the baseline manifest status from `Written design complete; implementation not started` to the verified implementation status only after MCP read-back succeeds.

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-readable-3a-architecture-mapping'
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: synchronization `complete`; reconciliation has empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.

- [ ] **Step 5: Commit governance evidence**

```bash
git add docs/adr/0025-readable-3a-architecture-mapping.md docs/design-facts/baseline-manifest.json scripts/design-fact-manifest.test.ts apps/web/components/three-a/architecture-map-acceptance.test.ts apps/knowledge-projector/src/architecture-unit-isolation.test.ts packages/knowledge-query/src/architecture-map-scope.test.ts
git commit -m "docs: record readable 3A map implementation evidence"
```

## Coverage Review

- Information model and explicit unit semantics: Task 1 defines the types, validation, and Scope-safe schema.
- Projection and PostgreSQL authority: Task 2 materializes immutable rebuildable read models and blocks invalid publication.
- Query contracts, budgets, continuation, digests, and compatibility: Task 3 adds both operations without changing existing graph operations.
- Map overview, responsive layout, filters, URL state, labels, and reduced motion: Task 4 covers the default surface.
- Bounded drill-down, breadcrumb, inspector, member handoff, keyboard, and mobile bottom sheet: Task 5 covers the local workflow.
- Isolation, acceptance, browser, MCP synchronization, and implementation evidence: Task 6 closes the delivery boundary.
- Deferred Web editing, cross-application portfolio maps, and algorithmic suggestions remain out of implementation scope as specified.

## Execution Handoff

Implementation must begin with a new exact-Scope `prepare_design_change` session for the approved implementation intent. The closed writing session `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3` is evidence for the design, not an authorization to alter code. Each task should be reviewed and committed independently, with unrelated `.superpowers/sdd/task-1-report.md` and `.superpowers/sdd/task-3-report.md` worktree changes left untouched.
