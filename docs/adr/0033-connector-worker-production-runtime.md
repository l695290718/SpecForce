# ADR-0033: Connector Worker Production Runtime

- Status: Accepted for single-host Docker deployment
- Date: 2026-08-17
- Scope: `com.huawei.celon.desiner`
- Preflight session: `design-change-session:526f9b9f-3d19-40d8-bab8-7a9922b8187f`

## Context

The continuous inbound connector needs to run with the same PostgreSQL authority as the Web and knowledge projector services. A production deployment must not require a developer-side process or a second database. It must also start safely when no connector run is queued and expose dependency health without leaking source credentials.

## Decision

Package the connector worker as an independent image at `deploy/connector-worker.Dockerfile` and run it as a first-class service in `deploy/compose.yaml`. The service uses the Compose PostgreSQL hostname and the same `DATABASE_URL` shape as the Web and projector services. It starts after the schema bootstrap succeeds, is restartable, exposes `/healthz` on port `8092`, and uses the exact application-service Scope configured by environment variables.

The worker's development and production entrypoint is `apps/connector-worker/src/main.ts`. Connector definitions and runs remain MCP-controlled; Compose does not seed source credentials or silently create connectors. Secret references are resolved by the worker only through the existing `env:<NAME>` and `docker-secret:<NAME>` policy. PostgreSQL remains authoritative and graph projection remains downstream.

## Consequences

- A single `docker compose up -d` topology can run Web, PostgreSQL, projector, bootstrap, 3A bootstrap, and the connector worker together.
- External PostgreSQL remains replaceable through deployment environment configuration; the worker does not own database lifecycle.
- The worker can be healthy with no queued runs; `/healthz` reports the latest scheduler tick and returns `503` only after a failed tick.
- Automatic source-specific registration, retry policy, dead-letter replay UI, and production connector credentials remain separate follow-up work.

## Evidence

- `pnpm --filter @specforge/connector-worker test`: 13 passed, 1 database integration test skipped without the integration flag.
- `pnpm exec tsc -p apps/connector-worker/tsconfig.json --noEmit`: passed.
- `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/connector-worker/src/__tests__/prisma-gateway.integration.test.ts --testTimeout=30000 --hookTimeout=30000 --pool=forks --poolOptions.forks.singleFork=true`: 1 passed.
- `docker compose --env-file deploy/.env.example -f deploy/compose.yaml config --quiet`: passed.
- `docker compose --env-file deploy/.env.example -f deploy/compose.yaml build connector-worker`: passed.
- `git diff --check`: passed before this ADR update.

## Synchronization status

`MCP synchronization blocked`: the current Codex tool surface did not expose `close_design_change_session` or an equivalent SpecForge write tool after implementation. Retry when the scoped MCP server is available; close the recorded preflight session with the exact evidence above before declaring this design fact converged.
