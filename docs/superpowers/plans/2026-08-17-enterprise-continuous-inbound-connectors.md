# Enterprise Continuous Inbound Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a PostgreSQL-authoritative, exact-Scope continuous inbound synchronization platform with snapshot-safe observation semantics, durable connector operations, PostgreSQL Schema and OpenAPI adapters, and a declarative REST/JSON catalog adapter.

**Architecture:** Extend the existing `continuous-observation/v1` contract with a versioned v2 envelope instead of changing existing streams in place. PostgreSQL stores runs, leases, fencing tokens, observations, candidates, receipts, and Outbox records; a dedicated worker reads external sources and submits through the existing MCP receiving boundary. Observation processing remains separate from governed MCP promotion, reconciliation, and graph projection.

**Tech Stack:** TypeScript 5.7, `@specforge/core`, Prisma 6/PostgreSQL 16, MCP SDK 1.29, Zod 3, Vitest, Node.js `fetch`, Docker Compose, and existing Go `specforge-cli` only for the local repository/Agent workflow.

## Global Constraints

- Owning Scope is exactly `com.huawei.celon.desiner` with scope path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL is authoritative for connector state, observations, candidates, relationships, receipts, and Outbox; graph storage is derived only.
- MCP is the only authored system-of-record write boundary for accepted ADRs, Proposals, Context Packs, Evidence, assets, and typed links.
- Every write and read is exact-Scope; sibling Scope data is never returned as partial metadata.
- `continuous-observation/v1` remains compatible; v2 streams use a versioned source namespace or explicit audited migration.
- Full snapshots infer Tombstones only after complete finalization with the same inventory-boundary digest.
- Delta streams require explicit `TOMBSTONE` operations; temporary absence is not deletion.
- Connector credentials are Secret References; raw credentials never enter database payloads, logs, design facts, or MCP responses.
- Declarative mappings use bounded JSON Pointer selectors and typed transforms; arbitrary JavaScript, shell commands, and dynamic module loading are forbidden.
- Observations remain candidates by default; formal facts require existing MCP review, localization, promotion, and reconciliation gates.
- Human-facing accepted content has English canonical fields and complete Chinese overlays.
- Do not modify unrelated user files: `outputs/` and `scripts/build-design-code-challenge-workbook.mjs`.
- Before implementation, reuse the open Design Change Session `design-change-session:526f9b9f-3d19-40d8-bab8-7a9922b8187f`; after verification, close the same session with exact evidence.

---

## File Map

### Core contracts

- Modify `packages/core/src/federation/continuous.ts`: v2 envelope, operation/run types, canonical digest, shape validation, and snapshot rules.
- Modify `packages/core/src/federation/types.ts`: connector run, lease, dead-letter, health, and reconciliation state types.
- Modify `packages/core/src/federation/index.ts` and `packages/core/src/index.ts`: export the v2 contracts.
- Create `packages/core/src/__tests__/continuous-observation-v2.test.ts`: pure contract, digest, snapshot, tombstone, and boundary tests.

### Persistence and MCP bridge

- Modify `prisma/schema.prisma`: v2 fields and durable Connector Run, Lease, Seen Identity, Dead Letter, and Health models.
- Create `prisma/migrations/20260817_continuous_inbound_connectors/migration.sql`: forward-only PostgreSQL migration matching Prisma.
- Create `apps/mcp-server/src/connectors/v2-persistence.ts`: exact-Scope v2 batch acceptance, snapshot finalization, fencing validation, and cursor read-back.
- Create `apps/mcp-server/src/connectors/operations-persistence.ts`: run, lease, dead-letter, health, and connector operation persistence.
- Modify `apps/mcp-server/src/federation/tools.ts`: v2 submission and connector operation MCP tools.
- Modify `apps/mcp-server/src/federation/tools.test.ts`: registration, authorization, and input rejection tests.
- Create `apps/mcp-server/src/connectors/v2-persistence.integration.test.ts`: real PostgreSQL atomicity, resume, tombstone, and Scope tests.

### Worker and adapters

- Create `apps/connector-worker/package.json`, `apps/connector-worker/tsconfig.json`, and `apps/connector-worker/src/index.ts`: independently runnable worker package.
- Create `apps/connector-worker/src/scheduler.ts`: due-run selection, PostgreSQL lease acquisition, fencing, heartbeat, and bounded retry.
- Create `apps/connector-worker/src/secret-resolver.ts`: environment/Docker Secret resolution and redaction.
- Create `apps/connector-worker/src/adapter-registry.ts`: typed adapter factory with capability and mapping-version checks.
- Create `apps/connector-worker/src/adapters/postgres-schema.ts`: read-only PostgreSQL catalog adapter.
- Create `apps/connector-worker/src/adapters/openapi.ts`: local-file and HTTPS OpenAPI 3.0/3.1 adapter.
- Create `apps/connector-worker/src/adapters/declarative-catalog.ts`: bounded REST/JSON mapping adapter.
- Create `apps/connector-worker/src/adapters/http-policy.ts`: allowlist, redirect, private-network, size, content-type, and timeout policy.
- Create `apps/connector-worker/src/__tests__/scheduler.test.ts`, `postgres-schema.test.ts`, `openapi.test.ts`, `declarative-catalog.test.ts`, and `http-policy.test.ts`.

### Observation processing and read-only status

- Create `apps/mcp-server/src/connectors/observation-processor.ts`: Outbox claim, identity matching, candidate/tombstone/conflict classification, and Review Bundle dispatch.
- Create `apps/mcp-server/src/connectors/observation-processor.test.ts`: idempotency, authority, conflict, deletion, and Scope tests.
- Modify `apps/mcp-server/src/connectors/index.ts`: export the connector runtime, adapters, and persistence boundaries.
- Create `apps/web/lib/connectors/health-loader.ts`: current-Scope read-only connector health loader.
- Create `apps/web/lib/connectors/health-loader.test.ts`: health Scope and freshness tests.
- Create `apps/web/components/connectors/connector-health-summary.tsx`: read-only status summary with no editing controls.

### Deployment, documentation, and design facts

- Modify `docker-compose.yml`: PostgreSQL health check and `connector-worker` service with explicit opt-in/disable behavior.
- Create `apps/connector-worker/Dockerfile`: multi-stage Node 22 image that builds the workspace package and runs the worker as a non-root user.
- Modify `docs/operations/single-host-docker-compose.md`: worker configuration, secrets, connector registration, recovery, and health checks.
- Modify `docs/adr/0020-continuous-observation-governance.md`: accepted v2/platform increment, evidence, and deferred vendor boundaries.
- Modify `docs/adr/0010-federated-design-fact-synchronization.md`: continuous inbound delivery status and source ownership constraints.
- Modify `docs/TODO.md`: close only the generic connector item after all acceptance evidence; retain vendor-specific adapters as deferred facts.
- Modify `docs/design-facts/baseline-manifest.json` and the matching bilingual Proposal, Context Pack, Evidence, and typed links through the existing manifest/MCP workflow.

---

### Task 1: Add the V2 Observation Contract

**Files:**
- Modify: `packages/core/src/federation/continuous.ts`
- Modify: `packages/core/src/federation/types.ts`
- Modify: `packages/core/src/federation/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/continuous-observation-v2.test.ts`

**Interfaces:**
- Consumes: existing `ArchitectureScopeRef`, `contentDigest`, `ContinuousObservationBatch`, and v1 integrity functions.
- Produces: `CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION`, `ObservationRunMode`, `ObservationOperation`, `ContinuousObservationV2`, `ContinuousObservationBatchV2`, `assertContinuousObservationBatchV2`, `computeContinuousObservationBatchV2Integrity`, and `assertSnapshotFinalizationInput`.

- [ ] **Step 1: Write failing contract tests**

  Add tests for:

  ```ts
  expect(validV2().mode).toBe("FULL_SNAPSHOT");
  expect(() => assertContinuousObservationBatchV2({ ...validV2(), fencingToken: "stale" })).not.toThrow();
  expect(() => assertContinuousObservationBatchV2({ ...validV2(), observations: [{ ...upsert(), operation: "TOMBSTONE", payload: { value: 1 } }] })).toThrow("TOMBSTONE_PAYLOAD_FORBIDDEN");
  expect(() => assertSnapshotFinalizationInput({ complete: false, isLastPage: true })).toThrow("SNAPSHOT_NOT_COMPLETE");
  ```

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `pnpm exec vitest run packages/core/src/__tests__/continuous-observation-v2.test.ts`

  Expected: FAIL because the v2 types and validators do not yet exist.

- [ ] **Step 3: Implement the minimal v2 types and canonical integrity**

  Use this shape as the public contract:

  ```ts
  export type ObservationRunMode = "FULL_SNAPSHOT" | "DELTA";
  export type ObservationOperation = "UPSERT" | "TOMBSTONE";

  export interface ContinuousObservationV2 {
    id: string;
    operation: ObservationOperation;
    externalAssetType: string;
    externalId: string;
    payload?: Record<string, unknown>;
    deletionReason?: string;
    sourceVersion: string;
    observedAt?: string;
  }

  export interface ContinuousObservationBatchV2 {
    contractVersion: "continuous-observation/v2";
    architectureScope: ArchitectureScopeRef;
    connectorId: string;
    sourceNamespace: string;
    runId: string;
    fencingToken: string;
    mode: ObservationRunMode;
    snapshotId: string | null;
    mappingVersion: string;
    mappingDigest: string;
    inventoryBoundaryDigest: string;
    sequence: number;
    previousBatchDigest: string | null;
    pageIndex: number;
    isLastPage: boolean;
    sourceCursor: string | null;
    sourceHighWaterMark: string | null;
    observedAt: string;
    coverage: Record<string, unknown>;
    observations: ContinuousObservationV2[];
    payloadDigest: string;
    batchDigest: string;
  }
  ```

  Canonical digest input must include all stream identity, run, boundary, sequence, page, cursor, coverage, and observation fields. Tombstones cannot contain payloads; UPSERTs must contain payloads.

- [ ] **Step 4: Run the focused test and package typecheck**

  Run: `pnpm exec vitest run packages/core/src/__tests__/continuous-observation-v2.test.ts` and `pnpm --filter @specforge/core typecheck`

  Expected: all v2 tests pass and Core typecheck exits 0.

- [ ] **Step 5: Commit**

  ```powershell
  git add packages/core/src/federation packages/core/src/index.ts packages/core/src/__tests__/continuous-observation-v2.test.ts
  git commit -m "feat: add continuous observation v2 contract"
  ```

### Task 2: Add PostgreSQL State and Exact-Scope V2 Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260817_continuous_inbound_connectors/migration.sql`
- Create: `apps/mcp-server/src/connectors/v2-persistence.ts`
- Create: `apps/mcp-server/src/connectors/operations-persistence.ts`
- Test: `apps/mcp-server/src/connectors/v2-persistence.integration.test.ts`

**Interfaces:**
- Consumes: Core v2 batch validators and existing `resolveWritableScope`, `readableScope`, `writableActor`, `createOutbox`, and Prisma transaction patterns.
- Produces: `submitContinuousObservationBatchV2`, `finalizeContinuousSnapshot`, `createConnectorRun`, `claimConnectorRun`, `heartbeatConnectorLease`, `releaseConnectorLease`, `recordConnectorDeadLetter`, and `getConnectorHealth`.

- [ ] **Step 1: Add failing PostgreSQL integration cases**

  Cover first batch, identical retry, stale fencing rejection, sequence gap, incomplete snapshot, same-boundary tombstone, changed-boundary no-delete, sibling Scope rejection, and transaction rollback.

  ```ts
  await expect(submitContinuousObservationBatchV2({ ...batch, fencingToken: "expired" })).rejects.toThrow("CONNECTOR_FENCING_TOKEN_INVALID");
  await expect(finalizeContinuousSnapshot({ ...scope, runId, snapshotId, inventoryBoundaryDigest: "changed" })).rejects.toThrow("SNAPSHOT_BOUNDARY_MISMATCH");
  expect(await listTombstoneCandidates(scope, runId)).toHaveLength(1);
  ```

- [ ] **Step 2: Run the integration file to verify the new cases fail**

  Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/connectors/v2-persistence.integration.test.ts`

  Expected: FAIL with missing Prisma models/functions.

- [ ] **Step 3: Add schema and migration**

  Add v2 columns to cursor, batch, and observation records, then add Scope-keyed models for `ConnectorDefinition`, `ConnectorRun`, `ConnectorLease`, `ConnectorSnapshotIdentity`, `ConnectorDeadLetter`, and `ConnectorHealthSnapshot`. Every model gets `applicationServiceId`, `scopePath`, exact Scope indexes, and idempotency constraints. Lease claims include a monotonically increasing fencing token.

  The migration must use forward-only `ALTER TABLE`, `CREATE TABLE`, unique constraints, and indexes. It must not delete existing v1 rows or rewrite existing v1 streams.

- [ ] **Step 4: Implement atomic v2 acceptance and finalization**

  The transaction must:

  1. resolve and validate exact writable Scope;
  2. lock the connector stream;
  3. verify connector status, capability, run ownership, and fencing token;
  4. verify v2 digest, sequence, page, mapping, and boundary;
  5. insert batch, observations, and seen identities idempotently;
  6. advance cursor and append Outbox atomically;
  7. on finalization, compare only the same completed boundary and create Tombstone candidates;
  8. leave incomplete or failed snapshots unable to produce deletions.

- [ ] **Step 5: Run schema and focused integration checks**

  Run: `pnpm db:generate`, `pnpm db:push`, `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/connectors/v2-persistence.integration.test.ts`, and `pnpm --filter @specforge/mcp-server typecheck`

  Expected: schema is synchronized, all v2 persistence cases pass, and MCP Server typecheck exits 0.

- [ ] **Step 6: Commit**

  ```powershell
  git add prisma/schema.prisma prisma/migrations/20260817_continuous_inbound_connectors apps/mcp-server/src/connectors/v2-persistence.ts apps/mcp-server/src/connectors/operations-persistence.ts apps/mcp-server/src/connectors/v2-persistence.integration.test.ts
  git commit -m "feat: persist scoped connector runs and snapshots"
  ```

### Task 3: Implement Connector Operations and Worker Leases

**Files:**
- Create: `apps/connector-worker/package.json`
- Create: `apps/connector-worker/tsconfig.json`
- Create: `apps/connector-worker/src/index.ts`
- Create: `apps/connector-worker/src/scheduler.ts`
- Create: `apps/connector-worker/src/secret-resolver.ts`
- Create: `apps/connector-worker/src/adapter-registry.ts`
- Test: `apps/connector-worker/src/__tests__/scheduler.test.ts`
- Test: `apps/connector-worker/src/__tests__/secret-resolver.test.ts`

**Interfaces:**
- Consumes: `createConnectorRun`, `claimConnectorRun`, `heartbeatConnectorLease`, `submitContinuousObservationBatchV2`, and `ConnectorSourceAdapter`.
- Produces: `ConnectorScheduler`, `LeaseOwner`, `SecretResolver`, `ConnectorAdapterRegistry`, and `runWorkerOnce`.

- [ ] **Step 1: Write scheduler failure tests**

  Test that two owners cannot use one stream, an expired lease can be taken over with a higher fencing token, stale submission is rejected, transient errors back off, and terminal errors quarantine the run.

  ```ts
  const first = await scheduler.claimNext("worker-a");
  const takeover = await scheduler.claimNext("worker-b");
  expect(takeover.fencingToken).toBeGreaterThan(first.fencingToken);
  expect(await scheduler.submitWithLease(first, page)).toMatchObject({ status: "REJECTED", code: "CONNECTOR_FENCING_TOKEN_INVALID" });
  ```

- [ ] **Step 2: Run tests and verify missing worker modules fail**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/scheduler.test.ts apps/connector-worker/src/__tests__/secret-resolver.test.ts`

  Expected: FAIL because the worker package does not exist.

- [ ] **Step 3: Implement the worker package and bounded retry policy**

  `ConnectorScheduler` must claim due runs, invoke a registered adapter, submit each page with the current run and fencing token, heartbeat between pages, finalize snapshots, and release the lease. It must classify errors into retryable, suspended, or quarantined without infinite retry.

  `SecretResolver` accepts only references shaped as `env:<NAME>` or `docker-secret:<NAME>`, reads the configured source, and exposes only an opaque credential object to adapters. Error messages must contain the reference kind but never the secret value.

- [ ] **Step 4: Implement the adapter registry**

  Register adapters by `kind` and verify connector capability, contract version, mapping version, and configuration schema before a run can start. Unknown kinds and unsupported mappings produce terminal configuration errors.

- [ ] **Step 5: Run worker tests and typecheck**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__` and `pnpm --filter @specforge/connector-worker typecheck`

  Expected: lease, fencing, retry, secret redaction, and registry tests pass.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/connector-worker
  git commit -m "feat: add durable connector worker leases"
  ```

### Task 4: Add the PostgreSQL Schema Adapter

**Files:**
- Create: `apps/connector-worker/src/adapters/postgres-schema.ts`
- Test: `apps/connector-worker/src/__tests__/postgres-schema.test.ts`
- Test: `apps/connector-worker/src/__tests__/fixtures/postgres-schema-fixture.ts`

**Interfaces:**
- Consumes: `ConnectorSourceAdapter`, `ConnectorSourcePollInput`, read-only secret resolution, and v2 page builder.
- Produces: `PostgresSchemaAdapter` with `kind = "postgres-schema"` and `sourceNamespace = "postgres-schema-v1"`.

- [ ] **Step 1: Add catalog golden tests**

  Verify stable identities for schemas, tables, columns, constraints, indexes, enums, functions, comments, and foreign-key relationships. Verify excluded schemas create coverage gaps and business rows are never queried.

- [ ] **Step 2: Run the golden tests to verify the adapter is missing**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/postgres-schema.test.ts`

  Expected: FAIL because `PostgresSchemaAdapter` does not exist.

- [ ] **Step 3: Implement the read-only catalog adapter**

  Use a separate read-only PostgreSQL connection and parameterized catalog queries. Build deterministic pages sorted by object kind and stable identity. Include source transaction/high-water metadata and an inventory-boundary digest derived from selected schemas, exclusions, and visibility policy. Never interpolate identifiers from configuration into raw SQL without identifier validation.

- [ ] **Step 4: Run adapter tests and an integration smoke**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/postgres-schema.test.ts`; with PostgreSQL available, run `pnpm exec vitest run --runInBand apps/connector-worker/src/__tests__/postgres-schema.integration.test.ts`.

  Expected: deterministic output, bounded pages, no business-row reads, and stable boundary digest.

- [ ] **Step 5: Commit**

  ```powershell
  git add apps/connector-worker/src/adapters/postgres-schema.ts apps/connector-worker/src/__tests__/postgres-schema.test.ts apps/connector-worker/src/__tests__/fixtures/postgres-schema-fixture.ts
  git commit -m "feat: observe PostgreSQL schema catalogs"
  ```

### Task 5: Add the OpenAPI Adapter and HTTP Policy

**Files:**
- Create: `apps/connector-worker/src/adapters/http-policy.ts`
- Create: `apps/connector-worker/src/adapters/openapi.ts`
- Test: `apps/connector-worker/src/__tests__/http-policy.test.ts`
- Test: `apps/connector-worker/src/__tests__/openapi.test.ts`

**Interfaces:**
- Consumes: `SecretResolver`, `ConnectorSourceAdapter`, and v2 page builder.
- Produces: `OpenApiSourceAdapter` with `kind = "openapi"` and `sourceNamespace = "openapi-v1"`.

- [ ] **Step 1: Write security and parser tests**

  Cover HTTPS-only URLs, host allowlist, private-IP rejection, bounded redirects, response byte limits, content-type checks, timeout cancellation, OpenAPI 3.0 and 3.1, local `$ref`, bounded remote `$ref`, cyclic refs, unsupported syntax, ETag reuse, and digest changes.

- [ ] **Step 2: Run tests and verify missing adapter behavior**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/http-policy.test.ts apps/connector-worker/src/__tests__/openapi.test.ts`

  Expected: FAIL until the policy and adapter are implemented.

- [ ] **Step 3: Implement HTTP policy and bounded document loading**

  Resolve hostnames before connection and after redirects, reject disallowed private addresses, cap redirects and bytes, enforce timeout through `AbortSignal`, and redact authorization errors. Local file loading is limited to configured roots; the adapter cannot read arbitrary worker filesystem paths.

- [ ] **Step 4: Implement OpenAPI normalization**

  Normalize document identity, operations, parameters, request/response schemas, security schemes, servers, tags, and component references. Use `operationId` only when unique; otherwise use normalized method/path. Unsupported or cyclic references become coverage issues rather than silent omissions.

- [ ] **Step 5: Run tests and typecheck**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/http-policy.test.ts apps/connector-worker/src/__tests__/openapi.test.ts` and `pnpm --filter @specforge/connector-worker typecheck`

  Expected: all security/parser tests pass and no raw source credential appears in snapshots.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/connector-worker/src/adapters/http-policy.ts apps/connector-worker/src/adapters/openapi.ts apps/connector-worker/src/__tests__/http-policy.test.ts apps/connector-worker/src/__tests__/openapi.test.ts
  git commit -m "feat: add bounded OpenAPI connector"
  ```

### Task 6: Add Declarative REST/JSON Catalog Adapter

**Files:**
- Create: `apps/connector-worker/src/adapters/declarative-catalog.ts`
- Test: `apps/connector-worker/src/__tests__/declarative-catalog.test.ts`
- Test: `apps/connector-worker/src/__tests__/fixtures/catalog-profiles.ts`

**Interfaces:**
- Consumes: `HttpPolicy`, bounded JSON Pointer/typed-transform evaluator, `SecretResolver`, and v2 page builder.
- Produces: `DeclarativeCatalogAdapter` with profile kinds `cmdb-catalog` and `runtime-service-catalog`.

- [ ] **Step 1: Write profile validation and pagination tests**

  Cover missing stable ID, unsupported executable transform, invalid pagination, full snapshot, explicit delta tombstone, same-boundary deletion, changed-boundary no-delete, runtime evidence expiry, and bounded response traversal.

- [ ] **Step 2: Run tests and verify missing adapter behavior**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/declarative-catalog.test.ts`

  Expected: FAIL until profile validation and adapter code exist.

- [ ] **Step 3: Implement the profile schema**

  Accept only declarative fields for endpoint, page cursor, collection pointer, stable ID template, field pointers, relationship pointers, operation, source version, and evidence expiry. Reject JavaScript, shell, module, URL fetch, and arbitrary expression fields.

- [ ] **Step 4: Implement bounded REST pagination and normalization**

  Fetch pages under the shared HTTP policy, enforce maximum page count and bytes, normalize stable identities and relations, and calculate mapping, profile, and inventory-boundary digests. Require complete finalization for inferred tombstones.

- [ ] **Step 5: Run tests and typecheck**

  Run: `pnpm exec vitest run apps/connector-worker/src/__tests__/declarative-catalog.test.ts` and `pnpm --filter @specforge/connector-worker typecheck`

  Expected: profile, pagination, deletion, and expiry tests pass.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/connector-worker/src/adapters/declarative-catalog.ts apps/connector-worker/src/__tests__/declarative-catalog.test.ts apps/connector-worker/src/__tests__/fixtures/catalog-profiles.ts
  git commit -m "feat: add declarative catalog connector"
  ```

### Task 7: Process Accepted Observations into Governed Candidates

**Files:**
- Create: `apps/mcp-server/src/connectors/observation-processor.ts`
- Test: `apps/mcp-server/src/connectors/observation-processor.test.ts`
- Modify: `apps/mcp-server/src/connectors/index.ts`
- Modify: existing federation/knowledge persistence files only where the processor needs an established exported function

**Interfaces:**
- Consumes: `FEDERATION_CONTINUOUS_BATCH_ACCEPTED` Outbox records, `ExternalIdentityMapping`, `AuthorityPolicy`, `assembleKnowledgeReviewBundle`, `promoteKnowledgeCandidates`, `reconcilePersistedScope`, and impact-analysis enqueue contracts.
- Produces: `processContinuousObservationEvent`, `processTombstoneObservation`, `classifyObservationChange`, and `ObservationProcessResult`.

- [ ] **Step 1: Write processor tests**

  Test unchanged digest, new identity, unambiguous update, ambiguous identity, authority conflict, same-boundary Tombstone, stale runtime evidence, exact-Scope rejection, and idempotent Outbox replay.

- [ ] **Step 2: Run processor tests to verify missing implementation**

  Run: `pnpm exec vitest run apps/mcp-server/src/connectors/observation-processor.test.ts`

  Expected: FAIL because the processor does not exist.

- [ ] **Step 3: Implement normalization and classification**

  Load persisted observations and mappings by exact Scope; never trust event payloads as the source of candidate content if PostgreSQL has the persisted row. Classify changes into `UNCHANGED`, `CANDIDATE`, `TOMBSTONED`, or `CONFLICTED`. Preserve provenance and source digest.

- [ ] **Step 4: Dispatch existing governance stages**

  Create or refresh Review Bundles for candidate and tombstone groups, preserve the default review policy, and enqueue reconciliation/impact work only after a governed promotion result. Do not auto-promote business semantics.

- [ ] **Step 5: Run focused tests and package typecheck**

  Run: `pnpm exec vitest run apps/mcp-server/src/connectors/observation-processor.test.ts` and `pnpm --filter @specforge/mcp-server typecheck`

  Expected: all processor tests pass and the processor remains Scope-safe.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/mcp-server/src/connectors/observation-processor.ts apps/mcp-server/src/connectors/observation-processor.test.ts apps/mcp-server/src/connectors/index.ts apps/mcp-server/src/federation apps/mcp-server/src/knowledge
  git commit -m "feat: process continuous observations into candidates"
  ```

### Task 8: Expose Connector Operations and Read-Only Health

**Files:**
- Modify: `apps/mcp-server/src/federation/tools.ts`
- Modify: `apps/mcp-server/src/federation/tools.test.ts`
- Modify: `apps/mcp-server/src/connectors/index.ts`
- Create: `apps/web/lib/connectors/health-loader.ts`
- Create: `apps/web/lib/connectors/health-loader.test.ts`
- Create: `apps/web/components/connectors/connector-health-summary.tsx`

**Interfaces:**
- Consumes: operation persistence from Task 2 and exact-scope auth helpers already used by federation tools.
- Produces: MCP tools `submit_continuous_observation_batch_v2`, `create_connector_run`, `pause_connector_run`, `resume_connector_run`, `get_connector_run`, `get_connector_health`, and `replay_connector_dead_letter`.

- [ ] **Step 1: Add tool registration and authorization tests**

  Verify exact Scope success, sibling Scope denial, read-only annotations for health/status, unsupported fields rejection, and that secrets never appear in output.

- [ ] **Step 2: Run the tool tests and verify missing tools fail**

  Run: `pnpm exec vitest run apps/mcp-server/src/federation/tools.test.ts`

  Expected: FAIL for the new tool names.

- [ ] **Step 3: Implement MCP schemas and handlers**

  Use Zod input schemas, `assertWritableExactScope` for state-changing commands, `assertReadableExactScope` for health/status, and existing audit wrappers. No handler accepts a caller-supplied Scope different from the authenticated Scope.

- [ ] **Step 4: Add read-only current-Scope health**

  Show run status, source freshness, candidate count, conflict count, dead-letter count, Outbox lag, and reconciliation state. Do not add edit controls or cross-Scope aggregate cards.

- [ ] **Step 5: Run MCP and web checks**

  Run: `pnpm exec vitest run apps/mcp-server/src/federation/tools.test.ts apps/web/lib/connectors/health-loader.test.ts` and `pnpm --filter @specforge/mcp-server typecheck`.

  Expected: tools and read-only health tests pass with exact Scope assertions.

- [ ] **Step 6: Commit**

  ```powershell
  git add apps/mcp-server/src/federation/tools.ts apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/connectors apps/web
  git commit -m "feat: expose scoped connector operations"
  ```

### Task 9: Package Worker in Docker and Document Operations

**Files:**
- Modify: `docker-compose.yml`
- Create or modify: `apps/connector-worker/Dockerfile`
- Modify: `docs/operations/single-host-docker-compose.md`
- Create: `scripts/start-local.ps1`: Windows one-command PostgreSQL/schema/worker startup.
- Create: `scripts/start-local.sh`: POSIX one-command PostgreSQL/schema/worker startup.
- Test: `scripts/connector-compose.test.ts`: Compose and startup-script contract test.

**Interfaces:**
- Consumes: worker entrypoint and all completed connector tasks.
- Produces: one-command startup with PostgreSQL readiness, Worker health, configurable connector enablement, and restart recovery.

- [ ] **Step 1: Add a failing deployment smoke check**

  Assert that Compose contains PostgreSQL health, a connector-worker service, `DATABASE_URL`, an explicit worker disable switch, and a health check.

- [ ] **Step 2: Run the smoke check before Compose changes**

  Run: `pnpm exec vitest run scripts/connector-compose.test.ts`

  Expected: FAIL because the worker service is absent.

- [ ] **Step 3: Add the worker service**

  Configure the worker to wait for PostgreSQL health, use the same canonical database URL, avoid source credentials in Compose logs, expose `SPECFORGE_CONNECTOR_WORKER_PORT=8092` for `/healthz`, and run with a non-root image user where the existing image pattern allows it. Keep the service disabled when no connector is registered through an environment flag, not by silently bypassing health.

- [ ] **Step 4: Document setup and recovery**

  Document PostgreSQL readiness, connector registration through MCP, `env:` and `docker-secret:` references, manual run/ pause/resume, dead-letter replay, lease takeover, worker health, and the difference between run success and Scope convergence.

- [ ] **Step 5: Run Compose verification**

  Run: `docker compose config`, `docker compose up -d postgres`, `pnpm db:generate`, `pnpm db:push`, `docker compose up -d connector-worker`, and `Invoke-WebRequest -UseBasicParsing http://localhost:8092/healthz`.

  Expected: configuration validates, PostgreSQL is healthy, Worker starts, and health reports its dependency status without exposing secrets.

- [ ] **Step 6: Commit**

  ```powershell
  git add docker-compose.yml apps/connector-worker/Dockerfile docs/operations/single-host-docker-compose.md scripts/connector-compose.test.ts
  git commit -m "feat: deploy connector worker with compose"
  ```

### Task 10: Run End-to-End Verification and Synchronize Design Facts

**Files:**
- Modify: `docs/adr/0020-continuous-observation-governance.md`
- Modify: `docs/adr/0010-federated-design-fact-synchronization.md`
- Modify: `docs/TODO.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Create or modify: matching bilingual Proposal, Context Pack, Evidence, and typed-link manifest entries using the existing design-fact conventions.
- Test: `apps/mcp-server/src/connectors/continuous-inbound.e2e.test.ts`

**Interfaces:**
- Consumes: every implementation and focused test from Tasks 1-9, exact Scope, and the open Design Change Session.
- Produces: authoritative MCP records, read-back receipts, reconciliation evidence, and a closed design session only if all gates converge.

- [ ] **Step 1: Add the end-to-end scenario**

  Use a fixture source with an initial complete snapshot, an identical retry, one changed object, one deleted object, one incomplete snapshot, and one changed inventory boundary. Assert that only the same-boundary complete run produces a Tombstone candidate, promotion remains MCP-governed, and final reconciliation distinguishes run success from convergence.

- [ ] **Step 2: Run the end-to-end test before documentation changes**

  Run: `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run apps/mcp-server/src/connectors/continuous-inbound.e2e.test.ts`

  Expected: PASS only after all prior tasks are complete; no active Baseline changes on incomplete or failed runs.

- [ ] **Step 3: Update ADR, Proposal, Context Pack, Evidence, and backlog facts**

  Record exact Scope, v2 contract, worker/lease model, adapters, deferred vendor integrations, English canonical fields, complete Chinese overlays, and exact verification commands. Keep the generic connector item open until the final read-back is successful. Mark only the generic inbound capability complete; retain vendor-specific Huawei integrations as owned deferred facts with trigger and rationale.

- [ ] **Step 4: Run the design-fact preflight/read-back workflow**

  Run: `pnpm design-facts:sync`, `pnpm design-facts:check`, `pnpm design-facts:federation:check`, and the exact-Scope catalog/read-back command used by the existing manifest workflow.

  Expected: all matching MCP records exist in the Designer Scope; IDs, typed links, English fields, Chinese overlays, evidence commands, and Scope are consistent; no blocked or out-of-scope facts remain.

- [ ] **Step 5: Close the existing design-change session**

  Run:

  ```powershell
  pnpm design-context:close -- --session design-change-session:526f9b9f-3d19-40d8-bab8-7a9922b8187f --status CONVERGED --evidence "pnpm exec vitest run apps/mcp-server/src/connectors/continuous-inbound.e2e.test.ts=passed,pnpm db:push=passed,pnpm design-facts:check=passed,pnpm design-facts:federation:check=passed,docker compose config=passed"
  ```

  Expected: the same session closes as `CONVERGED`. If MCP synchronization or a required check fails, record `MCP synchronization blocked` with the failure reason and retry trigger, keep the backlog fact open, and do not claim completion.

- [ ] **Step 6: Run the final verification set**

  Run: `pnpm typecheck`, `pnpm test`, `pnpm --filter @specforge/mcp-server typecheck`, `pnpm exec vitest run apps/mcp-server/src/connectors apps/connector-worker/src`, `git diff --check`, and the Compose smoke command.

  Expected: all focused and package checks pass; only the two pre-existing user-owned untracked paths remain untracked.

- [ ] **Step 7: Commit the synchronized design records and implementation evidence**

  ```powershell
  git add docs/adr/0010-federated-design-fact-synchronization.md docs/adr/0020-continuous-observation-governance.md docs/TODO.md docs/design-facts/baseline-manifest.json docs/superpowers/plans/2026-08-17-enterprise-continuous-inbound-connectors.md
  git commit -m "docs: close continuous inbound connector governance"
  ```

## Self-Review Checklist

- Spec coverage: Tasks 1-2 cover v2 semantics, fencing, snapshots, boundary digests, persistence, and tombstones; Task 3 covers leases, worker recovery, secrets, and retry; Tasks 4-6 cover PostgreSQL, OpenAPI, and declarative catalog sources; Task 7 covers candidates, conflicts, review, promotion, reconciliation, and impact triggers; Task 8 covers MCP and read-only health; Task 9 covers Docker and operations; Task 10 covers E2E evidence, bilingual MCP synchronization, backlog, and session closure.
- Placeholder scan: no implementation task uses `TBD`, generic “handle edge cases”, or an undefined future adapter. Vendor-specific adapters are explicitly deferred with a separate boundary.
- Type consistency: the v2 batch type is produced by Task 1, persisted by Task 2, submitted by Task 3, and consumed by adapters in Tasks 4-6; operation persistence is produced by Task 2 and consumed by Tasks 3 and 8; the processor result is produced by Task 7 and exposed only through existing governance stages.
- Existing behavior: v1 streams and the Agent/local repository path remain compatible; no task changes graph authority, Scope isolation, or MCP promotion semantics.
- Evidence policy: every task ends with focused tests and a commit; Task 10 records exact commands and closes the preflight session only after MCP read-back.

## Execution Order

Execute Tasks 1-3 first as the platform foundation. Tasks 4-6 may then run independently against the adapter SPI. Task 7 depends on the v2 persistence model, Task 8 depends on operation persistence and processor status, Task 9 depends on the worker package, and Task 10 depends on all previous tasks.
