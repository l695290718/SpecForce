# Enterprise Relationship and Impact Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct-only Proposal impact summaries with a Scope-safe, explainable relationship engine that uses PostgreSQL as the audited source of truth and NebulaGraph as the enterprise graph-query projection.

**Architecture:** Domain types, ontology, traversal plans, and impact evaluation live in `@specforge/core`. PostgreSQL stores addressable nodes, current relationships, history, transactional outbox, projection checkpoints, and analysis runs. A `GraphStore` package supplies in-memory, PostgreSQL, and Nebula gateway adapters; a projector and impact worker provide asynchronous processing without coupling MCP or Web requests to NebulaGraph.

**Tech Stack:** TypeScript 5.7, Node.js 22, pnpm 9, Prisma 6, PostgreSQL 16, Vitest 2, Next.js 15, MCP SDK 1.29, Go graph gateway, official NebulaGraph Go client, NebulaGraph 3.x, Docker Compose, Kubernetes.

## Global Constraints

- English relationship codes and technical identifiers are canonical; Chinese is presentation content only.
- Every read and write requires exact `applicationServiceId` and exact `scopePath`; no prefix or global fallback is allowed.
- First delivery analyzes exactly one authorized application-service Scope; cross-service traversal is not exposed.
- Complete means the reachable graph was exhausted under ontology rules. Timeout, depth, node, or path limits return `PARTIAL` with an unexplored frontier.
- Interactive preview initially renders two degrees, targets P95 below two seconds, and has a three-second request budget.
- Full analysis is asynchronous, defaults to a defensive maximum depth of 12, and never labels a truncated result complete.
- PostgreSQL is authoritative. NebulaGraph is a rebuildable query projection and is never called directly by Web, MCP, or Agent clients.
- Production graph queries use NebulaGraph; PostgreSQL remains the development, test, and small-installation adapter.
- Existing `AssetLink` data must migrate without loss, and current Web/MCP graph behavior must remain available during cutover.
- Do not introduce a silent PostgreSQL traversal fallback when the production graph store is unavailable.

---

## File Map

### Core domain

- Create `packages/core/src/relationships/types.ts`: node, relationship, ontology, change-set, and propagation types.
- Create `packages/core/src/relationships/ontology.ts`: versioned built-in ontology and endpoint validation.
- Create `packages/core/src/relationships/extract.ts`: deterministic nested node and derived-edge extraction from design assets.
- Create `packages/core/src/graph-store/types.ts`: engine-neutral `GraphStore` and traversal contracts.
- Replace `packages/core/src/impact/analyze.ts`: traversal-based impact planning and evaluation.
- Create `packages/core/src/impact/evaluate.ts`: certainty, risk, confidence, and path ranking.
- Modify `packages/core/src/index.ts` and `packages/core/src/types.ts`: exports and compatibility aliases.

### PostgreSQL and command side

- Modify `prisma/schema.prisma`: normalized graph, outbox, projection, and analysis models.
- Create `prisma/migrations/20260714_enterprise_relationship_graph/migration.sql`: additive migration and `AssetLink` backfill.
- Create `apps/mcp-server/src/relationships/repository.ts`: transactional node/relationship persistence.
- Create `apps/mcp-server/src/relationships/command-service.ts`: Scope and ontology validation plus outbox writes.
- Modify `apps/mcp-server/src/persistence.ts`: call command service from asset writes while retaining legacy reads during cutover.

### Query side and workers

- Create `packages/graph-store/package.json` and `packages/graph-store/tsconfig.json`.
- Create `packages/graph-store/src/in-memory.ts`: deterministic tests.
- Create `packages/graph-store/src/postgres.ts`: recursive-CTE adapter.
- Create `packages/graph-store/src/nebula-gateway.ts`: HTTP client for the internal graph gateway.
- Create `apps/graph-projector/src/index.ts`: outbox projector and checkpoint loop.
- Create `apps/impact-worker/src/index.ts`: queued full-analysis worker.
- Create `apps/graph-gateway/`: Go service using the official NebulaGraph client.

### Product and operations

- Modify `apps/mcp-server/src/tools.ts` and `apps/mcp-server/src/scoped-derived.ts`: relationship and impact MCP tools.
- Create `apps/web/app/api/impact/preview/route.ts` and `apps/web/app/api/impact/runs/[id]/route.ts`.
- Modify `apps/web/components/proposal-detail.tsx`: direct/definite/possible/contextual results and evidence paths.
- Modify `docker-compose.yml`: local NebulaGraph, graph gateway, projector, and worker profiles.
- Create `deploy/kubernetes/specforge-graph/`: private-cloud manifests.
- Create `scripts/graph-benchmark.ts`: parameterized synthetic graph generator and measurements.

---

### Task 1: Relationship Ontology and Graph Contracts

**Files:**
- Create: `packages/core/src/relationships/types.ts`
- Create: `packages/core/src/relationships/ontology.ts`
- Create: `packages/core/src/graph-store/types.ts`
- Test: `packages/core/src/__tests__/relationship-ontology.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `RelationshipCode`, `RelationshipTypeDefinition`, `AssetNodeIdentity`, `GraphTraversalPlan`, `GraphTraversalResult`, `GraphStore`.
- Consumes: existing `AssetType`, `ArchitectureScopeRef`, and Scope authorization types.

- [ ] **Step 1: Write failing ontology and contract tests**

```ts
expect(relationshipOntology.get("CONSUMES")).toMatchObject({
  forwardPropagation: false,
  reversePropagation: true,
  strength: "strong"
});
expect(() => validateRelationshipEndpoints("CARRIES", "event", "api")).toThrow("RELATIONSHIP_ENDPOINT_INVALID");
expect(createTraversalPlan({ startNodes: [root], allowedScopes: [] })).toThrow("ALLOWED_SCOPES_REQUIRED");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @specforge/core test -- relationship-ontology.test.ts`

Expected: FAIL because the relationship modules do not exist.

- [ ] **Step 3: Add exact domain contracts and ontology version `specforge.relationships.v1`**

```ts
export interface GraphTraversalPlan {
  startNodes: AssetNodeIdentity[];
  allowedScopes: ArchitectureScopeRef[];
  relationRules: RelationTraversalRule[];
  maxDepth: number;
  maxNodes: number;
  maxPaths: number;
  timeoutMs: number;
  graphVersion?: bigint;
}

export interface GraphStore {
  traverse(plan: GraphTraversalPlan): Promise<GraphTraversalResult>;
  upsertProjection(batch: GraphProjectionBatch): Promise<ProjectionReceipt>;
  checkpoint(scope: ArchitectureScopeRef): Promise<bigint>;
}
```

Implement the approved relationship table, endpoint sets, canonical directions, terminal behavior, and immutable version identifier.

- [ ] **Step 4: Run test and typecheck**

Run: `pnpm --filter @specforge/core test -- relationship-ontology.test.ts && pnpm --filter @specforge/core typecheck`

Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/relationships packages/core/src/graph-store packages/core/src/__tests__/relationship-ontology.test.ts packages/core/src/index.ts
git commit -m "feat: define relationship ontology and graph contracts"
```

### Task 2: Addressable Nested Asset Nodes

**Files:**
- Create: `packages/core/src/relationships/extract.ts`
- Test: `packages/core/src/__tests__/relationship-extraction.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `RelationshipTypeDefinition`, existing `Asset`, `DataModel`, `ApiContract`, and `EventContract` types.
- Produces: `extractAssetGraph(assetType, asset): ExtractedAssetGraph` with deterministic nodes and derived relationships.

- [ ] **Step 1: Write failing nested-node tests**

```ts
const graph = extractAssetGraph("dataModel", customerModel);
expect(graph.nodes.map((node) => node.logicalId)).toEqual(expect.arrayContaining([
  "customer-model",
  "customer-model.Customer",
  "customer-model.Customer.email"
]));
expect(graph.relationships).toContainEqual(expect.objectContaining({
  relationType: "CONTAINS",
  sourceLogicalId: "customer-model.Customer",
  targetLogicalId: "customer-model.Customer.email"
}));
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @specforge/core test -- relationship-extraction.test.ts`

Expected: FAIL because `extractAssetGraph` is missing.

- [ ] **Step 3: Implement deterministic root/entity/field/operation extraction**

Use logical IDs derived only from canonical technical identifiers. Do not derive identity from translated names. Mark parser-created edges with `source: "asset-parser"` and a stable `sourceReference` containing root asset type, root asset ID, and asset version.

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `pnpm --filter @specforge/core test -- relationship-extraction.test.ts asset-localization.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/relationships/extract.ts packages/core/src/__tests__/relationship-extraction.test.ts packages/core/src/index.ts
git commit -m "feat: extract addressable asset graph nodes"
```

### Task 3: PostgreSQL Relationship Ledger and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714_enterprise_relationship_graph/migration.sql`
- Test: `apps/mcp-server/src/relationships/repository.integration.test.ts`

**Interfaces:**
- Produces Prisma models: `AssetNode`, `RelationshipCurrent`, `RelationshipEvent`, `RelationshipOutbox`, `ProjectionCheckpoint`, `ImpactAnalysisRun`, `ImpactResultNode`, `ImpactResultPath`.
- Preserves existing `AssetLink` until the read cutover task is complete.

- [ ] **Step 1: Add a failing PostgreSQL integration test**

```ts
await repository.upsertRelationship(tx, command);
expect(await prisma.relationshipCurrent.count({ where: scopeWhere })).toBe(1);
expect(await prisma.relationshipEvent.count({ where: { action: "UPSERT" } })).toBe(1);
expect(await prisma.relationshipOutbox.count({ where: { status: "PENDING" } })).toBe(1);
```

- [ ] **Step 2: Verify RED against an isolated PostgreSQL database**

Run: `$env:SPECFORGE_PG_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/relationships/repository.integration.test.ts`

Expected: FAIL because Prisma models are absent.

- [ ] **Step 3: Add additive schema and migration**

Use UUID primary keys, exact Scope columns on every table, endpoint foreign keys, `BigInt` versions, and indexes beginning with Scope. Backfill each `AssetLink` into root `AssetNode` rows and one `RelationshipCurrent` row while retaining the original record. Record backfilled provenance as `legacy-asset-link`.

- [ ] **Step 4: Generate Prisma client, apply migration, and verify idempotent backfill**

Run: `pnpm db:generate && pnpm exec prisma migrate deploy`

Expected: migration succeeds; rerunning `migrate deploy` reports no pending migrations.

- [ ] **Step 5: Run integration test and commit**

Run: `$env:SPECFORGE_PG_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/relationships/repository.integration.test.ts`

Expected: PASS.

```bash
git add prisma apps/mcp-server/src/relationships/repository.integration.test.ts
git commit -m "feat: add enterprise relationship ledger"
```

### Task 4: Transactional Relationship Command Service

**Files:**
- Create: `apps/mcp-server/src/relationships/repository.ts`
- Create: `apps/mcp-server/src/relationships/command-service.ts`
- Test: `apps/mcp-server/src/relationships/command-service.test.ts`
- Modify: `apps/mcp-server/src/persistence.ts`

**Interfaces:**
- Consumes: `extractAssetGraph`, ontology validation, Prisma transaction client, exact writable Scope.
- Produces: `upsertAssetGraph(command)`, `upsertRelationship(command)`, `deleteRelationship(command)`.

- [ ] **Step 1: Write failing atomicity, Scope, and idempotency tests**

```ts
await service.upsertRelationship(validCommand);
await service.upsertRelationship(validCommand);
expect(repository.currentWrites).toHaveLength(2);
expect(repository.currentRows()).toHaveLength(1);
await expect(service.upsertRelationship(crossScopeCommand)).rejects.toThrow("SCOPE_MISMATCH");
await expect(service.upsertRelationship(invalidEndpointCommand)).rejects.toThrow("RELATIONSHIP_ENDPOINT_INVALID");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run apps/mcp-server/src/relationships/command-service.test.ts`

Expected: FAIL because the command service is absent.

- [ ] **Step 3: Implement one-transaction current state, event, and outbox writes**

Asset upsert must extract nodes, upsert current parser-owned relationships, invalidate obsolete parser-owned relationships, preserve MCP/manual relationships, and increment one Scope graph version. Return that version to the caller.

- [ ] **Step 4: Run focused and persistence tests**

Run: `pnpm exec vitest run apps/mcp-server/src/relationships/command-service.test.ts apps/mcp-server/src/persistence.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/relationships apps/mcp-server/src/persistence.ts
git commit -m "feat: persist relationship commands transactionally"
```

### Task 5: GraphStore Package and PostgreSQL Traversal

**Files:**
- Create: `packages/graph-store/package.json`
- Create: `packages/graph-store/tsconfig.json`
- Create: `packages/graph-store/src/index.ts`
- Create: `packages/graph-store/src/in-memory.ts`
- Create: `packages/graph-store/src/postgres.ts`
- Test: `packages/graph-store/src/postgres.integration.test.ts`

**Interfaces:**
- Implements: `GraphStore` from `@specforge/core`.
- Produces: `createGraphStore(config)` and exact `GraphTraversalResult` semantics shared by all adapters.

- [ ] **Step 1: Write contract tests for direction, cycles, Scope, and truncation**

```ts
expect(result.paths[0]?.nodes).toEqual([apiNode.key, entityNode.key, eventNode.key]);
expect(result.nodes.every((node) => node.scope.applicationServiceId === policyScope.id)).toBe(true);
expect(budgeted.status).toBe("PARTIAL");
expect(budgeted.stopReason).toBe("NODE_BUDGET_EXCEEDED");
expect(budgeted.unexploredFrontier.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Verify RED for both in-memory and PostgreSQL adapters**

Run: `pnpm --filter @specforge/graph-store test`

Expected: FAIL because adapters are absent.

- [ ] **Step 3: Implement cycle-safe traversal**

The PostgreSQL adapter uses parameterized recursive CTEs, carries visited node IDs in the recursive row, applies exact Scope and relation filters in every recursive term, and enforces timeout, depth, node, and path budgets. It returns the frontier rather than dropping truncated branches.

- [ ] **Step 4: Run contract tests against both adapters**

Run: `pnpm --filter @specforge/graph-store test`

Expected: identical semantic fixtures pass for in-memory and PostgreSQL.

- [ ] **Step 5: Commit**

```bash
git add packages/graph-store pnpm-lock.yaml
git commit -m "feat: add scope-safe graph store traversal"
```

### Task 6: Traversal-Based Impact Evaluation

**Files:**
- Create: `packages/core/src/impact/evaluate.ts`
- Replace: `packages/core/src/impact/analyze.ts`
- Test: `packages/core/src/__tests__/impact-analysis.test.ts`
- Modify: `packages/core/src/context-pack/generate.ts`

**Interfaces:**
- Consumes: `GraphStore`, `GraphTraversalPlan`, Proposal, normalized change types, governance results.
- Produces: `previewProposalImpact(input, deps)` and `analyzeProposalImpact(input, deps)` with explainable paths and `COMPLETE | PARTIAL` status.

- [ ] **Step 1: Write failing golden business scenarios**

```ts
expect(result.nodes.find(byId("crm-service"))).toMatchObject({
  certainty: "DEFINITE",
  impactLevel: "high",
  depth: 3
});
expect(result.nodes.find(byId("customer-adr"))?.certainty).toBe("CONTEXTUAL");
expect(result.nodes.find(byId("crm-service"))?.primaryPath.edges.map(edgeCode)).toEqual([
  "READS", "CARRIES", "SUBSCRIBES"
]);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @specforge/core test -- impact-analysis.test.ts`

Expected: existing direct-only analyzer fails the transitive expectations.

- [ ] **Step 3: Implement change normalization, traversal planning, and evaluation**

Use `DIRECT`, `DEFINITE`, `POSSIBLE`, `CONTEXTUAL`, and `NOT_IMPACTED`. Rank one primary and at most three alternative paths by certainty, strength, confidence, and length. Preserve old summary fields as derived compatibility fields until Web and MCP cut over.

- [ ] **Step 4: Run impact, localization, governance, and Context Pack tests**

Run: `pnpm --filter @specforge/core test -- impact-analysis.test.ts localized-derived-views.test.ts governance-localization.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/impact packages/core/src/context-pack packages/core/src/__tests__
git commit -m "feat: analyze transitive design impact"
```

### Task 7: Asynchronous Full Analysis Worker

**Files:**
- Create: `apps/impact-worker/package.json`
- Create: `apps/impact-worker/tsconfig.json`
- Create: `apps/impact-worker/src/index.ts`
- Create: `apps/impact-worker/src/worker.ts`
- Test: `apps/impact-worker/src/worker.test.ts`

**Interfaces:**
- Consumes: queued `ImpactAnalysisRun`, `GraphStore`, required graph version, Scope authorization snapshot.
- Produces: persisted result nodes/paths and terminal `COMPLETE`, `PARTIAL`, `FAILED`, or `CANCELLED` state.

- [ ] **Step 1: Write failing state-machine and resume tests**

```ts
expect(await worker.claim(run.id)).toMatchObject({ status: "RUNNING" });
expect(await worker.run(run.id)).toMatchObject({ status: "PARTIAL", stopReason: "DEPTH_LIMIT_EXCEEDED" });
expect(await worker.resume(run.id)).toMatchObject({ resumedFromFrontier: true });
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @specforge/impact-worker test`

Expected: FAIL because the worker does not exist.

- [ ] **Step 3: Implement `FOR UPDATE SKIP LOCKED` claiming, heartbeat, cancellation, and persisted frontier**

Wait for `ProjectionCheckpoint >= requiredGraphVersion`; otherwise retain `WAITING_FOR_PROJECTION`. Store ontology version, asset version, relationship version, graph checkpoint, authorization snapshot, budgets, and stop reason on every run.

- [ ] **Step 4: Run worker tests and typecheck**

Run: `pnpm --filter @specforge/impact-worker test && pnpm --filter @specforge/impact-worker typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/impact-worker pnpm-lock.yaml
git commit -m "feat: run full impact analysis asynchronously"
```

### Task 8: NebulaGraph Gateway and Projection

**Files:**
- Create: `apps/graph-gateway/go.mod`
- Create: `apps/graph-gateway/cmd/server/main.go`
- Create: `apps/graph-gateway/internal/nebula/store.go`
- Create: `apps/graph-gateway/internal/httpapi/handlers.go`
- Create: `apps/graph-gateway/internal/httpapi/handlers_test.go`
- Create: `packages/graph-store/src/nebula-gateway.ts`
- Create: `apps/graph-projector/package.json`
- Create: `apps/graph-projector/src/projector.ts`
- Test: `apps/graph-projector/src/projector.test.ts`

**Interfaces:**
- Gateway endpoints: `POST /v1/projections`, `POST /v1/traversals`, `GET /v1/checkpoints/{scopeId}`, `GET /health`.
- Projector consumes pending outbox rows and writes idempotent projection batches.

- [ ] **Step 1: Add a compatibility gate using NebulaGraph 3.8.0**

Start the pinned local cluster, connect through the official Go client, create the `specforge_graph` Space, write two vertices and one edge, and execute a two-step traversal. Record the verified client module version in `apps/graph-gateway/go.mod`. Stop this task and open an ADR amendment if the official client cannot pass this exact test; do not substitute an unmaintained Node native addon.

- [ ] **Step 2: Write failing gateway HTTP and projector idempotency tests**

```go
if response.StatusCode != http.StatusOK { t.Fatalf("status = %d", response.StatusCode) }
if body.Status != "COMPLETE" || len(body.Paths) != 1 { t.Fatalf("unexpected traversal: %#v", body) }
```

```ts
await projector.process(event);
await projector.process(event);
expect(gateway.projectionCalls).toHaveLength(2);
expect(await checkpoints.read(scope)).toBe(event.graphVersion);
```

- [ ] **Step 3: Implement schema bootstrap, parameter-safe nGQL generation, gateway auth, and retries**

The gateway accepts structured plans only, never raw nGQL from callers. It enforces non-empty allowed Scopes, escapes values centrally, and returns the engine-neutral traversal response. Projector marks outbox rows sent only after both projection receipt and checkpoint persistence succeed.

- [ ] **Step 4: Run Go, projector, and cross-adapter contract tests**

Run: `go test ./...` from `apps/graph-gateway`, then `pnpm --filter @specforge/graph-projector test`, then `pnpm --filter @specforge/graph-store test`.

Expected: PASS; Nebula and PostgreSQL fixtures have equivalent nodes, paths, status, and stop reasons.

- [ ] **Step 5: Commit**

```bash
git add apps/graph-gateway apps/graph-projector packages/graph-store pnpm-lock.yaml
git commit -m "feat: project relationships to NebulaGraph"
```

### Task 9: MCP and Web Product Surface

**Files:**
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/scoped-derived.ts`
- Test: `apps/mcp-server/src/tools.test.ts`
- Create: `apps/web/app/api/impact/preview/route.ts`
- Create: `apps/web/app/api/impact/runs/[id]/route.ts`
- Modify: `apps/web/components/proposal-detail.tsx`
- Test: `apps/web/lib/__tests__/impact-api.test.ts`

**Interfaces:**
- Adds MCP tools approved by the spec.
- Web preview returns within the interactive budget; full analysis returns an analysis run ID for polling.

- [ ] **Step 1: Write failing MCP registration and Scope-isolation tests**

```ts
expect(toolNames).toEqual(expect.arrayContaining([
  "upsert_asset_relationship", "delete_asset_relationship",
  "get_asset_upstream", "get_asset_downstream",
  "preview_change_impact", "analyze_change_impact",
  "get_impact_analysis", "explain_asset_impact"
]));
await expect(preview({ ...input, applicationServiceId: sibling.id })).rejects.toThrow("SCOPE_READ_NOT_AUTHORIZED");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run apps/mcp-server/src/tools.test.ts apps/web/lib/__tests__/impact-api.test.ts`

Expected: FAIL because the tools and routes are absent.

- [ ] **Step 3: Implement MCP tools, preview/run APIs, and evidence-path UI**

Display direct, definite, possible, and contextual groups; status and stop reason; primary path; up to three alternative paths; graph and ontology versions; and unexplored frontier count. Preserve bilingual human-facing labels while keeping technical relationship codes canonical.

- [ ] **Step 4: Run MCP, Web typecheck, and browser verification**

Run: `pnpm exec vitest run apps/mcp-server/src/tools.test.ts apps/web/lib/__tests__/impact-api.test.ts && pnpm typecheck`

Expected: PASS. Browser verification must switch Scope and locale and confirm no sibling Scope node, count, or path appears.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server apps/web
git commit -m "feat: expose explainable impact analysis"
```

### Task 10: Operations, Observability, Capacity, and Cutover

**Files:**
- Modify: `docker-compose.yml`
- Create: `deploy/kubernetes/specforge-graph/`
- Create: `scripts/graph-benchmark.ts`
- Create: `docs/operations/enterprise-graph.md`
- Modify: `README.md`
- Modify: `package.json`
- Test: `apps/mcp-server/src/enterprise-graph.smoke.test.ts`

**Interfaces:**
- Produces local and private-cloud deployment instructions, health probes, metrics, benchmark reports, rebuild procedure, and legacy cutover switch.

- [ ] **Step 1: Write failing smoke assertions for health, lag, and complete/partial semantics**

```ts
expect(health.graphStore).toBe("ready");
expect(health.projectionLagSeconds).toBeLessThan(10);
expect(preview.elapsedMs).toBeLessThan(3000);
expect(truncated).toMatchObject({ status: "PARTIAL", unexploredFrontierCount: expect.any(Number) });
```

- [ ] **Step 2: Add local Compose and Kubernetes resources**

Configure three Meta, three Storage, and multiple stateless Graph Service replicas for the production manifest; add readiness/liveness probes, PodDisruptionBudgets, persistent volumes, secrets, network policies, resource requests, Prometheus scrape endpoints, and backup/rebuild jobs. Local Compose may use a smaller single-developer topology but must be clearly labeled non-production.

- [ ] **Step 3: Add benchmark stages and release gates**

`pnpm graph:benchmark --edges 1000000`, `--edges 10000000`, and `--edges 100000000` generate deterministic high-degree and skewed-Scope datasets. Record ingest throughput, projection lag, two-degree P50/P95/P99, full-analysis throughput, partition skew, and `PARTIAL` rates. The 100-million run executes only in the enterprise benchmark environment.

- [ ] **Step 4: Execute cutover rehearsal**

Backfill legacy links, project them, compare PostgreSQL and Nebula node/edge counts per exact Scope, run golden path comparisons, disable legacy reads behind `SPECFORGE_RELATIONSHIP_READ_MODEL=normalized`, and retain the old table for one release. Document rollback as re-enabling the legacy read flag; do not delete legacy rows in this task.

- [ ] **Step 5: Run final verification**

Run: `pnpm db:generate && pnpm typecheck && pnpm test && pnpm build`

Run integration suites with PostgreSQL and NebulaGraph enabled, then run `pnpm --filter @specforge/mcp-server smoke`.

Expected: all commands exit 0; smoke confirms exact Scope isolation, projection checkpointing, explainable paths, `PARTIAL` semantics, and bilingual display.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml deploy scripts docs/operations README.md package.json apps/mcp-server/src/enterprise-graph.smoke.test.ts
git commit -m "chore: operationalize enterprise graph analysis"
```

---

## Review Checkpoints

1. After Task 3, review the migration and legacy backfill before applying it to any shared database.
2. After Task 6, demonstrate transitive impact on PostgreSQL before introducing NebulaGraph.
3. After Task 8, review the official-client compatibility evidence and cross-adapter contract results.
4. After Task 9, perform a security review of Scope enforcement and error redaction.
5. After Task 10, approve production rollout only after the representative 100-million-edge benchmark meets the target SLOs.
