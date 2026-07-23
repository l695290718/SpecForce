# Docker PostgreSQL Authoritative MCP Sync Design

## Status

Approved for implementation on 2026-07-23.

## Objective

Make the Docker/WSL PostgreSQL instance at `localhost:5433` the local SpecForge authority, then persist and read back the federated design-fact governance record through the scoped MCP boundary.

## Scope

- Change the local `DATABASE_URL` from the native PostgreSQL instance on port `5432` to the Docker/WSL PostgreSQL instance on port `5433`.
- Apply the checked-in Prisma schema to the selected database.
- Persist the manifest-driven design facts through `design-facts:sync`.
- Verify exact Designer Scope, canonical English content, Chinese overlays, typed links, Evidence, and federated reconciliation through read-only checks.
- Update the tracked backlog only after every write and read-back check succeeds.

## Non-Goals

- Do not copy, merge, or delete data in the native `5432` PostgreSQL instance.
- Do not make NebulaGraph authoritative or introduce a graph projection in this change.
- Do not treat a successful local migration as evidence of MCP synchronization.

## Architecture

`localhost:5433/specforge` becomes the single local development authority for Web, MCP, and command-line design-fact workflows. All authored records remain PostgreSQL rows accessed through Prisma and scoped MCP tools. The repository ADR and manifest remain the version-controlled counterpart of each synchronized fact.

The Designer Scope is fixed for this operation:

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

NebulaGraph remains a separate derived-query runtime. It receives no authoring write and is not part of this synchronization completion gate.

## Execution Flow

1. Stop the Web development process if it holds the Prisma engine file.
2. Update the local connection string to port `5433` and regenerate Prisma Client.
3. Apply the checked-in schema/migrations to `5433` without resetting or importing `5432`.
4. Start the Web service with the new connection string.
5. Run `pnpm design-facts:sync`.
6. Run `pnpm design-facts:check`.
7. Run `pnpm design-facts:federation:check` with the fixed exact Scope environment variables.
8. Read back the persisted federated ADR, Proposal, Context Pack, typed links, and Evidence through the scoped MCP boundary.
9. Mark the two MCP synchronization backlog facts complete only when every command and read-back succeeds.

## Failure and Rollback

Any failed migration, MCP write, reconciliation issue, or read-back mismatch leaves the backlog blocked. The failure reason and retry trigger remain recorded. The `.env` connection string can be restored to port `5432` and the Web service restarted; no data is removed from either database by this workflow.

## Verification

Completion requires all of the following:

- Prisma generation and type checks pass against the updated repository.
- `design-facts:sync` exits successfully against `5433`.
- `design-facts:check` reports no missing, mismatched, out-of-scope, or blocked records.
- The configured federation check exits successfully for the exact Designer Scope.
- Scoped MCP read-back confirms stable IDs, English canonical fields, complete Chinese overlays, links, and six Evidence records.
- The Web service responds after restart using `5433`.
