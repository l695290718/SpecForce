# Transactional Outbox and Scope-Safe Graph Projection

## Status

**Accepted; implemented and locally verified for the PostgreSQL projection contract.** The production NebulaGraph projector, operational retry loop, and graph health telemetry are **deferred**. MCP synchronization is **blocked** in this session because no SpecForge ADR/design-record write tool is available.

- Stable ADR/MCP ID: `adr-transactional-outbox-graph-projection`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

Relationship mutations need a durable source of truth, an auditable event history, and a replayable path to derived graph views. A graph database must not become an independent authoring source, and a projection for one application service must never read or write a sibling service or a near-prefix scope. The impact-analysis worker also needs a persisted projection checkpoint so analysis results can identify the graph version they used.

The repository already models `RelationshipEvent`, `RelationshipOutbox`, and `ProjectionCheckpoint` with composite enterprise/service/scope identities. The graph-store contract validates exact-scope projection batches, idempotent upserts, deterministic traversal, and checkpoint reads. The checked-in TODO states that the NebulaGraph 3.8.0 projection path and durable projector operations remain future work.

## Decision

PostgreSQL is authoritative for relationship commands, current relationships, relationship events, outbox rows, projection checkpoints, and audit evidence. A successful relationship mutation records its event and outbox work in the same transaction. Projectors consume the outbox idempotently, apply a graph version to the derived projection, and advance an exact-scope checkpoint only after the projection succeeds. Retries must be safe for the same event and must not cross `applicationServiceId` or `scopePath` boundaries.

The normal production traversal runtime is NebulaGraph behind its gateway; PostgreSQL remains the compatibility and verification path. Graph nodes and edges carry the full scope identity, and a projection batch is rejected when any node or edge endpoint is outside the batch scope.

## Alternatives

1. **Write PostgreSQL and NebulaGraph synchronously from the command path.** Rejected because it couples command availability to graph availability and makes partial failure recovery difficult.
2. **Treat NebulaGraph as the primary relationship store.** Rejected because authored relationship history, idempotency, audit evidence, and replay authority would be lost from the transactional store.
3. **Project by service ID only or by scope-path prefix.** Rejected because sibling services and near-prefix paths could contaminate derived results.
4. **Use an in-memory queue without durable outbox rows.** Rejected because process loss would discard work and make checkpoint advancement unverifiable.

## Consequences

Positive consequences:

- Relationship writes remain transactional and auditable in PostgreSQL.
- Projection retries and replay can converge on the same graph version without duplicating logical nodes or edges.
- Exact scope keys make cross-service contamination testable and prevent accidental global graph views.
- Impact analysis can wait for and record a persisted projection checkpoint.

Tradeoffs:

- Graph views are eventually consistent and require checkpoint-aware consumers.
- Outbox retention, retry scheduling, dead-letter handling, and telemetry add operational work.
- The current repository proves the PostgreSQL-compatible contract locally, but does not yet prove a live NebulaGraph deployment.

## Constraints

- Scope is limited to `com.huawei.celon.desiner` and its exact canonical scope path above.
- PostgreSQL is the authority for authored relationships and relationship events; graph stores are derived projections only.
- Projection writes must preserve `enterpriseId`, `applicationServiceId`, and `scopePath` on every node, edge, event, outbox row, and checkpoint.
- Projection application must be idempotent and monotonic by graph version; a checkpoint cannot advance before successful application.
- The existing logical service spelling `com.huawei.celon.desiner` is stable and must not be corrected in this ADR.
- NebulaGraph production deployment, projector lease/retry orchestration, and health telemetry are deferred until the tracked TODO is implemented and verified.

## Evidence

- **Implemented:** `prisma/schema.prisma` defines `RelationshipEvent`, `RelationshipOutbox`, and `ProjectionCheckpoint`, including exact composite scope identities and graph-version fields.
- **Implemented:** `packages/graph-store/src/postgres.ts` performs exact-scope checkpoint reads and idempotent PostgreSQL projection upserts; `packages/graph-store/src/traversal.ts` supplies scope-safe graph identity helpers.
- **Locally verified:** `packages/graph-store/src/graph-store.contract.test.ts` covers exact-scope traversal, rejection of out-of-scope projection nodes/endpoints, deterministic bounded traversal, and partial-result frontiers.
- **Locally verified when enabled:** `packages/graph-store/src/postgres.integration.test.ts` creates a disposable schema and exercises the PostgreSQL graph-store contract when `SPECFORGE_PG_INTEGRATION=1` and `DATABASE_URL` are present.
- **Deferred:** `docs/TODO.md` records the NebulaGraph 3.8.0 projection path, idempotent outbox projector, checkpointing, retry handling, and graph health telemetry as future work.

## MCP Record

- Matching MCP ADR ID: `adr-transactional-outbox-graph-projection`
- Exact owning `architectureScope`: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related repository records: `docs/superpowers/specs/2026-07-17-design-fact-governance-design.md`, `prisma/schema.prisma`, `packages/graph-store/src/postgres.ts`, `packages/graph-store/src/graph-store.contract.test.ts`, and `docs/TODO.md`.
- Matching Proposal, Context Pack, typed MCP links, and persisted evidence references: not verified in this session.
- **MCP synchronization blocked:** the available tool surface has no SpecForge ADR/design-record write endpoint. Retry when the MCP persistence tools are available; then write and verify the same stable ID, exact scope, English canonical fields, complete Chinese overlay, typed links, and evidence references before marking this ADR complete.

## 中文本地化 / Chinese Localization

### 状态

**已接受；PostgreSQL 投影契约已实现并完成本地验证。**生产 NebulaGraph 投影器、运行时重试循环和图健康度遥测仍为**延期工作**。本次会话中的 MCP 同步状态为**受阻**，原因是没有可用的 SpecForge ADR/设计记录写入工具。

- 稳定 ADR/MCP ID：`adr-transactional-outbox-graph-projection`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

### 背景

关系变更需要持久化事实来源、可审计的事件历史以及可重放的派生图视图路径。图数据库不能成为独立的编写事实来源；单个应用服务的投影也绝不能读取或写入兄弟服务或近似前缀 Scope。影响分析工作器还需要持久化投影检查点，以标识分析结果所使用的图版本。

仓库已经用 `RelationshipEvent`、`RelationshipOutbox` 和 `ProjectionCheckpoint` 建模这些能力，并使用企业、服务和 Scope 的复合身份。graph-store 契约验证精确 Scope 投影批次、幂等 upsert、确定性遍历和检查点读取。已提交的 TODO 明确将 NebulaGraph 3.8.0 投影路径及持久化投影器操作列为后续工作。

### 决策

PostgreSQL 是关系命令、当前关系、关系事件、outbox 行、投影检查点和审计证据的权威来源。成功的关系变更必须在同一事务中写入事件和 outbox 工作项。投影器以幂等方式消费 outbox，在派生投影上应用图版本，并且仅在投影成功后推进精确 Scope 的检查点。相同事件的重试必须安全，且不得跨越 `applicationServiceId` 或 `scopePath` 边界。

生产环境的常规遍历运行时是由网关封装的 NebulaGraph；PostgreSQL 保留为兼容和验证路径。图节点和边必须携带完整 Scope 身份；如果节点或边端点超出批次 Scope，投影批次必须被拒绝。

### 备选方案

1. **在命令路径中同步写 PostgreSQL 和 NebulaGraph。** 拒绝，因为这会让命令可用性依赖图数据库，并使部分失败恢复困难。
2. **把 NebulaGraph 作为主要关系存储。** 拒绝，因为事务存储将失去关系历史、幂等性、审计证据和重放权威。
3. **只按服务 ID 或 Scope 路径前缀投影。** 拒绝，因为会产生兄弟服务和近似前缀路径的数据污染。
4. **使用没有持久化 outbox 行的内存队列。** 拒绝，因为进程丢失会丢弃工作，使检查点推进无法验证。

### 后果

积极后果：关系写入在 PostgreSQL 中保持事务性和可审计性；投影重试与重放可以在不重复逻辑节点或边的情况下收敛到同一图版本；精确 Scope 键使跨服务污染可测试并防止意外的全局图视图；影响分析可以等待并记录持久化投影检查点。

权衡：图视图最终一致，消费者必须理解检查点；outbox 保留、重试调度、死信处理和遥测增加运维工作；当前仓库在本地证明了 PostgreSQL 兼容契约，但尚未证明在线 NebulaGraph 部署。

### 约束

- 范围仅限 `com.huawei.celon.desiner` 及上述精确规范 Scope 路径。
- PostgreSQL 是已编写关系和关系事件的权威来源；图存储只能是派生投影。
- 每个节点、边、事件、outbox 行和检查点都必须保留 `enterpriseId`、`applicationServiceId` 和 `scopePath`。
- 投影应用必须幂等并按图版本单调推进；成功应用前不得推进检查点。
- 既有逻辑服务拼写 `com.huawei.celon.desiner` 是稳定标识，本 ADR 不得更正它。
- NebulaGraph 生产部署、投影器租约/重试编排和健康度遥测在实现并验证 TODO 前延期。

### 证据

- **已实现：** `prisma/schema.prisma` 定义了 `RelationshipEvent`、`RelationshipOutbox` 和 `ProjectionCheckpoint`，包含精确复合 Scope 身份与图版本字段。
- **已实现：** `packages/graph-store/src/postgres.ts` 执行精确 Scope 检查点读取和幂等 PostgreSQL 投影 upsert；`packages/graph-store/src/traversal.ts` 提供 Scope 安全的图身份辅助函数。
- **已本地验证：** `packages/graph-store/src/graph-store.contract.test.ts` 覆盖精确 Scope 遍历、拒绝越界投影节点/端点、确定性有界遍历和部分结果前沿。
- **启用时已本地验证：** `packages/graph-store/src/postgres.integration.test.ts` 在 `SPECFORGE_PG_INTEGRATION=1` 且存在 `DATABASE_URL` 时创建一次性 Schema 并运行 PostgreSQL graph-store 契约。
- **已延期：** `docs/TODO.md` 将 NebulaGraph 3.8.0 投影路径、幂等 outbox 投影器、检查点、重试处理和图健康度遥测列为后续工作。

### MCP 记录

- 匹配的 MCP ADR ID：`adr-transactional-outbox-graph-projection`
- 精确所属 `architectureScope`：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 相关仓库记录：`docs/superpowers/specs/2026-07-17-design-fact-governance-design.md`、`prisma/schema.prisma`、`packages/graph-store/src/postgres.ts`、`packages/graph-store/src/graph-store.contract.test.ts` 和 `docs/TODO.md`。
- 匹配的 Proposal、Context Pack、有类型的 MCP 链接以及持久化证据引用：本次会话未验证。
- **MCP 同步受阻：** 当前可用工具没有 SpecForge ADR/设计记录写入端点。待 MCP 持久化工具可用后重试；在 ADR 完成前，必须写入并核验相同稳定 ID、精确 Scope、英文规范字段、完整中文覆盖、有类型链接和证据引用。
