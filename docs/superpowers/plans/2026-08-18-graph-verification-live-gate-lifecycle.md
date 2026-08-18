# Graph Verification Live Gate Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local NebulaGraph live verification gate self-starting, project-scoped, host/container database-safe, and failure-cleaning without touching production services.

**Architecture:** The existing graph Compose overlays remain the source of topology. The PowerShell gate will generate a unique Compose project name and temporary environment, start only the six graph verification services on the existing external `deploy_default` network, run the MCP-backed fixture lifecycle, and clean only its own project and run ID in an outer `finally` path. PostgreSQL remains authoritative; NebulaGraph remains derived.

**Tech Stack:** PowerShell, Docker Compose, TypeScript/tsx, MCP stdio client, PostgreSQL, NebulaGraph, existing Vitest and Compose configuration tests.

## Global Constraints

- Owning Scope is exactly `com.huawei.celon.desiner.graph-verification` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`.
- Parent production Scope `com.huawei.celon.desiner` is read-only for this gate.

## Correction Plan: Ordered Fixture Watermark and Ephemeral Volume Cleanup

**Goal:** Make the live gate wait for the complete two-edge fixture, tolerate bounded graph-read visibility lag, and remove all resources owned by the generated Compose project.

**Architecture:** The MCP relationship outbox remains the authoritative readiness source. The gate aggregates both fixture relationship states, selects the highest contiguous completed graph version, and polls the Gateway until the exact two-hop shape is visible at that watermark. Cleanup uses the same generated Compose project and removes only its services, network, and ephemeral graph volumes.

**Stale outbox correction:** A previous interrupted verification run can leave an exact-Scope `DEAD_LETTER` or pending row ahead of new events. Before authoring, MCP seed cleanup archives only nonterminal graph outbox rows in the verification Scope as `ARCHIVED`, preserving payload and audit history. Projector claim and contiguous-checkpoint SQL treats `ARCHIVED` as terminal. Cleanup repeats the same scoped archival after fixture deletion.

**Files:**
- Modify: `deploy/graph/live-projection-check.ts`
- Modify: `deploy/graph/verify-projection.ps1`
- Modify: `scripts/verify-graph-lifecycle.test.ts`
- Modify: `docs/evidence/graph-verification-fixture-isolation-cleanup-evidence.md`
- Modify: `docs/TODO.md`
- Modify: `scripts/sync-p1-design-facts.ts`

### Task 5: Wait for the complete ordered fixture

- [x] Add a second fixture relationship identity for `second -> third`.
- [x] Read both exact-Scope relationship states and reject missing, pending, or dead-lettered rows.
- [x] Return a fixture watermark containing the latest graph version and checkpoint version only when the checkpoint covers both completed rows.
- [x] Keep idempotency assertion scoped to the first relationship event count.

### Task 6: Poll graph-read convergence

- [x] Extract exact traversal-shape validation into a reusable assertion that checks the three fixture node IDs and both ordered `CALLS` endpoint pairs.
- [x] Poll traversal at the fixture watermark with a bounded deadline and interval; retry only shape/read-visibility failures.
- [x] Preserve fail-closed status, graph-version, truncation, Scope-leak, and dead-letter checks.
- [x] Reuse the same convergence assertion before and after Projector recreation.

### Task 7: Remove all managed ephemeral resources

- [x] Keep MCP asset cleanup first while the graph services are reachable, archiving stale verification Outbox history before and after deletion.
- [x] Stop and remove only the six managed services, then run project-scoped Compose `down --volumes --remove-orphans` for the generated project.
- [x] Ensure failure diagnostics retain the primary error and any cleanup error.
- [x] Add static tests proving the cleanup command is project-scoped and volume removal cannot target production projects.

### Task 8: Verify and synchronize

- [x] Run the configuration check and focused lifecycle tests.
- [x] Run the complete Live gate and record both relationship watermarks, convergence result, Projector recreation result, `remainingLinks=0`, and zero managed resources.
- [ ] Synchronize ADR, Proposal, Context Pack, and Evidence facts through MCP in the exact verification Scope.
- [ ] Close the new design session as `CONVERGED` only after repository checks and MCP reconciliation pass.
- Only `nebula-metad`, `nebula-storaged`, `nebula-graphd`, `nebula-bootstrap`, `graph-gateway`, and `graph-projector` may be lifecycle-managed.
- Never call an unscoped `docker compose down`, `docker stop`, `docker rm`, or volume deletion.
- Host verification uses the canonical `specforge_canonical` database URL; the Projector container uses `deploy-postgres-1:5432/specforge_canonical`.
- Fixture writes and deletes use MCP and the explicit run ID; PostgreSQL is the authoritative write store.
- The design session is `design-change-session:e84bb591-73dc-4b05-b30d-8c3175f01333`.
- Preserve unrelated user files `outputs/` and `scripts/build-design-code-challenge-workbook.mjs`.

---

### Task 1: Add Pure Lifecycle and Compose-Argument Helpers

**Files:**
- Modify: `deploy/graph/verify-projection.ps1`
- Create: `scripts/verify-graph-lifecycle.test.ts`

**Interfaces:**
- Produce `New-ManagedComposeInvocation` behavior that always carries `-p <validated-project-name>`, the three Compose files, both environment files, and the six-service allow-list.
- Produce a deterministic project name `specforge-graph-verify-<runId>` where `runId` is limited to `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`.
- Produce Docker-assigned loopback ports for live runs and preserve `18088`/`18090` defaults for configuration-only assertions.
- Produce separate host and container database URL values without logging passwords.

- [ ] **Step 1: Write failing tests for project and service isolation.**

Assert that a generated invocation contains the dedicated project flag and exactly the six approved services, and that a production service such as `postgres`, `web`, or `knowledge-projector` is rejected.

Run:

```powershell
pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts --testTimeout=30000
```

Expected: FAIL because the lifecycle helpers and test seams do not exist.

- [ ] **Step 2: Implement the smallest helper seam.**

Keep the existing script entrypoint. Add internal functions for `Assert-ManagedRunId`, `Get-ManagedComposeArgs`, `Assert-CanonicalHostDatabaseUrl`, and `Get-ContainerDatabaseUrl`. The Compose argument list must use:

```powershell
@("-p", $composeProjectName, "--env-file", $rootEnvFile, "--env-file", $graphEnvFile,
  "-f", $baseCompose, "-f", $localCompose, "-f", $verificationCompose)
```

Append only the six approved service names for `up`, `ps`, `restart`, and `rm` operations.

- [ ] **Step 3: Run the focused tests.**

Run the Vitest command from Step 1 and expect all isolation, URL, and invalid-input cases to pass.

- [ ] **Step 4: Run configuration-only verification.**

```powershell
powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly
```

Expected: `NebulaGraph projection configuration assertions passed.`

### Task 2: Manage the Isolated Compose Lifecycle

**Files:**
- Modify: `deploy/graph/verify-projection.ps1`
- Modify: `deploy/graph/compose.graph-verify.yaml` only if the lifecycle tests identify a topology mismatch

**Interfaces:**
- Consume the Task 1 project and URL helpers.
- Produce `Start-ManagedGraphVerification`, `Stop-ManagedGraphVerification`, and `Invoke-ManagedCompose` behavior with a run-scoped project name.

- [ ] **Step 1: Add preflight checks before Docker writes.**

Validate Docker availability, `deploy_default` network existence, graph credentials, and the canonical host database URL. Fail with run-scoped diagnostics before starting any container when a prerequisite is missing.

- [ ] **Step 2: Create a temporary container environment file.**

Render only the container URL and required graph health variables to a file under the system temporary directory. Use `try/finally` removal. Do not write credentials or generated values into the repository.

- [ ] **Step 3: Start only the graph services.**

Invoke Compose with the dedicated project and service allow-list:

```powershell
docker compose @composeArgs up -d --build nebula-metad nebula-storaged nebula-graphd nebula-bootstrap graph-gateway graph-projector
```

Wait for the graph bootstrap and both health endpoints through the project-scoped `ps` output. Do not call the base stack without the service allow-list.

- [ ] **Step 4: Scope the Projector restart and shutdown.**

Replace the global `docker ps --filter label=com.docker.compose.service=graph-projector` lookup with the project-scoped recreate:

```powershell
docker compose @composeArgs up -d --force-recreate --no-deps graph-projector
```

Rediscover the dynamically assigned loopback port after recreation before running the verify phase.

Stop and remove only the six services through the same project-scoped invocation. Never remove production volumes or call a global Docker cleanup command.

- [ ] **Step 5: Run focused lifecycle tests.**

Verify project-scoped restart, service allow-listing, temporary env cleanup, and no production service in any destructive command. Run:

```powershell
pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts --testTimeout=30000
```

### Task 3: Make Fixture Cleanup Failure-Safe

**Files:**
- Modify: `deploy/graph/verify-projection.ps1`
- Modify: `deploy/graph/live-projection-check.ts`
- Modify: `scripts/cleanup-graph-verification-fixtures.ts` only if cleanup diagnostics need a structured run ID
- Test: `scripts/cleanup-graph-verification-fixtures.test.ts`

**Interfaces:**
- Consume the existing MCP cleanup operation and explicit `SPECFORGE_GRAPH_LIVE_RUN_ID`.
- Produce one outer cleanup path that runs after prepare, restart, verify, or Compose failure and reports both primary and cleanup errors.

- [ ] **Step 1: Add a test for cleanup on every failure phase.**

Exercise simulated failures after Compose start, after `prepare`, and after Projector restart. Assert that the cleanup command receives the same run ID and that a cleanup error produces a non-zero result with both error codes.

- [ ] **Step 2: Wrap the live gate in an outer `try/finally`.**

Track `$primaryError` and `$cleanupError`; invoke MCP cleanup while the graph services are still available, then stop the managed Compose project. Preserve the primary error when cleanup succeeds, and combine both diagnostics when cleanup fails.

- [ ] **Step 3: Keep TypeScript cleanup deterministic.**

Ensure `--phase cleanup` remains idempotent and can run after partial preparation. It must report exact verification Scope, run-scoped asset count, deletion status, and `remainingLinks`.

- [ ] **Step 4: Run focused cleanup tests.**

```powershell
pnpm exec vitest run scripts/cleanup-graph-verification-fixtures.test.ts scripts/verify-graph-lifecycle.test.ts --testTimeout=30000
```

Expected: all cleanup and lifecycle cases pass.

### Task 4: Run the Live Gate and Synchronize Completion Facts

**Files:**
- Modify: `docs/evidence/graph-verification-fixture-isolation-cleanup-evidence.md`
- Modify: `docs/TODO.md`
- Modify: `docs/superpowers/specs/2026-08-15-graph-verification-fixture-isolation-cleanup-design.md`
- Modify: `docs/superpowers/specs/2026-08-18-graph-verification-live-gate-design.md`

**Interfaces:**
- Consume the managed live gate and its MCP read-back.
- Produce current bilingual evidence, completed backlog state, and synchronized ADR/Proposal/Context Pack/Evidence through MCP.

- [ ] **Step 1: Run repository checks.**

```powershell
powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly
pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts scripts/cleanup-graph-verification-fixtures.test.ts --testTimeout=30000
git diff --check
```

- [ ] **Step 2: Run the managed live gate.**

```powershell
powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -Live
```

Expected: fixture accepted in the verification Scope, RelationshipOutbox reaches `COMPLETED`, Projector recreation and dynamic-port rediscovery succeed, traversal returns the expected two-hop result, idempotent replay produces one logical edge, dead letters remain zero, MCP cleanup reports `remainingLinks=0`, and only the managed graph services are stopped.

- [x] **Step 3: Synchronize the design facts through MCP.**

Update the exact evidence and completion status, then use the existing MCP design-fact writer for `adr-graph-verification-fixture-isolation`, `proposal-graph-verification-fixture-isolation`, `ctx-graph-verification-fixture-isolation`, and `evidence-graph-verification-fixture-isolation`. Read all four back by stable ID and run `pnpm design-facts:check`.

- [x] **Step 4: Close the design session.**

```powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner.graph-verification --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification --session design-change-session:e84bb591-73dc-4b05-b30d-8c3175f01333 --status CONVERGED --evidence "verify-projection:configuration=passed,verify-projection:live=passed,relationships=2:COMPLETED,watermark=44,projector-recreate=passed,traversal=3-nodes-2-edges,mcp-cleanup:remainingLinks=0,managed-resources=0,design-facts:check=passed,git-diff-check=passed"
```

- [ ] **Step 5: Commit tracked changes only.**

```powershell
git add deploy/graph/verify-projection.ps1 deploy/compose.graph-verify.yaml scripts/verify-graph-lifecycle.test.ts scripts/cleanup-graph-verification-fixtures.ts scripts/cleanup-graph-verification-fixtures.test.ts docs/evidence/graph-verification-fixture-isolation-cleanup-evidence.md docs/TODO.md docs/superpowers/specs/2026-08-15-graph-verification-fixture-isolation-cleanup-design.md docs/superpowers/specs/2026-08-18-graph-verification-live-gate-design.md docs/superpowers/plans/2026-08-18-graph-verification-live-gate-lifecycle.md
git commit -m "test: isolate graph verification lifecycle"
```
