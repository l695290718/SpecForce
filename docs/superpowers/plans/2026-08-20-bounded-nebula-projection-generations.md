# Bounded Nebula Projection Generations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive, PostgreSQL-controlled BUILDING/ACTIVE/PREVIOUS generation lifecycle and generation-qualified graph contract for the Nebula 3A projection without breaking the existing relationship Outbox projection.

**Architecture:** PostgreSQL owns immutable `NebulaProjectionManifest` records, one exact-Scope `NebulaProjectionHead`, generation-aware checkpoints, and resumable purge chunks. Core exports stable generation identities and digest-based VIDs. The Go Gateway accepts a generation-qualified projection/traversal contract and rejects cross-Scope or cross-generation payloads; the existing graph path remains compatible until a later cutover.

**Tech Stack:** Prisma 6/PostgreSQL, TypeScript packages with Vitest, Go `net/http`, NebulaGraph 3.8 compatibility adapter, existing MCP design-fact governance.

## Global Constraints

- PostgreSQL remains authoritative for authored facts, projection manifests, slot pointers, checkpoints, and complete history.
- NebulaGraph remains a rebuildable derived projection; ordinary clients cannot choose an arbitrary generation.
- Every new control and graph operation carries the exact `applicationServiceId` and `scopePath`.
- One Scope may have at most one BUILDING, one ACTIVE, and one PREVIOUS online generation.
- Failed build or validation cannot modify ACTIVE; cleanup cannot target ACTIVE.
- Existing `RelationshipOutbox`, legacy `ProjectionCheckpoint`, and current Gateway payloads remain compatible during this increment.
- No production multi-node or billion-scale capability is claimed by this increment.

---

### Task 1: Add PostgreSQL Generation Control Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated-nebula-generation-migration>/migration.sql` through `pnpm exec prisma migrate dev`
- Test: `prisma/three-a-schema.test.ts`

**Interfaces:**
- Produces Prisma models `NebulaProjectionManifest`, `NebulaProjectionHead`, `NebulaProjectionCheckpoint`, `NebulaProjectionPurgeChunk`, and `NebulaProjectionCertificationRun`.
- Keeps existing `ProjectionManifest` and `ProjectionCheckpoint` unchanged for compatibility.

- [x] **Step 1: Write schema assertions for the new models**

Add assertions that the new models contain exact-Scope keys, generation identity, slot state, and purge safety fields. The test must verify that the source text contains the following composite constraints:

```ts
expect(schema).toContain("model NebulaProjectionHead");
expect(schema).toContain("@@unique([enterpriseId, applicationServiceId, scopePath]");
expect(schema).toContain("model NebulaProjectionManifest");
expect(schema).toContain("@@unique([applicationServiceId, scopePath, id]");
expect(schema).toContain("model NebulaProjectionCheckpoint");
expect(schema).toContain("model NebulaProjectionPurgeChunk");
```

- [x] **Step 2: Run the schema test and confirm it fails**

Run `node .\\node_modules\\vitest\\vitest.mjs run --root . prisma/three-a-schema.test.ts`.

Expected: FAIL because the Nebula generation models do not exist.

- [x] **Step 3: Add the Prisma models**

Add these fields and constraints:

```prisma
model NebulaProjectionManifest {
  dbId String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  id String
  generationId String
  generationNumber BigInt
  baselineId String
  profileId String
  profileVersion String
  projectionSchemaVersion String
  status String
  sourceWatermarks Json @default("{}") @db.JsonB
  expectedCounts Json @default("{}") @db.JsonB
  bucketDigests Json @default("{}") @db.JsonB
  contentDigest String
  errorCode String?
  diagnosticRef String?
  createdAt DateTime @default(now())
  validatedAt DateTime?
  retiredAt DateTime?
  purgedAt DateTime?
  applicationServiceId String
  scopePath String

  @@unique([applicationServiceId, scopePath, id], map: "NebulaProjectionManifest_scope_id_key")
  @@unique([applicationServiceId, scopePath, generationId], map: "NebulaProjectionManifest_scope_generation_key")
  @@index([applicationServiceId, scopePath, status, createdAt], map: "NebulaProjectionManifest_scope_status_idx")
}

model NebulaProjectionHead {
  dbId String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  buildingManifestId String?
  activeManifestId String?
  previousManifestId String?
  headVersion BigInt @default(0)
  previousRetainUntil DateTime?
  updatedAt DateTime @updatedAt
  enterpriseId String
  applicationServiceId String
  scopePath String

  @@unique([enterpriseId, applicationServiceId, scopePath], map: "NebulaProjectionHead_scope_key")
  @@index([applicationServiceId, scopePath, activeManifestId], map: "NebulaProjectionHead_active_idx")
}

model NebulaProjectionCheckpoint {
  dbId String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  manifestId String
  partitionId String
  lastEventId String?
  projectionVersion BigInt @default(0)
  status String
  error String?
  projectedAt DateTime?
  applicationServiceId String
  scopePath String

  @@unique([applicationServiceId, scopePath, manifestId, partitionId], map: "NebulaProjectionCheckpoint_scope_manifest_partition_key")
  @@index([applicationServiceId, scopePath, manifestId, status], map: "NebulaProjectionCheckpoint_scope_manifest_status_idx")
}
```

Add `NebulaProjectionPurgeChunk` with `manifestId`, chunk sequence, state, delete counts, retry fields, and exact Scope; add `NebulaProjectionCertificationRun` with manifest, tier, status, workload digest, evidence JSON, and exact Scope. Do not add foreign keys to graph data rows because the derived projection may be rebuilt independently.

- [x] **Step 4: Push and validate the schema**

Run `pnpm db:generate`, `pnpm db:push`, and `pnpm exec prisma validate`.

Expected: Prisma Client generation, canonical Docker PostgreSQL schema push, and validation all exit 0.

- [x] **Step 5: Run the schema tests**

Run `node .\\node_modules\\vitest\\vitest.mjs run --root . prisma/three-a-schema.test.ts`.

Expected: PASS with the existing schema assertions plus the new model assertions.

- [ ] **Step 6: Commit the schema increment**

Run `git add prisma/schema.prisma prisma/migrations prisma/three-a-schema.test.ts && git commit -m "feat: add Nebula projection generation control schema"`.

---

### Task 2: Add Stable Generation Identity Utilities

**Files:**
- Create: `packages/core/src/graph/projection-generation.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/projection-generation.test.ts`

**Interfaces:**
- Produces `ProjectionIdentity`, `createProjectionIdentity`, `generationQualifiedVertexId`, `generationQualifiedEdgeRank`, and `assertSameProjectionIdentity`.
- `generationQualifiedVertexId` returns a fixed-length digest that includes Scope, Manifest, entity type, and logical ID.
- `generationQualifiedEdgeRank` accepts a persisted PostgreSQL `projectionOrdinal`; it never hashes a relationship ID for the rank.

- [ ] **Step 1: Write failing identity tests**

```ts
it("changes the vertex identity when only the manifest changes", () => {
  const first = generationQualifiedVertexId(identity("manifest-a"), "asset", "api-1");
  const second = generationQualifiedVertexId(identity("manifest-b"), "asset", "api-1");
  expect(first).not.toBe(second);
  expect(first).toHaveLength(67);
});

it("rejects an edge identity that crosses Scope or Manifest", () => {
  expect(() => assertSameProjectionIdentity(identity("manifest-a"), identity("manifest-b"))).toThrow("PROJECTION_IDENTITY_MISMATCH");
});

it("uses the persisted ordinal as a safe signed Nebula rank", () => {
  expect(generationQualifiedEdgeRank(42n)).toBe(42);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run `node .\\node_modules\\vitest\\vitest.mjs run --root . packages/core/src/__tests__/projection-generation.test.ts`.

Expected: FAIL because the module and functions do not exist.

- [ ] **Step 3: Implement the identity module**

Use a canonical `JSON.stringify` tuple and SHA-256. The VID format is `n:` plus 64 lowercase hex characters. Require all Scope and identity fields to be non-empty. Reject negative, unsafe, or zero ordinals.

- [ ] **Step 4: Export and test**

Export the module from `packages/core/src/index.ts`, then run `pnpm --filter @specforge/core typecheck` and the focused Vitest test.

Expected: Typecheck passes and all focused identity tests pass.

- [ ] **Step 5: Commit the identity increment**

Run `git add packages/core/src/graph/projection-generation.ts packages/core/src/index.ts packages/core/src/__tests__/projection-generation.test.ts && git commit -m "feat: add generation-qualified graph identities"`.

---

### Task 3: Implement Scope-Safe Three-Slot Lifecycle Repository

**Files:**
- Create: `apps/graph-projector/src/generation-repository.ts`
- Create: `apps/graph-projector/src/generation-repository.test.ts`
- Modify: `apps/graph-projector/src/index.ts`

**Interfaces:**
- Produces `NebulaGenerationRepository` with `createBuilding`, `markValidated`, `publish`, `rollback`, `retirePrevious`, and `getHead`.
- All methods require `{ enterpriseId, applicationServiceId, scopePath }` and use Prisma transactions.
- `publish` atomically moves old ACTIVE to PREVIOUS and new BUILDING to ACTIVE; `rollback` atomically swaps ACTIVE and PREVIOUS.

- [ ] **Step 1: Write lifecycle tests**

Cover these exact scenarios:

```ts
it("creates only one BUILDING generation per Scope");
it("does not change ACTIVE when validation fails");
it("publishes BUILDING and moves ACTIVE to PREVIOUS");
it("rejects publishing a Manifest from another Scope");
it("rolls back only when PREVIOUS is online and schema-compatible");
it("never retires or purges ACTIVE");
```

Use the existing repository test fake pattern and assert transaction calls, head version checks, and explicit error codes.

- [ ] **Step 2: Run the focused lifecycle test and confirm failure**

Run `node .\\node_modules\\vitest\\vitest.mjs run --root . apps/graph-projector/src/generation-repository.test.ts`.

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement transaction-safe lifecycle methods**

Use `pg_advisory_xact_lock(hashtext(exactScopeKey))` inside every mutating transaction. Enforce one building row, verify `headVersion` with `updateMany`, set `previousRetainUntil` to `now + 72 hours` on publish, and write immutable manifest status changes rather than mutating content. Return durable receipts containing Scope, Manifest, generation, and new head version.

- [ ] **Step 4: Add repository exports and run tests**

Run `pnpm --filter @specforge/graph-projector typecheck` and the focused lifecycle tests.

Expected: Typecheck and all lifecycle tests pass.

- [ ] **Step 5: Commit the lifecycle increment**

Run `git add apps/graph-projector/src/generation-repository.ts apps/graph-projector/src/generation-repository.test.ts apps/graph-projector/src/index.ts && git commit -m "feat: add bounded Nebula generation lifecycle"`.

---

### Task 4: Add Generation-Qualified Graph Gateway Contract

**Files:**
- Modify: `apps/graph-gateway/internal/httpapi/types.go`
- Modify: `apps/graph-gateway/internal/httpapi/handler.go`
- Modify: `apps/graph-gateway/internal/nebula/adapter.go`
- Test: `apps/graph-gateway/internal/httpapi/handler_test.go`
- Test: `apps/graph-gateway/internal/nebula/adapter_test.go`

**Interfaces:**
- Adds required `ProjectionIdentity` to the new generation-qualified projection and traversal payloads while retaining legacy payload decoding for the existing Outbox path.
- Produces error codes `PROJECTION_IDENTITY_REQUIRED`, `PROJECTION_IDENTITY_MISMATCH`, and `ACTIVE_GENERATION_REQUIRED`.

- [ ] **Step 1: Add failing Go contract tests**

Test that a generation-qualified request with mismatched Manifest IDs is rejected, a node from another Scope is rejected, and a valid request produces a VID that changes when only `generationId` changes.

Run `go test ./internal/httpapi ./internal/nebula`.

Expected: FAIL because the identity contract is absent.

- [ ] **Step 2: Add typed identity fields and validation**

Define:

```go
type ProjectionIdentity struct {
    BaselineID string `json:"baselineId"`
    ManifestID string `json:"manifestId"`
    GenerationID string `json:"generationId"`
    SchemaVersion string `json:"schemaVersion"`
}
```

Generation-qualified requests must carry one identity at the request level and every node and edge endpoint must match it. Legacy requests remain accepted only on the existing compatibility path.

- [ ] **Step 3: Make generation VID and edge rank deterministic**

Include `manifestId` and `generationId` in the canonical `vertexID` input. Add `ProjectionOrdinal` to the typed Edge contract and use it for Nebula rank. Reject missing ordinals on generation-qualified edges; retain the old hash rank only for legacy requests.

- [ ] **Step 4: Add adapter traversal filtering and response metadata**

Use the generation-qualified VIDs as the traversal start keys and return the exact ProjectionIdentity in the response. Validate returned node keys against the request identity before returning them to the caller.

- [ ] **Step 5: Run Go tests and commit**

Run `go test ./internal/httpapi ./internal/nebula`.

Expected: All focused handler and adapter tests pass.

Run `git add apps/graph-gateway/internal/httpapi apps/graph-gateway/internal/nebula && git commit -m "feat: add generation-qualified graph gateway contract"`.

---

### Task 5: Add Generation-Aware Projector Delivery Metadata

**Files:**
- Modify: `apps/graph-projector/src/projector.ts`
- Modify: `apps/graph-projector/src/gateway.ts`
- Modify: `apps/graph-projector/src/repository.ts`
- Test: `apps/graph-projector/src/gateway.test.ts`
- Test: `apps/graph-projector/src/projector.test.ts`

**Interfaces:**
- Adds optional generation metadata to the existing canonical event envelope for compatibility.
- Generation-qualified events must carry `manifestId`, `generationId`, `baselineId`, and `schemaVersion`; missing metadata causes a retryable `GRAPH_PROJECTION_GENERATION_REQUIRED` error on the new path.
- Existing legacy events continue to use the current relationship-outbox checkpoint and contract.

- [ ] **Step 1: Write failing metadata tests**

Cover generation metadata forwarding, rejection of a cross-generation edge payload, and preservation of the legacy event path.

Run `pnpm --filter @specforge/graph-projector test -- gateway.test.ts projector.test.ts`.

Expected: FAIL for the new generation assertions.

- [ ] **Step 2: Add metadata parsing and forwarding**

Parse the event envelope into a typed `ProjectionIdentity`, attach it to `/v1/projections`, and require the Gateway receipt to echo the same identity. Keep the old graphVersion-only request when the event has no generation metadata.

- [ ] **Step 3: Add generation-aware checkpoint namespace**

When generation metadata exists, use `manifestId:partitionId` as the checkpoint partition key and never update the legacy `relationship-outbox` checkpoint from a generation-qualified event.

- [ ] **Step 4: Run focused tests and commit**

Run `pnpm --filter @specforge/graph-projector typecheck` and `pnpm --filter @specforge/graph-projector test`.

Expected: Existing projector tests and new generation tests pass.

Run `git add apps/graph-projector/src/projector.ts apps/graph-projector/src/gateway.ts apps/graph-projector/src/repository.ts apps/graph-projector/src/gateway.test.ts apps/graph-projector/src/projector.test.ts && git commit -m "feat: carry generation metadata through projector"`.

---

### Task 6: Add Parity and Lifecycle Verification

**Files:**
- Create: `apps/graph-projector/src/generation-parity.ts`
- Create: `apps/graph-projector/src/generation-parity.test.ts`
- Modify: `apps/graph-projector/src/projection.e2e.test.ts`
- Modify: `docs/adr/0036-bounded-nebula-knowledge-projection-generations.md`
- Modify: `docs/TODO.md`

**Interfaces:**
- Produces `compareGenerationParity` for control totals, deterministic bucket digests, and bounded semantic probes.
- Returns a typed result with `status: "MATCH" | "MISMATCH"`, mismatch buckets, source watermarks, and evidence references.

- [ ] **Step 1: Write failing parity tests**

Test equal totals and digests, missing bucket detection, Scope mismatch detection, and semantic probe mismatch.

Run `node .\\node_modules\\vitest\\vitest.mjs run --root . apps/graph-projector/src/generation-parity.test.ts`.

Expected: FAIL because parity comparison does not exist.

- [ ] **Step 2: Implement deterministic parity comparison**

Hash canonical tuples sorted by `(entityType, logicalId, relationType, sourceId, targetId)` into fixed buckets. Never use a sample-only result for activation. Return bounded mismatch details and preserve exact Manifest identity in the result.

- [ ] **Step 3: Add end-to-end lifecycle coverage**

Extend the existing projection E2E flow to prove failed validation leaves ACTIVE unchanged, successful publish moves the old ACTIVE to PREVIOUS, rollback restores the previous generation, and a cleanup request cannot target ACTIVE.

- [ ] **Step 4: Run the Phase 1 verification set**

Run `pnpm db:generate`, `pnpm db:push`, `pnpm --filter @specforge/core typecheck`, `pnpm --filter @specforge/graph-projector typecheck`, `pnpm --filter @specforge/graph-projector test`, `go test ./...`, and `git diff --check`.

Expected: All focused tests, typechecks, schema validation, Go tests, and diff checks pass. No scale certification claim is added.

- [ ] **Step 5: Synchronize implementation evidence and close the implementation session**

Create a new exact-Scope `prepare_design_change` session for the implementation, update ADR-0036 and the MCP Evidence record with exact command results, run selected `pnpm design-facts:sync`, selected `pnpm design-facts:check`, and `pnpm design-facts:federation:check`, then close the same implementation session as `CONVERGED` only if every result passes.

- [ ] **Step 6: Commit the Phase 1 integration**

Run `git add apps/graph-projector/src/generation-parity.ts apps/graph-projector/src/generation-parity.test.ts apps/graph-projector/src/projection.e2e.test.ts docs/adr/0036-bounded-nebula-knowledge-projection-generations.md docs/TODO.md && git commit -m "feat: verify bounded Nebula projection generations"`.

## Self-Review Checklist

- Spec coverage: Tasks 1-3 cover PostgreSQL authority, three slots, and lifecycle; Tasks 4-5 cover generation-qualified graph identity, Gateway validation, and checkpoint namespaces; Task 6 covers parity, rollback, and evidence. Production multi-node and scale certification remain intentionally outside this Phase 1 plan.
- Placeholder scan: no implementation step depends on an unspecified file, command, or error code.
- Type consistency: `ProjectionIdentity` is shared by Core, Projector, and Go contract; `manifestId` and `generationId` use the same names in all payloads; lifecycle methods use the same exact Scope shape.
