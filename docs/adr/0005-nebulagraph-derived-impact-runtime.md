# ADR 0005: NebulaGraph as the Derived Impact Runtime

## Status

- Stable ID: `adr-nebulagraph-derived-impact-runtime`
- Status: Accepted architecture; production implementation deferred.
- Implementation status: The engine-neutral GraphStore contract, scoped impact traversal, and local PostgreSQL adapter are implemented and locally verified. NebulaGraph production projection, the Go gateway using the official client, and deployment compatibility verification are deferred.
- Owning `architectureScope`: `applicationServiceId=com.huawei.celon.desiner`; `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

中文本地化状态：

- 稳定 ID：`adr-nebulagraph-derived-impact-runtime`
- 状态：架构已接受；生产实现延期。
- 实现状态：与引擎无关的 GraphStore 契约、有范围影响遍历和本地 PostgreSQL 适配器已经实现并完成本地验证。NebulaGraph 生产投影、使用官方客户端的 Go 网关以及部署兼容性验证延期处理。
- 所属 `architectureScope`：`applicationServiceId=com.huawei.celon.desiner`；`scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

Impact analysis needs bounded, explainable traversal over typed design relationships. Local development and automated tests need a deterministic and inexpensive runtime, while enterprise deployments may need a distributed graph engine for higher graph volume and query concurrency. The runtime must preserve exact scope authorization and must never make a derived projection an authoring authority.

中文本地化背景：

影响分析需要对有类型设计关系执行有边界、可解释的遍历。本地开发和自动化测试需要确定性强且成本低的运行时；企业部署可能需要分布式图引擎来承载更大的图规模和更高的查询并发。运行时必须保留精确的范围授权，并且绝不能让派生投影成为编写权威。

## Decision

Use NebulaGraph as the normal enterprise impact-analysis query runtime, fed by idempotent projections of PostgreSQL relationship events. A Go graph gateway owns NebulaGraph client credentials and the official NebulaGraph client integration. Web, MCP, and Agent clients call an engine-neutral `GraphQueryService` only; they never connect to NebulaGraph directly.

Keep `PostgresGraphStore` as the local, development, test, and small-installation compatibility runtime, and keep `InMemoryGraphStore` for deterministic unit tests. Every traversal plan contains exactly the authorized application-service scope, bounded depth/node/path/time budgets, a graph version requirement when needed, and evidence paths. Results identify the actual checkpoint and report `PARTIAL` with frontier and truncation reasons when budgets, timeout, or projection readiness prevent complete analysis. There is no silent stale-data or unbounded PostgreSQL fallback for an enterprise graph outage.

中文本地化决策：

将 NebulaGraph 作为企业影响分析的常规查询运行时，由 PostgreSQL 关系事件的幂等投影提供数据。Go 图网关负责 NebulaGraph 客户端凭据和官方 NebulaGraph 客户端集成。Web、MCP 和 Agent 客户端只能调用与引擎无关的 `GraphQueryService`，绝不能直接连接 NebulaGraph。

保留 `PostgresGraphStore` 作为本地、开发、测试和小规模部署的兼容运行时，并保留 `InMemoryGraphStore` 用于确定性单元测试。每个遍历计划都必须包含恰好一个已授权应用服务范围、有边界的深度、节点、路径和时间预算，以及必要时的图版本要求和证据路径。当预算、超时或投影就绪状态阻止完整分析时，结果必须标识实际使用的检查点，并以 `PARTIAL` 状态返回前沿节点和截断原因。企业图运行时故障时，不得静默使用过期数据或无边界 PostgreSQL 回退。

## Alternatives

1. **Use PostgreSQL for every production traversal.** Rejected as the normal enterprise runtime because relational recursive queries remain useful but do not provide the intended distributed graph deployment profile at enterprise scale.
2. **Let Web or MCP query NebulaGraph directly.** Rejected because it would bypass centralized authorization, budgets, audit, engine-neutral semantics, and credential ownership.
3. **Make NebulaGraph authoritative and replicate back to PostgreSQL.** Rejected because it reverses the write authority and makes graph availability and projection ordering part of authored-fact correctness.
4. **Fall back silently to PostgreSQL when NebulaGraph is unavailable.** Rejected because stale or differently bounded results could be presented as current enterprise analysis.

中文本地化替代方案：

1. **所有生产遍历都使用 PostgreSQL。** 拒绝作为企业常规运行时，因为关系递归查询仍然有价值，但无法提供目标企业规模的分布式图部署形态。
2. **允许 Web 或 MCP 直接查询 NebulaGraph。** 拒绝，因为这会绕过集中式授权、预算、审计、与引擎无关的语义和凭据所有权。
3. **让 NebulaGraph 成为权威源并复制回 PostgreSQL。** 拒绝，因为这会反转写入权威，使图可用性和投影顺序影响编写事实正确性。
4. **NebulaGraph 不可用时静默回退到 PostgreSQL。** 拒绝，因为过期或边界不同的结果可能被当作当前企业分析呈现。

## Consequences

- Enterprise traversal can scale independently from authoring transactions, with projection lag and checkpoint state made explicit.
- One engine-neutral contract supports NebulaGraph, PostgreSQL, and in-memory implementations, but requires contract and compatibility tests.
- Projection failure requires retryable jobs, lag observability, and rebuild procedures from PostgreSQL snapshots plus relationship-event replay.
- NebulaGraph introduces operational cost: Go gateway ownership, private-cluster deployment, version compatibility, partitioning, credentials, and capacity testing.
- Until the deferred production path is delivered, local PostgreSQL impact analysis is the verified capability and NebulaGraph must be reported as deferred.

中文本地化后果：

- 企业遍历可以与编写事务独立扩展，同时明确暴露投影延迟和检查点状态。
- 一个与引擎无关的契约可以支持 NebulaGraph、PostgreSQL 和内存实现，但需要契约测试和兼容性测试。
- 投影失败需要可重试任务、延迟可观测性以及从 PostgreSQL 快照和关系事件重放开始的重建流程。
- NebulaGraph 会带来运维成本：Go 网关所有权、私有集群部署、版本兼容、分区、凭据和容量测试。
- 在延期的生产路径交付前，本地 PostgreSQL 影响分析是已验证能力，NebulaGraph 必须标记为延期。

## Constraints

- Scope is exactly `com.huawei.celon.desiner` and its exact scope path for this ADR; no cross-service traversal is exposed.
- NebulaGraph is derived only from PostgreSQL relationship events and cannot receive direct authoring writes.
- Only `GraphQueryService` may hold graph database credentials; Web, MCP, and Agents use scoped service APIs.
- Authorization is applied before query compilation and validated again on every returned node and edge.
- Projection versions, checkpoints, lag, retries, and actual graph version used by each result must be observable.
- NebulaGraph 3.8.0 official-client compatibility, Docker or private-cloud topology, and enterprise capacity targets are deferred evidence, not implemented claims.

中文本地化约束：

- 本 ADR 的范围恰好是 `com.huawei.celon.desiner` 及其精确范围路径；不开放跨服务遍历。
- NebulaGraph 只能由 PostgreSQL 关系事件派生，不能接受直接编写。
- 只有 `GraphQueryService` 可以持有图数据库凭据；Web、MCP 和 Agent 使用有范围的服务 API。
- 授权必须在查询编译前执行，并再次核验每个返回的节点和边。
- 必须能够观测投影版本、检查点、延迟、重试以及每个结果实际使用的图版本。
- NebulaGraph 3.8.0 官方客户端兼容性、Docker 或私有云拓扑以及企业容量目标属于延期证据，不能宣称已实现。

## Evidence

- `pnpm --filter @specforge/core test` — local tests verify scoped traversal authorization, bounded impact analysis, partial-result semantics, and evidence paths.
- `pnpm --filter @specforge/graph-store test` — local tests verify `PostgresGraphStore` traversal, projection, and checkpoint behavior.
- `docs/superpowers/specs/2026-07-14-enterprise-impact-analysis-design.md` — records the approved PostgreSQL-to-NebulaGraph projection architecture and the deferred production boundary.
- `docs/TODO.md` — records the deferred NebulaGraph 3.8.0 Go-client, topology, integration, and smoke-suite work.
- No local evidence proves a running NebulaGraph 3.8.0 cluster or official-client compatibility; those capabilities remain deferred.

中文本地化证据：

- `pnpm --filter @specforge/core test` — 本地测试验证范围遍历授权、有边界影响分析、部分结果语义和证据路径。
- `pnpm --filter @specforge/graph-store test` — 本地测试验证 `PostgresGraphStore` 的遍历、投影和检查点行为。
- `docs/superpowers/specs/2026-07-14-enterprise-impact-analysis-design.md` — 记录已批准的 PostgreSQL 到 NebulaGraph 投影架构以及生产边界的延期状态。
- `docs/TODO.md` — 记录 NebulaGraph 3.8.0 Go 客户端、拓扑、集成和冒烟套件的延期工作。
- 没有本地证据证明正在运行的 NebulaGraph 3.8.0 集群或官方客户端兼容性；这些能力仍然延期。

## Reconciliation Update (2026-07-19)

This update supersedes the prior statement that MCP synchronization for this ADR was blocked. The ADR, matching Proposal/Context Pack, typed links, and Evidence are now synchronized and read back in the exact Designer scope. NebulaGraph 3.8.0 production projection, official-client compatibility, topology, and enterprise capacity evidence remain deferred.

### 对账更新（2026-07-19）

本更新覆盖此前本 ADR 的 MCP 同步受阻描述。ADR、关联 Proposal/Context Pack、类型化关系和 Evidence 现已在精确 Designer Scope 中同步并回读。NebulaGraph 3.8.0 生产投影、官方客户端兼容性、部署拓扑和企业容量证据仍保持延期。

## P1 Verification Runtime Boundary

The live projection checker is fail-closed and requires an explicit verification Scope, enterprise, database URL, and run ID. It cleans the same run before preparation and in a `finally` path after verification. Historical cleanup is fingerprint-protected and MCP-only.

Live Nebula readiness is externally blocked: `pnpm exec tsx deploy/graph/live-projection-check.ts --phase prepare` returned `NEBULA_LIVE_GATEWAY_UNAVAILABLE` at `http://127.0.0.1:18088/health`. Recovery cleanup for run `p1-cleanup-check` succeeded with `assetIds=3`, `status=deleted`, `remainingLinks=0`. The capability is locally implemented, but live Nebula is not claimed until the Gateway/Nebula profile is running and the same prepare command passes.

### P1 验证运行时边界

实时投影检查器失败关闭，必须显式提供验证 Scope、企业、数据库连接串和运行 ID，并在准备前及验证后的 finally 路径清理同一运行批次。实时 Nebula 就绪仍被网关阻塞；网关启动后必须重跑相同的 prepare 命令。恢复清理已成功，结果为 3 个资产、状态 `deleted`、剩余关系 `0`。

## MCP Record

- Matching MCP ADR ID: `adr-nebulagraph-derived-impact-runtime`
- Exact `architectureScope`: `applicationServiceId=com.huawei.celon.desiner`; `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related Proposal: `proposal-enterprise-impact-analysis`
- Related Context Pack: `ctx-enterprise-impact-analysis`
- Related assets: `data-specforge-asset-graph`, `api-specforge-mcp-tools`, `quality-specforge-impact-ready`, `event-specforge-context-pack-generated`
- Typed links: `derives-from`, `implements`, `queries`, and `blocked-by-deferred-work`, with all endpoints in the exact scope.
- Evidence references: the commands and repository paths listed in `Evidence`.
- MCP synchronization: the P1 verification-runtime ADR, Proposal, Context Pack, Evidence, and three typed links were persisted and read back in the exact verification Scope. Live Nebula readiness remains blocked separately by the unavailable Gateway.

中文本地化 MCP 记录：

- 匹配的 MCP ADR ID：`adr-nebulagraph-derived-impact-runtime`
- 精确 `architectureScope`：`applicationServiceId=com.huawei.celon.desiner`；`scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 相关 Proposal：`proposal-enterprise-impact-analysis`
- 相关 Context Pack：`ctx-enterprise-impact-analysis`
- 相关资产：`data-specforge-asset-graph`、`api-specforge-mcp-tools`、`quality-specforge-impact-ready`、`event-specforge-context-pack-generated`
- 有类型关系：`derives-from`、`implements`、`queries` 和 `blocked-by-deferred-work`，所有端点都必须位于精确范围内。
- 证据引用：使用 `Evidence` 章节列出的命令和仓库路径。
- MCP 同步受阻：本次仅处理文档，无法执行 MCP 写入和回读核验。重试触发条件：通过有范围的 `create_adr` MCP 操作持久化本 ADR，持久化有类型关系和延期待办事实，并回读核验 ID、范围、英文规范字段、中文覆盖、目标和证据。
