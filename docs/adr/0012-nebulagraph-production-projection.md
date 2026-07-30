# ADR 0012: NebulaGraph Production Projection

## Status

**Accepted; repository implementation and live component health verification completed, end-to-end authoritative projection and MCP synchronization blocked.**

- Stable ADR/MCP ID: `adr-nebulagraph-production-projection`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Repository implementation: Gateway contract, official NebulaGraph Go client adapter, PostgreSQL outbox projector, Nebula Gateway GraphStore adapter, explicit runtime selection, local Compose profile, and cross-adapter isolation tests are committed.
- Operational verification: the local Compose profile has a healthy PostgreSQL, Nebula Meta, Storage, Graphd, Gateway, and Projector. Gateway v3 client authentication, typed idempotent projection, scoped traversal, and full edge mapping were exercised against NebulaGraph 3.8.0. The authoritative outbox and checkpoint tables are currently empty, so this is not end-to-end outbox evidence.
- Design-fact synchronization: **MCP synchronization blocked.** The configured Docker PostgreSQL authority at `localhost:5433` is not reachable from the MCP stdio client. A responding PostgreSQL listener at `localhost:5432` is not the elected `5433` authority and was deliberately not used for writes.

## Context

Enterprise impact analysis requires multi-hop traversal over a relationship graph that may grow beyond the practical operating envelope of recursive PostgreSQL queries. The graph runtime must scale independently without becoming an authoring authority or weakening application-service isolation.

PostgreSQL already owns authored relationships, relationship events, outbox rows, projection checkpoints, and audit evidence. A derived NebulaGraph view must therefore tolerate temporary graph unavailability, support replay, preserve exact `enterpriseId`, `applicationServiceId`, and `scopePath` identity, and expose the graph version used by impact analysis.

Local development and compatibility testing need a repeatable single-node topology. Enterprise deployments must be able to use the same Gateway, Projector, and GraphStore contracts with an externally managed NebulaGraph cluster selected only by configuration.

## Decision

### Authority and topology

PostgreSQL remains authoritative. A relationship command commits current state, event history, and a `RelationshipOutbox` row in one PostgreSQL transaction. NebulaGraph is a rebuildable derived projection and is never on the MCP authoring path.

A private Go Graph Gateway is the only component that uses the official NebulaGraph client or owns Nebula credentials. It accepts typed projection batches and traversal plans, rejects raw nGQL, validates exact scope, sanitizes failures, and exposes checkpoint and health contracts. Web, MCP, Agents, and the impact worker do not connect to NebulaGraph directly.

The Graph Projector claims PostgreSQL outbox rows with a lease, sends an idempotent projection to the Gateway, and records delivery state in PostgreSQL. The local Compose overlay declares NebulaGraph 3.8.0, Gateway, and Projector services without publishing Nebula ports. Enterprise mode supplies external Nebula endpoints and credentials through environment-managed secrets.

### Delivery and checkpoint consistency

Delivery is at-least-once. Every event retains a stable idempotency identity and graph version. Replaying an event must converge on the same logical graph state.

The exact-scope checkpoint advances monotonically only after Gateway acknowledgement. A failed lower graph version cannot be skipped by a later successful event. Transient failures are retried with bounded backoff; terminal failures are dead-lettered with a sanitized 64-hex diagnostic reference. Raw exceptions, credentials, connection strings, and raw nGQL are not persisted or returned.

Impact analysis waits while `ProjectionCheckpoint < requiredGraphVersion` and reports `WAITING_FOR_PROJECTION`. It must not silently read stale Nebula data.

### Scope and fallback

Every node, edge, projection, traversal, outbox row, and checkpoint carries the full exact scope. Mixed-scope projection batches are rejected, and traversal results are checked so sibling application-service data cannot escape.

`SPECFORGE_GRAPH_STORE=nebula` selects the Gateway-backed runtime. `SPECFORGE_GRAPH_STORE=postgres` is the only fallback. Production requires an explicit selector; Gateway failure never triggers an implicit PostgreSQL read. Local development may default to PostgreSQL.

### Health and operations

Gateway health reports `status`, `graphSchemaReady`, and a sanitized code. Projector backlog, oldest pending age, last checkpoint, retries, and dead letters remain required operational telemetry. The repository currently provides projector processing summaries and persistence fields, but it does not yet expose the planned Projector runtime health endpoint.

Stopping Gateway or Projector must not block PostgreSQL/MCP relationship writes. Outbox rows accumulate and replay after recovery. Rollback switches explicitly to PostgreSQL traversal and preserves all relationship and outbox data.

## Alternatives

1. **Use PostgreSQL for every enterprise traversal.** Rejected as the normal high-scale runtime because it does not provide the intended independently scalable graph-query topology. PostgreSQL remains the explicit compatibility fallback.
2. **Write PostgreSQL and NebulaGraph synchronously.** Rejected because graph availability would become part of the authoring transaction and partial failure recovery would be unsafe.
3. **Let Web, MCP, or Agents query NebulaGraph directly.** Rejected because it would distribute credentials and bypass the typed, scope-validating Gateway boundary.
4. **Make NebulaGraph authoritative.** Rejected because authored history, audit evidence, replay authority, and transactional consistency belong in PostgreSQL.
5. **Silently fall back to PostgreSQL after a Nebula failure.** Rejected because callers could receive results with different freshness or execution semantics without knowing the runtime changed.

## Consequences

- PostgreSQL writes remain available when the graph runtime is unavailable.
- NebulaGraph can be rebuilt from retained PostgreSQL relationship events and outbox state.
- At-least-once delivery requires idempotent graph writes, leased claims, retries, dead-letter handling, and monotonic checkpoints.
- Exact-scope identity and sibling-scope tests make application-service isolation enforceable at each projection and query boundary.
- Local and enterprise profiles share contracts, but live compatibility must still be proven against a running NebulaGraph 3.8.0 service.
- Operators must monitor projection lag and explicitly choose PostgreSQL fallback during a graph incident.
- Multi-node production sizing, hundred-million-edge capacity certification, Kubernetes deployment, and corporate secret-store integration remain deferred.

## Constraints

- PostgreSQL is authoritative for authored assets, relationships, events, outbox rows, checkpoints, and audit evidence.
- NebulaGraph is a derived projection only and cannot accept direct authoring writes.
- The exact owning scope is the Designer application service identified above; this increment does not provide a cross-service comparison view.
- Gateway accepts structured contracts only and must not expose credentials, raw nGQL, or raw exception text.
- A checkpoint cannot advance until the corresponding projection is acknowledged.
- Nebula failure must not cause implicit mixed-store reads.
- The local single-node Compose profile is a compatibility topology, not a multi-node production cluster.
- Full completion requires an MCP-authored relationship to drain from PostgreSQL outbox through the Projector, checkpoint advancement, Projector restart/idempotency evidence, and successful MCP synchronization/read-back.

## Repository Evidence

The following implementation commits were inspected:

- `3991632` — Gateway HTTP contract, exact-scope validation, sanitized health response, official NebulaGraph Go adapter, schema bootstrap, and opt-in compatibility test.
- `836762a` — leased PostgreSQL outbox Projector, retry/dead-letter behavior, checkpoint persistence, Prisma fields, and additive migration.
- `e686ebb` — Gateway-backed `GraphStore` adapter with scope forwarding, traversal mapping, checkpoint reads, timeout propagation, and unavailable-error normalization.
- `cf3ecb7` — local NebulaGraph 3.8.0 Compose overlay, environment template, configuration assertions, and operations guide.
- `8be48c8` — explicit `nebula`/`postgres` runtime selection and impact-worker construction with no implicit fallback.
- `e51de0f` — cross-adapter result consistency, sibling-scope isolation, checkpoint isolation, projection-wait behavior, and MCP smoke isolation assertions.

Fresh repository-only checks on 2026-07-27:

- `node "C:\Users\69529\OneDrive\文档\SpecForge\node_modules\.pnpm\vitest@2.1.9_@types+node@22.20.1\node_modules\vitest\vitest.mjs" run packages/graph-store/src/nebula-gateway.test.ts packages/graph-store/src/cross-adapter.integration.test.ts apps/graph-projector/src/projector.test.ts apps/impact-worker/src/index.test.ts apps/impact-worker/src/worker.test.ts` — passed 5 files and 33 tests.
- `$env:GOCACHE = "C:\Users\69529\OneDrive\文档\SpecForge\.worktrees\nebulagraph-production-projection\.tmp\go-build"; go test ./...` from `apps/graph-gateway` — passed. The live compatibility test remains opt-in and was skipped because `SPECFORGE_NEBULA_COMPATIBILITY=1` was not set.
- `node "C:\Users\69529\OneDrive\文档\SpecForge\node_modules\.pnpm\typescript@5.9.3\node_modules\typescript\bin\tsc" -p <package>/tsconfig.json --noEmit` for GraphStore, Graph Projector, and impact worker — passed.
- `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly` — passed the Compose topology assertions; Docker emitted non-fatal access warnings for the user-level Docker config file.
- `pnpm --filter @specforge/graph-store test` — did not complete in this isolated worktree because pnpm attempted restricted registry access for missing workspace dependency links. The direct local Vitest run above is the successful test evidence for this repository-only pass.

## Completion Blockers

- **Authoritative outbox evidence blocked:** the live private PostgreSQL query returned zero `RelationshipOutbox` rows and zero `ProjectionCheckpoint` rows. Therefore no MCP-authored relationship has drained through the Projector, and checkpoint, restart, or duplicate-edge claims cannot be made. Owner: SpecForge Runtime. Retry trigger: make the elected PostgreSQL authority reachable to the scoped MCP client, author one exact-Designer-scope relationship through MCP, then retain the outbox, checkpoint, traversal, and Projector-restart results.
- **MCP synchronization blocked:** `localhost:5433/specforge` is the elected Docker PostgreSQL authority but is unreachable from the host MCP stdio client. The private graph-profile database has no host port by design, and `localhost:5432` was not substituted. Owner: SpecForge Architecture. Retry trigger: restore the elected `5433` authority or provide an approved MCP runtime on the private Compose network, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the exact-scope federation check and read back IDs, scope, English canonical fields, Chinese overlays, directional links, and evidence.

The fresh 2026-07-28 synchronization attempt used `DATABASE_URL=postgresql://admin:admin@localhost:5433/specforge?schema=public pnpm design-facts:sync`. The MCP stdio client reached `create_adr` and failed with Prisma `P1001` because `localhost:5433` is unreachable. No ADR, Proposal, Context Pack, asset, link, Evidence, or receipt was persisted by that attempt.

## MCP Record

- Expected MCP ADR ID: `adr-nebulagraph-production-projection`
- Exact owning `architectureScope`: `applicationServiceId=com.huawei.celon.desiner`; `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Required matching records: Proposal, Context Pack, Gateway API, Projector service, deployment topology, outbox/checkpoint data model, operational rules, typed links, and Evidence.
- Persisted/read-back status: none in this repository-only task.
- **MCP synchronization blocked** as described in `Completion Blockers`; the active failure is the unreachable elected `localhost:5433` authority, not a missing MCP contract.

## Canonical PostgreSQL Cutover Amendment (2026-07-30)

The local NebulaGraph compatibility profile now starts only Nebula Meta, Storage, Graphd, a one-shot storage-host bootstrap, the Gateway, and the Projector. It joins the external `deploy_default` network and the Projector uses the canonical `deploy-postgres-1:5432/specforge_canonical` connection. It no longer starts or reads an isolated PostgreSQL service.

The bootstrap job registers the single local storage host before the Gateway initializes its graph space. The Projector claim query now permits at most the earliest incomplete graph version in one exact scope, so a batch cannot lease later events in that scope ahead of a failed predecessor.

Focused evidence: the Compose configuration assertions passed; Graph Projector tests (24) and typecheck passed; the rebuilt local Gateway and Projector both reported healthy; a scoped typed Gateway projection returned a successful receipt and Nebula reported populated node tags. A transient startup run before storage-host registration produced legacy-scope `GRAPH_GATEWAY_DELIVERY_FAILED` dead letters. Those historical recovery records are deliberately not reclassified as successful evidence.

MCP synchronization remains required before this amendment can be considered fully closed. Retry trigger: synchronize and read back this ADR, its matching Proposal, Context Pack, typed links, and updated evidence in the exact Designer scope.

## 规范 PostgreSQL 切换补充（2026-07-30）

本地 NebulaGraph 兼容配置现仅启动 Nebula Meta、Storage、Graphd、一次性存储主机自举、Gateway 和 Projector。它加入外部 `deploy_default` 网络，Projector 使用规范连接 `deploy-postgres-1:5432/specforge_canonical`，不再启动或读取隔离的 PostgreSQL 服务。

自举任务会在 Gateway 初始化图空间前注册单节点存储主机。Projector 的领取查询现在在一个精确 Scope 中只允许最早的未完成图版本，避免同一批次预先租赁失败前序事件之后的事件。

聚焦证据：Compose 配置断言、Graph Projector 的 24 项测试和类型检查均已通过；重建后的本地 Gateway 与 Projector 均健康；有 Scope 的 Gateway 投影返回成功回执，Nebula 已存在投影节点标签。存储主机注册前的瞬态启动曾产生 legacy Scope 的 `GRAPH_GATEWAY_DELIVERY_FAILED` 死信；这些历史恢复记录不会被重新描述为成功证据。

在精确 Designer Scope 中通过 MCP 同步并回读本 ADR、匹配 Proposal、Context Pack、有类型链接和更新后的 Evidence 前，本补充仍不能视为完全闭环。

## Protocol Compatibility Amendment (2026-07-28)

The Gateway dependency `github.com/vesoft-inc/nebula-go v1.1.0` used Thrift types that are incompatible with the deployed NebulaGraph 3.8.0 Graphd and failed during authentication with `unable to skip over unknown type id 116`.

The Gateway now uses the official `github.com/vesoft-inc/nebula-go/v3 v3.8.0` module. `Connect` uses `HostAddress`, `GetDefaultConf`, `NewConnectionPool`, and `GetSession`; query execution consumes `ResultSet`, checks `IsSucceed`, and reads v3 row values through `Row.GetValues` and `Value.GetSVal`. HTTP contracts, exact-scope validation, typed nGQL construction, and sanitized external errors are unchanged.

Evidence:

- A focused `ResultSet` compatibility test failed before the module upgrade because `github.com/vesoft-inc/nebula-go/v3` was not provided, then passed after the adapter migration.
- `$env:GOCACHE=<worktree>/.tmp/go-build-v3-all; go test ./...` from `apps/graph-gateway` passed all Gateway packages.
- The Gateway image built from the updated `go.mod` and `go.sum`; Docker resolved the v3 module dependencies during `go mod download`.
- Against the local NebulaGraph 3.8.0 Compose network, the v3 client authenticated and executed `SHOW HOSTS`, and the rebuilt Gateway remained `healthy` without the Thrift type error.
- The broader opt-in two-hop compatibility test still returned `NEBULA_QUERY_FAILED` during projection. Local diagnostics also found pre-existing cluster initialization state (`Host not enough!` before storaged registration). Therefore end-to-end projection completion remains blocked and is not claimed by this amendment.
- MCP synchronization remains blocked because no SpecForge MCP write tool is exposed in this execution context. Retry trigger: expose the scoped MCP write surface, persist this amendment under `adr-nebulagraph-production-projection`, and read it back in the exact Designer scope.

## 协议兼容性补充（2026-07-28）

Gateway 原先依赖 `github.com/vesoft-inc/nebula-go v1.1.0`。该版本的 Thrift 类型与当前 NebulaGraph 3.8.0 Graphd 不兼容，认证阶段会出现 `unable to skip over unknown type id 116`。

Gateway 现已升级到官方模块 `github.com/vesoft-inc/nebula-go/v3 v3.8.0`。连接流程改为 `HostAddress`、`GetDefaultConf`、`NewConnectionPool` 和 `GetSession`；查询结果改为使用 `ResultSet`、`IsSucceed`、`Row.GetValues` 与 `Value.GetSVal`。HTTP 契约、精确 Scope 校验、有类型 nGQL 构造和外部错误脱敏保持不变。

验证结果：

- 聚焦 `ResultSet` 兼容性测试在升级前因缺少 `/v3` 模块按预期失败，适配完成后通过。
- 在 `apps/graph-gateway` 运行 `$env:GOCACHE=<worktree>/.tmp/go-build-v3-all; go test ./...`，所有 Gateway 包通过。
- Gateway 镜像使用更新后的 `go.mod` 和 `go.sum` 构建成功；Docker 在 `go mod download` 阶段解析了 v3 依赖。
- 在本地 NebulaGraph 3.8.0 Compose 网络中，v3 客户端完成认证并成功执行 `SHOW HOSTS`；重建后的 Gateway 保持 `healthy`，未再出现 Thrift 类型错误。
- 更完整的两跳兼容性测试仍在投影阶段返回 `NEBULA_QUERY_FAILED`。本地诊断还发现既有集群初始化状态问题（登记 storaged 前返回 `Host not enough!`）。因此本补充不声明端到端生产投影已经完成。
- 当前执行环境未暴露 SpecForge MCP 写入工具，所以 MCP 同步仍处于阻塞状态。重试条件：提供精确 Scope 的 MCP 写入能力，将本补充写入 `adr-nebulagraph-production-projection`，并在 Designer Scope 下完成回读核验。

## 中文本地化

### 状态

**决策已接受；仓库实现和非在线验证已完成，但生产闭环仍受阻。**

- 稳定 ADR/MCP ID：`adr-nebulagraph-production-projection`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 仓库实现：Gateway 契约、NebulaGraph 官方 Go 客户端适配器、PostgreSQL Outbox Projector、Nebula Gateway GraphStore 适配器、显式运行时选择、本地 Compose 形态和跨适配器隔离测试均已提交。
- 运行验证：Compose 配置断言已通过，但没有真实 NebulaGraph/PostgreSQL 投影冒烟或官方客户端兼容性运行证据。
- 设计事实同步：**MCP synchronization blocked。** 本次 Task 7 明确仅允许仓库变更并禁止调用 MCP，因此没有写入或回读匹配的 ADR、Proposal、Context Pack、资产、类型关系或 Evidence。

### 背景

企业影响分析需要在关系图上执行多跳遍历，关系规模可能超出 PostgreSQL 递归查询的合理运行范围。图运行时必须能够独立扩展，同时不能成为编写权威，也不能削弱应用服务隔离。

PostgreSQL 已经负责已编写关系、关系事件、Outbox、投影检查点和审计证据。派生 NebulaGraph 视图必须容忍图侧暂时不可用、支持重放、保留精确的 `enterpriseId`、`applicationServiceId` 和 `scopePath`，并向影响分析暴露实际使用的图版本。

本地开发和兼容性测试需要可重复的单节点拓扑；企业部署则必须能够只通过配置，让同一套 Gateway、Projector 和 GraphStore 契约连接外部托管的 NebulaGraph 集群。

### 决策

PostgreSQL 保持权威。关系命令在一个 PostgreSQL 事务中提交当前状态、事件历史和 `RelationshipOutbox`。NebulaGraph 是可重建的派生投影，绝不位于 MCP 编写路径上。

私有 Go Graph Gateway 是唯一使用 NebulaGraph 官方客户端并持有 Nebula 凭据的组件。它只接受有类型的投影批次和遍历计划，拒绝原始 nGQL，校验精确 Scope，对错误脱敏，并提供检查点和健康契约。Web、MCP、Agent 和影响分析工作器都不得直接连接 NebulaGraph。

Graph Projector 使用租约领取 PostgreSQL Outbox，经 Gateway 执行幂等投影，并把投递状态记录在 PostgreSQL。至少一次投递依赖稳定幂等标识和图版本收敛。只有 Gateway 确认成功后，才能单调推进精确 Scope 的检查点；失败的低版本不能被后续高版本越过。瞬时失败采用有界退避重试，终态失败使用脱敏的 64 位十六进制诊断引用进入死信。不得持久化或返回原始异常、凭据、连接串或原始 nGQL。

当 `ProjectionCheckpoint < requiredGraphVersion` 时，影响分析保持 `WAITING_FOR_PROJECTION`，不得静默读取过期图数据。

每个节点、边、投影、遍历、Outbox 和检查点都携带完整精确 Scope。混合 Scope 投影必须拒绝，遍历结果必须防止兄弟应用服务数据泄漏。

`SPECFORGE_GRAPH_STORE=nebula` 选择 Gateway 后端；`postgres` 是唯一回退方式。生产环境必须显式选择，Gateway 故障绝不能触发隐式 PostgreSQL 读取；本地开发可以默认 PostgreSQL。

Gateway 健康响应包含 `status`、`graphSchemaReady` 和脱敏代码。Projector 的积压、最老待处理年龄、最近检查点、重试和死信仍是必需运维指标。当前仓库提供处理摘要和持久化字段，但尚未暴露计划中的 Projector 运行健康端点。

### 备选方案

1. **企业遍历全部使用 PostgreSQL。** 不作为高规模常规运行时；PostgreSQL 保留为显式兼容回退。
2. **同步写 PostgreSQL 与 NebulaGraph。** 拒绝，因为这会让编写事务依赖图侧可用性，并使部分失败恢复不安全。
3. **允许 Web、MCP 或 Agent 直接查询 NebulaGraph。** 拒绝，因为会分散凭据并绕过有类型、可校验 Scope 的 Gateway 边界。
4. **让 NebulaGraph 成为权威源。** 拒绝，因为已编写历史、审计证据、重放权威和事务一致性属于 PostgreSQL。
5. **Nebula 故障后静默回退 PostgreSQL。** 拒绝，因为调用方可能在不知道运行时已变化的情况下收到新鲜度或执行语义不同的结果。

### 后果与约束

- 图运行时不可用时，PostgreSQL 关系写入仍然可用。
- 可以从保留的 PostgreSQL 事件和 Outbox 重建 NebulaGraph。
- 至少一次投递要求幂等图写、租约领取、重试、死信和单调检查点。
- 精确 Scope 身份和兄弟 Scope 测试在投影与查询边界共同落实应用服务隔离。
- 本地与企业形态共享契约，但仍需在真实 NebulaGraph 3.8.0 服务上证明兼容性。
- 运维人员必须监控投影延迟，并在图故障时显式选择 PostgreSQL 回退。
- 本地单节点 Compose 只是兼容性形态，不是多节点生产集群。
- 多节点生产容量、亿级边认证、Kubernetes 部署和公司密钥系统集成继续延期。
- 全部完成仍要求真实 Docker 兼容证据、端到端 Outbox 投影、Projector 运维健康能力，以及 MCP 同步和回读成功。

### 仓库证据

已检查六个实现提交：`3991632`、`836762a`、`e686ebb`、`cf3ecb7`、`8be48c8` 和 `e51de0f`。2026-07-27 的统一非在线检查结果如下：

- 本地 Vitest 运行通过 5 个文件、33 个测试，覆盖 Gateway GraphStore、跨适配器一致性、Projector、运行时选择和影响分析工作器。
- `go test ./...` 通过 Gateway HTTP 和 Nebula 适配器测试；由于未设置 `SPECFORGE_NEBULA_COMPATIBILITY=1`，真实 Nebula 兼容性测试仍然跳过。
- GraphStore、Graph Projector 和影响分析工作器 TypeScript 类型检查通过。
- `deploy/graph/verify-projection.ps1 -ConfigurationOnly` 通过 Compose 拓扑断言；Docker 对用户级配置文件报告了不影响断言结果的访问警告。
- 隔离工作区中的 `pnpm --filter @specforge/graph-store test` 因缺失依赖链接而尝试受限注册表访问，未完成；成功证据来自上述直接使用本地主工作区 Vitest 运行时的测试。

### 完成阻塞

- **真实 Docker 兼容性受阻：** 当前没有正在运行的 NebulaGraph 3.8.0、官方客户端兼容测试、从 PostgreSQL Outbox 到 Nebula 的端到端投影、检查点推进、多跳遍历、Projector 重启或逻辑边去重证据。负责人：SpecForge Runtime。重试触发条件：准备可构建的 Gateway/Projector 镜像和可访问 PostgreSQL，启动本地图形态，执行并保留 live 验证结果。
- **Projector 运维健康能力未完成：** 当前仓库尚未暴露积压、最老年龄、检查点、重试和死信健康端点。负责人：SpecForge Runtime。重试触发条件：在 live Compose 门禁前交付可执行 Projector 运行时及健康契约。
- **MCP synchronization blocked：** 本任务被明确限制为仅仓库变更并禁止调用 MCP。没有 MCP 写入尝试、收据、Proposal、Context Pack、设计资产、类型关系、Evidence 或回读结果。负责人：SpecForge Architecture。重试触发条件：获得有 Scope 的 MCP 写入授权后，在精确 Designer Scope 持久化本 ADR 和匹配记录，运行 `pnpm design-facts:sync`、`pnpm design-facts:check` 和精确 Scope 联邦检查，再回读 ID、Scope、英文规范字段、中文覆盖、方向关系和证据。

### MCP 记录

- 预期 MCP ADR ID：`adr-nebulagraph-production-projection`
- 精确所属 `architectureScope`：`applicationServiceId=com.huawei.celon.desiner`；`scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 必需匹配记录：Proposal、Context Pack、Gateway API、Projector 服务、部署拓扑、Outbox/检查点数据模型、运维规则、类型关系和 Evidence。
- 本次仅仓库任务没有任何持久化或回读结果。
- 同步状态为 **MCP synchronization blocked**，不声明同步成功。
