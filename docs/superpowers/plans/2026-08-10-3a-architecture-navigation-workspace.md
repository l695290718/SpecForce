# 3A Architecture Navigation Workspace Implementation Plan

## Execution Status (2026-08-10)

- [x] Tasks 0-8 implemented locally: v2 contracts, PostgreSQL read model, leased Projector, shared query service, MCP operations, Web principal boundary, bilingual read-only workspace, and Docker packaging.
- [x] Focused Core, Query, Projector, MCP, and Web tests; five-package typecheck; production build with the Windows standalone workaround; and Compose configuration verification.
- [x] Task 9 governance closure: the exact Designer Scope ADR, implemented Proposal, Context Pack, managed assets, Evidence, typed links, Manifest read-back, federation reconciliation, and the same preflight session are synchronized; session status is `CONVERGED`.
- [ ] External PostgreSQL Projector e2e, browser desktop/mobile visual acceptance, production identity, and Knowledge-Assertion-aware Nebula 3A projection remain deferred with owner, trigger, and rationale in `docs/TODO.md`.

The unchecked procedural boxes below describe the original execution recipe. The status above is the authoritative completion record for this implementation run; deferred checks are intentionally not represented as passed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an exact-Scope, read-only 3A Web and MCP browser over immutable official Knowledge Baselines, backed by an asynchronously materialized PostgreSQL projection.

**Architecture:** MCP submits an idempotent projection build job; a separate leased Knowledge Projector writes bounded Baseline-bound node and edge batches and atomically publishes an immutable v2 Manifest. Web and MCP use one `@specforge/knowledge-query` service for authorized keyset search, resumable traversal, detail, alignment, and node-and-edge Baseline drift.

**Tech Stack:** TypeScript 5.7, Node.js 22, Next.js 15, React 19, Prisma 6, PostgreSQL 16, MCP SDK 1.29, Vitest 2, Tailwind CSS 3, Docker Compose.

## Global Constraints

- Owning application service is exactly `com.huawei.celon.desiner` with scope path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Open a new exact-Scope Design Change Session before implementation and close the same session only after focused verification and MCP reconciliation.
- Official browser inputs have `publishedAt` and status `PUBLISHED` or `SUPERSEDED`; `PUBLISHED` remains the active default.
- Projection schema is exactly `3a.v2`; Profile ID and version are explicit and legacy Manifests are never guessed or silently backfilled.
- PostgreSQL remains authoritative. Projection jobs, nodes, edges, and continuations are derived or operational records; NebulaGraph is outside this increment.
- MCP is the formal write boundary. Web can write only expiring traversal continuation state.
- Every build, query, row, cursor, continuation, count, and error is tenant- and exact-application-service-Scope safe.
- Default traversal budgets are depth 2, 200 nodes, 400 edges, 100 paths, 2 seconds, and 512 KiB. Hard caps are depth 5, 1,000 nodes, 2,000 edges, 1,000 paths, 5 seconds, and 2 MiB.
- English is canonical. Human-facing Chinese fields are complete overlays; technical IDs, codes, digests, versions, and Scope values are not translated.
- The browser is read-only and must never synthesize relationships, Evidence, identity mappings, or Chinese text.

## File Structure

- `packages/core/src/knowledge/projection-v2.ts`: pure v2 projection, build, official-Baseline, and drift contracts.
- `packages/core/src/__tests__/knowledge-projection-v2.test.ts`: deterministic contract and node/edge drift tests.
- `prisma/schema.prisma` and `prisma/migrations/20260810_3a_navigation_read_model/migration.sql`: build, generation, Manifest, node, edge, continuation, and exact-Scope indexes.
- `apps/mcp-server/src/knowledge/projection-build.ts`: authorized MCP-side idempotent build submission only.
- `apps/knowledge-projector/`: leased asynchronous PostgreSQL materializer and health runtime.
- `packages/knowledge-query/`: shared read service, Prisma adapter, typed errors, cursor signing, and continuation store.
- `apps/mcp-server/src/tools.ts`: projection-build/status and 3A read tool adapters.
- `apps/web/lib/3a/`: request-principal resolution, service construction, and server-side query facade.
- `apps/web/app/architecture/3a/` and `apps/web/components/three-a/`: read-only route, lanes, list, detail, alignment, drift, and typed states.
- `deploy/knowledge-projector.Dockerfile`, `deploy/compose.yaml`, and `deploy/scripts/verify-compose.ps1`: production Worker packaging and verification.
- `docs/adr/0022-3a-architecture-navigation-workspace.md`, `docs/design-facts/baseline-manifest.json`, and `docs/TODO.md`: dual-record closure and deferred 3A graph projection.

---

### Task 0: Exact-Scope Implementation Preflight

**Files:**
- Read: `docs/superpowers/specs/2026-08-10-3a-architecture-navigation-design.md`
- Read: `docs/adr/0022-3a-architecture-navigation-workspace.md`
- Generated by command: `.specforge/design-context/`

**Interfaces:**
- Consumes: approved Spec, reconciled design facts, exact Designer Scope.
- Produces: one open implementation `DesignChangeSession` receipt stored as `$sessionId` for Task 10.

- [ ] **Step 1: Run the exact-Scope implementation preflight**

```powershell
$receipt = pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Implement the approved PostgreSQL-first 3A Architecture Navigation Workspace, asynchronous projection build, shared query service, Web view, and MCP read contracts." --affected "adr-3a-architecture-navigation-workspace,adr-deterministic-3a-knowledge-projections,api-specforge-3a-projection-build,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model,rule-specforge-3a-projection-publication" --evidence "approved-3a-navigation-spec,approved-3a-navigation-plan" | Out-String
$sessionId = [regex]::Match($receipt, 'design-change-session:[0-9a-f-]+').Value
if (-not $sessionId) { throw 'DESIGN_CHANGE_SESSION_RECEIPT_MISSING' }
$sessionId
```

Expected: an `OPEN` receipt in the exact Designer Scope, a non-empty design-context digest, the six affected facts, and `reconciliationBlocking=false`.

- [ ] **Step 2: Stop on any preflight mismatch**

```powershell
if ($receipt -notmatch 'com\.huawei\.celon\.desiner' -or $receipt -notmatch 'pf-huawei/product-celon/subproduct-platform/module-celon-designer/com\.huawei\.celon\.desiner') {
  throw 'DESIGN_CHANGE_SESSION_SCOPE_MISMATCH'
}
```

Expected: no exception. Do not edit implementation files when this check fails.

### Task 1: Core v2 Projection And Published-History Contracts

**Files:**
- Create: `packages/core/src/knowledge/projection-v2.ts`
- Modify: `packages/core/src/knowledge/index.ts`
- Modify: `packages/core/src/knowledge/types.ts`
- Create: `packages/core/src/__tests__/knowledge-projection-v2.test.ts`

**Interfaces:**
- Consumes: `ArchitectureScopeRef`, `AnalysisProfile`, `KnowledgeAssertion`, `Baseline`, and `KnowledgeProjectionRelationship`.
- Produces: `ProjectionBuildJob`, `ProjectionManifestV2`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, `PublishedBaselineDrift`, `isOfficialBaseline`, `projectionBuildKey`, and `comparePublishedBaselines`.

- [ ] **Step 1: Write failing official-Baseline and node/edge drift tests**

```ts
import { describe, expect, it } from "vitest";
import { comparePublishedBaselines, isOfficialBaseline, projectionBuildKey } from "../knowledge/projection-v2";

describe("3A projection v2", () => {
  it("accepts active and historical official publications only", () => {
    expect(isOfficialBaseline({ status: "PUBLISHED", publishedAt: "2026-08-10T00:00:00.000Z" })).toBe(true);
    expect(isOfficialBaseline({ status: "SUPERSEDED", publishedAt: "2026-08-09T00:00:00.000Z" })).toBe(true);
    expect(isOfficialBaseline({ status: "BLOCKED", publishedAt: "2026-08-09T00:00:00.000Z" })).toBe(false);
    expect(isOfficialBaseline({ status: "PUBLISHED" })).toBe(false);
  });

  it("detects a relationship-only change", () => {
    const drift = comparePublishedBaselines(fixturePublishedComparison({ targetEdgeConfidence: 0.7 }));
    expect(drift.items).toContainEqual(expect.objectContaining({ entityKind: "EDGE", change: "CHANGED" }));
    expect(drift.baseBaselineId).toBe("baseline-1");
    expect(drift.targetBaselineId).toBe("baseline-2");
  });

  it("excludes timestamps and attempts from the canonical build key", () => {
    expect(projectionBuildKey(buildKeyInput({ attempt: 1 }))).toBe(projectionBuildKey(buildKeyInput({ attempt: 9 })));
  });
});
```

- [ ] **Step 2: Run the focused Core test and verify failure**

Run: `pnpm --filter @specforge/core exec vitest run src/__tests__/knowledge-projection-v2.test.ts`

Expected: FAIL because `projection-v2.ts` does not exist.

- [ ] **Step 3: Add the exact v2 public contracts**

```ts
export type ProjectionBuildStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";

export interface ProjectionBuildJob extends ArchitectureScopeRef {
  id: string;
  buildKey: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: "3a.v2";
  status: ProjectionBuildStatus;
  attempt: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  checkpoint: { assertionSortKey?: string; relationshipVersion?: string };
  nodeCount: number;
  edgeCount: number;
  errorCode?: string;
  diagnosticRef?: string;
}

export interface ProjectionManifestV2 extends ArchitectureScopeRef {
  id: string;
  baselineId: string;
  generationId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: "3a.v2";
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  inputDigest: string;
  contentDigest: string;
  nodeCount: number;
  edgeCount: number;
  publishedAt: string;
}

export interface KnowledgeProjectionNode extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  assertionId: string;
  semanticIdentity: string;
  layer: ArchitectureLayer;
  sortKey: string;
  acceptedAssetType?: AssetType;
  acceptedAssetId?: string;
  contentDigest: string;
}

export interface KnowledgeProjectionEdge extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  relationshipIdentity: string;
  relationshipAssertionId?: string;
  relationshipEventId?: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  sourceSemanticIdentity: string;
  targetSemanticIdentity: string;
  relationCode: string;
  confidence: number;
  relationshipVersion: string;
  contentDigest: string;
}
```

- [ ] **Step 4: Implement official history, canonical build key, and pure drift**

```ts
export function isOfficialBaseline(value: Pick<Baseline, "status" | "publishedAt">): boolean {
  return (value.status === "PUBLISHED" || value.status === "SUPERSEDED") && Boolean(value.publishedAt);
}

export function projectionBuildKey(input: ProjectionBuildKeyInput): string {
  return contentDigest({
    architectureScope: input.architectureScope,
    baselineId: input.baselineId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    projectionSchemaVersion: input.projectionSchemaVersion,
    sourceRevisionIds: [...input.sourceRevisionIds].sort(),
    relationshipVersion: input.relationshipVersion,
    query: canonicalizeRecord(input.query)
  });
}

export function comparePublishedBaselines(input: PublishedBaselineComparisonInput): PublishedBaselineDrift {
  assertComparableOfficialBaselines(input);
  const nodeItems = compareByStableKey(input.baseNodes, input.targetNodes, (node) => node.semanticIdentity, "NODE");
  const edgeItems = compareByStableKey(
    input.baseEdges,
    input.targetEdges,
    (edge) => [edge.sourceSemanticIdentity, edge.relationCode, edge.targetSemanticIdentity, edge.relationshipIdentity].join("|"),
    "EDGE"
  );
  const items = [...nodeItems, ...edgeItems].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  return { baseBaselineId: input.baseBaseline.id, targetBaselineId: input.targetBaseline.id, baseManifestId: input.baseManifest.id, targetManifestId: input.targetManifest.id, architectureScope: input.baseBaseline.architectureScope, items, digest: contentDigest(items) };
}
```

- [ ] **Step 5: Export the contracts and run Core verification**

Run: `pnpm --filter @specforge/core typecheck; pnpm --filter @specforge/core exec vitest run src/__tests__/knowledge-projection-v2.test.ts src/__tests__/knowledge-projections.test.ts`

Expected: Core typecheck passes and both projection suites pass without changing legacy deterministic projection output.

- [ ] **Step 6: Commit the Core contract**

```powershell
git add packages/core/src/knowledge/projection-v2.ts packages/core/src/knowledge/index.ts packages/core/src/knowledge/types.ts packages/core/src/__tests__/knowledge-projection-v2.test.ts
git commit -m "feat: define 3A projection v2 contracts"
```

### Task 2: PostgreSQL Build, Projection, And Continuation Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260810_3a_navigation_read_model/migration.sql`
- Modify: `apps/mcp-server/src/persistence.ts`
- Create: `prisma/three-a-schema.test.ts`

**Interfaces:**
- Consumes: Task 1 v2 contracts and current exact-Scope Prisma conventions.
- Produces: `ProjectionBuildJob`, extended `ProjectionManifest`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, and `TraceContinuation` Prisma delegates and indexes.

- [ ] **Step 1: Write a failing Schema contract test**

```ts
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("defines exact-Scope 3A build, projection, and continuation storage", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const migration = await readFile("prisma/migrations/20260810_3a_navigation_read_model/migration.sql", "utf8");
  for (const model of ["ProjectionBuildJob", "KnowledgeProjectionNode", "KnowledgeProjectionEdge", "TraceContinuation"]) {
    expect(schema).toContain(`model ${model}`);
  }
  expect(migration).toContain('"ProjectionBuildJob_one_active_build_key"');
  expect(migration).toContain("WHERE status IN ('QUEUED', 'BUILDING')");
});
```

- [ ] **Step 2: Add Prisma models with exact-Scope uniqueness**

```prisma
model ProjectionBuildJob {
  dbId                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id                      String
  buildKey                String
  generationId            String
  baselineId              String
  profileId               String
  profileVersion          String
  projectionSchemaVersion String
  status                  String
  attempt                 Int      @default(1)
  leaseOwner              String?
  leaseExpiresAt          DateTime?
  checkpoint              Json     @default("{}") @db.JsonB
  nodeCount               Int      @default(0)
  edgeCount               Int      @default(0)
  errorCode               String?
  diagnosticRef           String?
  availableAt             DateTime @default(now())
  completedAt             DateTime?
  applicationServiceId    String
  scopePath               String
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@unique([applicationServiceId, scopePath, id], map: "ProjectionBuildJob_scope_id_key")
  @@unique([applicationServiceId, scopePath, buildKey, attempt], map: "ProjectionBuildJob_scope_build_attempt_key")
  @@index([status, availableAt, leaseExpiresAt, createdAt], map: "ProjectionBuildJob_claim_idx")
  @@index([applicationServiceId, scopePath, baselineId, profileId, profileVersion], map: "ProjectionBuildJob_scope_baseline_profile_idx")
}
```

Add `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, and `TraceContinuation` with `applicationServiceId` and `scopePath` in every unique key. Extend `ProjectionManifest` with nullable `profileId`, `profileVersion`, `generationId`, `inputDigest`, `contentDigest`, `nodeCount`, `edgeCount`, and `publishedAt` so legacy rows remain readable but cannot satisfy v2 queries.

- [ ] **Step 3: Add migration-level partial and keyset indexes**

```sql
CREATE UNIQUE INDEX "ProjectionBuildJob_one_active_build_key"
ON "ProjectionBuildJob" ("applicationServiceId", "scopePath", "buildKey")
WHERE status IN ('QUEUED', 'BUILDING');

CREATE INDEX "KnowledgeProjectionNode_search_idx"
ON "KnowledgeProjectionNode" ("applicationServiceId", "scopePath", "generationId", layer, "sortKey", "assertionId");

CREATE INDEX "KnowledgeProjectionEdge_source_idx"
ON "KnowledgeProjectionEdge" ("applicationServiceId", "scopePath", "generationId", "sourceAssertionId", "relationCode", "targetAssertionId");

CREATE INDEX "KnowledgeProjectionEdge_target_idx"
ON "KnowledgeProjectionEdge" ("applicationServiceId", "scopePath", "generationId", "targetAssertionId", "relationCode", "sourceAssertionId");

CREATE INDEX "TraceContinuation_expiry_idx"
ON "TraceContinuation" ("expiresAt");
```

Mirror the new tables and columns in `ensureMcpPersistenceSchema` so seed/dev bootstrap produces the same contract as Prisma migration. The fallback DDL must use the same exact-Scope unique keys and cannot omit the active-build partial index.

- [ ] **Step 4: Generate Prisma Client and verify migration SQL**

Run: `pnpm db:generate; pnpm exec prisma validate`

Expected: Prisma Client generation and schema validation pass.

- [ ] **Step 5: Run the focused Schema contract test**

Run: `node .\node_modules\vitest\vitest.mjs run prisma/three-a-schema.test.ts`

Expected: Prisma model, migration, active-build uniqueness, exact-Scope indexes, and bootstrap-DDL parity checks pass.

- [ ] **Step 6: Commit the schema increment**

```powershell
git add prisma/schema.prisma prisma/migrations/20260810_3a_navigation_read_model/migration.sql prisma/three-a-schema.test.ts apps/mcp-server/src/persistence.ts
git commit -m "feat: add 3A projection read model"
```

### Task 3: Idempotent MCP Build Submission And Leased Knowledge Projector

**Files:**
- Create: `apps/mcp-server/src/knowledge/projection-build.ts`
- Create: `apps/mcp-server/src/knowledge/projection-build.test.ts`
- Create: `apps/knowledge-projector/package.json`
- Create: `apps/knowledge-projector/tsconfig.json`
- Create: `apps/knowledge-projector/src/index.ts`
- Create: `apps/knowledge-projector/src/repository.ts`
- Create: `apps/knowledge-projector/src/materializer.ts`
- Create: `apps/knowledge-projector/src/runtime.ts`
- Create: `apps/knowledge-projector/src/main.ts`
- Create: `apps/knowledge-projector/src/materializer.test.ts`
- Create: `apps/knowledge-projector/src/repository.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, Task 2 tables, current `RelationshipEvent` snapshots, promoted asset `knowledgeRevision.sourceAssertionId`, and accepted identity decisions.
- Produces: `requestProjectionBuild`, `ProjectionBuildRepository`, `ProjectionMaterializer.processOnce`, and an exact-Scope `/health` endpoint.

- [ ] **Step 1: Write failing Worker closure and recovery tests**

```ts
it("fails closed when one endpoint resolves to two Baseline assertions", async () => {
  const result = await materializer.process(buildWithAmbiguousEndpoint());
  expect(result).toEqual({ status: "FAILED", errorCode: "PROJECTION_ENDPOINT_AMBIGUOUS" });
  expect(repository.publish).not.toHaveBeenCalled();
});

it("resumes from a persisted batch checkpoint after lease recovery", async () => {
  await repository.seedBuildingJob({ checkpoint: { assertionSortKey: "SYS|customer" }, leaseExpiresAt: expiredAt });
  const result = await materializer.processOnce();
  expect(result.resumed).toBe(true);
  expect(repository.writtenAssertionIds()).not.toContain("assertion-before-customer");
});

it("returns one active job for the same exact-Scope canonical build key", async () => {
  const first = await requestProjectionBuild(buildRequest);
  const second = await requestProjectionBuild(buildRequest);
  expect(second.id).toBe(first.id);
  expect(second.buildKey).toBe(first.buildKey);
  expect(second.status).toBe("QUEUED");
});
```

- [ ] **Step 2: Implement idempotent build submission as a short transaction**

```ts
export async function requestProjectionBuild(input: ProjectionBuildRequest): Promise<ProjectionBuildSubmission> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const baseline = await requireOfficialBaseline(scope, input.baselineId);
  const profile = requireAnalysisProfile(input.profileId, input.profileVersion);
  const buildKey = projectionBuildKey({ architectureScope: scope, baselineId: baseline.id, profileId: profile.id, profileVersion: profile.version, projectionSchemaVersion: "3a.v2", sourceRevisionIds: baseline.manifest.sourceRevisionIds, relationshipVersion: baseline.manifest.relationshipVersion, query: input.query ?? {} });
  return prisma.$transaction((tx) => createOrReturnBuild(tx, { scope, baseline, profile, buildKey }), { isolationLevel: "Serializable" });
}
```

The transaction returns an existing published v2 Manifest, an active `QUEUED` or `BUILDING` job, or a new `QUEUED` attempt. It never performs assertion or relationship projection work.

Run `pnpm install` after adding `apps/knowledge-projector/package.json`; commit the resulting `pnpm-lock.yaml` with this task.

- [ ] **Step 3: Implement lease compare-and-set and bounded batch persistence**

```ts
export interface ProjectionBuildRepository {
  claim(owner: string, now: Date, leaseExpiresAt: Date): Promise<ProjectionBuildJob | null>;
  loadBatch(job: ProjectionBuildJob, limit: number): Promise<ProjectionSourceBatch>;
  writeBatch(job: ProjectionBuildJob, owner: string, batch: MaterializedProjectionBatch): Promise<boolean>;
  publish(job: ProjectionBuildJob, owner: string, result: ProjectionPublication): Promise<ProjectionManifestV2>;
  fail(job: ProjectionBuildJob, owner: string, code: string, diagnosticRef: string): Promise<boolean>;
  health(scope: ArchitectureScopeRef, now: Date): Promise<ProjectionBuildHealth>;
}
```

Use `FOR UPDATE SKIP LOCKED`, a renewable 30-second lease, default batch size 500, deterministic assertion sort keys, and compare-and-set updates that include job ID, exact Scope, `status = 'BUILDING'`, lease owner, and unexpired lease.

- [ ] **Step 4: Resolve historical relationships without guesses**

```ts
export function resolveProjectionEdge(input: ProjectionEndpointResolutionInput): KnowledgeProjectionEdge {
  const source = resolveUniqueAssertion(input.relationship.source, input.assertionsBySemanticIdentity, input.assertionsByPromotedAsset);
  const target = resolveUniqueAssertion(input.relationship.target, input.assertionsBySemanticIdentity, input.assertionsByPromotedAsset);
  if (source.length === 0 || target.length === 0) throw new ProjectionBuildError("PROJECTION_ENDPOINT_UNRESOLVED");
  if (source.length !== 1 || target.length !== 1) throw new ProjectionBuildError("PROJECTION_ENDPOINT_AMBIGUOUS");
  return projectionEdgeFrom(input, source[0]!, target[0]!);
}
```

Reconstruct relationship state at `BaselineManifest.relationshipVersion` from append-only `RelationshipEvent.snapshot`. Never substitute current `AssetLink` state and never silently skip an unresolved relationship assertion.

- [ ] **Step 5: Publish only through a short final transaction**

```ts
return prisma.$transaction(async (tx) => {
  const locked = await requireOwnedUnexpiredBuild(tx, job, owner);
  const counts = await countGenerationRows(tx, locked);
  if (counts.nodeCount !== publication.nodeCount || counts.edgeCount !== publication.edgeCount) throw new Error("PROJECTION_COUNT_MISMATCH");
  await assertEndpointClosure(tx, locked);
  const manifest = await tx.projectionManifest.create({ data: manifestData(locked, publication, counts) });
  await tx.projectionBuildJob.update({ where: { dbId: locked.dbId }, data: { status: "READY", nodeCount: counts.nodeCount, edgeCount: counts.edgeCount, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
  return projectionManifestFromRow(manifest);
});
```

- [ ] **Step 6: Add a polling runtime and sanitized health endpoint**

The runtime follows `apps/graph-projector/src/runtime.ts`: one non-overlapping polling loop, graceful SIGINT/SIGTERM shutdown, and `/health?applicationServiceId=...&scopePath=...`. Return only `status`, `code`, `queued`, `building`, `failed`, `oldestQueuedAgeSeconds`, and `lastPublishedAt`; never return SQL, credentials, raw exceptions, or source content.

- [ ] **Step 7: Run Worker verification**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/knowledge/projection-build.test.ts; pnpm --filter @specforge/knowledge-projector typecheck; pnpm --filter @specforge/knowledge-projector test`

Expected: unit tests pass for lease ownership, recovery, batching, endpoint failure, digest mismatch, idempotent publication, and sanitized health.

- [ ] **Step 8: Commit the projection runtime**

```powershell
git add apps/mcp-server/src/knowledge/projection-build.ts apps/mcp-server/src/knowledge/projection-build.test.ts apps/knowledge-projector pnpm-lock.yaml
git commit -m "feat: materialize 3A projections asynchronously"
```

### Task 4: Shared Exact-Scope Query Service, Cursors, And Continuations

**Files:**
- Create: `packages/knowledge-query/package.json`
- Create: `packages/knowledge-query/tsconfig.json`
- Create: `packages/knowledge-query/src/index.ts`
- Create: `packages/knowledge-query/src/types.ts`
- Create: `packages/knowledge-query/src/errors.ts`
- Create: `packages/knowledge-query/src/cursor.ts`
- Create: `packages/knowledge-query/src/service.ts`
- Create: `packages/knowledge-query/src/prisma-repository.ts`
- Create: `packages/knowledge-query/src/prisma-continuation-store.ts`
- Create: `packages/knowledge-query/src/service.test.ts`
- Create: `packages/knowledge-query/src/cursor.test.ts`

**Interfaces:**
- Consumes: Task 1 DTOs, normalized `ScopedPrincipal`, published v2 Manifests, and Task 2 Prisma delegates.
- Produces: `ThreeAProjectionQueryService`, `ThreeAQueryRepository`, `TraceContinuationStore`, signed cursor helpers, budgets, and typed query errors.

- [ ] **Step 1: Create the package manifest and install workspace dependencies**

```json
{
  "name": "@specforge/knowledge-query",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "dependencies": { "@prisma/client": "^6.1.0", "@specforge/core": "workspace:*" },
  "devDependencies": { "vitest": "^2.1.8" }
}
```

Run: `pnpm install`

Expected: `pnpm-lock.yaml` records `@specforge/knowledge-query` without adding a second Prisma or MCP SDK version.

- [ ] **Step 2: Write failing authorization-before-existence and cursor replay tests**

```ts
it("authorizes exact Scope before checking Baseline existence", async () => {
  await expect(service.listPublishedBaselines(unauthorizedRequest)).rejects.toMatchObject({ code: "SCOPE_ACCESS_DENIED" });
  expect(repository.listOfficialBaselines).not.toHaveBeenCalled();
});

it("rejects traversal continuation replay by another subject", async () => {
  const first = await service.traceArchitecturePath(traceRequestFor("subject-a"));
  await expect(service.traceArchitecturePath({ ...traceRequestFor("subject-b"), continuation: first.continuation })).rejects.toMatchObject({ code: "CURSOR_INVALID" });
});
```

- [ ] **Step 3: Define one shared semantic service**

```ts
export interface ThreeAProjectionQueryService {
  listPublishedBaselines(input: ScopedQueryInput): Promise<PublishedBaselineSummary[]>;
  listProjectionManifests(input: BaselineQueryInput): Promise<ProjectionManifestV2[]>;
  searchArchitectureFacts(input: SearchArchitectureFactsInput): Promise<SearchArchitectureFactsResult>;
  traceArchitecturePath(input: TraceArchitecturePathInput): Promise<TraceArchitecturePathResult>;
  getArchitectureFactDetail(input: ArchitectureFactDetailInput): Promise<ArchitectureFactDetail>;
  getArchitectureAlignment(input: ArchitectureAlignmentInput): Promise<ArchitectureAlignmentResult>;
  comparePublishedBaselines(input: ComparePublishedBaselinesInput): Promise<PublishedBaselineDrift>;
}
```

Every public method calls `authorizePrincipalScope` before repository existence, count, cursor-state, or detail reads. Every returned DTO includes `applicationServiceId`, `scopePath`, `baselineId`, `projectionManifestId`, `profileId`, `profileVersion`, `relationshipVersion`, and `resultDigest`.

- [ ] **Step 4: Implement HMAC keyset search cursors**

```ts
export interface SearchCursorPayload {
  version: 1;
  tenant: string;
  subject: string;
  scopeDigest: string;
  baselineId: string;
  projectionManifestId: string;
  filterDigest: string;
  sortKey: string;
  assertionId: string;
  expiresAt: string;
  keyId: string;
}

export function signSearchCursor(payload: SearchCursorPayload, key: Buffer): string {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}
```

Verification uses `timingSafeEqual`, validates expiry and every bound claim, and returns only `CURSOR_INVALID` for all client-visible failures.

- [ ] **Step 5: Implement server-held traversal continuations**

Store only a signed token containing `browseSessionId`, sequence, state digest, expiry, and key ID. Persist the bounded frontier and visited IDs in `TraceContinuation`, bound to tenant, subject, exact Scope, Baseline, Manifest, and query fingerprint. Consume the expected sequence with compare-and-set so stale replay fails.

- [ ] **Step 6: Enforce default and hard budgets**

```ts
export const defaultThreeABudget = { maxDepth: 2, maxNodes: 200, maxEdges: 400, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 } as const;
export const hardThreeABudget = { maxDepth: 5, maxNodes: 1_000, maxEdges: 2_000, maxPaths: 1_000, timeoutMs: 5_000, maxPayloadBytes: 2_097_152 } as const;
```

Return `RESULT_PARTIAL` metadata with one or more of `MAX_DEPTH`, `MAX_NODES`, `MAX_EDGES`, `MAX_PATHS`, `TIMEOUT`, or `MAX_PAYLOAD`; do not convert partial results into success without the metadata.

- [ ] **Step 7: Run package tests and typecheck**

Run: `pnpm --filter @specforge/knowledge-query typecheck; pnpm --filter @specforge/knowledge-query test`

Expected: tests pass for deterministic keyset ordering, authorization ordering, exact-Scope endpoint filtering, cursor tampering/expiry/replay, no duplicate traversal, budget truncation, official historical Baselines, published Manifest visibility, localization warnings, and node/edge drift.

- [ ] **Step 8: Commit the shared query boundary**

```powershell
git add packages/knowledge-query pnpm-lock.yaml
git commit -m "feat: add scoped 3A knowledge query service"
```

### Task 5: MCP Projection Build, Status, And Read Tools

**Files:**
- Modify: `apps/mcp-server/package.json`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/prompts.ts`
- Create: `apps/mcp-server/src/knowledge/query-adapter.ts`

**Interfaces:**
- Consumes: `requestProjectionBuild`, `ThreeAProjectionQueryService`, current request principal context, and MCP `registerJsonTool`.
- Produces: `request_3a_projection_build`, `get_3a_projection_build`, `list_3a_published_baselines`, `search_3a_architecture_facts`, `trace_3a_architecture_path`, `get_3a_architecture_fact`, `get_3a_alignment`, and `compare_3a_published_baselines`.

- [ ] **Step 1: Write failing MCP registration and permission tests**

```ts
it("registers 3A build as write and every browser operation as read", async () => {
  const tools = captureTools();
  expect(tools.get("request_3a_projection_build")?.metadata.readOnly).toBe(false);
  expect(tools.get("request_3a_projection_build")?.metadata.permissions).toContain("knowledge:write");
  for (const name of ["get_3a_projection_build", "list_3a_published_baselines", "search_3a_architecture_facts", "trace_3a_architecture_path", "get_3a_architecture_fact", "get_3a_alignment", "compare_3a_published_baselines"]) {
    expect(tools.get(name)?.metadata.readOnly).toBe(true);
    expect(tools.get(name)?.metadata.permissions).toContain("knowledge:read");
  }
});
```

- [ ] **Step 2: Register build and status tools**

```ts
registerJsonTool(server, "request_3a_projection_build", {
  title: "Request 3A projection build",
  description: "Creates or returns an idempotent exact-Scope asynchronous PostgreSQL projection build.",
  inputSchema: { architectureScope: architectureScopeSchema, baselineId: z.string().min(1), profileId: z.string().min(1), profileVersion: z.string().min(1), projectionSchemaVersion: z.literal("3a.v2"), query: z.record(z.unknown()).optional() },
  permissions: ["knowledge:write"],
  readOnly: false
}, requestProjectionBuild);
```

`get_3a_projection_build` returns sanitized status, counts, timestamps, published Manifest ID, error code, and diagnostic reference. It never returns lease owner, SQL, raw exception, credentials, or partial node/edge payloads.

- [ ] **Step 3: Register read tools over the shared service**

Each handler obtains the normalized request `ScopedPrincipal`, passes the exact `architectureScope`, and delegates to one `ThreeAProjectionQueryService` method. Do not call Prisma from `tools.ts`.

- [ ] **Step 4: Remove current-set drift from the browser contract without breaking legacy callers**

Keep `derive_3a_knowledge_projection` as a compatibility read during this increment, but mark it legacy in its description. New drift clients must call `compare_3a_published_baselines`; they cannot pass `currentAssertionIds`.

- [ ] **Step 5: Run MCP tests and typecheck**

Run: `pnpm --filter @specforge/mcp-server typecheck; pnpm --filter @specforge/mcp-server exec vitest run src/tools.test.ts src/auth.test.ts`

Expected: registration, normalized-principal propagation, seed-only development behavior, sibling-Scope denial, permission separation, sanitized status, and compatibility tests pass.

- [ ] **Step 6: Commit the MCP adapters**

```powershell
git add apps/mcp-server/package.json apps/mcp-server/src/tools.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/prompts.ts apps/mcp-server/src/knowledge/query-adapter.ts
git commit -m "feat: expose governed 3A MCP operations"
```

### Task 6: Web Principal Boundary And Server Query Facade

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/lib/3a/principal.ts`
- Create: `apps/web/lib/3a/service.ts`
- Create: `apps/web/lib/3a/url-state.ts`
- Create: `apps/web/lib/3a/principal.test.ts`
- Create: `apps/web/lib/3a/url-state.test.ts`

**Interfaces:**
- Consumes: normalized `ScopedPrincipal`, Next request headers/cookies, `ThreeAProjectionQueryService`, and existing locale state.
- Produces: `WebPrincipalResolver`, `resolveThreeARequest`, `parseThreeAUrlState`, and `createWebThreeAQueryService`.

- [ ] **Step 1: Write failing seed/non-seed and URL-state tests**

```ts
it("fails closed outside seed mode when no Web principal provider is configured", async () => {
  await expect(resolveWebPrincipal({ authMode: "production", provider: undefined })).rejects.toThrow("WEB_PRINCIPAL_RESOLVER_REQUIRED");
});

it("does not put locale in shareable 3A URL state", () => {
  expect(parseThreeAUrlState(new URLSearchParams("scope=com.huawei.celon.desiner&locale=zh"))).toEqual(expect.not.objectContaining({ locale: "zh" }));
});
```

- [ ] **Step 2: Define the provider boundary**

```ts
export interface WebPrincipalResolver {
  resolve(input: { headers: Headers; cookies: ReadonlyRequestCookies }): Promise<ScopedPrincipal>;
}

export async function resolveWebPrincipal(input: WebPrincipalResolutionInput): Promise<ScopedPrincipal> {
  if (input.authMode === "seed") return seedWebPrincipal();
  if (!input.provider) throw new Error("WEB_PRINCIPAL_RESOLVER_REQUIRED");
  return input.provider.resolve({ headers: input.headers, cookies: input.cookies });
}
```

Raw credentials cannot appear in the returned principal, logs, errors, continuation rows, or DTOs.

- [ ] **Step 3: Parse and normalize shareable route state**

```ts
export interface ThreeAUrlState {
  scope: string;
  baseline?: string;
  projection?: string;
  focus?: string;
  tab: "architecture" | "alignment" | "drift";
  mode: "lanes" | "list";
  direction: "upstream" | "downstream" | "both";
}
```

Ignore unknown keys, reject invalid enum values to defaults, and keep locale in the existing cookie/local-storage provider rather than in architecture URLs.

- [ ] **Step 4: Construct the shared service with injected Prisma and keys**

Read `SPECFORGE_3A_CURSOR_KEYS` as a key-ID to base64 secret map and `SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID` as the signing key. Non-seed startup fails with `THREE_A_CURSOR_KEY_REQUIRED` when keys are absent. Tests inject deterministic in-memory keys and repositories.

- [ ] **Step 5: Run Web facade tests**

Run: `pnpm --filter @specforge/web exec vitest run lib/3a/principal.test.ts lib/3a/url-state.test.ts; pnpm --filter @specforge/web typecheck`

Expected: exact-Scope authorization, fail-closed provider behavior, raw-token exclusion, URL defaults, and locale separation pass.

- [ ] **Step 6: Commit the Web server boundary**

```powershell
git add apps/web/package.json apps/web/lib/3a
git commit -m "feat: add Web 3A principal and query boundary"
```

### Task 7: Read-Only 3A Architecture Workspace

**Files:**
- Create: `apps/web/app/architecture/3a/page.tsx`
- Create: `apps/web/app/architecture/3a/loading.tsx`
- Create: `apps/web/app/architecture/3a/error.tsx`
- Create: `apps/web/components/three-a/three-a-workspace.tsx`
- Create: `apps/web/components/three-a/baseline-toolbar.tsx`
- Create: `apps/web/components/three-a/architecture-lanes.tsx`
- Create: `apps/web/components/three-a/architecture-path-list.tsx`
- Create: `apps/web/components/three-a/architecture-detail-drawer.tsx`
- Create: `apps/web/components/three-a/alignment-view.tsx`
- Create: `apps/web/components/three-a/published-baseline-drift-view.tsx`
- Create: `apps/web/components/three-a/projection-state-banner.tsx`
- Create: `apps/web/components/three-a/three-a-workspace.test.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/app/styles/globals.css`

**Interfaces:**
- Consumes: Task 6 request facade and Task 4 DTOs.
- Produces: `/architecture/3a`, three stable lanes, list fallback, detail drawer, alignment, drift, and typed failure states with no mutation controls.

- [ ] **Step 1: Write failing navigation, parity, and read-only tests**

```tsx
it("preserves exact Scope in the 3A navigation link", () => {
  render(<AppShellHarness pathname="/workspace" search="scope=com.huawei.celon.desiner" />);
  expect(screen.getByRole("link", { name: "3A 架构" })).toHaveAttribute("href", "/architecture/3a?scope=com.huawei.celon.desiner");
});

it("renders the same returned node IDs in lanes and list mode", () => {
  const { rerender } = render(<ThreeAWorkspace fixture={pathFixture} mode="lanes" />);
  const laneIds = visibleArchitectureIds();
  rerender(<ThreeAWorkspace fixture={pathFixture} mode="list" />);
  expect(visibleArchitectureIds()).toEqual(laneIds);
});

it("contains no design mutation controls", () => {
  render(<ThreeAWorkspace fixture={pathFixture} mode="lanes" />);
  expect(screen.queryByRole("button", { name: /edit|approve|promote|publish|编辑|批准|提升|发布/i })).toBeNull();
});
```

- [ ] **Step 2: Add navigation and complete bilingual copy**

Add `nav.threeA`, toolbar, tabs, directions, empty states, truncation reasons, build states, detail labels, localization warning, Evidence warning, and sanitized authorization/unavailable messages to both `messages.zh` and `messages.en`. Use Lucide `Waypoints` for the navigation item after Workspace and before Design Assets.

- [ ] **Step 3: Implement the server page and deterministic defaults**

The server page resolves principal and Scope first, chooses the active `PUBLISHED` Baseline by `publishedAt DESC, id ASC`, chooses the configured compatible published v2 Manifest, and initially loads a keyset-paginated BIZ catalog. An explicit historical `SUPERSEDED` Baseline is accepted only when it belongs to the same exact Scope.

- [ ] **Step 4: Implement stable lanes and list fallback**

Use a CSS grid with three named rows or columns, fixed node min/max dimensions, anchored focus, typed edges, and frontier controls. Do not use a force-directed canvas. Mobile defaults to list mode; both modes receive the same DTO and preserve all returned node and edge IDs.

- [ ] **Step 5: Implement detail, alignment, drift, and typed states**

The drawer shows canonical English, Chinese overlay, fact type, layer, aspect, domain, confidence, status, incoming/outgoing relationships, Evidence, source observations, revision, Baseline, Profile, questions, counter-evidence, and accepted asset mapping. Alignment uses explicit edges only. Drift renders `NODE` and `EDGE` items. State banners map every Spec error code without revealing unauthorized existence or counts.

- [ ] **Step 6: Add restrained motion and accessibility**

Animate only focus changes, lane entry, and drawer transitions with opacity/transform durations from 140 to 220 ms. Under `prefers-reduced-motion: reduce`, remove transform and transition motion. Provide keyboard focus order, visible focus rings, `aria-current` on tabs, semantic lists, and icon tooltips.

- [ ] **Step 7: Run component and type verification**

Run: `pnpm --filter @specforge/web exec vitest run components/three-a/three-a-workspace.test.tsx lib/3a/principal.test.ts lib/3a/url-state.test.ts; pnpm --filter @specforge/web typecheck`

Expected: navigation, URL restoration, BIZ default, any-layer search, bidirectional path, lane/list parity, detail, alignment, node/edge drift, localization warning, partial result, authorization denial, keyboard behavior, reduced motion, and read-only tests pass.

- [ ] **Step 8: Commit the Web workspace**

```powershell
git add apps/web/app/architecture/3a apps/web/components/three-a apps/web/components/app-shell.tsx apps/web/lib/i18n.ts apps/web/app/styles/globals.css
git commit -m "feat: add read-only 3A architecture workspace"
```

### Task 8: Worker Deployment, Integration Proof, And Visual Acceptance

**Files:**
- Create: `deploy/knowledge-projector.Dockerfile`
- Create: `deploy/knowledge-projector.Dockerfile.dockerignore`
- Modify: `deploy/compose.yaml`
- Modify: `deploy/compose.external-postgres.yaml`
- Modify: `deploy/scripts/verify-compose.ps1`
- Modify: `package.json`
- Modify: `deploy/README.md`
- Create: `apps/knowledge-projector/src/projection.e2e.test.ts`

**Interfaces:**
- Consumes: Tasks 2-7 and canonical Docker PostgreSQL.
- Produces: default Worker deployment, exact-Scope end-to-end evidence, health checks, desktop/mobile visual evidence, and rollback instructions.

- [ ] **Step 1: Package the Worker as a separate image**

```dockerfile
FROM node:22-bookworm-slim AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/knowledge-projector/package.json apps/knowledge-projector/package.json
COPY packages/core/package.json packages/core/package.json
COPY prisma ./prisma
COPY apps/knowledge-projector ./apps/knowledge-projector
COPY packages/core ./packages/core
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm --filter @specforge/knowledge-projector build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /workspace/apps/knowledge-projector/dist ./dist
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/prisma ./prisma
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Add Worker to the default and external-PostgreSQL Compose modes**

The default service uses the private `postgres` service, port `8091`, `restart: unless-stopped`, and a health check against `/health` with the exact Designer Scope. The external overlay removes the PostgreSQL dependency and supplies the same external `DATABASE_URL` as Web. Neither mode starts NebulaGraph for 3A.

- [ ] **Step 3: Add an exact-Scope E2E fixture**

The gated test creates two immutable official Baselines in one temporary Stream, publishes one v2 Manifest per Baseline through the Worker, includes one node-only and one relationship-only change, and verifies search, two-direction traversal, detail, alignment, drift, cursor replay denial, sibling-Scope denial, Worker restart recovery, and cleanup.

Run: `$env:SPECFORGE_3A_INTEGRATION='1'; pnpm --filter @specforge/knowledge-projector exec vitest run src/projection.e2e.test.ts`

Expected when the external integration environment is configured: one test suite passes against `localhost:15433/specforge_canonical` and removes all prefixed fixtures. In this run the gated suite was skipped and recorded as `DEFERRED_ENV_NOT_CONFIGURED`.

- [ ] **Step 4: Include new packages in root lifecycle scripts**

```json
{
  "build": "pnpm --filter @specforge/core build && pnpm --filter @specforge/knowledge-query build && pnpm --filter @specforge/knowledge-projector build && pnpm --filter @specforge/mcp-server typecheck && pnpm --filter @specforge/web build",
  "typecheck": "pnpm --filter @specforge/core typecheck && pnpm --filter @specforge/knowledge-query typecheck && pnpm --filter @specforge/knowledge-projector typecheck && pnpm --filter @specforge/mcp-server typecheck && pnpm --filter @specforge/web typecheck",
  "test": "pnpm --filter @specforge/core test && pnpm --filter @specforge/knowledge-query test && pnpm --filter @specforge/knowledge-projector test"
}
```

- [ ] **Step 5: Run the full focused phase gate once**

Run: `pnpm db:generate; pnpm typecheck; pnpm --filter @specforge/core exec vitest run src/__tests__/knowledge-projection-v2.test.ts src/__tests__/knowledge-projections.test.ts; pnpm --filter @specforge/knowledge-query test; pnpm --filter @specforge/knowledge-projector test; pnpm --filter @specforge/mcp-server exec vitest run src/tools.test.ts src/auth.test.ts; pnpm --filter @specforge/web exec vitest run components/three-a/three-a-workspace.test.tsx lib/3a/principal.test.ts lib/3a/url-state.test.ts; pnpm build`

Expected: all typechecks, focused suites, and production build pass. This is the phase-level validation point; do not rerun the full gate after every small edit.

- [ ] **Step 6: Verify Compose configuration and live health**

Run: `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly`

Expected: Web and Knowledge Projector images, internal PostgreSQL wiring, external PostgreSQL override, Worker health, and absence of a required Nebula 3A service all pass.

- [ ] **Step 7: Verify desktop and mobile rendering**

Start the service at `http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner`. Capture 1440x900 and 390x844 screenshots. This acceptance remains deferred until the Web visual harness is configured; it was not claimed as passed in this run.

- [ ] **Step 8: Document operations and rollback**

Document build-job health, lease recovery, failed-job retry, retention, cursor key rotation, external `DATABASE_URL`, and rollback. Rollback stops the Knowledge Projector and hides the navigation route; it does not delete official Baselines, authored facts, published Manifests, or PostgreSQL volumes.

- [ ] **Step 9: Commit deployment and acceptance evidence**

```powershell
git add deploy package.json apps/knowledge-projector/src/projection.e2e.test.ts
git commit -m "ops: deploy and verify 3A knowledge projector"
```

### Task 9: Dual-Record Governance Closure

**Files:**
- Modify: `docs/adr/0022-3a-architecture-navigation-workspace.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`
- Modify: `docs/superpowers/plans/2026-08-10-3a-architecture-navigation-workspace.md`

**Interfaces:**
- Consumes: `$sessionId`, all focused commands and operational evidence from Tasks 1-8.
- Produces: matching exact-Scope MCP ADR, implemented Proposal, Context Pack, four managed assets, Evidence, typed links, reconciled backlog, and a closed implementation session.

- [ ] **Step 1: Update repository records from actual evidence**

Change ADR status from design-approved to implemented only when Tasks 1-8 pass. Change Manifest `proposalStatus` from `approved` to `implemented`, replace design-only status text, and add exact command/result evidence. Keep the Knowledge-Assertion-aware Nebula 3A projection and production IdP entries deferred.

- [ ] **Step 2: Validate the design-fact Manifest locally**

Run: `node .\node_modules\vitest\vitest.mjs run scripts/sync-design-facts.test.ts scripts/design-fact-manifest.test.ts`

Expected: both suites pass, including explicit Proposal lifecycle, unique IDs, complete localization, managed asset schemas, and directional relation types.

- [ ] **Step 3: Synchronize only the 3A decision through MCP**

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-3a-architecture-navigation-workspace'
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: the ADR, implemented Proposal, Context Pack, four managed assets, Evidence, and links are written and read back in the exact Designer Scope with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.

- [ ] **Step 4: Run exact-Scope federation reconciliation**

```powershell
$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'
$env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'
pnpm design-facts:federation:check
```

Expected: `blocking:false` and empty issue counts.

- [ ] **Step 5: Close the implementation Design Change Session**

```powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session $sessionId --status CONVERGED --evidence "core-and-query-tests=PASS,projection-worker-tests=PASS,mcp-and-web-tests=PASS,production-build-no-standalone=PASS,compose-check=PASS,3a-e2e=DEFERRED_ENV_NOT_CONFIGURED,design-facts-readback=PASS,federation-check=blocking-false,web-visual-acceptance=DEFERRED_ENV_NOT_CONFIGURED"
```

Expected: the same exact-Scope session closes as `CONVERGED`. A failed MCP write or check must close as `BLOCKED` with a sanitized reason and concrete retry trigger; implementation cannot be called complete.

- [ ] **Step 6: Commit the matched implementation and governance facts**

```powershell
git add docs/adr/0022-3a-architecture-navigation-workspace.md docs/design-facts/baseline-manifest.json docs/TODO.md docs/superpowers/plans/2026-08-10-3a-architecture-navigation-workspace.md
git commit -m "docs: close 3A navigation design facts"
```

## Self-Review Result

- Spec coverage: Tasks 1-3 cover Profile-pinned asynchronous PostgreSQL publication; Task 4 covers shared exact-Scope queries, cursors, continuations, budgets, alignment, and node/edge drift; Tasks 5-7 cover MCP, Web auth, navigation, localization, read-only UX, and typed states; Task 8 covers deployment and phase-level evidence; Task 9 covers MCP dual-record closure.
- Type consistency: `ProjectionBuildJob`, `ProjectionManifestV2`, `KnowledgeProjectionNode`, `KnowledgeProjectionEdge`, `ThreeAProjectionQueryService`, and published-history status semantics are defined once and consumed under the same names.
- Deferred boundaries: production OAuth/OIDC, cross-service comparison, Nebula 3A projection, whole-Scope rendering, external connectors, and billion-scale certification are not claimed by any task.
- Completeness scan: every implementation action names concrete files, interfaces, commands, and expected results; generated session identity is captured at runtime in `$sessionId`.
