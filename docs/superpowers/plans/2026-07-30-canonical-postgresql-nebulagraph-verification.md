# Canonical PostgreSQL NebulaGraph Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the local NebulaGraph Gateway and Projector from the main repository against `deploy-postgres/specforge_canonical`, then retire the isolated graph-verification PostgreSQL authority.

**Architecture:** Reuse the existing Gateway and Projector implementation, but expose a main-repository Compose profile with no PostgreSQL service. The profile joins Docker's `deploy_default` network, receives one explicit canonical `DATABASE_URL`, and projects PostgreSQL outbox records into a rebuildable local NebulaGraph topology.

**Tech Stack:** Docker Compose, PostgreSQL 16, NebulaGraph 3.8, Go Gateway, Node Graph Projector, Prisma, pnpm.

## Global Constraints

- PostgreSQL `deploy-postgres-1/specforge_canonical` is the sole authored-data authority.
- The graph Compose profile must not declare a PostgreSQL service, PostgreSQL volume, or fallback database connection.
- Graph Gateway and Projector must not expose Nebula credentials, raw nGQL, or raw exceptions.
- No destructive database, volume, or relationship-data command is allowed.
- Rollback is explicit: stop Gateway/Projector and set `SPECFORGE_GRAPH_STORE=postgres`.
- Completion requires focused evidence plus MCP synchronization and read-back in the exact Designer Scope.

---

### Task 1: Bring the Graph Runtime into Main

**Files:**
- Create: `deploy/compose.graph-local.yaml`
- Create: `deploy/graph/.env.example`
- Create: `deploy/graph-gateway.Dockerfile`
- Create: `deploy/graph-projector.Dockerfile`
- Modify: `deploy/compose.yaml`

**Interfaces:**
- Consumes: existing Gateway/Projector source and Docker network `deploy_default`.
- Produces: a main-repository local Nebula profile that starts Nebula, Gateway, and Projector without a PostgreSQL service.

- [ ] Copy the existing graph runtime assets from the verified implementation branch into main, preserving image and healthcheck contracts.
- [ ] Replace all `postgres` service dependencies with an external `deploy-postgres-1` network alias and a required canonical `DATABASE_URL` environment variable.
- [ ] Add `external: true` network declaration for `deploy_default`; keep Nebula data volumes local to the graph profile.
- [ ] Run `docker compose config` with a non-secret local environment file and assert the rendered services do not contain a `postgres` service.

### Task 2: Rebuild and Verify the Derived Projection

**Files:**
- Create or modify: `deploy/graph/verify-canonical-projection.ps1`
- Modify: `deploy/graph/.env.example`

**Interfaces:**
- Consumes: canonical PostgreSQL outbox and graph profile from Task 1.
- Produces: repeatable health, checkpoint, and scoped traversal evidence.

- [ ] Start the replacement Nebula/Gateway/Projector services using the canonical PostgreSQL connection.
- [ ] Check Gateway and Projector health with exact `enterpriseId`, `applicationServiceId`, and `scopePath`.
- [ ] Create or replay a scoped relationship event through the PostgreSQL authority and prove the Projector advances only after Gateway acknowledgement.
- [ ] Run the existing Gateway compatibility, Projector, GraphStore, and smoke suites selected by the implementation branch.
- [ ] Verify explicit `postgres` fallback remains available while no replacement process connects to the legacy graph-verification PostgreSQL container.

### Task 3: Retire the Isolated Authority and Record Facts

**Files:**
- Modify: `docs/adr/0005-nebulagraph-derived-impact-runtime.md`
- Modify: `docs/adr/0014-single-authoritative-local-postgresql.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`

**Interfaces:**
- Consumes: Task 2 evidence.
- Produces: one active PostgreSQL authority, updated backlog, and synchronized governance records.

- [ ] Stop the legacy graph-verification Compose project only after Task 2 passes; retain its logical backup and document the stopped state.
- [ ] Record exact commands, health results, checkpoint result, traversal result, and fallback result in the ADRs and manifest.
- [ ] Run `pnpm design-facts:sync` and `pnpm design-facts:check` with the canonical connection; require zero missing, mismatched, out-of-scope, or blocked records.
- [ ] Commit the runtime configuration, tests, evidence, and updated design facts together.

## Plan Self-Review

- Spec coverage: Task 1 eliminates the second PostgreSQL service; Task 2 proves the derived projection; Task 3 retires the old authority and records verified facts.
- Placeholder scan: all configuration and verification responsibilities are assigned to concrete paths and commands; values that are secrets remain environment-only.
- Scope check: multi-node Nebula operation, benchmark certification, and enterprise secret-store integration remain out of scope.
