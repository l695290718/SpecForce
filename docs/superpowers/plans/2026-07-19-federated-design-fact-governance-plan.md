# Federated Design-Fact Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first governance-core increment for federated design facts so external systems can later discover, observe, propose changes, and reconcile through one scoped, auditable contract.

**Architecture:** Add a small federation domain in `packages/core`, persist connector registrations, observations, candidate facts, identity mappings, authority policies, Change Sessions, reconciliation snapshots, and durable delivery records in PostgreSQL, and expose the workflows through MCP tools. The first increment is source-neutral: it defines contracts and state transitions but does not implement Git/OpenAPI/PostgreSQL scanners or direct external mutation.

**Tech Stack:** TypeScript, Vitest, Zod, Prisma 6, PostgreSQL, MCP SDK 1.29, existing scoped persistence and relationship/outbox conventions.

## Global Constraints

- MCP is the only authored SpecForge write boundary; direct database writes are test/setup-only.
- Every federation record carries the exact `architectureScope.applicationServiceId` and `architectureScope.scopePath`; no implicit default scope is allowed.
- English is canonical; accepted human-facing facts require complete Chinese localization, while raw source observations may wait for localization before promotion.
- PostgreSQL is authoritative for authored state, candidates, mappings, policies, conflicts, checkpoints, outbox records, and audit events; graph stores remain derived projections.
- Reconciliation is read-only and must never repair drift as a side effect.
- Last-writer-wins is forbidden for governed facts; ambiguous identity or authority creates a blocking conflict.
- Do not add connector-specific dependencies in this increment.
- Every implementation task follows TDD: write the failing test, run it to confirm failure, implement the smallest change, rerun focused tests, then run the relevant package checks.

---

## File Map

Create the following focused units:

- `packages/core/src/federation/types.ts`: source-neutral federation enums and public records.
- `packages/core/src/federation/digest.ts`: deterministic normalization and SHA-256 digest helpers.
- `packages/core/src/federation/reconcile.ts`: pure authority and reconciliation decisions.
- `packages/core/src/federation/index.ts`: federation exports.
- `packages/core/src/__tests__/federation.test.ts`: pure contract, digest, authority, and reconciliation tests.
- `apps/mcp-server/src/federation/persistence.ts`: scoped Prisma persistence and transactional state transitions.
- `apps/mcp-server/src/federation/persistence.test.ts`: unit tests with mocked Prisma transaction boundaries.
- `apps/mcp-server/src/federation/tools.ts`: MCP input schemas and handlers.
- `apps/mcp-server/src/federation/tools.test.ts`: MCP registration and handler contract tests.
- `prisma/migrations/20260719_federated_design_fact_governance/migration.sql`: additive PostgreSQL schema.
- `scripts/reconcile-federated-facts.ts`: read-only CLI reconciliation against configured MCP persistence.
- `scripts/reconcile-federated-facts.test.ts`: exit-code and diagnostic tests.
- `docs/adr/0010-federated-design-fact-synchronization.md`: accepted architectural decision after implementation evidence exists.

Modify:

- `packages/core/src/index.ts`: export the federation domain.
- `prisma/schema.prisma`: add the federation models and exact Scope composite indexes.
- `apps/mcp-server/src/server.ts`: register federation tools.
- `apps/mcp-server/src/tools.ts`: reuse the existing audit/auth wrapper for federation handlers only if the handler needs the common target/audit behavior; keep federation schemas in its own module.
- `apps/mcp-server/src/persistence.ts`: reuse `readableScope`, `resolveWritableScope`, `writableActor`, `ensureMcpPersistenceSchema`, and audit conventions without duplicating Scope logic.
- `package.json`: add `design-facts:federation:check` and any focused test command only if the repository has an existing script convention that requires it.
- `AGENTS.md`, `docs/adr/README.md`, and `docs/design-facts/baseline-manifest.json`: update the governance fact only after the code and local evidence are complete.

---

### Task 1: Define the source-neutral federation domain

**Files:**

- Create: `packages/core/src/federation/types.ts`
- Create: `packages/core/src/federation/digest.ts`
- Create: `packages/core/src/federation/reconcile.ts`
- Create: `packages/core/src/federation/index.ts`
- Create: `packages/core/src/__tests__/federation.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- `ConnectorCapability = "DISCOVER" | "OBSERVE" | "PROPOSE" | "APPLY"`
- `ConnectorStatus = "ACTIVE" | "SUSPENDED" | "REVOKED"`
- `CandidateFactStatus = "CANDIDATE" | "PROMOTED" | "REJECTED" | "CONFLICTED" | "TOMBSTONED"`
- `FactAuthority = "EXTERNAL" | "SPECFORGE" | "SHARED"`
- `DesignChangeSessionStatus = "OPEN" | "WAITING_FOR_DELIVERY" | "WAITING_FOR_REVIEW" | "CONFLICTED" | "CONVERGED" | "BLOCKED" | "CLOSED"`
- `ReconciliationIssueCode = "UNDECLARED_CHANGE" | "MISSING_FACT" | "CONTENT_DRIFT" | "LOCALIZATION_DRIFT" | "RELATIONSHIP_DRIFT" | "EVIDENCE_DRIFT" | "SCOPE_DRIFT" | "IDENTITY_CONFLICT" | "DELIVERY_BLOCKED" | "SOURCE_UNREACHABLE"`
- `FederatedFactEnvelope`, `SourceObservation`, `ExternalIdentityMapping`, `AuthorityPolicy`, `DesignChangeSession`, and `ReconciliationReport` with exact Scope fields, provenance, status, and normalized digest fields.
- `normalizeForDigest(value: unknown): string`, `contentDigest(value: unknown): string`.
- `evaluateObservation(input): { action: "PROMOTE" | "CANDIDATE" | "CONFLICT" | "REJECT"; reason: string }`.
- `reconcileFacts(input): ReconciliationReport`.

The test file must define `createReconciliationFixture(options)` as a local typed fixture builder containing one accepted fact, one source observation, one identity mapping, one Scope, and the requested drift flags. It must also define `designerScope` and `siblingScope` using the existing architecture-scope fixtures; no test may use an unscoped fake string.

- [ ] **Step 1: Write failing pure-domain tests**

```ts
it("produces the same digest when object keys are reordered", () => {
  expect(contentDigest({ b: 2, a: 1 })).toBe(contentDigest({ a: 1, b: 2 }));
});

it("does not promote an ambiguous identity match", () => {
  expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "AMBIGUOUS", policyAllowsPromotion: true }))
    .toEqual({ action: "CONFLICT", reason: "IDENTITY_CONFLICT" });
});

it("promotes only an unambiguous externally authoritative observation", () => {
  expect(evaluateObservation({ authority: "EXTERNAL", identityMatch: "UNAMBIGUOUS", policyAllowsPromotion: true }))
    .toEqual({ action: "PROMOTE", reason: "EXTERNAL_AUTHORITY" });
});

it("reports content and localization drift without changing inputs", () => {
  const inputFacts = createReconciliationFixture({ contentDrift: true, localizationDrift: true });
  const before = JSON.stringify(inputFacts);
  const report = reconcileFacts(inputFacts);
  expect(report.issues.map((issue) => issue.code)).toEqual(["CONTENT_DRIFT", "LOCALIZATION_DRIFT"]);
  expect(JSON.stringify(inputFacts)).toBe(before);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @specforge/core test -- federation.test.ts`

Expected: FAIL because the federation exports and decision functions do not exist.

- [ ] **Step 3: Implement the smallest pure domain**

Use a recursively key-sorted JSON representation for digest input. Exclude no business fields implicitly; callers pass the canonical payload to digest. `evaluateObservation` must return `CONFLICT` for ambiguous identity, missing authority, shared-field concurrent edits, or disabled policy. `reconcileFacts` must return diagnostics plus a deterministic Scope root without mutating records.

- [ ] **Step 4: Run focused and package checks**

Run: `pnpm --filter @specforge/core test -- federation.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/core typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/federation packages/core/src/__tests__/federation.test.ts packages/core/src/index.ts
git commit -m "feat: add federated fact domain contracts"
```

### Task 2: Add scoped PostgreSQL federation state

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260719_federated_design_fact_governance/migration.sql`
- Create: `apps/mcp-server/src/federation/persistence.ts`
- Create: `apps/mcp-server/src/federation/persistence.test.ts`
- Modify: `apps/mcp-server/src/persistence.ts` only for shared helper exports if required by TypeScript visibility.

**Interfaces:**

- `registerConnector(input): Promise<ConnectorInstance>`
- `recordObservation(input): Promise<SourceObservation>`
- `promoteCandidate(input): Promise<FederatedFactEnvelope>`
- `createDesignChangeSession(input): Promise<DesignChangeSession>`
- `appendFederationOutbox(input): Promise<FederationOutboxRecord>`
- `reconcilePersistedScope(scope): Promise<ReconciliationReport>`

Add additive models with composite Scope uniqueness and indexes:

- `ConnectorInstance`: connector identity, kind, capabilities, status, secret reference, Scope.
- `SourceObservation`: connector, external identity, asset type, payload, digest, source version, observed time, candidate status, Scope.
- `ExternalIdentityMapping`: connector/source namespace/external type/external ID to SpecForge asset identity, match status, digest, Scope.
- `AuthorityPolicy`: asset type plus field path, authority, promotion mode, policy version, Scope.
- `DesignChangeSession`: actor, intent, affected facts, expected evidence, lifecycle state, Scope.
- `FederationOutbox`: event type, payload, idempotency key, status, retry fields, Change Session ID, Scope.
- `ReconciliationSnapshot`: deterministic root, issue diagnostics, status, Scope.

- [ ] **Step 1: Write failing persistence contract tests**

```ts
it("rejects an observation whose Scope differs from the connector Scope", async () => {
  await expect(recordObservation({ connectorId, architectureScope: siblingScope, ...observation }))
    .rejects.toThrow("SCOPE_MISMATCH");
});

it("records an observation and outbox event atomically", async () => {
  const transactionMock = {
    sourceObservation: { create: vi.fn() },
    federationOutbox: { create: vi.fn() }
  };
  await recordObservation({ connectorId, architectureScope: designerScope, ...observation });
  expect(transactionMock.sourceObservation.create).toHaveBeenCalled();
  expect(transactionMock.federationOutbox.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "PENDING", architectureScope: undefined })
  }));
});

it("keeps identical external identities isolated between application services", async () => {
  await registerConnector({ ...connector, architectureScope: designerScope });
  await registerConnector({ ...connector, id: "policy-connector", architectureScope: policyScope });
  expect(await listConnectors(designerScope)).toHaveLength(1);
  expect(await listConnectors(policyScope)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/persistence.test.ts`

Expected: FAIL because the models and persistence functions do not exist.

- [ ] **Step 3: Implement Prisma models and migration**

Use the existing naming convention: persist `applicationServiceId` and `scopePath` as columns on every model, add composite unique keys for external identities and idempotency keys, and add indexes beginning with the exact Scope columns. The migration must be additive and safe to run once through the repository's migration runner. Do not add a global unique external ID.

- [ ] **Step 4: Implement transactional persistence**

Resolve writable Scope with the existing `resolveWritableScope` and readable Scope with `readableScope`. `recordObservation` must insert the observation and its idempotent `FederationOutbox` event in one Prisma transaction. Duplicate idempotency keys must return the existing receipt or existing observation without creating another event. `reconcilePersistedScope` must call the pure core reconciler and persist only a snapshot after the read-only comparison is complete.

- [ ] **Step 5: Run generated client, migration, focused tests, and typecheck**

Run: `pnpm db:generate`

Expected: Prisma client generation succeeds.

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/persistence.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260719_federated_design_fact_governance apps/mcp-server/src/federation apps/mcp-server/src/persistence.ts
git commit -m "feat: persist scoped federation governance state"
```

### Task 3: Expose governance-core workflows through MCP

**Files:**

- Create: `apps/mcp-server/src/federation/tools.ts`
- Create: `apps/mcp-server/src/federation/tools.test.ts`
- Modify: `apps/mcp-server/src/server.ts`

**Interfaces:**

- Register `registerFederationTools(server)`.
- MCP tools:
  - `register_connector`: write, requires `asset:write`, accepts exact Scope, connector kind, capabilities, and secret reference.
  - `record_external_observation`: write, requires `asset:write`, accepts connector ID, external identity, candidate payload, source version, and exact Scope.
  - `promote_candidate_fact`: write, requires `asset:write`, accepts candidate ID, approval reason, and exact Scope.
  - `create_design_change_session`: write, requires `asset:write`, accepts intent, affected facts, and exact Scope.
  - `reconcile_federated_scope`: read-only, requires `asset:read` and `governance:run`, accepts exact Scope and returns diagnostics plus root.
- `get_federated_sync_status`: read-only, requires `asset:read`, accepts exact Scope and returns connector freshness, pending delivery, conflicts, and latest reconciliation.

The MCP test file must reuse the existing `captureTools` pattern from `apps/mcp-server/src/tools.test.ts`, extending it as a local `captureToolsWithFederationRegistration()` helper that calls both `registerTools` and `registerFederationTools`. Its `RegisteredTool` type must include the existing `config` and `handler` fields.

- [ ] **Step 1: Write failing MCP registration and authorization tests**

```ts
it("registers federation tools with read-only annotations where applicable", () => {
  const tools = captureToolsWithFederationRegistration();
  expect([...tools.keys()]).toEqual(expect.arrayContaining([
    "register_connector",
    "record_external_observation",
    "reconcile_federated_scope"
  ]));
  expect((tools.get("reconcile_federated_scope")!.config.annotations as { readOnlyHint: boolean }).readOnlyHint).toBe(true);
});

it("rejects a connector write when applicationServiceId and scopePath do not match the registered Scope", async () => {
  await expect(callTool("register_connector", { architectureScope: siblingScope, ...connector })).rejects.toThrow();
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/tools.test.ts`

Expected: FAIL because federation registration and schemas do not exist.

- [ ] **Step 3: Implement tool schemas and handlers**

Keep all Zod schemas in `apps/mcp-server/src/federation/tools.ts`. Reuse the existing `architectureScopeSchema` shape, assert exact Scope before persistence, and route all writes to `federation/persistence.ts`. Use the standard audit wrapper and return structured errors containing a stable error code such as `SCOPE_MISMATCH`, `IDENTITY_CONFLICT`, `AUTHORITY_CONFLICT`, or `DELIVERY_BLOCKED`.

- [ ] **Step 4: Register tools and run focused tests**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/tools.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/federation/tools.ts apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/server.ts
git commit -m "feat: expose federation governance through mcp"
```

### Task 4: Add read-only reconciliation CLI and scope diagnostics

**Files:**

- Create: `scripts/reconcile-federated-facts.ts`
- Create: `scripts/reconcile-federated-facts.test.ts`
- Modify: `package.json`

**Interfaces:**

- `reconciliationExitCode(report): 0 | 1`.
- CLI input: `SPECFORGE_APPLICATION_SERVICE_ID`, optional `SPECFORGE_SCOPE_PATH`.
- CLI output: one JSON report containing Scope, root, verified count, issue counts by code, and blocking status.

- [ ] **Step 1: Write failing CLI tests**

```ts
it("returns zero for a converged Scope", () => {
  expect(reconciliationExitCode({ blocking: false, issues: [], root: "root" })).toBe(0);
});

it("returns one for blocking drift", () => {
  expect(reconciliationExitCode({ blocking: true, issues: [{ code: "CONTENT_DRIFT" }], root: "root" })).toBe(1);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm exec vitest run scripts/reconcile-federated-facts.test.ts`

Expected: FAIL because the script and exit-code helper do not exist.

- [ ] **Step 3: Implement the read-only CLI**

Require an explicit application-service ID. Resolve the exact Scope through the existing architecture registry. Call `reconcilePersistedScope`; never call a write or promotion function. Print stable JSON to stdout and exit `1` for any blocking issue, unavailable source, unresolved conflict, Scope drift, incomplete localization, or pending required delivery.

- [ ] **Step 4: Add the package script and run checks**

Add:

```json
"design-facts:federation:check": "tsx scripts/reconcile-federated-facts.ts"
```

Run: `pnpm exec vitest run scripts/reconcile-federated-facts.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/reconcile-federated-facts.ts scripts/reconcile-federated-facts.test.ts package.json
git commit -m "feat: add federated fact reconciliation gate"
```

### Task 5: Record the architecture fact and prove the first increment

**Files:**

- Create: `docs/adr/0010-federated-design-fact-synchronization.md`
- Modify: `docs/adr/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/superpowers/specs/2026-07-19-federated-design-fact-synchronization-design.md` only to add verified implementation evidence.

**Interfaces:**

- ADR stable ID: `adr-federated-design-fact-synchronization`.
- Exact Scope: `com.huawei.celon.desiner` and `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Required MCP records: matching ADR, Proposal for the delivered governance-core capability, Context Pack update for agents, typed links to the new federation assets, and Evidence records for the focused tests and reconciliation check.

- [ ] **Step 1: Write the failing governance-manifest test**

Extend `scripts/design-fact-manifest.test.ts` with:

```ts
it("includes federated design-fact governance in the baseline", () => {
  expect(manifest.decisions.some((decision) => decision.mcpAdrId === "adr-federated-design-fact-synchronization")).toBe(true);
});
```

- [ ] **Step 2: Run it to verify the fact is missing**

Run: `pnpm exec vitest run scripts/design-fact-manifest.test.ts`

Expected: FAIL because the new ADR is not in the baseline manifest.

- [ ] **Step 3: Add the ADR, manifest entry, repository governance text, and MCP payloads**

The ADR must include Status, Context, Decision, Alternatives, Consequences, Constraints, Evidence, MCP Record, and a complete Chinese localization. Describe the implemented increment precisely: governance core only; legacy scanners, continuous inbound connectors, outbound proposals, and APPLY remain deferred. Extend the existing sync manifest and synchronization payload builders with the new stable ID, Proposal, Context Pack, typed links, and Evidence. Do not claim external-system scanning or production APPLY as implemented.

- [ ] **Step 4: Run all required verification and MCP reconciliation**

Run: `pnpm --filter @specforge/core test`

Expected: PASS.

Run: `pnpm --filter @specforge/mcp-server exec vitest run`

Expected: PASS for unit tests; integration tests must pass when the configured PostgreSQL database is available.

Run: `pnpm design-facts:sync`

Expected: the new ADR, Proposal, Context Pack, typed links, and Evidence are persisted through MCP under the exact owning Scope.

Run: `pnpm design-facts:check`

Expected: zero missing, mismatched, out-of-scope, or blocked baseline records.

Run: `pnpm design-facts:federation:check`

Expected: zero blocking issues for the local Designer Scope.

- [ ] **Step 5: Commit the complete dual record**

```bash
git add docs/adr/0010-federated-design-fact-synchronization.md docs/adr/README.md AGENTS.md docs/design-facts/baseline-manifest.json docs/superpowers/specs/2026-07-19-federated-design-fact-synchronization-design.md scripts
git commit -m "docs: record federated design fact governance"
```

## Plan Self-Review

- Spec coverage: connector capabilities, legacy onboarding contract, candidate promotion, identity mapping, field authority, conflicts, transactional delivery, read-only reconciliation, Merkle roots, Scope isolation, failure handling, scale, and staged delivery are covered by Tasks 1-5.
- Scope check: this plan implements only governance core. Git/OpenAPI/PostgreSQL discovery, continuous inbound connectors, and outbound proposal/apply workflows are explicitly deferred to separate plans.
- Type consistency: core types are defined before persistence; persistence interfaces are defined before MCP tools; reconciliation helpers are shared by persistence and CLI; ADR and MCP synchronization occur only after implementation evidence exists.
- Placeholder scan: no placeholder markers or unspecified connector implementation appears in the executable task steps.
- Safety check: checks are read-only, writes are MCP-mediated, exact Scope is mandatory, and no production external mutation is planned in this increment.
