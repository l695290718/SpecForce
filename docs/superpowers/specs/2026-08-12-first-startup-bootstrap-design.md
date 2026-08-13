# First-Startup Database Bootstrap Design

## Status

Accepted for implementation.

- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Decision: a fresh database is bootstrapped once; later starts never replay seed data.

## Problem

The current Docker Web entrypoint applies the Prisma schema, but the default deployment does not populate the database. A new deployment therefore has tables but no usable design catalog. Running a business-data seed command on every start would make container restarts unsafe because same-ID upserts could overwrite later authored changes. Initial deployment data is infrastructure bootstrap content, not an MCP-authored business change.

## Decision

Add a dedicated one-shot direct Bootstrap service and a separate governed one-shot 3A Bootstrap service to the default deployment topology. PostgreSQL becomes healthy first, direct Bootstrap applies the schema if required, acquires a PostgreSQL advisory lock, and evaluates a database-owned bootstrap record. For a fresh database it executes a versioned Prisma initialization script directly against PostgreSQL. It does not start the MCP server and does not call MCP design write tools. After direct Bootstrap succeeds, the governed 3A service invokes the MCP preflight, baseline, projection-build, status, and close tools, and Web waits for its `READY` result.

The Bootstrap service follows these rules:

1. No bootstrap record and no authored business rows: run the deterministic versioned database initialization script, validate the expected inventory, then mark the record `COMPLETED`.
2. A `COMPLETED` record: skip seed writes and exit successfully. It may run a separate idempotent relationship-projection repair over the current authored catalog; this repair never updates authored payloads.
3. Existing authored rows with no bootstrap record: fail closed with an actionable message. The service does not infer ownership, delete rows, or overwrite data.
4. A `RUNNING` record whose lease is active: wait for the current run and then re-read the result.
5. A `FAILED` record: retry the same bootstrap version under the advisory lock. The initialization script is transactional and idempotent, and the final inventory check determines success.

The Web and Knowledge Projector depend on direct Bootstrap completion; governed 3A Bootstrap depends on the Projector health; Web additionally depends on governed 3A Bootstrap completion. `start.ps1` starts the stack and waits for both one-shot services plus Web health; `status.ps1` reports both initializer states and scoped inventory. `stop.ps1` continues to preserve the PostgreSQL volume.

## Persistence

Add a `DeploymentBootstrap` table with:

- `id` fixed to `specforge-default-bootstrap`;
- `bootstrapKey` identifying the deployment profile;
- `version` identifying the deterministic seed contract;
- `status` with `PENDING`, `RUNNING`, `COMPLETED`, or `FAILED`;
- `startedAt`, `completedAt`, `heartbeatAt`, and `updatedAt` timestamps;
- `assetCount`, `proposalCount`, `contextPackCount`, and `relationshipCount` after success;
- sanitized `lastError` and `attemptCount`.

The table is operational metadata, not a design asset. PostgreSQL remains authoritative for authored design facts. Direct database initialization is allowed only for this versioned first-startup bootstrap; all subsequent business design writes still go through MCP tools. The bootstrap record prevents a filesystem marker or container recreation from changing initialization semantics.

## Runtime Flow

```text
postgres healthy
       |
       v
bootstrap schema + advisory lock
       |
       +-- COMPLETED -> exit 0
       +-- empty     -> direct initialization transaction -> inventory check -> COMPLETED
       +-- non-empty -> FAILED -> block Web/Projector
       v
Knowledge Projector healthy -> governed MCP 3A baseline/projection -> READY -> Web healthy
```

The Bootstrap container is one-shot and has no host port. It receives the database credentials and initialization version, but no MCP runtime dependency. It must not run legacy cleanup in a normal deployment. Its direct SQL/Prisma writes are limited to the versioned infrastructure bootstrap transaction and are not available to runtime agents.

## Safety and Recovery

- PostgreSQL advisory locking prevents concurrent Bootstrap containers from seeding twice.
- Stable IDs, one transaction, and the bootstrap lock make a retried failed initialization safe.
- A non-empty uninitialized database requires an explicit operator decision; the default startup fails closed.
- A completed database is never reseeded automatically, even if the seed source changes.
- Future catalog upgrades require a separately versioned migration or explicit operator command; ordinary startup is not a migration channel for authored content.

## Acceptance Criteria

- A new PostgreSQL volume starts with tables, bilingual self-design assets, proposals, Context Pack, and relationships available through the Web.
- A second start leaves all authored row counts and content digests unchanged.
- A restart after `COMPLETED` does not execute the initialization transaction or launch MCP.
- An existing non-empty database without a bootstrap record fails before Web becomes healthy.
- A forced bootstrap failure records `FAILED`, and a retry can converge without duplicate logical rows.
- Bundled and external PostgreSQL topologies use the same Bootstrap contract.
- English canonical fields, Chinese overlays, exact Scope, PostgreSQL authority, and MCP-only post-bootstrap design writes remain enforced.
