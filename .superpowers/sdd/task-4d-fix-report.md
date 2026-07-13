# Task 4D Review Fix Report

## Scope

- Replaced sibling-service shallow clones with semantically independent bilingual domain, data model, rule, API, and event fixtures.
- Replaced direct seed cleanup with an audited MCP tool call.
- Scoped every cleanup query by authorized `applicationServiceId` and `scopePath`.

## TDD Evidence

- RED: focused tests failed on inherited Designer domain/data/API/event structures and unscoped delete filters.
- GREEN: focused seed and persistence tests passed after the independent fixtures and scoped cleanup were implemented.

## Verification

- MCP focused seed, persistence, and canonical seed tests: 25 passed.
- Core tests: 51 passed.
- MCP typecheck: passed.
- Core typecheck: passed.
- No standalone MCP contract package exists in this workspace; the tool input contract is defined and typechecked in `apps/mcp-server/src/tools.ts`.

## Database

- No real database migration or seed was executed in this review-fix task.

## P1 Scope Identity Follow-up

- `delete_seed_design_data` is registered only when `SPECFORGE_MCP_SEED=1`, and both the tool handler and persistence function reject execution outside seed mode.
- Seed tool calls are audited as `system/specforge-seed`.
- Cleanup and MCP readers use exact `applicationServiceId` and `scopePath` matches; near-prefix paths are not included.
- `DesignAsset`, `Proposal`, `ContextPack`, and `AssetLink` now use an internal PostgreSQL UUID primary key and a unique logical identity of `applicationServiceId + scopePath + id`.
- Every MCP single-record read and upsert uses the generated scoped composite Prisma identity.

### Follow-up Verification

- Prisma Client generation: passed.
- Prisma schema validation: passed.
- MCP focused tests: 30 passed.
- Seed-only tool boundary tests: 3 passed.
- PostgreSQL isolated-schema persistence tests: 2 passed, including same logical IDs in two services and exact-scope cleanup preservation.
- Core tests: 58 passed.
- Core, MCP, and Web typechecks: passed.
- No `db push` or seed was executed; the PostgreSQL integration suite created and removed only its isolated temporary schema.
