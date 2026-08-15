# Graph Verification Fixture Isolation And Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent graph verification from contaminating product Scopes and remove the nine approved historical fixtures through exact-Scope MCP cleanup with projection readback.

**Architecture:** Add a verification-purpose application service to the existing Scope registry and make verification Scopes reject inherited module grants. Refactor graph-health configuration into a pure fail-closed resolver, require explicit verification settings, and route all fixture lifecycle operations through MCP. Historical cleanup uses strict MCP fingerprints and exact IDs, then waits for relationship deletion projection.

**Tech Stack:** TypeScript, pnpm, Vitest, MCP stdio client, PostgreSQL relationship ledger, Projector/Gateway health endpoints, existing scoped authorization and seed-only cleanup tool.

## Global Constraints

- Product Designer Scope: `com.huawei.celon.desiner` with path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Verification Scope: `com.huawei.celon.desiner.graph-verification` with path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`.
- Verification Scopes reject inherited module grants; only an exact system grant is valid.
- `live-projection-check.ts` has no Designer default and requires explicit application service, Scope path, enterprise ID, and run ID.
- Cleanup is exact-ID, exact-Scope, MCP-only, seed-only, audited, idempotent, and never uses raw SQL for deletion.
- PostgreSQL is authoritative; relationship deletion events and Outbox drive derived graph cleanup.
- v5 regression must remain `4 units / 38 memberships / 3 mappings`.
- Preserve the user’s existing untracked `outputs/` directory and `scripts/build-design-code-challenge-workbook.mjs`.

## File Map

- Modify `packages/core/src/architecture/types.ts`: add the verification-purpose field to `ArchitectureScope`.
- Modify `packages/core/src/architecture/mock.ts`: register the verification application service and exact system grant data.
- Modify `packages/core/src/architecture/service.ts`: enforce exact grants for verification-purpose Scopes.
- Modify `packages/core/src/architecture/principal.ts`: keep principal claim validation exact while accepting the registered verification Scope.
- Modify `packages/core/src/architecture/__tests__/architecture-scope.test.ts`: test purpose-aware inherited authorization.
- Modify `apps/web/lib/scope.ts`: exclude verification-purpose application services from product selectors.
- Modify `apps/web/lib/__tests__/scope.test.ts`: assert the verification Scope is not listed.
- Create `deploy/graph/live-projection-config.ts`: pure environment and Scope resolver.
- Create `deploy/graph/live-projection-config.test.ts`: fail-closed configuration tests.
- Modify `deploy/graph/live-projection-check.ts`: use explicit verification config and run cleanup lifecycle.
- Create `deploy/graph/live-projection-check.test.ts`: fixture ID and cleanup request tests.
- Create `scripts/cleanup-graph-verification-fixtures.ts`: fingerprint validation, exact MCP deletion, and readback.
- Create `scripts/cleanup-graph-verification-fixtures.test.ts`: approve/reject/idempotency tests using a mocked MCP client.
- Modify `scripts/verify-designer-3a-v5.ts`: keep the nine-ID exclusion assertion and add explicit current-catalog absence reporting if needed by the cleanup evidence.
- Modify `docs/adr/0004-postgresql-authoritative-design-store.md` and `docs/adr/0005-nebulagraph-derived-impact-runtime.md`: record the isolation and deletion-event constraints.
- Create `docs/evidence/graph-verification-fixture-isolation-cleanup-evidence.md`.
- Modify `docs/TODO.md`: close the fixture-cleanup item only after all readback checks pass.

### Task 1: Add verification-purpose Scope semantics

**Files:**
- Modify: `packages/core/src/architecture/types.ts`
- Modify: `packages/core/src/architecture/mock.ts`
- Modify: `packages/core/src/architecture/service.ts`
- Modify: `packages/core/src/architecture/principal.ts`
- Test: `packages/core/src/architecture/__tests__/architecture-scope.test.ts`
- Modify: `apps/web/lib/scope.ts`
- Test: `apps/web/lib/__tests__/scope.test.ts`

**Interfaces:**
- Adds `purpose?: "product" | "verification"` to `ArchitectureScope`.
- Adds `isVerificationScope(scope: ArchitectureScope): boolean` in `packages/core/src/architecture/service.ts`.
- Keeps `hasScopeAccess(actor, requestedScope, action, registry)` as the authorization entry point.

- [ ] **Step 1: Write failing authorization and selector tests**

Add these assertions:

```ts
it("does not inherit a module grant into a verification Scope", () => {
  const moduleReader = { actorType: "agent", actorId: "module-reader", grants: [{ scopeId: "module-celon-designer", action: "read" }] } as const;
  expect(hasScopeAccess(moduleReader, scopeById("com.huawei.celon.desiner.graph-verification")!, "read")).toBe(false);
});

it("accepts only an exact verification Scope grant", () => {
  const verifier = { actorType: "system", actorId: "graph-verifier", grants: [{ scopeId: "com.huawei.celon.desiner.graph-verification", action: "write" }] } as const;
  const scope = scopeById("com.huawei.celon.desiner.graph-verification")!;
  expect(hasScopeAccess(verifier, scope, "write")).toBe(true);
  expect(hasScopeAccess(verifier, scope, "read")).toBe(false);
});
```

Add a Web scope test asserting `listReadableApplicationServices()` excludes `com.huawei.celon.desiner.graph-verification` even when the local development actor can read the parent module.

- [ ] **Step 2: Run tests to verify they fail**

```text
pnpm exec vitest run packages/core/src/architecture/__tests__/architecture-scope.test.ts apps/web/lib/__tests__/scope.test.ts
```

Expected: FAIL because the verification Scope is not registered and inherited access is not purpose-aware.

- [ ] **Step 3: Register the verification Scope and enforce exact grants**

Add the scope under `module-celon-designer`:

```ts
{
  id: "com.huawei.celon.desiner.graph-verification",
  code: "com.huawei.celon.desiner.graph-verification",
  name: "SpecForge Graph Verification Harness",
  description: "Internal application service used only by graph projection verification.",
  owner: "SpecForge Runtime and Test Infrastructure",
  level: "applicationService",
  purpose: "verification",
  parentId: "module-celon-designer",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification"
}
```

Update `hasScopeAccess` so a requested `purpose === "verification"` scope returns true only when the grant’s `scopeId` equals the requested scope’s `id`; product scopes retain descendant-module behavior. Exclude verification-purpose scopes in `listReadableApplicationServices` while leaving exact MCP seed authorization available to the dedicated verifier actor.

- [ ] **Step 4: Run core/Web tests and typechecks**

```text
pnpm exec vitest run packages/core/src/architecture/__tests__/architecture-scope.test.ts apps/web/lib/__tests__/scope.test.ts
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/web typecheck
```

Expected: all selected tests pass and both typechecks exit 0.

- [ ] **Step 5: Commit Scope semantics**

```text
git add packages/core/src/architecture/types.ts packages/core/src/architecture/mock.ts packages/core/src/architecture/service.ts packages/core/src/architecture/principal.ts packages/core/src/architecture/__tests__/architecture-scope.test.ts apps/web/lib/scope.ts apps/web/lib/__tests__/scope.test.ts
git commit -m "feat: isolate verification Scopes from inherited access"
```

### Task 2: Make graph-health configuration fail closed

**Files:**
- Create: `deploy/graph/live-projection-config.ts`
- Create: `deploy/graph/live-projection-config.test.ts`
- Modify: `deploy/graph/live-projection-check.ts`

**Interfaces:**
- Produces `GraphHealthConfig` with `applicationServiceId`, `scopePath`, `enterpriseId`, `gatewayUrl`, `projectorHealthUrl`, `databaseUrl`, and `liveRunId`.
- Exposes `resolveGraphHealthConfig(env: NodeJS.ProcessEnv): GraphHealthConfig`.

- [ ] **Step 1: Write failing resolver tests**

```ts
it("requires explicit verification configuration", () => {
  expect(() => resolveGraphHealthConfig({ DATABASE_URL: "postgres://test" })).toThrow("GRAPH_HEALTH_APPLICATION_SERVICE_REQUIRED");
});

it("rejects the Designer Scope and product-purpose scopes", () => {
  expect(() => resolveGraphHealthConfig({ ...verificationEnv(), SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID: "com.huawei.celon.desiner" })).toThrow("GRAPH_HEALTH_VERIFICATION_SCOPE_REQUIRED");
});

it("rejects an application-service and path mismatch", () => {
  expect(() => resolveGraphHealthConfig({ ...verificationEnv(), SPECFORGE_GRAPH_HEALTH_SCOPE_PATH: "forged/path" })).toThrow("GRAPH_HEALTH_SCOPE_MISMATCH");
});
```

- [ ] **Step 2: Run resolver tests to verify they fail**

```text
pnpm exec vitest run deploy/graph/live-projection-config.test.ts
```

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement explicit config resolution**

Read these required environment variables with no fallback: `SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID`, `SPECFORGE_GRAPH_HEALTH_SCOPE_PATH`, `SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID`, `SPECFORGE_GRAPH_HEALTH_DATABASE_URL` or `DATABASE_URL`, and `SPECFORGE_GRAPH_LIVE_RUN_ID`. Continue using bounded defaults only for local endpoint URLs. Resolve the Scope through `scopeById`, require `level === "applicationService"` and `purpose === "verification"`, compare the path exactly, reject `manual`, and validate run IDs with `/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u`.

Replace the top-level constants in `live-projection-check.ts` with the resolver result. Pass the explicit application service to `SPECFORGE_MCP_SEED_SCOPE` and use the resolved Scope in every MCP and health request.

- [ ] **Step 4: Run tests and typecheck**

```text
pnpm exec vitest run deploy/graph/live-projection-config.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: resolver tests pass and the MCP server typecheck exits 0.

- [ ] **Step 5: Commit fail-closed configuration**

```text
git add deploy/graph/live-projection-config.ts deploy/graph/live-projection-config.test.ts deploy/graph/live-projection-check.ts
git commit -m "feat: require explicit graph verification Scope"
```

### Task 3: Add deterministic run cleanup and historical fingerprint cleanup

**Files:**
- Modify: `deploy/graph/live-projection-check.ts`
- Create: `deploy/graph/live-projection-check.test.ts`
- Create: `scripts/cleanup-graph-verification-fixtures.ts`
- Create: `scripts/cleanup-graph-verification-fixtures.test.ts`
- Read: `apps/mcp-server/src/tools.ts`
- Read: `apps/mcp-server/src/persistence.ts`

**Interfaces:**
- `live-projection-check.ts` calls `cleanupRunFixtures(client, config)` with exactly three IDs.
- `cleanup-graph-verification-fixtures.ts` exports `HISTORICAL_FIXTURE_IDS`, `validateHistoricalFixture(asset, links)`, and `cleanupHistoricalFixtures(client, scope)`.

- [ ] **Step 1: Write failing cleanup tests**

```ts
it("sends exactly three run IDs to the seed-only delete tool", async () => {
  await cleanupRunFixtures(mockClient(), verificationConfig("run-1"));
  expect(callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "delete_seed_design_data", arguments: expect.objectContaining({ assetIds: ["specforge-graph-verification-run-1-a", "specforge-graph-verification-run-1-b", "specforge-graph-verification-run-1-c"] }) }));
});

it("rejects a historical asset with a non-fixture path", () => {
  expect(() => validateHistoricalFixture({ id: HISTORICAL_FIXTURE_IDS[0], type: "api", path: "/api/product", domainId: "domain-graph-verification" }, [])).toThrow("GRAPH_FIXTURE_FINGERPRINT_MISMATCH");
});

it("does not call delete when any historical fingerprint mismatches", async () => {
  await expect(cleanupHistoricalFixtures(mockClientWithMismatch(), designerScope())).rejects.toThrow("GRAPH_FIXTURE_FINGERPRINT_MISMATCH");
  expect(callTool).not.toHaveBeenCalledWith(expect.objectContaining({ name: "delete_seed_design_data" }));
});
```

- [ ] **Step 2: Run cleanup tests to verify they fail**

```text
pnpm exec vitest run deploy/graph/live-projection-check.test.ts scripts/cleanup-graph-verification-fixtures.test.ts
```

Expected: FAIL because deterministic cleanup and historical fingerprint functions do not exist.

- [ ] **Step 3: Implement exact run cleanup**

Create fixture helpers that derive the three IDs from `liveRunId`. Add a `cleanup` phase and call it from `verify` in `finally`. The MCP request must be exactly:

```ts
await client.callTool({
  name: "delete_seed_design_data",
  arguments: {
    architectureScope: { applicationServiceId: config.applicationServiceId, scopePath: config.scopePath },
    assetIds: fixtureAssetIds(config.liveRunId)
  }
});
```

Reject empty arrays, wildcard strings, and IDs that are not the three derived IDs. After the MCP response, poll the authoritative relationship checkpoint and use MCP `get_asset_detail` plus relationship readback to confirm absence. Preserve the original verification error when cleanup also fails, but print a separate cleanup failure and exact retry phase.

- [ ] **Step 4: Implement historical fingerprint validation and cleanup**

Use the exact nine IDs from the Spec. Read each asset with MCP `get_asset_detail` in the Designer Scope and read links with MCP `list_asset_links`. Validate `type === "api"`, the approved ID, `/internal/specforge-graph-verification/` path, `domain-graph-verification`, fixture description, and only the expected `CALLS` links. If any candidate is missing, treat it as already absent; if any present candidate mismatches, abort before deletion. Call `delete_seed_design_data` once with the exact present subset only after all present rows pass validation. Never instantiate Prisma in this script.

- [ ] **Step 5: Run cleanup tests and typechecks**

```text
pnpm exec vitest run deploy/graph/live-projection-check.test.ts scripts/cleanup-graph-verification-fixtures.test.ts apps/mcp-server/src/persistence.test.ts
pnpm --filter @specforge/mcp-server typecheck
```

Expected: selected tests pass, including existing relationship deletion tests, and the MCP server typecheck exits 0.

- [ ] **Step 6: Commit lifecycle and cleanup**

```text
git add deploy/graph/live-projection-check.ts deploy/graph/live-projection-check.test.ts scripts/cleanup-graph-verification-fixtures.ts scripts/cleanup-graph-verification-fixtures.test.ts
git commit -m "feat: isolate and clean graph verification fixtures"
```

### Task 4: Run live cleanup, record evidence, and close the session

**Files:**
- Modify: `docs/adr/0004-postgresql-authoritative-design-store.md`
- Modify: `docs/adr/0005-nebulagraph-derived-impact-runtime.md`
- Create: `docs/evidence/graph-verification-fixture-isolation-cleanup-evidence.md`
- Modify: `docs/TODO.md`
- MCP records: matching ADR, Proposal, Context Pack, Evidence, and typed links in exact Scopes.

**Interfaces:**
- Consumes cleanup receipts, v5 verification output, projector checkpoint, and Scope authorization tests.
- Produces synchronized repository and MCP evidence, a closed implementation session, and a resolved backlog fact.

- [ ] **Step 1: Run the isolated live flow**

Set explicit verification environment values and run:

```text
$env:SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID="com.huawei.celon.desiner.graph-verification"
$env:SPECFORGE_GRAPH_HEALTH_SCOPE_PATH="pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification"
$env:SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID="huawei"
$env:SPECFORGE_GRAPH_LIVE_RUN_ID="p1-cleanup-check"
pnpm exec tsx deploy/graph/live-projection-check.ts --phase prepare
pnpm exec tsx deploy/graph/live-projection-check.ts --phase verify
pnpm exec tsx deploy/graph/live-projection-check.ts --phase cleanup
```

Expected: the verifier writes and reads only the verification Scope, verification ends with cleanup readback showing zero active fixture assets/links, and the projector reaches the deletion checkpoint.

- [ ] **Step 2: Run the historical dry run and exact cleanup**

```text
pnpm exec tsx scripts/cleanup-graph-verification-fixtures.ts --phase dry-run --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
pnpm exec tsx scripts/cleanup-graph-verification-fixtures.ts --phase delete --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
pnpm exec tsx scripts/verify-designer-3a-v5.ts
```

Expected: dry run validates exactly the nine approved fixture IDs, delete returns exact IDs, v5 returns `4/38/3`, and no fixture appears in catalog or active traversal readback. The delete command must be run with `SPECFORGE_MCP_SEED=1` and the exact Designer Scope; otherwise it fails closed.

- [ ] **Step 3: Synchronize ADR, Proposal, Context Pack, Evidence, and backlog**

Update ADR-0004 and ADR-0005 with the producer isolation and MCP deletion-event decision. Create or update matching Proposal, Context Pack, and Evidence records through MCP, and link them with typed directional links. Record the exact nine IDs, verification Scope, deletion receipt, projector checkpoint, v5 regression, and absence readback. Mark the TODO item complete only after all evidence is present.

- [ ] **Step 4: Run final checks**

```text
pnpm exec vitest run packages/core/src/architecture/__tests__/architecture-scope.test.ts apps/web/lib/__tests__/scope.test.ts deploy/graph/live-projection-config.test.ts deploy/graph/live-projection-check.test.ts scripts/cleanup-graph-verification-fixtures.test.ts apps/mcp-server/src/persistence.test.ts
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm design-facts:sync
pnpm design-facts:check
git diff --check
```

Expected: all focused tests and typechecks pass; design-facts sync is `complete`; reconciliation lists are empty; diff check exits 0.

- [ ] **Step 5: Close the exact implementation session**

```text
$session = (Get-ChildItem .specforge/design-context/design-change-session_*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Raw | ConvertFrom-Json).receipt.sessionId
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session $session --status CONVERGED --evidence "verification-scope=isolated,live-flow=prepare-verify-cleanup-PASS,historical-fixtures=9-validated-and-absent,projector-deletion-checkpoint=PASS,v5-regression=4-38-3-PASS,focused-tests=PASS,design-facts-check=missing-0-mismatched-0-outOfScope-0-blocked-0,git-diff-check=PASS"
```

If cleanup, projection, MCP synchronization, or readback fails, close as `BLOCKED` with the exact reason and retry trigger and leave the backlog item open.

- [ ] **Step 6: Commit evidence and backlog state**

```text
git add docs/adr/0004-postgresql-authoritative-design-store.md docs/adr/0005-nebulagraph-derived-impact-runtime.md docs/evidence/graph-verification-fixture-isolation-cleanup-evidence.md docs/TODO.md
git commit -m "docs: record graph fixture cleanup evidence"
```

## Self-Review Checklist

- Scope registry, inherited authorization, selector filtering, producer configuration, cleanup, historical deletion, projection consistency, documentation, and session closure each have a task.
- No deletion step uses Prisma, wildcard IDs, prefix matching, or a broad Scope.
- The live verifier has a recovery `cleanup` phase for interrupted processes.
- Product v5 regression is pinned and checked after historical cleanup.
- The implementation session is read from the newest committed preflight receipt immediately before closure; no session ID is hardcoded in the plan.
