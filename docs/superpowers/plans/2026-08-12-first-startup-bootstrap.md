# First-Startup Database Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Implementation status:** Completed for the approved first-startup direct database Bootstrap increment. Fresh startup and persistent-volume restart verification are complete; injected Bootstrap failure/recovery remains a deferred deployment verification task.

**Goal:** Make the Docker deployment create its schema and populate deterministic initial catalog data through a versioned direct database initialization exactly once for a fresh database, while refusing to overwrite an existing uninitialized catalog.

**Architecture:** Add a database-owned `DeploymentBootstrap` state machine and a one-shot Bootstrap container. The container acquires a PostgreSQL advisory lock, classifies the database, runs a versioned direct SQL/Prisma initialization script only for an empty database, verifies the expected inventory, and gates Web and Knowledge Projector on `COMPLETED`. MCP remains the only post-bootstrap business design-fact write boundary.

**Tech Stack:** TypeScript, pnpm workspaces, Prisma/PostgreSQL, MCP stdio client, Docker Compose, PowerShell, Vitest.

## Global Constraints

- PostgreSQL remains authoritative for authored assets and relationship events.
- All post-bootstrap business design writes continue through MCP tools; only the versioned first-startup initialization transaction may write initial infrastructure content directly.
- Exact application-service Scope and bilingual localization remain mandatory.
- Fresh database means no rows in authored tables; a non-empty database without a Bootstrap record must fail closed.
- `COMPLETED` never triggers automatic reseeding.
- `stop.ps1` must preserve the PostgreSQL volume.
- Existing unrelated working-tree changes must remain untouched.

---

### Task 1: Add the database-owned Bootstrap state

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260812_deployment_bootstrap/migration.sql`
- Create: `apps/knowledge-projector/src/bootstrap-initializer.ts`
- Create: `apps/knowledge-projector/src/bootstrap-initializer.test.ts`

**Interfaces:**
- Produces `runFirstStartupBootstrap(prisma, version)`, with a database-owned state record and advisory-lock claim.

- [x] Add Prisma model `DeploymentBootstrap` with the fixed singleton key, status, version, timestamps, counts, sanitized error, and attempt count.
- [x] Add a migration that creates the table without touching authored data.
- [x] Implement PostgreSQL advisory-lock acquisition and transactionally update the state row.
- [x] Run the Bootstrap classification tests and Prisma validation.

### Task 2: Build the versioned direct database initializer

**Files:**
- Create: `apps/knowledge-projector/src/bootstrap-initializer.ts`
- Create: `apps/knowledge-projector/src/bootstrap-initializer.test.ts`
- Create: `deploy/bootstrap/init.sql`
- Modify: `apps/knowledge-projector/package.json`

**Interfaces:**
- Produces `runFirstStartupBootstrap(options): Promise<BootstrapResult>` and a CLI entrypoint used by the Docker Bootstrap image.

- [x] Convert the canonical initial inventory into a versioned direct Prisma initialization path without invoking MCP or the MCP server.
- [x] Preserve canonical English fields, Chinese overlays, exact Scope, stable logical IDs, and typed AssetLink relationships.
- [x] Add an empty-catalog classifier for authored `DesignAsset`, `Proposal`, `ContextPack`, and `AssetLink` rows.
- [x] Treat a missing bootstrap row plus any authored row as `NON_EMPTY_UNINITIALIZED` and exit non-zero without writes.
- [x] Treat `COMPLETED` as a no-op and do not spawn MCP or execute initialization.
- [x] Verify the deterministic inventory through scoped counts and record counts in the Bootstrap state.
- [x] Add classification tests for completed, fresh, running, retryable, and non-empty states.

### Task 3: Add the Docker Bootstrap service and dependency gates

**Files:**
- Create: `deploy/bootstrap.Dockerfile`
- Create: `deploy/bootstrap-entrypoint.sh`
- Modify: `deploy/compose.yaml`
- Modify: `deploy/compose.external-postgres.yaml`
- Modify: `deploy/.env.example`

**Interfaces:**
- Produces a one-shot `bootstrap` Compose service with no host ports.

- [x] Build the Bootstrap image with the workspace, Prisma client, initializer, canonical initialization payload, and required runtime dependencies; it does not include or start an MCP server dependency.
- [x] Pass `DATABASE_URL` and `SPECFORGE_BOOTSTRAP_VERSION` into the container.
- [x] Make `web` and `knowledge-projector` depend on `bootstrap.condition: service_completed_successfully` in bundled and external modes.
- [x] Keep PostgreSQL private and preserve the existing named volume.
- [x] Ensure Bootstrap does not run legacy cleanup, MCP writes, or initialization on every Web restart.
- [x] Render both Compose topologies and assert the dependency gate and no published database/Bootstrap ports.

### Task 4: Make lifecycle scripts bootstrap-aware

**Files:**
- Modify: `deploy/scripts/start.ps1`
- Modify: `deploy/scripts/status.ps1`
- Modify: `deploy/scripts/common.ps1`
- Modify: `deploy/scripts/verify-compose.ps1`
- Create: `deploy/scripts/bootstrap-status.ps1`

**Interfaces:**
- `start.ps1` starts the complete topology and waits for Bootstrap plus Web health.
- `status.ps1` prints Bootstrap status, attempt count, counts, and last sanitized error.
- `bootstrap-status.ps1` provides a direct operator check.

- [x] Make `start.ps1` fail with the Bootstrap error when a non-empty uninitialized database blocks startup.
- [x] Make `status.ps1` print Bootstrap state, version, counts, and error details.
- [x] Ensure `-NoBuild` still starts the Bootstrap container when it has not completed.
- [x] Add explicit output explaining that normal start never reseeds completed databases.
- [x] Test PowerShell parsing and configuration-only behavior.

### Task 5: Documentation, ADR, and MCP synchronization

**Files:**
- Modify: `deploy/README.md`
- Modify: `docs/operations/single-host-docker-compose.md`
- Modify: `README.md`
- Modify: `docs/adr/0011-single-host-docker-compose-deployment.md`
- Modify: `docs/design-facts/baseline-manifest.json`

- [x] Document first startup, subsequent startup, non-empty database refusal, failed bootstrap recovery, and external PostgreSQL mode.
- [x] Record the accepted decision, Proposal, Context Pack, evidence commands, and exact Scope through MCP.
- [x] Run `pnpm design-facts:sync` and `pnpm design-facts:check` against the canonical PostgreSQL database.
- [x] Read back the updated ADR, Proposal, Context Pack, evidence, and typed links.

### Task 6: End-to-end verification

**Files:**
- Create: `deploy/scripts/bootstrap-e2e.ps1`
- Create: `deploy/scripts/bootstrap-e2e.test.ps1`

- [x] Run isolated PostgreSQL first-startup and persistent-volume restart verification.
- [ ] Run injected Bootstrap failure/recovery E2E verification (deferred to deployment verification).
- [x] Run `git diff --check`, focused tests, Compose configuration verification, Prisma validation, and Bootstrap image build.
- [x] Close the exact MCP design change session with command/result evidence.
