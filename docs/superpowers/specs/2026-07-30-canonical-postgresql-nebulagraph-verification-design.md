# Canonical PostgreSQL NebulaGraph Verification Design

## Objective

Make the local NebulaGraph verification topology consume the same `deploy-postgres/specforge_canonical` database as Web and MCP, then verify the derived projection end to end.

## Topology

The main-repository Graph Compose profile starts only NebulaGraph, Graph Gateway, and Graph Projector. It does not define a PostgreSQL service or volume. The profile joins the existing `deploy_default` Docker network and uses a `DATABASE_URL` whose host is `deploy-postgres-1` and database is `specforge_canonical`. PostgreSQL remains the only authored-data authority. NebulaGraph holds an idempotent, rebuildable projection.

## Cutover

1. Preserve the existing graph-verification PostgreSQL container and its logical backup until validation succeeds.
2. Add the main-repository external-PostgreSQL graph profile, with credentials supplied only by ignored environment files.
3. Start a replacement Gateway and Projector against canonical PostgreSQL and a fresh local NebulaGraph single-node topology.
4. Verify gateway health, graph schema initialization, pending-outbox projection, monotonic checkpoint advancement, and a scoped multi-hop impact query.
5. Stop the legacy graph-verification Compose project only after the replacement receives data from the canonical outbox and all checks pass.

## Failure and Rollback

Stop Gateway and Projector, set `SPECFORGE_GRAPH_STORE=postgres`, and retain canonical PostgreSQL outbox rows for replay. No relationship, event, outbox, checkpoint, or source data is deleted. The legacy graph-verification stack remains available until the successful cutover is recorded.

## Acceptance Criteria

- No replacement Graph Gateway or Projector process connects to `specforge-graph-verify-postgres`.
- Gateway and Projector report healthy against `deploy-postgres-1/specforge_canonical`.
- An exact Designer Scope outbox row is projected into NebulaGraph and advances its checkpoint only after successful delivery.
- A graph traversal or impact query returns scoped derived results; PostgreSQL fallback remains explicit.
- The old isolated graph-verification PostgreSQL service is stopped only after the evidence above passes.

## 中文本地化

### 目标

让本地 NebulaGraph 验证拓扑与 Web、MCP 使用同一个 `deploy-postgres/specforge_canonical` 数据库，并完成派生投影端到端验证。

### 拓扑

主仓库的图 Compose Profile 只启动 NebulaGraph、Graph Gateway 和 Graph Projector，不再定义 PostgreSQL 服务或数据卷。该 Profile 加入现有 `deploy_default` Docker 网络，并通过 `deploy-postgres-1/specforge_canonical` 连接权威数据库。PostgreSQL 是唯一已编写数据权威源；NebulaGraph 只保存可重建、幂等的派生投影。

### 验收

- 替换后的 Gateway 和 Projector 不得连接 `specforge-graph-verify-postgres`。
- Gateway 与 Projector 必须针对 `deploy-postgres-1/specforge_canonical` 报告健康。
- 精确 Designer Scope 的 Outbox 必须被投影到 NebulaGraph，并且仅在投递成功后推进检查点。
- 旧图验证 PostgreSQL 仅在全部验证通过后才停止。
