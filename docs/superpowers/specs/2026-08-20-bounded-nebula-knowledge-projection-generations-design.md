# Bounded Nebula Knowledge Projection Generations Design

## Status

- Approved by the product owner on 2026-08-20.
- This document defines the target architecture and three delivery phases; implementation has not started.
- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design Change Session: `design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76`.
- English is canonical. Chinese is the complete human-facing localization.

## Problem

The current NebulaGraph runtime projects current design-asset identities and typed relationships from PostgreSQL. It can accelerate relationship traversal, but it is not semantically equivalent to the PostgreSQL-first 3A model. It does not represent Baseline-bound Knowledge Assertions, Profile-pinned projection generations, versioned relationship snapshots, or an atomic active-generation pointer.

Keeping an unlimited number of immutable graph generations online would restore history but would also multiply storage, write, index, cache, cleanup, and operational costs. At billion-edge scale, that turns the online traversal runtime into a historical warehouse and makes every query depend on a correctly applied generation filter.

The system needs a bounded model that supports safe publication and rollback without weakening exact-Scope isolation, PostgreSQL authority, or the distinction between authored facts and derived projections.

## Goals

- Project Baseline-bound Knowledge Assertions, design assets, 3A architecture units, and versioned typed relationships into NebulaGraph.
- Keep graph adjacency physically isolated by exact Scope and immutable projection Manifest.
- Support non-disruptive build, validation, publication, rollback, retirement, and cleanup.
- Retain only bounded online generations while PostgreSQL preserves complete authoritative history.
- Make every graph result traceable to Scope, Baseline, Profile, Manifest, generation, and source digest.
- Provide deterministic PostgreSQL/Nebula reconciliation before activation.
- Define separate production topology and billion-scale certification phases without claiming them before evidence exists.

## Non-Goals

- Making NebulaGraph an authored-fact system of record.
- Allowing arbitrary or cross-Scope graph writes.
- Keeping unlimited historical generations online.
- Providing unrestricted historical or cross-generation graph queries to ordinary clients.
- Replacing PostgreSQL fallback or authoritative historical reads.
- Claiming production multi-node readiness or billion-scale support from local single-node verification.
- Automatically promoting derived asset-to-3A trace mappings into canonical membership facts.

## Current Boundary

PostgreSQL remains authoritative for authored design assets, Knowledge Assertions, Evidence, immutable Baselines, Profile identities, relationship events, and publication control. NebulaGraph remains a rebuildable projection. Existing Relationship Outbox delivery, leased Projector processing, retries, dead letters, monotonic checkpoints, exact-Scope Gateway checks, and PostgreSQL fallback are retained and extended rather than replaced.

The current local NebulaGraph 3.8 single-node profile remains a compatibility and developer runtime. Multi-node operations and scale certification are separate delivery phases.

## Considered Approaches

### 1. Unlimited generations in one graph Space

Every Manifest remains queryable indefinitely in a shared Space. This provides immediate history but is rejected because unchanged vertices and edges are repeatedly duplicated, online caches are diluted, cleanup becomes unbounded, and a missing generation predicate can create false paths.

### 2. One graph Space per Scope and generation

Each generation receives physical Space isolation. This simplifies deletion and rollback, but is rejected as the default because enterprise application-service counts and release frequency would create excessive Space metadata, memory, provisioning, and operational overhead.

### 3. ACTIVE-only graph with PostgreSQL history

NebulaGraph stores only the current generation. This minimizes cost but cannot provide rapid rollback and forces a rebuild after a bad publication. It remains an allowed capacity-pressure degradation mode.

### 4. Shared Space with bounded generation slots

Each Scope has at most one BUILDING, one ACTIVE, and one PREVIOUS generation. Generation identity is encoded into every graph identity, while PostgreSQL atomically controls slot pointers. This is selected because it balances isolation, rollback, and enterprise Scope cardinality.

## Authoritative Control Model

`NebulaProjectionManifest` is an immutable PostgreSQL record containing:

- exact `applicationServiceId` and `scopePath`;
- `baselineId`, `profileId`, `profileVersion`, and graph schema version;
- immutable `manifestId` and monotonically allocated `generationNumber` within the Scope;
- source catalog, Knowledge Assertion, relationship, and evidence watermarks;
- expected vertex and edge counts by type and deterministic bucket digests;
- build attempt, content digest, creation identity, and timestamps;
- certification and compatibility metadata.

`NebulaProjectionHead` is the single mutable control row for one exact Scope. It contains `buildingManifestId`, `activeManifestId`, `previousManifestId`, an optimistic-lock version, retention timestamps, and the last publication or rollback event.

Manifest content is immutable. Slot membership is mutable only through a short PostgreSQL transaction. A failed Manifest is never repaired in place; a retry creates a new Manifest and generation.

## Generation Lifecycle

```text
create Manifest
      |
      v
  BUILDING ---- failure ----> FAILED
      |
      v
  VALIDATING -- failure ----> FAILED
      |
      v
PostgreSQL atomic pointer switch
      |
      v
    ACTIVE
old ACTIVE -> PREVIOUS
old PREVIOUS -> RETIRED -> PURGING -> PURGED
```

Only one build may run per Scope. Build, publish, rollback, and cleanup operations acquire a Scope-specific PostgreSQL lock and verify the `ProjectionHead` version. Publication changes only the control pointers; it does not depend on a NebulaGraph transaction.

Rollback atomically swaps ACTIVE and PREVIOUS after verifying that the previous Manifest is still online and compatible. A failed BUILDING or VALIDATING generation never changes the current ACTIVE pointer.

## Graph Identity And Schema

Each online generation contains these semantic vertex families:

- `DesignAsset`: API, data model, rule, event, state machine, ADR, Proposal, Context Pack, and other governed assets.
- `ArchitectureUnit`: BIZ, SYS, and TECH architecture units from the pinned Baseline.
- `KnowledgeAssertion`: an evidence-backed assertion bound to the Baseline and Profile.

Asset-to-3A mapping is represented through the assertion, not as an unexplained generic edge:

```text
DesignAsset
  <- ASSERTION_SUBJECT - KnowledgeAssertion
  - CLASSIFIED_AS / REALIZED_BY / DEPLOYED_ON ->
ArchitectureUnit
```

Typed asset-to-asset relationships remain separate graph edges for traceability and impact analysis. Architecture-unit-to-unit realization relationships remain separate from asset-to-3A mapping.

The internal VID is a fixed-length digest of `scopePath + manifestId + entityType + logicalId`. Full logical identity is preserved as properties. Because `manifestId` participates in the VID, adjacency cannot mix generations even if a query predicate is omitted.

Each relationship uses a PostgreSQL-assigned stable `BIGINT projectionOrdinal` as its Nebula rank. A truncated random hash is forbidden because collision probability becomes material at billion-edge scale. Edge properties include logical relationship ID, relationship version, Baseline ID, Manifest ID, evidence digest, source watermark, and semantic type.

The Projector rejects any edge whose endpoints differ by application-service Scope or Manifest. Cross-Scope and cross-generation edges are invalid projection data.

## Outbox And Checkpoints

The existing PostgreSQL Relationship Outbox remains the durable delivery source. Generation-aware projection adds Manifest-bound build work and checkpoints. Checkpoint identity is:

```text
applicationServiceId + scopePath + manifestId + logicalPartition
```

Every batch is idempotent and reports attempted, inserted, updated, skipped, retried, and rejected counts. A Projector restart resumes from the same Manifest and partition checkpoint. A checkpoint from another Manifest or Scope is never reusable.

Publication is blocked while any required partition is incomplete, any dead letter is unresolved, or the observed source watermark differs from the Manifest's pinned watermark.

## Query Contract

Ordinary graph clients provide an authorized principal, exact `architectureScope`, and bounded query. They do not choose a generation. Graph Gateway resolves the current `activeManifestId` from PostgreSQL, pins it for the request, and generates Manifest-qualified VIDs and traversals.

Only internal verification and administrator diagnostics may explicitly request a Manifest. Such access requires a separate permission and still cannot cross Scope.

Every response includes:

- exact Scope;
- Baseline, Profile, Manifest, and generation identity;
- graph schema and source digest;
- query budget, truncation, continuation, and fallback state;
- whether the result came from NebulaGraph or PostgreSQL fallback.

Graph queries have finite depth, vertex, edge, path, timeout, and payload budgets. Continuations are signed and bound to principal, Scope, Manifest, and query fingerprint. A continuation becomes invalid after the pinned generation is retired.

## Publication Reconciliation

VALIDATING performs three gates before activation:

1. Control totals compare vertices and edges by semantic type.
2. Deterministic bucket digests compare complete PostgreSQL and Nebula projection membership without relying only on samples.
3. Semantic probes execute representative asset-to-3A, architecture realization, upstream, downstream, and bounded impact queries against both runtimes.

Any mismatch fails closed and leaves ACTIVE unchanged. Reconciliation records the exact Manifest, source watermarks, commands, results, mismatch buckets, owner, and retry trigger.

## Retention And Cleanup

ACTIVE remains online until a validated replacement is published. PREVIOUS is retained for 72 hours by default. Capacity watermarks have higher priority than elapsed retention: under pressure, PREVIOUS may be archived early after the minimum rollback window and operator approval.

Retirement is logical before physical deletion. The Gateway stops issuing new leases for a RETIRED generation, waits beyond the maximum graph query duration plus a safety margin, and then permits cleanup.

PostgreSQL or production object storage retains chunked vertex and edge identity manifests. The cleaner uses these manifests for rate-limited deletion instead of a full graph property scan. Cleanup pauses when latency, compaction debt, replica health, or disk watermarks exceed policy. Compaction runs during an approved maintenance window.

When PREVIOUS is ARCHIVED rather than online, PostgreSQL retains complete authoritative history and object storage may retain an immutable bulk projection snapshot. Recovery requires rebuilding or importing that generation; it is no longer an instant pointer swap.

## Failure Handling

- Projector crash: resume from the exact Manifest partition checkpoint.
- Gateway crash: resolve the ACTIVE pointer again; no client-selected generation is trusted.
- Build mismatch: mark the Manifest FAILED and keep ACTIVE unchanged.
- Publication race: reject on Scope lock or optimistic version conflict.
- Cross-Scope or cross-generation record: reject, audit, and block publication.
- NebulaGraph outage: keep PostgreSQL writes available and use explicit PostgreSQL fallback for supported reads.
- PostgreSQL control-plane outage: fail graph generation publication and rollback closed; do not infer ACTIVE from Nebula data.
- Cleanup interruption: resume idempotently from chunk state; never delete ACTIVE.
- MCP synchronization failure: record `MCP synchronization blocked`, owner, reason, and retry trigger; do not claim completion.

## Delivery Phases

### Phase 1: Semantic Projection Core

- Add Manifest, ProjectionHead, generation checkpoints, and purge work records.
- Project Knowledge Assertion, Design Asset, Architecture Unit, and versioned relationship identities.
- Implement bounded slots, exact-generation Gateway reads, reconciliation, publication, rollback, and PostgreSQL fallback.
- Extend local live verification for failure, restart, cross-Scope, cross-generation, and parity cases.

### Phase 2: Production Operations

- Support external multi-node NebulaGraph connection strings and independent credentials.
- Provide Kubernetes reference topology, secret injection, backup and restore, object storage, dashboards, alerts, and runbooks.
- Validate storage, graph, and metadata node failure; Projector and Gateway restart; rolling deployment; and recovery from retained PostgreSQL state.

### Phase 3: Scale Certification

- Execute progressive `10M`, `100M`, and `1B` relationship tests.
- Model power-law degree distribution, supernodes, type diversity, Scope skew, active build traffic, retention cleanup, and concurrent bounded traversals.
- Record ingestion throughput, projection lag, P50/P95/P99 query latency, disk and replica amplification, compaction debt, cleanup duration, resource saturation, and recovery time.
- Publish an immutable Certification Report for each tier with exact environment, versions, topology, configuration, dataset generator, commands, and results.
- Do not claim a certified tier until that tier succeeds with correctness and operational evidence.

## Compatibility And Migration

The first implementation is additive. Existing current-relationship projection and Gateway contracts continue while the generation-aware schema is built in parallel. A feature flag routes verification traffic to the new projection. Publication to production requires parity and rollback rehearsal. Legacy projection removal is a later, separately approved cleanup after all supported callers use Manifest-bound responses.

PostgreSQL fallback remains compatible throughout migration. Existing Baseline, Knowledge Assertion, relationship, Proposal, ADR, and Context Pack identities are not rewritten.

## Verification

- Schema and persistence tests enforce exact Scope, one build per Scope, immutable Manifests, valid slot references, and monotonic generation numbers.
- Projector tests cover idempotent replay, partition resume, stable VID and rank identity, endpoint validation, and dead-letter blocking.
- Gateway tests prove server-resolved ACTIVE identity, signed continuation binding, finite budgets, and no cross-Scope or cross-generation result.
- Lifecycle tests cover successful publication, failed validation, concurrent publication, rollback, retirement, cleanup interruption, and ACTIVE deletion prevention.
- Parity tests compare counts, bucket digests, and semantic probes against PostgreSQL.
- Operations tests cover external cluster configuration, secret handling, backup and restore, node failure, restart, and degraded PostgreSQL fallback.
- Scale reports must preserve correctness evidence alongside latency and throughput; performance alone cannot certify a tier.

## Acceptance Criteria

- PostgreSQL remains authoritative and MCP remains the only authored-design-fact write boundary.
- Every graph vertex and edge is bound to one exact Scope and immutable Manifest.
- A Scope has no more than one BUILDING, one ACTIVE, and one PREVIOUS online generation.
- Failed builds and validation never alter ACTIVE.
- ACTIVE publication and rollback are controlled by atomic PostgreSQL pointer updates.
- Asset-to-3A results are represented through Baseline-bound Knowledge Assertions and remain distinguishable from architecture realization and asset relationships.
- PostgreSQL/Nebula control totals, deterministic digests, and semantic probes agree before activation.
- PREVIOUS retention is bounded and cleanup is rate-limited, resumable, and unable to delete ACTIVE.
- Production and scale claims remain deferred until their own evidence and MCP reconciliation are complete.

## 中文本地化覆盖

### 状态与问题

本设计于 2026-08-20 由产品负责人确认，所属应用服务为 `com.huawei.celon.desiner`，设计变更会话为 `design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76`。本文只确定目标架构和三个交付阶段，代码尚未开始实现。

当前 NebulaGraph 只投影设计资产身份和当前类型关系，不能完整表达绑定 Baseline 的 Knowledge Assertion、固定 Profile 的投影代次、版本化关系快照和原子活动代次指针。无限保留不可变图代次会线性放大存储、写入、索引、缓存和清理成本，并让在线遍历运行时承担历史仓库职责。因此必须采用有界在线代次。

### 目标与边界

目标是在不削弱精确 Scope 隔离、PostgreSQL 权威和编写事实与派生投影边界的前提下，把 Knowledge Assertion、设计资产、3A 架构单元和版本化关系投影到 NebulaGraph，并支持安全构建、校验、发布、回滚、退役和清理。

NebulaGraph 不能成为设计事实权威库，不能接受跨 Scope 写入，不能无限保留历史代次，也不能仅凭本地单节点验证宣称生产多节点或十亿级能力。PostgreSQL 继续保存资产、断言、证据、Baseline、Profile、关系事件和完整历史，NebulaGraph 始终是可重建派生投影。

### 方案选择

拒绝在共享 Space 中无限保留代次，因为数据和运维成本无界；拒绝默认按 Scope 和代次创建独立 Space，因为企业应用服务数量和发布频率会导致 Space 数量膨胀；只保留 ACTIVE 的方案成本最低，但无法快速回滚，仅作为容量压力下的降级模式。

正式采用共享 Space 下的有界三槽模型：每个精确 Scope 同时最多存在一个 BUILDING、一个 ACTIVE 和一个 PREVIOUS。每个图身份都包含 Manifest 身份，PostgreSQL 原子管理槽位指针。

### 权威控制与状态机

`NebulaProjectionManifest` 是不可变 PostgreSQL 记录，保存精确 Scope、Baseline、Profile、图 Schema、代次号、源水位、预期数量、确定性桶摘要和内容摘要。`NebulaProjectionHead` 是每个 Scope 唯一的可变控制行，保存 BUILDING、ACTIVE、PREVIOUS 指针、乐观锁版本和保留时间。

构建、发布、回滚和清理必须取得 Scope 级数据库锁并校验版本。BUILDING 完成后进入 VALIDATING，只有数量、桶摘要和语义探针全部一致，才能通过短 PostgreSQL 事务切换 ACTIVE。旧 ACTIVE 变成 PREVIOUS，旧 PREVIOUS 进入 RETIRED 和清理流程。失败代次不能修改 ACTIVE，修复必须创建新 Manifest。

### 图语义与身份

每代图包含 `DesignAsset`、`ArchitectureUnit` 和 `KnowledgeAssertion` 三类核心顶点。设计资产到 3A 的映射必须通过 Knowledge Assertion 表达，即资产是断言主体，BIZ、SYS 或 TECH 单元是断言目标；它不能退化成无解释的通用关系边。资产间类型关系和架构单元间实现关系保持独立。

内部 VID 使用 `scopePath + manifestId + entityType + logicalId` 的固定长度摘要，完整逻辑身份保存在属性中。Manifest 进入 VID 后，不同代次的邻接关系在身份层隔离。关系 rank 使用 PostgreSQL 分配的稳定 `BIGINT projectionOrdinal`，禁止使用截断随机哈希。Projector 必须拒绝任何跨 Scope 或跨 Manifest 的关系。

### Outbox、查询与对账

现有 PostgreSQL Relationship Outbox 保持持久投递来源。代次检查点使用 `applicationServiceId + scopePath + manifestId + logicalPartition`，Projector 重启只能恢复同一 Scope、Manifest 和分区的进度。分区未完成、存在未解决死信或源水位变化时禁止发布。

普通客户端只提交授权身份、精确 Scope 和有限查询，不能选择代次。Graph Gateway 从 PostgreSQL 解析 ACTIVE Manifest 并固定到本次请求。只有内部校验和管理员诊断可以显式指定 Manifest，而且仍需独立权限和同 Scope 约束。所有结果返回 Scope、Baseline、Profile、Manifest、代次、源摘要、查询预算、截断信息及 Nebula 或 PostgreSQL Fallback 来源。

发布前依次核对按类型数量、完整确定性桶摘要和代表性语义查询。任一不一致都失败关闭，并记录 Manifest、源水位、差异桶、负责人和重试条件。

### 保留、清理与故障

PREVIOUS 默认保留 72 小时，但容量水位优先级更高。超过最小回滚窗口并经过运维批准后，可以提前转为 ARCHIVED。Gateway 停止为 RETIRED 代次发放新查询租约，等待最大查询时间和安全宽限期后才允许物理清理。

PostgreSQL 或生产对象存储保存分块顶点和关系清单，清理器按清单限速删除，不能依赖全图属性扫描。清理在延迟、压缩债务、副本健康或磁盘水位异常时暂停，并且永远不能删除 ACTIVE。Nebula 不可用时，PostgreSQL 写入保持可用，受支持的读取显式回退到 PostgreSQL；PostgreSQL 控制面不可用时，发布和回滚必须失败关闭。

### 三阶段交付与认证

第一阶段实现语义投影核心，包括 Manifest、ProjectionHead、检查点、Knowledge Assertion 图语义、三槽状态机、Gateway 代次固定、对账、发布、回滚和 Fallback。

第二阶段实现外部多节点连接、Kubernetes 参考拓扑、密钥注入、备份恢复、对象存储、指标、告警和故障演练。第三阶段按 `10M`、`100M`、`1B` 关系逐级认证，覆盖幂律分布、超大顶点、多 Scope 倾斜、并发构建、在线遍历和清理压力，并记录吞吐、投影延迟、P50/P95/P99、磁盘与副本放大、压缩债务、清理时间和恢复时间。

每一级必须生成带环境、版本、拓扑、配置、数据生成器、命令和结果的不可变认证报告。未真实通过的级别不能对外宣称已认证。

### 兼容与验收

第一阶段采用增量迁移。现有关系投影和 Gateway 在新代次 Schema 并行构建期间继续工作，验证流量通过特性开关进入新路径。只有完成一致性校验和回滚演练后才能切换生产调用方。旧投影的删除属于后续独立清理，不得在首个增量中破坏现有 Baseline、Knowledge Assertion、关系、Proposal、ADR 和 Context Pack 身份。

验收要求每个图顶点和关系都绑定一个精确 Scope 和不可变 Manifest；每个 Scope 最多存在一个 BUILDING、ACTIVE 和 PREVIOUS；失败构建不改变 ACTIVE；发布与回滚由 PostgreSQL 原子指针控制；设计资产到 3A 通过 Knowledge Assertion 表达；数量、桶摘要和语义探针在发布前一致；清理有限、可恢复且不能删除 ACTIVE；生产与规模声明在证据和 MCP 对账完成前保持延期。
