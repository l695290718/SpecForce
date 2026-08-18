# Graph Verification Live Gate Lifecycle Design

## Status

Accepted for implementation in the exact verification Scope.

- Owning application service: `com.huawei.celon.desiner.graph-verification`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`
- Design Change Session: `design-change-session:cf2480f7-cccd-4a6f-bf69-726a8fab2c49`
- Parent production Scope: `com.huawei.celon.desiner`

## Problem

The graph fixture isolation implementation already writes temporary assets through MCP, binds them to an explicit run ID, and removes them through the verification Scope. The live gate still depends on an operator starting the local NebulaGraph, Gateway, and Projector profile before running `verify-projection.ps1 -Live`. This leaves a repeatability gap: the gate can report `NEBULA_LIVE_GATEWAY_UNAVAILABLE` even though the repository contains the local verification topology.

The live gate must become repeatable without changing the production topology or stopping unrelated containers.

## Goals

1. Start only the graph verification services required by the live gate under a unique Compose project name.
2. Use the existing canonical PostgreSQL authority without confusing host and container connection strings.
3. Run `prepare`, Projector restart, `verify`, and MCP cleanup with one explicit run ID.
4. Guarantee cleanup of run fixtures and verification containers on success and failure.
5. Never stop or remove the production Web, PostgreSQL, knowledge projector, connector worker, or unrelated containers.
6. Preserve the existing exact verification Scope and fail-closed authorization behavior.

## Non-goals

- This does not change production NebulaGraph deployment or require NebulaGraph in the base application Compose profile.
- This does not make graph storage authoritative; PostgreSQL remains authoritative and the graph remains a derived projection.
- This does not delete persistent production volumes or perform broad Docker cleanup.
- This does not move fixtures into the parent Designer Scope or automatically classify them as design facts.

## Design

### Managed Compose topology

`verify-projection.ps1 -Live` will use the existing base Compose file plus `compose.graph-local.yaml` and `compose.graph-verify.yaml`, but it will start only the six graph verification services:

`nebula-metad`, `nebula-storaged`, `nebula-graphd`, `nebula-bootstrap`, `graph-gateway`, and `graph-projector`.

The command will use a dedicated Compose project name derived from the verification run ID and a validated character set. Live host ports are assigned by Docker and discovered after startup, so concurrent verification runs cannot collide on `18088` or `18090`; configuration-only mode retains those deterministic default ports. The existing `deploy_default` network remains an explicit external network so the containerized Projector can reach the already-running canonical PostgreSQL service. The script will use project-scoped Compose commands for health, restart, and stop operations. It will never call an unscoped `docker compose down`.

### Database connection split

The host-side TypeScript gate receives `SPECFORGE_GRAPH_HEALTH_DATABASE_URL`, or the host `DATABASE_URL`, and must point to the canonical `specforge_canonical` database. The managed Compose environment receives a separately rendered container URL pointing to `deploy-postgres-1:5432/specforge_canonical`. A host URL containing `localhost` is never passed to the Projector container.

### Lifecycle

1. Validate Docker, the exact verification Scope, canonical database URL, required graph credentials, and the external `deploy_default` network.
2. Generate one run ID and a temporary Compose environment file without credentials in the repository.
3. Build and start only the six graph verification services using the dedicated project name.
4. Wait for Compose health and Nebula bootstrap completion.
5. Run the existing MCP-backed `prepare` phase.
6. Restart `graph-projector` through the dedicated Compose project.
7. Run the existing `verify` phase, which validates the graph version, two-hop traversal, Scope isolation, idempotent replay, and dead-letter state.
8. In an outer `finally` path, run MCP cleanup for the run ID while the services are still reachable, then bring down only the six project-scoped verification services and their managed network and ephemeral volumes. The cleanup command must remain scoped to the generated Compose project.

### Watermark and graph-read convergence

The fixture contains two ordered `CALLS` relationships. The gate must not use the first relationship as its readiness signal. It will read both relationship outbox rows, reject `DEAD_LETTER`, require both rows to be `COMPLETED`, and select the greatest relationship `graphVersion` as the fixture watermark. The exact-Scope projection checkpoint must cover that watermark before traversal begins.

Checkpoint coverage proves that the Gateway accepted the projection, but graph storage visibility can still lag behind the PostgreSQL watermark. The gate will therefore poll the exact two-hop traversal until it returns the three expected fixture nodes and two expected `CALLS` edges, or until the bounded convergence deadline expires. The same watermark and expected-shape checks are repeated after the Projector restart. This distinguishes projection lag from an incorrect graph result without weakening Scope isolation or edge identity assertions.

If preparation, image build, or verification fails, the script reports the primary failure, attempts cleanup with the Scope variables already loaded, preserves the run ID and cleanup failure in the diagnostic output, and exits non-zero. Cleanup failure never becomes a silent success.

### Safety boundaries

- Compose project name, service names, and container labels are all restricted to the managed verification run.
- Projector restart uses the dedicated project rather than a global service-label query.
- Production services are addressed only through the external network and are never lifecycle-managed by this script.
- Fixture writes and deletes continue to use MCP and the exact verification Scope.
- The parent Designer Scope remains read-only for this gate.

## Error handling

The gate retains existing fail-closed error codes and adds lifecycle diagnostics for missing Docker, missing `deploy_default`, invalid canonical database URL, Compose startup failure, health timeout, and cleanup failure. Each error includes the run ID and the retry command context without exposing credentials.

## Verification

The implementation must pass:

- `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly`
- Focused PowerShell/script tests covering project-name isolation, host/container database URL separation, service allow-listing, and cleanup on prepare/restart/verify failure.
- A live run of `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -Live` against the canonical PostgreSQL and local Nebula profile.
- MCP read-back proving three run-scoped assets and their relationships are deleted, with `remainingLinks=0`.
- `git diff --check` and the design-fact reconciliation checks.

## Consequences

The live gate becomes self-contained and repeatable for local development. It still requires Docker, the canonical PostgreSQL service, the `deploy_default` network, and the local graph images. The verification run is isolated from production lifecycle operations, while its temporary graph volumes can be discarded after cleanup. The existing historical fixture evidence remains valid and the completion status can move out of the backlog only after a fresh live run passes.

## 中文说明

本设计在精确验证 Scope `com.huawei.celon.desiner.graph-verification` 内实现实时图验证门禁的自动生命周期管理。脚本只启动 6 个图验证服务，使用独立 Compose 项目名和明确的服务白名单；宿主机和容器使用不同的 PostgreSQL 连接串，生产 Web、PG、知识投影器和连接器不会被停止。`prepare -> Projector 重启 -> verify -> MCP 清理` 任何阶段失败都必须进入清理路径，并保留 run ID 和失败诊断。

PostgreSQL 仍是权威存储，NebulaGraph 仍是派生投影；临时夹具继续通过 MCP 写入和清理，且只写入验证 Scope，不进入父 Designer Scope。只有新的实时运行完整通过，并确认 `remainingLinks=0` 后，才能将该待办从延期状态归档。
