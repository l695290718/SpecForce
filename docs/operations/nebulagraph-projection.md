# NebulaGraph Projection Operations

## Purpose

PostgreSQL remains the authoritative store for authored design assets, typed relationships, and relationship outbox events. NebulaGraph is a rebuildable projection used by the graph adapter. The Graph Gateway is the only service that connects to NebulaGraph; authoring and MCP writes never depend on NebulaGraph availability.

## Deployment Modes

### Local compatibility verification

The optional `deploy/compose.graph-local.yaml` overlay creates a private, single-node NebulaGraph 3.8 runtime with a Graph Gateway and Projector. It publishes no NebulaGraph host port. This mode checks compatibility and recovery behavior; it is not a multi-node production cluster.

1. Copy `deploy/.env.example` to `deploy/.env` and set the PostgreSQL values.
2. Copy `deploy/graph/.env.example` to `deploy/graph/.env` and set image tags and the local credential.
3. Start the profile:

   ```powershell
   docker compose --env-file deploy/.env --env-file deploy/graph/.env -f deploy/compose.yaml -f deploy/compose.graph-local.yaml up -d
   ```

4. Inspect service health without exposing graph ports:

   ```powershell
   docker compose --env-file deploy/.env --env-file deploy/graph/.env -f deploy/compose.yaml -f deploy/compose.graph-local.yaml ps
   ```

5. Stop the local graph profile while retaining projection data:

   ```powershell
   docker compose --env-file deploy/.env --env-file deploy/graph/.env -f deploy/compose.yaml -f deploy/compose.graph-local.yaml down
   ```

Use `down -v` only for an intentional compatibility reset. A reset does not affect the authoritative PostgreSQL relationship history; replay rebuilds NebulaGraph from the outbox.

### External NebulaGraph cluster

For enterprise deployment, run the base Compose file without `deploy/compose.graph-local.yaml`; it contains no NebulaGraph, Graph Gateway, or Projector service. Deploy the Gateway and Projector through the platform orchestrator close to the managed NebulaGraph cluster.

Required runtime variables are `SPECFORGE_NEBULA_ADDRESS`, `SPECFORGE_NEBULA_USER`, `SPECFORGE_NEBULA_PASSWORD`, and `SPECFORGE_NEBULA_SPACE`. The password must come from the platform secret manager, never from a committed env file. Gateway and Projector also require the PostgreSQL connection and `SPECFORGE_GRAPH_GATEWAY_URL` respectively.

## Health, Replay, and Recovery

- Gateway health: `GET /health` reports `status`, `graphSchemaReady`, and a sanitized code. Do not log credentials or raw Nebula errors.
- Projector health reports the pending backlog, oldest event age, checkpoint, retries, and dead letters when the runtime health endpoint is delivered.
- A failed projection leaves its outbox event available for retry. The exact-scope checkpoint advances only after successful idempotent projection.
- To rebuild a graph, reset only NebulaGraph storage, then replay relationship outbox events with the Projector. Do not rewrite authored relationships solely to repopulate NebulaGraph.
- If Gateway or NebulaGraph is unavailable, select `SPECFORGE_GRAPH_STORE=postgres` explicitly for PostgreSQL traversal fallback. Nebula failures never silently select a different store.

## Verification

Run the configuration-only topology assertions before live verification:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly
```

The later live procedure creates an exact-scope relationship through MCP persistence, waits for the Projector checkpoint, verifies a Nebula traversal, restarts the Projector, and proves the logical edge remains singular.

## 中文说明

PostgreSQL 是设计资产、关系和 Outbox 事件的权威数据源；NebulaGraph 仅保存可重建的派生投影。MCP 写入不依赖 NebulaGraph。`compose.graph-local.yaml` 仅用于本地单节点兼容性验证，不是生产多节点集群。企业集群模式不加载该文件，平台负责部署 Gateway 与 Projector，并通过密钥管理系统提供 Nebula 凭据。图服务异常时，必须显式选择 `SPECFORGE_GRAPH_STORE=postgres` 进行降级，不允许静默切换。
