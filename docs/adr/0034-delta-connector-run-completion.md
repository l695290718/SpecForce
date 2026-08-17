# ADR-0034: Delta Connector Run Completion

- Status: Accepted for continuous observation v2
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`
- Preflight session: `design-change-session:cafe8dd0-3acd-4e02-8e5e-1a26c4291964`

## Context

`DELTA` runs do not require snapshot finalization or deletion inference. The previous persistence path marked a last-page delta batch as `FINALIZING`, while the Worker intentionally finalizes only `FULL_SNAPSHOT` runs. A delta run could therefore remain non-terminal and retain its lease after successful ingestion.

## Decision

When a `DELTA` batch is accepted with `isLastPage=true`, PostgreSQL persistence marks the run `SUCCEEDED`, records `finishedAt`, and removes the run lease in the same transaction. `FULL_SNAPSHOT` behavior remains unchanged: the last page enters `FINALIZING` and only the explicit snapshot finalization path can infer same-boundary tombstones. An incomplete full snapshot remains `RUNNING` and cannot infer deletion.

Explicit delta `UPSERT` and `TOMBSTONE` observations remain source observations and do not bypass candidate review or MCP promotion governance.

## Consequences

- Delta runs have a deterministic terminal lifecycle and do not wait for a snapshot finalizer that will never run.
- Lease cleanup is atomic with the terminal state, reducing stale ownership after successful ingestion.
- Snapshot deletion safety remains boundary- and completeness-gated.

## Evidence

- `pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit`: passed.
- `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/connectors/v2-persistence.integration.test.ts --testTimeout=30000 --hookTimeout=30000 --pool=forks --poolOptions.forks.singleFork=true`: 4 passed.
- `git diff --check`: passed.

## 中文本地化

DELTA 增量运行不需要快照终结或删除推断。此前最后一页增量批次会把运行置为 `FINALIZING`，但 Worker 只终结 `FULL_SNAPSHOT`，因此增量运行可能在成功摄取后仍不结束并保留租约。

当 `DELTA` 批次 `isLastPage=true` 被接受时，PostgreSQL 持久化在同一事务中将运行置为 `SUCCEEDED`、写入 `finishedAt` 并删除租约。完整快照仍然必须经过显式终结，并且只有同边界且完整的快照才能产生删除候选。显式增量更新和删除仍然只能形成来源观测，不能绕过候选审核和 MCP 提升治理。

## Synchronization status

`MCP synchronization blocked`: the current MCP write surface cannot update the matching ADR and close the exact-Scope Design Change Session from this agent. Retry with the scoped MCP write tools available; do not claim full design-fact convergence before read-back succeeds.
