# NebulaGraph Production Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a scope-safe, idempotent PostgreSQL-outbox projection to NebulaGraph, usable through one local Compose profile or an externally configured enterprise cluster.

**Architecture:** PostgreSQL remains authoritative and emits `RelationshipOutbox` rows. A TypeScript Projector claims, submits, retries, and checkpoints these rows through a private Go Gateway; the Gateway is the only component that uses the official Nebula client. GraphStore uses the Gateway only when `SPECFORGE_GRAPH_STORE=nebula`, with explicit PostgreSQL fallback.

**Tech Stack:** TypeScript 5.7, Node 22, pnpm 9, Prisma 6, Vitest 2, Go, official NebulaGraph Go client, NebulaGraph 3.8, Docker Compose.

## Global Constraints

- Every graph identity and operation requires exact `enterpriseId`, `applicationServiceId`, and `scopePath`.
- PostgreSQL is authoritative; NebulaGraph is rebuildable and never on the MCP authoring path.
- Gateway accepts typed batches and traversal plans, never caller-provided nGQL.
- Delivery is at-least-once; only successful idempotent projection can advance an exact-scope checkpoint.
- `SPECFORGE_GRAPH_STORE=postgres` is the only fallback; Nebula failures never silently mix stores.
- English is canonical; human-facing records require Chinese localization and MCP synchronization before completion.

---

## File Map

- Create `apps/graph-gateway/`: Go HTTP service, Nebula adapter, schema bootstrap, health, and compatibility tests.
- Create `apps/graph-projector/`: leased PostgreSQL outbox delivery, retry, checkpoint, and health logic.
- Modify `packages/graph-store/src/index.ts`: add `nebula` configuration and factory branch.
- Create `packages/graph-store/src/nebula-gateway.ts`: typed Gateway client implementing `GraphStore`.
- Modify `apps/impact-worker/src/index.ts`: environment-to-GraphStore configuration with explicit validation.
- Modify `prisma/schema.prisma`: projector lease, retry, sanitized diagnostic, and delivery metadata.
- Create `prisma/migrations/<timestamp>_nebulagraph_projection_runtime/migration.sql`: additive migration and indexes.
- Modify `deploy/compose.yaml` and create `deploy/compose.graph-local.yaml`: opt-in single-node Nebula, Gateway, and Projector profile.
- Create `deploy/graph/.env.example`, `deploy/graph/verify-projection.ps1`, and `docs/operations/nebulagraph-projection.md`.
- Create ADR, Proposal, Context Pack, design assets, typed links, Evidence, and backlog updates through MCP during the final task.

### Task 1: Gateway API Contract and Nebula Compatibility Gate

**Files:** Create `apps/graph-gateway/go.mod`, `apps/graph-gateway/cmd/server/main.go`, `apps/graph-gateway/internal/httpapi/*.go`, `apps/graph-gateway/internal/nebula/*.go`, and Go tests.

**Produces:** `POST /v1/projections`, `POST /v1/traversals`, `GET /v1/checkpoints/{scopeId}`, and `GET /health`; all requests use structured JSON contracts matching `@specforge/core` graph types.

- [ ] Write Go handler tests proving a batch with mixed scopes returns `400 SCOPE_MISMATCH`, raw `ngql` is rejected, and a scoped health failure returns `503` without credential text.
- [ ] Run `go test ./...` and verify RED because the Gateway packages do not exist.
- [ ] Implement a request validator, an injected `NebulaClient` interface, scope-key encoder, and error sanitizer. Implement the official client adapter with parameter escaping owned by the adapter only.
- [ ] Add a compatibility test that creates `specforge_graph`, creates vertex/edge schema, writes two scoped nodes and one edge, and returns a two-hop traversal.
- [ ] Run `go test ./...`; expected: pass against the local Nebula Compose service.
- [ ] Commit: `feat: add NebulaGraph gateway compatibility contract`.

### Task 2: Nebula GraphStore Adapter

**Files:** Create `packages/graph-store/src/nebula-gateway.ts` and tests; modify `packages/graph-store/src/index.ts`.

**Consumes:** Gateway projection/traversal JSON. **Produces:** `{ kind: "nebula", baseUrl, fetch? }` `GraphStoreConfig` and `NebulaGatewayGraphStore`.

- [ ] Write Vitest contract cases that call a fake Gateway and assert exact scope forwarding, typed traversal output mapping, and a gateway-unavailable error of `GRAPH_GATEWAY_UNAVAILABLE`.
- [ ] Run `pnpm --filter @specforge/graph-store test -- nebula-gateway.test.ts`; expected RED.
- [ ] Implement only `traverse`, `upsertProjection`, and `checkpoint` as typed HTTP operations with abort budget propagation; reject empty scopes before any request.
- [ ] Add the `nebula` factory branch and preserve existing memory/PostgreSQL behavior.
- [ ] Run focused tests and `pnpm --filter @specforge/graph-store typecheck`; expected pass.
- [ ] Commit: `feat: add Nebula gateway graph store adapter`.

### Task 3: Projector Lease, Delivery, and Checkpoint Rules

**Files:** Create `apps/graph-projector/src/projector.ts`, `repository.ts`, `index.ts`, and unit/integration tests; modify `prisma/schema.prisma` and add an additive migration.

**Produces:** `GraphProjector.processOnce(): Promise<ProcessSummary>` and `PrismaProjectionRepository` with `claim`, `complete`, `retry`, `deadLetter`, and `checkpoint` operations.

- [ ] Write failing tests for duplicate event replay, lease expiry recovery, projection failure with bounded retry, sanitized 64-hex diagnostic reference, and checkpoint non-advancement after a failed lower graph version.
- [ ] Run `pnpm --filter @specforge/graph-projector test`; expected RED.
- [ ] Add nullable lease owner/expiry, terminal status, next availability, and diagnostic fields plus indexes for claim order. Do not alter relationship or event authority fields.
- [ ] Implement `FOR UPDATE SKIP LOCKED` claims ordered by `availableAt`, idempotent Gateway submission, exponential backoff, terminal dead-letter state, and monotonic exact-scope checkpoint updates in one PostgreSQL transaction after Gateway acknowledgement.
- [ ] Run projector unit tests and disposable PostgreSQL integration tests; expected pass.
- [ ] Commit: `feat: project relationship outbox to NebulaGraph`.

### Task 4: Runtime Selection, Health, and Impact-Worker Wiring

**Files:** Modify `packages/graph-store/src/index.ts` and `apps/impact-worker/src/index.ts`; create tests in `apps/impact-worker/src/index.test.ts`.

- [ ] Write failing tests for `SPECFORGE_GRAPH_STORE=nebula` without Gateway URL, valid Nebula config, valid PostgreSQL fallback, and no implicit fallback after a Nebula error.
- [ ] Implement `graphStoreConfigFromEnvironment(env)` returning either validated `postgres` or `nebula` configuration. Default only to `postgres` in local development; production requires an explicit selector.
- [ ] Add Gateway `/health` response fields: `status`, `graphSchemaReady`, and sanitized `code`; add Projector `/health` fields: backlog, oldest age, last checkpoint, retries, dead letters, and sanitized code.
- [ ] Run relevant package tests and root `pnpm typecheck`; expected pass.
- [ ] Commit: `feat: configure graph projection runtime health`.

### Task 5: Local Compose and External-Cluster Operations

**Files:** Create `deploy/compose.graph-local.yaml`, `deploy/graph/.env.example`, `deploy/graph/verify-projection.ps1`; modify `deploy/compose.yaml`; create `docs/operations/nebulagraph-projection.md`.

- [ ] Write configuration assertions that local profile exposes no Nebula host port by default, Gateway/Projector depend on healthy PostgreSQL and Nebula, and external mode contains no Nebula service.
- [ ] Add a single-node NebulaGraph 3.8 profile plus private Gateway and Projector services. Keep the existing Web/PostgreSQL deployment unchanged unless the graph profile is selected.
- [ ] Document required external variables, secret handling, start/stop, health inspection, replay, PostgreSQL fallback, and recovery. State clearly that single-node Compose is compatibility verification, not a multi-node production cluster.
- [ ] Run `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly`; expected pass.
- [ ] Run the live verification: create one exact-scope relation through MCP persistence, wait for outbox drain/checkpoint, verify Nebula traversal, restart Projector, and verify no duplicate logical edge.
- [ ] Commit: `feat: add local Nebula projection profile`.

### Task 6: Cross-Adapter, Scope-Isolation, and Smoke Verification

**Files:** Create/update GraphStore, Projector, MCP smoke, and impact-worker integration tests.

- [ ] Build a shared fixture with two sibling application-service scopes, two-hop paths, and budget-triggered partial traversal.
- [ ] Assert PostgreSQL and Nebula return equal scoped nodes, path evidence, completion state, and truncation reasons; assert neither adapter returns sibling-scope data.
- [ ] Assert an impact run waits until its required graph version is checkpointed, then completes using the Nebula adapter; assert an unavailable Gateway does not cause PostgreSQL reads unless the explicit selector is `postgres`.
- [ ] Run `pnpm --filter @specforge/graph-store test`, `pnpm --filter @specforge/graph-projector test`, `pnpm --filter @specforge/impact-worker test`, and the scoped MCP smoke suite; expected pass.
- [ ] Commit: `test: verify graph projection consistency and isolation`.

### Task 7: Design Facts, MCP Synchronization, and Completion Evidence

**Files:** Create `docs/adr/0012-nebulagraph-production-projection.md`; modify `docs/design-facts/baseline-manifest.json`, `docs/TODO.md`, and README/operations links as required.

- [ ] Write an ADR with the accepted topology, PostgreSQL authority, at-least-once/idempotent delivery, exact-scope checkpoint rule, explicit fallback, security/redaction boundary, and deferred multi-node scaling.
- [ ] Through MCP, write/update the matching ADR, Proposal, Context Pack, Gateway API, Projector service, deployment topology, data-model/rule assets, typed links, and Evidence in the exact Designer scope. Supply English canonical content and complete Chinese overlays.
- [ ] Run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the exact-scope federation check. Read back IDs, directional links, localized fields, and evidence command results.
- [ ] If any MCP operation cannot persist, record `MCP synchronization blocked`, its failure reason, owner, and retry trigger in the ADR and backlog; do not mark this task complete.
- [ ] Update the backlog only after all focused tests, operational checks, MCP writes, and reconciliation checks pass.
- [ ] Commit implementation and matching design facts together: `docs: record NebulaGraph projection design facts`.

## Self-Review

- Spec coverage: Tasks 1-6 cover local/external topology, gateway isolation, idempotency, retry, checkpointing, fallback, health, and verification; Task 7 covers ADR/MCP governance.
- No-placeholder scan: every task names concrete files, commands, interfaces, or checks; deferred multi-node scale remains explicitly outside this implementation.
- Type consistency: `GraphStoreConfig.kind="nebula"`, `GraphProjector.processOnce`, and Gateway routes are introduced before their consumers.
