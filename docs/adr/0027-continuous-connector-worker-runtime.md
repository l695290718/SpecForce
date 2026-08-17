# ADR-0027: Continuous Connector Worker Runtime

- Status: Accepted for the connector-worker foundation
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`
- Preflight session: `design-change-session:526f9b9f-3d19-40d8-bab8-7a9922b8187f`

## Context

Continuous inbound observation needs a durable worker boundary between external source adapters and the MCP persistence boundary. A worker must be restartable, scope-safe, and unable to retain source credentials in run facts.

## Decision

The worker is a separate workspace application. Its scheduler owns due-run claiming, fencing-aware page submission, snapshot finalization, heartbeat, and failure recording through `ConnectorV2WorkerGateway`. Source adapters are selected by a versioned `ConnectorAdapterRegistry`; adapters only implement bounded source polling. Secrets are resolved only from `env:<NAME>` or `docker-secret:<NAME>` references. Unsupported references, duplicate registrations, unsupported mappings, and adapter kind mismatches fail closed.

The worker emits `continuous-observation/v2` batches using the run's exact architecture Scope, mapping digest, inventory-boundary digest, sequence, and fencing token. PostgreSQL remains the authoritative persistence boundary; this stage does not write graph projections or promote business semantics.

## Consequences

- Worker restart and lease fencing can be tested without an external source.
- Source-specific adapters can be added without moving credentials or MCP authorization into the worker core.
- The runtime foundation is implemented; PostgreSQL/OpenAPI/catalog adapters, candidate processing, MCP operations, Docker packaging, and production synchronization remain later stages.

## Evidence

- `pnpm --filter @specforge/connector-worker test`: 4 passed.
- `pnpm --filter @specforge/connector-worker typecheck`: passed.
- `pnpm --filter @specforge/core typecheck`: passed before the dependency restore; the same source set is included by the Worker typecheck.
- Commit: `002cd99 feat: add connector worker runtime`.

## Synchronization status

`MCP synchronization blocked`: the current Codex tool surface did not expose `close_design_change_session` or an equivalent SpecForge write tool after the implementation. Retry when the scoped MCP server is available; close the recorded preflight session with the exact evidence above before declaring the design fact converged.
