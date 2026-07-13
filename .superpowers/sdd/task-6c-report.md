# Task 6C Report: Scoped Localized MCP Derived Views

## Result

Implemented an application-service scoped MCP derived-view boundary. Every derived read now constructs an exact `SpecForgeDataStore` from persisted records authorized for one `applicationServiceId`; Core graph, impact, governance, Context Pack, summary, and Markdown APIs receive that catalog explicitly, so they cannot fall back to global seed data.

## Changes

- Added `scoped-derived.ts` as the shared boundary for scoped catalog loading, graph, impact, governance, Context Pack generation/export, asset detail, and collection/detail Markdown.
- Enforced application-service read permission for every derived read and write permission for Context Pack generation.
- Rejected persisted payloads whose `architectureScope` does not exactly match the requested application service and scope path.
- Added `applicationServiceId` and `locale` to graph, impact, governance, generation, export, and prompt contracts.
- Added `get_asset_graph` and scoped localized resource templates for catalogs, details, and graphs.
- Preserved canonical English source alongside localized human-facing output and preserved technical IDs, relation codes, rule IDs, schemas, and source JSON.
- Removed MCP tool paths that called Core derived functions without an explicit persisted catalog.
- Updated smoke and prompt workflows for the scoped contracts.

## Scope Isolation Coverage

- Two application services use identical logical domain and proposal IDs in tests.
- English Designer and Chinese Policy Hub graph, impact, governance, Context Pack, detail, and collection results remain isolated.
- Unreadable services, read-only generation, and mismatched persisted scope envelopes are rejected.

## Verification

- Focused derived/tool/resource tests: 23 passed.
- MCP + Core full tests: 102 passed, 3 PostgreSQL integration tests skipped without the dedicated test schema.
- MCP typecheck: passed.
- Core typecheck: passed.

## Coordination

`persistence.ts`, `persistence.integration.test.ts`, Prisma migration files, and Web files were owned by concurrent workers and are intentionally excluded from this task commit.
