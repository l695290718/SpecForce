# Federation Hardening Slice 3A Fix Report

## Findings Fixed

- `registerConnector` now acquires the same exact-Scope connector advisory transaction lock as `recordObservation`, before changing connector status or capabilities. Concurrent revoke and observe operations therefore serialize on one connector key; the readiness check runs against the committed transaction state.
- Promotion replay now recognizes a valid persisted `PROMOTED` candidate envelope, validates its canonical digest, complete bilingual localization, and exact Scope, and returns that existing receipt without updating the observation or creating another promotion outbox event. Invalid persisted receipts fail closed.

## TDD Evidence

- Added a concurrent revoke-versus-observe regression. Before the fix it failed because registration did not take the connector lock; after the fix it proves the revoke wins in the test ordering, observation is rejected with `CONNECTOR_NOT_ACTIVE`, no observation is persisted, and both operations use the same connector lock key.
- Added a promotion replay regression. Before the fix it failed with `CANDIDATE_STATUS_INVALID`; after the fix it returns the first receipt and keeps the promotion event count at one.

## Verification

- `node $vitest run src/federation/persistence.test.ts --root apps/mcp-server`: **62 tests passed**.
- `node $vitest run src/federation/tools.test.ts src/federation/persistence.test.ts --root apps/mcp-server`: **2 files, 94 tests passed**.
- `pnpm --filter @specforge/core typecheck`: passed.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `git diff --check`: passed; normal LF-to-CRLF working-copy warnings only.

## MCP Synchronization Blocked

Live PostgreSQL/MCP synchronization remains unverified because `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable. Retry after configuring PostgreSQL and the exact Scope, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, the federation check, and read back receipts. No live synchronization success is claimed.
