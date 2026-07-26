# NebulaGraph Production Projection Design

## Status

Proposed and approved for implementation planning. This document defines the production projection increment for the existing enterprise impact-analysis model. It does not claim that a live NebulaGraph deployment has been implemented or verified.

## Goals

- Run a repeatable local single-node NebulaGraph topology for development and compatibility verification.
- Use the same gateway and projector contracts against a shared enterprise NebulaGraph cluster through configuration only.
- Preserve PostgreSQL as the sole authority for authored relationships, events, outbox rows, checkpoints, and audit evidence.
- Project relationship events to NebulaGraph asynchronously, idempotently, and within an exact application-service scope.
- Make graph lag, retry state, and projection health observable without exposing graph credentials or raw errors.
- Keep PostgreSQL traversal as an explicit compatibility fallback, not an implicit mixed read model.

## Non-Goals

- Make NebulaGraph an authoring store or a synchronous dependency of MCP relationship writes.
- Ship a multi-node production NebulaGraph cluster, Kubernetes manifests, or corporate secrets integration in this increment.
- Expose direct NebulaGraph access to Web, MCP, or Agent clients.
- Enable cross-application-service graph reads; authorization for that future capability remains deferred.

## Topology

```text
MCP relationship command
  -> PostgreSQL transaction
       current relationship + event + outbox row
  -> success returned to caller

Graph projector
  -> claims pending PostgreSQL outbox rows
  -> Graph Gateway (HTTP, internal only)
  -> NebulaGraph projection
  -> PostgreSQL checkpoint and delivery receipt

Impact worker
  -> GraphStore=Nebula through Gateway in production
  -> GraphStore=PostgreSQL only when explicitly configured as fallback
```

The local Compose profile contains a single NebulaGraph instance, Graph Gateway, and Graph Projector in addition to the existing PostgreSQL authority. Enterprise mode starts Gateway and Projector with the same images but reads Nebula endpoints, credentials, and space configuration from secrets-managed environment variables. It does not start a Nebula container.

Web, MCP, and agents never connect to NebulaGraph directly. They use the existing GraphStore interface; its Nebula implementation calls only the Gateway. This retains one scope-validation and query-translation boundary.

## Delivery and Consistency

1. A relationship command validates exact `enterpriseId`, `applicationServiceId`, and `scopePath`, then commits current state, event history, and an outbox row in one PostgreSQL transaction.
2. The Projector claims rows with a lease. A row retains its immutable idempotency key and graph version.
3. The Projector sends a structured projection batch to the Gateway. The batch includes full scope identity on every node and edge; raw nGQL is never accepted from callers.
4. Gateway validates the batch scope and applies idempotent upserts to NebulaGraph. Replaying an event produces the same logical graph state.
5. Only after Gateway acknowledgement does the Projector mark delivery complete and advance the exact-scope checkpoint monotonically.
6. On a transient failure the lease expires or is rescheduled with bounded exponential backoff. On a terminal failure the row becomes dead-lettered with a sanitized diagnostic reference. Checkpoints do not advance past unprojected work.
7. Impact analysis requires `ProjectionCheckpoint >= requiredGraphVersion`. Otherwise it remains `WAITING_FOR_PROJECTION`; it does not silently query stale data.

The delivery contract is at-least-once, not exactly-once. Idempotent graph writes and checkpoint ordering produce effective once-only graph state per event version. PostgreSQL remains replay authority, so a Nebula graph can be rebuilt from retained events.

## Configuration

The implementation exposes a single `SPECFORGE_GRAPH_STORE` selector with explicit values:

- `postgres`: local development and controlled fallback traversal; no Gateway or Nebula dependency.
- `nebula`: production traversal through Graph Gateway; startup must fail closed if Gateway health is unavailable.

Gateway configuration is environment-only and never returned by health or API responses:

- `SPECFORGE_GRAPH_GATEWAY_PORT` and internal base URL.
- `SPECFORGE_NEBULA_HOSTS`, `SPECFORGE_NEBULA_USER`, `SPECFORGE_NEBULA_PASSWORD`, and `SPECFORGE_NEBULA_SPACE`.
- `SPECFORGE_PROJECTOR_POLL_MS`, lease duration, retry cap, and batch size.

Local Compose supplies safe developer defaults through an ignored `deploy/.env`. Enterprise deployment supplies these values through the platform's secret mechanism. `DATABASE_URL` continues to select the authoritative PostgreSQL instance independently.

## Health, Security, and Operations

Gateway health verifies authenticated Nebula connectivity and required graph schema availability. Projector health reports backlog count, oldest pending age, last successful checkpoint per exact scope, retry/dead-letter counts, and a sanitized failure code. It must not expose connection strings, credentials, raw nGQL, or raw exception text.

The operator may stop Gateway and Projector during an incident without blocking MCP writes. Outbox rows accumulate in PostgreSQL and replay after recovery. The approved rollback is to set `SPECFORGE_GRAPH_STORE=postgres`, stop the projection services, and retain PostgreSQL outbox data for later replay. No relationship data is deleted during rollback.

## Verification Strategy

- A Go compatibility suite uses the official NebulaGraph client against the local single-node Compose profile, creates the configured space/schema, writes scoped vertices and edges, and performs multi-hop traversal.
- Gateway contract tests reject raw queries, missing or mixed scopes, and unsafe identifiers.
- Projector tests prove duplicate delivery, interrupted lease recovery, retry exhaustion, sanitized diagnostics, checkpoint ordering, and exact-scope isolation.
- Cross-adapter GraphStore tests compare PostgreSQL and Nebula results for nodes, paths, `PARTIAL` status, and truncation reasons.
- A Compose smoke test verifies PostgreSQL authority, outbox-to-Nebula projection, checkpoint advancement, `WAITING_FOR_PROJECTION`, and explicit PostgreSQL fallback.

Production-scale benchmark, multi-node Nebula operations, and corporate secret-store integration remain tracked separately. This increment establishes the projection contract and a reproducible compatibility topology; it does not claim hundred-million-edge capacity certification.

## Design-Fact Requirements

Before completion, create or update:

- ADR: `adr-nebulagraph-production-projection`.
- A scoped Proposal for the user-visible impact-analysis consistency behavior.
- A Context Pack for agents that operate the projector, Gateway, fallback flag, and replay workflow.
- Canonical assets and typed relationships for the graph Gateway API, projector service, deployment topology, outbox/checkpoint data model, and operational rules.
- Evidence records for exact commands and their results, synchronized through MCP in the Designer scope.

The owning scope is `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`. English remains canonical and each human-facing record requires a complete Chinese localization. A failed MCP write blocks completion and must be recorded as `MCP synchronization blocked` with its retry trigger.

## 中文本地化

### 状态与目标

本设计已获准进入实施计划阶段，但尚未声明已完成 NebulaGraph 生产投影。目标是在本地以单节点 Docker Compose 完成可重复的兼容性验证，并通过配置将同一 Gateway 与 Projector 接入企业共享 Nebula 集群。PostgreSQL 始终是关系、事件、Outbox、检查点和审计证据的唯一权威来源。

### 一致性与隔离

关系命令先在 PostgreSQL 的同一事务中写入当前关系、事件与 Outbox，再向调用方返回成功。Projector 以租约领取 Outbox，携带不变的幂等键和图版本，经由 Gateway 写入 NebulaGraph。只有图写入确认成功，才可以完成投递并单调推进精确 Scope 的检查点。重试采用至少一次投递，依靠幂等写入收敛；Nebula 不可用不会阻塞 MCP 写入。影响分析在检查点不足时保持 `WAITING_FOR_PROJECTION`，不得静默读取过期图数据。

每个节点、边、事件、Outbox 和检查点都必须保留 `enterpriseId`、`applicationServiceId` 与 `scopePath`。Web、MCP 和 Agent 不得直接连接 NebulaGraph，只能通过受限的 Gateway 和 GraphStore 抽象访问。跨应用服务读取仍是延期能力。

### 运行与回退

本地模式通过 Compose 启动单节点 NebulaGraph、Gateway 和 Projector；企业模式不启动 Nebula 容器，只通过密钥管理的环境变量连接共享集群。`SPECFORGE_GRAPH_STORE=nebula` 表示生产图读取必须经由健康 Gateway；`postgres` 是显式的开发或受控回退模式。发生图侧故障时，可以停止 Gateway/Projector 并切换到 `postgres`，保留 PostgreSQL Outbox，待恢复后重放；任何回退都不得删除关系事实。

### 验证与设计事实

实施完成前必须通过官方 Nebula Go Client 兼容性测试、Gateway/Projector 契约测试、跨适配器结果对比和 Compose 端到端冒烟验证。必须创建 ADR、Proposal、Context Pack、设计资产和有类型关系，并通过 MCP 在精确 Designer Scope 写入、回读和核验。英文为规范字段，所有面向人的记录必须有完整中文本地化；任一 MCP 同步失败都必须记录为 `MCP synchronization blocked`，并阻止完成声明。
