# ADR-0032: Connector MCP Operations and Scoped Health

- Status: Accepted for the connector foundation
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`

## Decision

Connector runs are controlled through MCP operations with the existing federation audit wrapper. State-changing operations use `assertWritableExactScope`; read-only run and health operations use `assertReadableExactScope`. The v2 batch schema validates contract version, bounded observations, digests, mode, snapshot, mapping, boundary, and source cursor before persistence.

Health output is limited to cursor, latest run, and dead-letter counts for the requested connector/source stream. Connector configuration, secret references, and credential material are never returned.

## Evidence

- `pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit`: passed.
- `pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/federation/tools.test.ts`: 39 passed.

## Deferred

Web health presentation, dead-letter replay, connector definition management, and MCP design-fact synchronization remain subsequent work. The current MCP tool surface still does not expose the required close/write operation to this agent.
