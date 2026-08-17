# ADR-0031: Process Accepted Observations into Governed Candidates

- Status: Accepted for the connector foundation
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`

## Decision

Accepted continuous observations are processed from PostgreSQL-persisted rows, not trusted directly from Outbox payloads. The processor requires an exact architecture Scope and matching connector/source namespace. It classifies an observation as `UNCHANGED`, `CANDIDATE`, `TOMBSTONED`, or `CONFLICTED` using normalized digests and authority source metadata.

New or changed observations, source tombstones, and authority conflicts remain governed candidates. No business semantic is auto-promoted. Processed Outbox event IDs are idempotency boundaries for replay.

## Evidence

- `pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/connectors/observation-processor.test.ts`: 3 passed.
- `pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit`: passed.

## Deferred

The repository adapter, review-bundle persistence, promotion dispatch, reconciliation enqueue, MCP tool exposure, and design-fact synchronization remain subsequent work. The current MCP tool surface does not expose the required close/write operation.
