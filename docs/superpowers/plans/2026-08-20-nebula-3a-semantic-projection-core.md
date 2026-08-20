# Nebula 3A Semantic Projection Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, exact-Scope, Knowledge-Assertion-aware Nebula projection that answers asset-to-BIZ/SYS/TECH queries while keeping PostgreSQL authoritative and preserving the existing bounded BUILDING/ACTIVE/PREVIOUS lifecycle.

**Architecture:** PostgreSQL read models are pinned by source Manifest, Baseline, coverage generation, relationship version, catalog digest, and semantic schema version. A pure TypeScript materializer converts those immutable rows into typed semantic vertices and edges; the graph Projector writes generation-qualified batches through the typed Go Gateway. Ordinary reads resolve ACTIVE server-side and use the PostgreSQL semantic read model as the explicit fallback. Phase 2 production operations and Phase 3 scale certification are separate follow-on increments.

**Tech Stack:** TypeScript, Prisma 6, PostgreSQL, Vitest, Go 1.26, nebula-go v3.8, NebulaGraph, pnpm workspaces.

**Implementation status (2026-08-20):** Tasks 1-4, the pure query/fallback portion of Task 6, and the bounded local implementation/integration portion of Tasks 5 and 7 are implemented and locally verified. The plan intentionally remains open for live semantic build/publish rehearsal, full family-partition restart semantics, production operation evidence, and scale certification. The exact implementation preflight session is `design-change-session:aa74dafc-08bb-4378-990f-ec38cf62d609`.

## Global Constraints

- `com.huawei.celon.desiner` and `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner` are the only owning Scope for this increment.
- PostgreSQL is authoritative for authored assets, Knowledge Assertions, Baselines, Profiles, coverage, mappings, relationships, Manifest control, and history; NebulaGraph is a rebuildable derived projection.
- MCP is the only system-of-record write boundary for ADRs, Proposals, Context Packs, Evidence, and typed links.
- Every source row, output row, checkpoint, continuation token, and query response carries the exact application-service Scope and one immutable output Manifest.
- `NebulaProjectionManifest.generationId` identifies the output graph generation; source projection and coverage generation IDs remain explicit separate fields.
- The semantic schema version is exactly `nebula.3a.semantic.v1` for this increment.
- Direct, traced, exempt, and blocked mappings are distinct outcomes; ambiguity, missing endpoints, cross-Scope input, and cross-Manifest input fail closed.
- Ordinary callers cannot select a generation. The Gateway resolves ACTIVE from PostgreSQL; an internal build request may name only the BUILDING Manifest owned by the exact Scope.
- A parity mismatch cannot publish and PostgreSQL fallback cannot conceal a failed build validation.
- English canonical fields are required; human-facing decision content has complete Chinese localization.
- Code changes require a new exact-Scope `prepare_design_change` preflight before implementation and closure of the same session with exact verification evidence after implementation.

---

### Task 1: Bind Semantic Source Versions In The PostgreSQL Control Model

**Files:**
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\prisma\schema.prisma:1074-1099`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\generation-repository.ts:1-95`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\generation-repository.test.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\graph\semantic-identity.ts`
- Test: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\__tests__\semantic-identity.test.ts`

**Interfaces:**
- Consumes: the existing `NebulaProjectionManifest`, `ProjectionManifest`, `ArchitectureCoverageManifest`, and `BuildingManifestInput` records.
- Produces: `SemanticSourceBinding`, `semanticProjectionIdentity`, and `validateSemanticSourceBinding` for Tasks 2-7.

- [ ] **Step 1: Write the failing schema/repository contract test**

Add a test fixture for an exact-Scope semantic build input with these values:

```ts
const binding = {
  sourceProjectionManifestId: "projection-manifest:designer:v6",
  sourceCoverageManifestId: "coverage-generation:designer:3a:v13",
  knowledgeGenerationId: "knowledge-generation:designer:v6",
  coverageGenerationId: "coverage-generation:designer:3a:v13",
  relationshipVersion: "graph-version:designer:42",
  catalogVersion: "catalog:designer:307",
  catalogDigest: "sha256:catalog-307",
  semanticSchemaVersion: "nebula.3a.semantic.v1"
};
```

Assert that a semantic build cannot be accepted when any source binding is empty, when the Scope differs, or when the schema version is not `nebula.3a.semantic.v1`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run --root . packages/core/src/__tests__/semantic-identity.test.ts apps/graph-projector/src/generation-repository.test.ts`

Expected: FAIL because the semantic identity module and source-binding fields do not exist.

- [ ] **Step 3: Add source-binding fields and validation**

Add the following fields to `NebulaProjectionManifest`:

```prisma
sourceProjectionManifestId String?
sourceCoverageManifestId   String?
knowledgeGenerationId     String?
coverageGenerationId      String?
relationshipVersion       String?
catalogVersion            String?
catalogDigest             String?
semanticSchemaVersion     String?
```

Keep them nullable for backward compatibility with already-created Phase 1 manifests. New semantic builds must populate all fields through `BuildingManifestInput`; legacy manifests remain eligible only for legacy projection routes. Add `SemanticSourceBinding` and the exact validator in `packages/core/src/graph/semantic-identity.ts`:

```ts
export interface SemanticSourceBinding {
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
  semanticSchemaVersion: "nebula.3a.semantic.v1";
}

export function validateSemanticSourceBinding(
  scope: { applicationServiceId: string; scopePath: string },
  binding: SemanticSourceBinding
): SemanticSourceBinding;

export function semanticProjectionIdentity(
  scope: { applicationServiceId: string; scopePath: string },
  manifest: { id: string; generationId: string; baselineId: string; profileId: string; profileVersion: string; projectionSchemaVersion: string },
  binding: SemanticSourceBinding
): {
  applicationServiceId: string;
  scopePath: string;
  manifestId: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
  semanticSchemaVersion: "nebula.3a.semantic.v1";
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
};
```

Update `BuildingManifestInput` and `createBuilding` so the semantic fields are written into the control row and included in the manifest content digest input. Do not change the existing three-slot state machine.

- [ ] **Step 4: Run schema generation and repository tests**

Run: `pnpm db:generate`

Expected: Prisma Client regenerates successfully.

Run: `pnpm exec vitest run --root . packages/core/src/__tests__/semantic-identity.test.ts apps/graph-projector/src/generation-repository.test.ts`

Expected: PASS, including rejection of missing binding fields and acceptance of a complete exact-Scope binding.

- [ ] **Step 5: Commit the control-model increment**

```bash
git add prisma/schema.prisma apps/graph-projector/src/generation-repository.ts apps/graph-projector/src/generation-repository.test.ts packages/core/src/graph/semantic-identity.ts packages/core/src/__tests__/semantic-identity.test.ts
git commit -m "feat: bind semantic projection source versions"
```

---

### Task 2: Implement The Pure 3A Semantic Materializer

**Files:**
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\architecture-map\asset-mapping.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\graph\semantic-projection.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\graph\semantic-projection.test.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\index.ts`

**Interfaces:**
- Consumes: Task 1 `SemanticSourceBinding`, existing `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, `ArchitectureUnitMappingProjection`, `Asset3AMappingProjection`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, and the existing `materializeAsset3AMappings` function.
- Produces: deterministic `SemanticProjectionBatch` rows consumed by Tasks 3-5.

- [ ] **Step 1: Write the failing materializer tests**

Cover these exact cases in `semantic-projection.test.ts`: one DIRECT assertion emits one `DesignAsset`, one `KnowledgeAssertion`, one `ArchitectureUnit`, an `ASSERTION_SUBJECT` edge, and one layer-specific edge; one TRACE row emits the authoritative path edges but no synthetic assertion; EXEMPT and BLOCKED emit reason-bearing asset metadata but no target edge; two direct members for one asset return `AMBIGUOUS_DIRECT_MAPPING`; a foreign Scope or generation returns `SEMANTIC_SCOPE_MISMATCH`.

Use a deterministic expected tuple such as:

```ts
expect(result.edges.map(({ family, sourceId, targetId }) => ({ family, sourceId, targetId }))).toEqual([
  { family: "ASSERTION_SUBJECT", sourceId: "assertion:a1", targetId: "asset:api:orders" },
  { family: "REALIZED_BY", sourceId: "assertion:a1", targetId: "unit:sys:orders" }
]);
```

- [ ] **Step 2: Run the materializer tests and verify they fail**

Run: `pnpm exec vitest run --root . packages/core/src/graph/semantic-projection.test.ts`

Expected: FAIL because the semantic batch types and materializer do not exist.

- [ ] **Step 3: Define typed semantic rows and edge families**

Create `semantic-projection.ts` with these discriminated unions:

```ts
export type SemanticVertex =
  | { family: "DesignAsset"; id: string; logicalId: string; assetType: string; assetId: string; mappingMode: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED"; reason?: string; contentDigest: string }
  | { family: "KnowledgeAssertion"; id: string; assertionId: string; semanticIdentity: string; layer: "BIZ" | "SYS" | "TECH"; factType: string; confidence: number; contentDigest: string }
  | { family: "ArchitectureUnit"; id: string; unitIdentity: string; layer: "BIZ" | "SYS" | "TECH"; kind: string; canonicalName: string; localizedName?: string; contentDigest: string };

export type SemanticEdgeFamily = "ASSERTION_SUBJECT" | "CLASSIFIED_AS" | "REALIZED_BY" | "DEPLOYED_ON" | "ASSERTION_RELATION" | "ASSET_RELATION" | "ARCHITECTURE_RELATION";

export interface SemanticEdge {
  family: SemanticEdgeFamily;
  id: string;
  sourceId: string;
  targetId: string;
  code: string;
  confidence: number;
  projectionOrdinal: bigint;
  relationshipVersion?: string;
  contentDigest: string;
}

export interface SemanticProjectionBatch {
  identity: ReturnType<typeof semanticProjectionIdentity>;
  vertices: readonly SemanticVertex[];
  edges: readonly SemanticEdge[];
  counts: Readonly<Record<string, number>>;
  bucketDigests: Readonly<Record<string, string>>;
  contentDigest: string;
  semanticProbes: Readonly<Record<string, string>>;
}

export interface SemanticAssetSource { assetType: string; assetId: string; logicalId: string; contentDigest: string; applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string }
export interface SemanticAssertionSource { assertionId: string; semanticIdentity: string; factType: string; layer: "BIZ" | "SYS" | "TECH"; confidence: number; contentDigest: string; applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string }
export interface SemanticCoverageSource { assetType: string; assetId: string; mappingMode: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED"; terminalAssertionId?: string; pathEvidence: readonly { relationshipIdentity: string; sourceSemanticIdentity: string; targetSemanticIdentity: string; relationCode: string }[]; reasonCode?: string; contentDigest: string }
export interface SemanticAssetRelationshipSource { relationshipIdentity: string; sourceAssetType: string; sourceAssetId: string; targetAssetType: string; targetAssetId: string; relationCode: string; confidence: number; relationshipVersion: string; projectionOrdinal: bigint; contentDigest: string }
export interface SemanticAssertionRelationshipSource { relationshipIdentity: string; sourceAssertionId: string; targetAssertionId: string; relationCode: string; confidence: number; relationshipVersion?: string; projectionOrdinal: bigint; contentDigest: string }
export interface SemanticArchitectureRelationshipSource { relationshipIdentity: string; sourceUnitIdentity: string; targetUnitIdentity: string; relationCode: string; confidence: number; relationshipVersion?: string; projectionOrdinal: bigint; contentDigest: string }
export interface SemanticProjectionInput {
  identity: ReturnType<typeof semanticProjectionIdentity>;
  assets: readonly SemanticAssetSource[];
  assertions: readonly SemanticAssertionSource[];
  units: readonly ArchitectureUnitProjection[];
  members: readonly ArchitectureUnitMemberProjection[];
  mappings: readonly ArchitectureUnitMappingProjection[];
  coverage: readonly SemanticCoverageSource[];
  assetRelationships: readonly SemanticAssetRelationshipSource[];
  assertionRelationships: readonly SemanticAssertionRelationshipSource[];
  architectureRelationships: readonly SemanticArchitectureRelationshipSource[];
}

export function materializeSemanticProjection(input: SemanticProjectionInput): SemanticProjectionBatch;
```

The `SemanticProjectionInput` source rows must carry the same Scope, baseline, generation, and projection Manifest identity. Sort vertices by `(family, stable logical ID)` and edges by `(family, source ID, target ID, code, projectionOrdinal)` before computing all digests.

- [ ] **Step 4: Reuse the existing mapping decision and implement fail-closed output**

Adapt `materializeAsset3AMappings` only to expose the validated mapping decision/evidence needed by the materializer. Do not duplicate its direct-member, trace-terminal, duplicate-target, or coverage validation. Map the target Architecture layer to `CLASSIFIED_AS`, `REALIZED_BY`, or `DEPLOYED_ON`; reject a target with an unknown layer. Preserve `pathEvidence` for TRACE and `reasonCode`/evidence for EXEMPT or BLOCKED in the asset vertex metadata.

Assign `ASSERTION_SUBJECT` and semantic target edges ordinal `1` only after duplicate detection. Use the authoritative relationship event version for `ASSET_RELATION`; use event version or the persisted assertion `projectionOrdinal` for `ASSERTION_RELATION`; use the persisted architecture mapping ordinal for `ARCHITECTURE_RELATION`.

- [ ] **Step 5: Run core typecheck and semantic tests**

Run: `pnpm --filter @specforge/core typecheck`

Expected: PASS.

Run: `pnpm exec vitest run --root . packages/core/src/graph/semantic-projection.test.ts packages/core/src/architecture-map/asset-mapping.test.ts`

Expected: PASS with deterministic digests, all four mapping modes, and fail-closed mismatch cases covered.

- [ ] **Step 6: Commit the pure materializer**

```bash
git add packages/core/src/architecture-map/asset-mapping.ts packages/core/src/graph/semantic-projection.ts packages/core/src/graph/semantic-projection.test.ts packages/core/src/index.ts
git commit -m "feat: materialize semantic 3a projection batches"
```

---

### Task 3: Add The Exact-Scope PostgreSQL Semantic Source Repository

**Files:**
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-source-repository.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-source-repository.test.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\repository.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\index.ts`

**Interfaces:**
- Consumes: Prisma rows for `ProjectionManifest`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, `ArchitectureUnitMappingProjection`, `ArchitectureCoverageManifest`, `ArchitectureAssetCoverageProjection`, `AssetNode`, and `RelationshipCurrent`.
- Produces: `SemanticProjectionSource` pages with a stable `nextCursor`, source-binding validation, and no rows from another Scope or generation.

- [ ] **Step 1: Write repository contract tests**

Use a fake Prisma delegate that records `where`, `orderBy`, `take`, and cursor arguments. Assert every query includes `applicationServiceId`, `scopePath`, `baselineId`, and the source generation/Manifest predicate. Assert the repository orders by stable key and returns the last key as the continuation cursor. Add a test proving a mismatched source Manifest throws `SEMANTIC_SOURCE_MANIFEST_MISMATCH` before querying child tables.

- [ ] **Step 2: Run the repository tests and verify they fail**

Run: `pnpm exec vitest run --root . apps/graph-projector/src/semantic-source-repository.test.ts`

Expected: FAIL because `SemanticProjectionSource` does not exist.

- [ ] **Step 3: Define the page and source interfaces**

Create the following interfaces:

```ts
export interface SemanticPage<T> {
  items: readonly T[];
  nextCursor: string | null;
  source: { applicationServiceId: string; scopePath: string; baselineId: string; generationId: string; manifestId: string };
}

export interface SemanticProjectionSource {
  readSourceBinding(scope: GenerationScope, manifestId: string): Promise<SemanticSourceBinding>;
  readAssets(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssetSource>>;
  readAssertions(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssertionSource>>;
  readUnits(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<ArchitectureUnitProjection>>;
  readMembers(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<ArchitectureUnitMemberProjection>>;
  readUnitMappings(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<ArchitectureUnitMappingProjection>>;
  readAssetCoverage(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<SemanticCoverageSource>>;
  readAssetRelationships(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssetRelationshipSource>>;
  readAssertionRelationships(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssertionRelationshipSource>>;
  readArchitectureRelationships(scope: GenerationScope, source: SemanticSourceBinding, cursor: string | null, limit: number): Promise<SemanticPage<SemanticArchitectureRelationshipSource>>;
}
```

Use keyset pagination on the existing stable primary/identity fields. A caller-supplied offset, arbitrary generation, or missing Scope is invalid.

- [ ] **Step 4: Implement source Manifest and paged reads**

Implement `PrismaSemanticProjectionSource` using the existing repository’s Prisma client and naming conventions. Read the source projection and coverage manifests first; verify both belong to the requested exact Scope and the requested Baseline. For every page, validate returned rows with the existing core validators before exposing them to the materializer. Never join by semantic name alone; use assertion IDs, unit identities, asset IDs, and relationship identities.

- [ ] **Step 5: Run repository, Projector typecheck, and SQL contract tests**

Run: `pnpm --filter @specforge/graph-projector typecheck`

Expected: PASS.

Run: `pnpm exec vitest run --root . apps/graph-projector/src/semantic-source-repository.test.ts apps/graph-projector/src/repository-sql.test.ts`

Expected: PASS with exact-Scope predicates, keyset continuation, empty pages, and source-manifest mismatch coverage.

- [ ] **Step 6: Commit the source repository**

```bash
git add apps/graph-projector/src/semantic-source-repository.ts apps/graph-projector/src/semantic-source-repository.test.ts apps/graph-projector/src/repository.ts apps/graph-projector/src/index.ts
git commit -m "feat: read scoped semantic projection sources"
```

---

### Task 4: Add Typed Semantic Projection And Query Contracts To The Go Gateway

**Files:**
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\httpapi\semantic_types.go`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\httpapi\handler.go`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\httpapi\types.go`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\httpapi\handler_test.go`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\httpapi\semantic_handler_test.go`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\nebula\adapter.go`

**Interfaces:**
- Consumes: Task 1 `ProjectionIdentity`, Task 2 `SemanticVertex`/`SemanticEdge` batches, and exact-Scope request validation.
- Produces: internal `POST /v1/semantic-projections` build delivery and `POST /v1/architecture-queries` read contract; ordinary queries receive server-resolved ACTIVE identity.

- [ ] **Step 1: Write failing HTTP contract tests**

Add tests that reject a semantic projection with a missing source binding, a foreign Scope, a non-BUILDING Manifest, an invalid edge family, or a zero/non-positive projection ordinal. Add query tests that reject a client-supplied projection identity and verify that the handler injects the identity returned by `ActiveManifestResolver`. Add a fallback response test with `source: "POSTGRESQL_FALLBACK"` and `partial: true`.

- [ ] **Step 2: Run the Go semantic tests and verify they fail**

Run: `go test ./internal/httpapi ./internal/nebula`

Expected: FAIL because the semantic contract and routes do not exist.

- [ ] **Step 3: Define typed semantic contracts**

Add these Go types without accepting raw nGQL:

```go
type SemanticProjectionRequest struct {
    Scope Scope `json:"scope"`
    Projection ProjectionIdentity `json:"projection"`
    Source SemanticSourceBinding `json:"source"`
    Vertices []SemanticVertex `json:"vertices"`
    Edges []SemanticEdge `json:"edges"`
}

type SemanticQueryRequest struct {
    Scope Scope `json:"scope"`
    AssetType string `json:"assetType"`
    AssetID string `json:"assetId"`
    Budget SemanticQueryBudget `json:"budget"`
}

type SemanticQueryResult struct {
    Status string `json:"status"`
    Source string `json:"source"`
    Projection ProjectionIdentity `json:"projection"`
    MappingMode string `json:"mappingMode"`
    Assertions []SemanticAssertionResult `json:"assertions"`
    Targets SemanticTargets `json:"targets"`
    TracePath []SemanticTraceStep `json:"tracePath,omitempty"`
    Reason string `json:"reason,omitempty"`
    Partial bool `json:"partial"`
    TruncationReasons []string `json:"truncationReasons"`
}
```

`SemanticSourceBinding` must contain all eight Task 1 fields. Add the corresponding Go structs with the same field names and JSON tags. `SemanticVertex` and `SemanticEdge` must use closed string enums for the seven edge families. `SemanticQueryBudget` must contain positive `maxAssertions`, `maxTargets`, `maxTraceSteps`, `timeoutMs`, and `maxPayloadBytes`.

- [ ] **Step 4: Implement resolver-backed routes and validation**

Add `ActiveManifestResolver`:

```go
type ActiveManifestResolver interface {
    ResolveActive(context.Context, Scope) (ProjectionIdentity, error)
}
```

Add the semantic methods to a separate `SemanticClient` interface so legacy `NebulaClient` implementations remain compatible. Register `POST /v1/semantic-projections` for internal BUILDING delivery and `POST /v1/architecture-queries` for ordinary reads. The query handler must ignore any client projection field, resolve ACTIVE from PostgreSQL, and return a typed unavailable response if the resolver fails. The projection handler must verify the request identity and source binding before calling Nebula.

The separate client boundary is:

```go
type SemanticClient interface {
    ProjectSemantic(context.Context, SemanticProjectionRequest) (SemanticProjectionReceipt, error)
    QueryArchitecture(context.Context, SemanticQueryRequest, ProjectionIdentity) (SemanticQueryResult, error)
}
```

- [ ] **Step 5: Implement Nebula semantic statements with parameterized values**

Extend the official adapter with typed vertex/edge insertion and semantic lookup methods. Build statements only from validated enum-to-schema mappings and escaped parameter values; no request field may contain executable nGQL. Include Scope and Manifest predicates in every lookup and return `PROJECTION_IDENTITY_MISMATCH` when a result carries a foreign identity.

- [ ] **Step 6: Run Gateway tests and commit the contract**

Run: `gofmt -w internal/httpapi/semantic_types.go internal/httpapi/handler.go internal/httpapi/types.go internal/httpapi/semantic_handler_test.go internal/nebula/adapter.go`

Run: `go test ./...`

Expected: PASS for `cmd/server`, `internal/httpapi`, and `internal/nebula`, including legacy route compatibility and semantic route rejection cases.

```bash
git add apps/graph-gateway/internal/httpapi apps/graph-gateway/internal/nebula/adapter.go
git commit -m "feat: add typed semantic gateway contracts"
```

---

### Task 5: Project Deterministic Semantic Batches Through The Bounded Lifecycle

**Files:**
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-projector.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-projector.test.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\runtime.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\projector.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\generation-repository.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\generation-parity.ts`

**Interfaces:**
- Consumes: Task 2 `materializeSemanticProjection`, Task 3 `SemanticProjectionSource`, Task 4 typed Gateway client, and existing `NebulaProjectionCheckpoint` lifecycle.
- Produces: `buildSemanticGeneration(scope, manifestId)` and a generation receipt that can transition BUILDING -> VALIDATED -> ACTIVE only after semantic parity.

- [ ] **Step 1: Write failing lifecycle tests**

Test that a build reads only the pinned source Manifest, partitions each semantic family by stable key, persists one checkpoint per `(manifestId, family, logicalPartition)`, retries an idempotent batch, and never calls `publish` after a digest/count/probe mismatch. Test that an existing ACTIVE Manifest remains unchanged after any materialization, Gateway, or parity failure.

- [ ] **Step 2: Run the Projector tests and verify they fail**

Run: `pnpm exec vitest run --root . apps/graph-projector/src/semantic-projector.test.ts`

Expected: FAIL because the semantic Projector does not exist.

- [ ] **Step 3: Implement the semantic Projector with bounded checkpoints**

Implement this coordinator contract:

```ts
export interface SemanticGenerationBuildReceipt {
  manifestId: string;
  identity: ProjectionIdentity;
  partitionsCompleted: number;
  vertexCount: number;
  edgeCount: number;
  counts: Readonly<Record<string, number>>;
  bucketDigests: Readonly<Record<string, string>>;
  contentDigest: string;
  semanticProbes: Readonly<Record<string, string>>;
}

export async function buildSemanticGeneration(
  scope: GenerationScope,
  manifestId: string,
  dependencies: SemanticGenerationDependencies
): Promise<SemanticGenerationBuildReceipt>;
```

Use bounded page sizes and continuation cursors. Write batches with the same Manifest identity, record successful checkpoint versions, and resume from the last completed partition. A failed partition records an error and leaves the head pointer untouched. Do not create a second graph generation or alter ACTIVE during retry.

- [ ] **Step 4: Extend parity with semantic families and probes**

Compare control totals, per-family bucket digests, content digest, Scope, source binding, and semantic probes such as `asset -> assertion -> BIZ`, `asset -> assertion -> SYS`, `asset -> assertion -> TECH`, TRACE path preservation, and BLOCKED reason preservation. Return named mismatch codes; do not treat a matching total with a mismatched semantic probe as valid.

- [ ] **Step 5: Run Projector typecheck and focused lifecycle tests**

Run: `pnpm --filter @specforge/graph-projector typecheck`

Expected: PASS.

Run: `pnpm exec vitest run --root . apps/graph-projector/src/semantic-projector.test.ts apps/graph-projector/src/generation-parity.test.ts apps/graph-projector/src/generation-repository.test.ts`

Expected: PASS with retry, checkpoint, parity failure, and ACTIVE protection coverage.

- [ ] **Step 6: Commit the bounded semantic build**

```bash
git add apps/graph-projector/src/semantic-projector.ts apps/graph-projector/src/semantic-projector.test.ts apps/graph-projector/src/runtime.ts apps/graph-projector/src/projector.ts apps/graph-projector/src/generation-repository.ts apps/graph-projector/src/generation-parity.ts
git commit -m "feat: build bounded semantic graph generations"
```

---

### Task 6: Implement Asset-To-3A Query And PostgreSQL Fallback

**Files:**
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\architecture-map\semantic-query.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\architecture-map\semantic-query.test.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-query-service.ts`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-query-service.test.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\packages\core\src\index.ts`

**Interfaces:**
- Consumes: Task 2 semantic rows, Task 3 PostgreSQL source repository, Task 4 Gateway query contract, and the active Manifest resolver.
- Produces: budgeted `ArchitectureSemanticQueryResult` with `NEBULA`, `POSTGRESQL_FALLBACK`, or typed unavailable source state.

- [ ] **Step 1: Write query and fallback tests**

Test exact Scope and asset identity matching, all three target layers, TRACE path output, EXEMPT/BLOCKED reasons, budget truncation, active-Manifest identity on every result, Nebula unavailable fallback, and parity mismatch refusal. Add a test proving a result never combines Nebula rows from one Manifest with PostgreSQL rows from another Baseline or generation.

- [ ] **Step 2: Run query tests and verify they fail**

Run: `pnpm exec vitest run --root . packages/core/src/architecture-map/semantic-query.test.ts apps/graph-projector/src/semantic-query-service.test.ts`

Expected: FAIL because the query types and service do not exist.

- [ ] **Step 3: Implement the pure budgeted query model**

Create:

```ts
export interface ArchitectureSemanticQuery {
  applicationServiceId: string;
  scopePath: string;
  assetType: string;
  assetId: string;
  budget: { maxAssertions: number; maxTargets: number; maxTraceSteps: number; timeoutMs: number; maxPayloadBytes: number };
}

export interface ArchitectureSemanticQueryResult {
  status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  source: "NEBULA" | "POSTGRESQL_FALLBACK" | "NONE";
  projection: ProjectionIdentity;
  mappingMode: "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED";
  assertions: readonly SemanticAssertionResult[];
  targets: Readonly<{ BIZ: readonly SemanticTarget[]; SYS: readonly SemanticTarget[]; TECH: readonly SemanticTarget[] }>;
  tracePath: readonly SemanticTraceStep[];
  reason?: string;
  truncationReasons: readonly string[];
}

export function normalizeArchitectureSemanticQuery(input: ArchitectureSemanticQuery): ArchitectureSemanticQuery;
```

Reject non-positive or over-capacity budgets, enforce exact Scope, and apply truncation in the order assertions, targets, trace steps, then payload bytes. The result must include the active identity even when no target is found.

- [ ] **Step 4: Implement graph-first service with explicit PostgreSQL oracle fallback**

The service resolves ACTIVE once, asks the Gateway for a semantic query using that identity internally, validates the returned identity, and returns `NEBULA` only for a complete matching response. On transport unavailability it executes the same normalized query against PostgreSQL read models and returns `POSTGRESQL_FALLBACK`. On identity/parity mismatch it returns `UNAVAILABLE` with a named reason and does not silently fall back.

- [ ] **Step 5: Run core and Projector query tests**

Run: `pnpm --filter @specforge/core typecheck; pnpm --filter @specforge/graph-projector typecheck`

Expected: PASS.

Run: `pnpm exec vitest run --root . packages/core/src/architecture-map/semantic-query.test.ts apps/graph-projector/src/semantic-query-service.test.ts`

Expected: PASS with exact-Scope, budget, fallback, and mixed-Manifest rejection coverage.

- [ ] **Step 6: Commit the query/fallback increment**

```bash
git add packages/core/src/architecture-map/semantic-query.ts packages/core/src/architecture-map/semantic-query.test.ts packages/core/src/index.ts apps/graph-projector/src/semantic-query-service.ts apps/graph-projector/src/semantic-query-service.test.ts
git commit -m "feat: query semantic architecture with postgres fallback"
```

---

### Task 7: Verify End-To-End Semantic Publication And Compatibility

**Files:**
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\semantic-integration.test.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-projector\src\gateway.test.ts`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\apps\graph-gateway\internal\nebula\compatibility_test.go`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\deploy\graph\verify-projection.ps1`
- Create: `C:\Users\69529\OneDrive\文档\SpecForge\deploy\graph\verify-semantic-projection.ps1`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\docs\operations\graph-projection-verification.md`

**Interfaces:**
- Consumes: Tasks 1-6 complete semantic build, query, parity, and lifecycle contracts.
- Produces: repeatable local verification evidence; no claim of multi-node or billion-scale production readiness.

- [ ] **Step 1: Write the integration scenario**

Build one exact-Scope fixture containing one asset for each mapping mode, one BIZ/SYS/TECH unit, one assertion relationship, one asset relationship, and one architecture mapping. Assert the generated batch, Gateway payload, checkpoint records, parity report, ACTIVE pointer, and query response all carry the same Manifest and source binding.

- [ ] **Step 2: Run the integration test against the existing local topology**

Run: `pnpm exec vitest run --root . apps/graph-projector/src/semantic-integration.test.ts`

Expected: PASS with a local deterministic fixture; if Nebula is unavailable, the test must still prove PostgreSQL fallback and record `POSTGRESQL_FALLBACK` rather than fabricate graph success.

- [ ] **Step 3: Add one-shot semantic verification commands**

Implement `deploy/graph/verify-semantic-projection.ps1` with strict parameters for the exact Scope, source Manifest IDs, database URL, Gateway URL, and optional managed compose mode. It must validate the script path, reject a missing compose file, use a temporary verification project name, wait for health, run the semantic build, query all three layers, check parity, and clean only its own temporary resources. Reuse the existing failure-code style such as `GRAPH_LIVE_COMPOSE_START_FAILED`; never stop or delete the main application stack.

- [ ] **Step 4: Preserve legacy compatibility and document evidence limits**

Run the existing legacy projection/traversal tests alongside semantic tests. Document that local single-node Nebula compatibility, semantic parity, and PostgreSQL fallback are verified; external multi-node, Kubernetes, backup/restore, and `10M`/`100M`/`1B` capacity tiers remain unverified Phase 2/3 work.

- [ ] **Step 5: Run the consolidated verification**

Run:

```powershell
pnpm db:generate
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/graph-projector typecheck
pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** packages/core/src/graph/semantic-projection.test.ts packages/core/src/architecture-map/semantic-query.test.ts apps/graph-projector/src/semantic-projector.test.ts apps/graph-projector/src/semantic-integration.test.ts apps/graph-projector/src/generation-parity.test.ts
go test ./...
git diff --check
```

Expected: all listed checks pass; any missing package-local Vitest link is recorded as an environment note only when the repository-root runner passes the same tests.

- [ ] **Step 6: Commit the verification increment**

```bash
git add apps/graph-projector/src/semantic-integration.test.ts apps/graph-projector/src/gateway.test.ts apps/graph-gateway/internal/nebula/compatibility_test.go deploy/graph/verify-projection.ps1 deploy/graph/verify-semantic-projection.ps1 docs/operations/graph-projection-verification.md
git commit -m "test: verify semantic projection publication"
```

---

### Task 8: Synchronize Design Facts And Close The Implementation Session

**Files:**
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\docs\adr\0036-bounded-nebula-knowledge-projection-generations.md`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\docs\TODO.md`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\docs\superpowers\specs\2026-08-20-nebula-3a-semantic-projection-core-design.md`
- Modify: `C:\Users\69529\OneDrive\文档\SpecForge\docs\superpowers\plans\2026-08-20-nebula-3a-semantic-projection-core.md`

**Interfaces:**
- Consumes: implementation commits and exact command results from Tasks 1-7.
- Produces: synchronized MCP ADR/Proposal/Context Pack/Evidence/backlog facts, a closed exact-Scope design session, and a precise distinction between implemented semantic core and deferred production phases.

- [ ] **Step 1: Update canonical records with exact evidence**

Record the semantic schema version, source-manifest binding, edge-family counts, mapping-mode counts, parity result, fallback result, verification script result, and every command’s exit result. Mark only the semantic core as implemented; keep Phase 2 production operations and Phase 3 scale certification deferred with owner, trigger, and rationale.

- [ ] **Step 2: Synchronize and read back the selected design facts**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-bounded-nebula-knowledge-projection-generations,adr-deterministic-3a-knowledge-projections'
pnpm design-facts:sync
pnpm design-facts:check
$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'
$env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'
pnpm design-facts:federation:check
```

Expected: sync `complete`; selected ADRs `verified`; missing, mismatched, out-of-Scope, and blocked lists empty; federation `blocking=false`.

- [ ] **Step 3: Close the exact implementation session**

Run the same session ID returned by the implementation preflight:

```powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session "$SPECFORGE_IMPLEMENTATION_SESSION_ID" --status CONVERGED --evidence "semantic-schema=nebula.3a.semantic.v1,source-binding=verified,semantic-parity=pass,postgresql-fallback=pass,verification-script=pass,design-facts-sync=complete,design-facts-check=verified-no-issues,federation-check=blocking-false,git-diff-check=no-errors"
```

Expected: set `SPECFORGE_IMPLEMENTATION_SESSION_ID` to the exact session ID returned by the implementation preflight before running this command; the exact session closes as `CONVERGED`. If any MCP write or read-back fails, record `MCP synchronization blocked`, the failure reason, and the retry trigger in the ADR and backlog instead of claiming completion.

- [ ] **Step 4: Run the final documentation and repository checks**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only the user’s pre-existing `outputs/` and `scripts/build-design-code-challenge-workbook.mjs` remain untracked.

- [ ] **Step 5: Commit the synchronized closure**

```bash
git add docs/adr/0036-bounded-nebula-knowledge-projection-generations.md docs/TODO.md docs/superpowers/specs/2026-08-20-nebula-3a-semantic-projection-core-design.md docs/superpowers/plans/2026-08-20-nebula-3a-semantic-projection-core.md
git commit -m "docs: close semantic projection design evidence"
```

## Self-Review Checklist

- **Spec coverage:** Tasks 1-2 cover source binding, vertex/edge families, mapping modes, stable ordinals, and deterministic materialization; Task 3 covers exact-Scope PostgreSQL sources and keyset pagination; Task 4 covers typed build/query contracts and server-side ACTIVE resolution; Task 5 covers checkpoints, lifecycle, and publication gates; Task 6 covers budgeted query and PostgreSQL fallback; Task 7 covers parity, local compatibility, and verification isolation; Task 8 covers MCP synchronization, evidence, and deferred-phase bookkeeping.
- **No ambiguous implementation placeholders:** Every task names exact files, interfaces, tests, commands, expected results, and commit boundaries. Phase 2/3 are explicitly deferred capabilities, not unfinished instructions hidden inside a task.
- **Type consistency:** Task 1 owns `SemanticSourceBinding` and `semanticProjectionIdentity`; Task 2 returns `SemanticProjectionBatch`; Task 3 supplies pages to Task 5; Task 4 defines the Go transport boundary; Task 5 produces the build receipt consumed by Task 6/7; Task 8 consumes only evidence from completed tasks.
- **Scope safety:** Every read, write, checkpoint, query, and response carries the exact application-service Scope; cross-Scope and mixed-Manifest cases are tested as failures.
- **Authority safety:** No task makes NebulaGraph authoritative or lets a PostgreSQL fallback publish an unvalidated generation.
