# Nebula 3A Semantic Projection Core Design

## Status

- Approved by product owner on 2026-08-20.
- English is canonical. The Chinese section is the complete human-facing localization.
- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design Change Session: `design-change-session:ce663776-075b-426f-a631-89c7b6b72dba`.
- Design-context digest: `fc24269b053ff5d4b4a9c587c0ba1655c8e64c99f71d2c3c807b66f711c97e8e`.
- Extends ADR-0019 and ADR-0036. It does not replace PostgreSQL authority or the bounded-generation lifecycle.
- Implementation plan: `docs/superpowers/plans/2026-08-20-nebula-3a-semantic-projection-core.md`.

## Problem

The bounded Nebula generation increment now provides PostgreSQL control records, BUILDING/ACTIVE/PREVIOUS lifecycle operations, Manifest-qualified graph identities, generation-aware delivery metadata, and deterministic parity primitives. It does not yet project the complete PostgreSQL-first 3A semantics into NebulaGraph.

The current graph path can store generic asset nodes and typed asset relationships, but it cannot answer why an asset belongs to a BIZ, SYS, or TECH unit. A direct generic asset-to-unit edge would hide the governing Knowledge Assertion, collapse direct and traced mappings, and mix asset relationships with architecture realization. It would also make NebulaGraph appear to author semantics that actually belong to PostgreSQL.

The next increment must project the existing immutable PostgreSQL read models into a generation-qualified semantic graph while preserving exact Scope, Baseline, Profile, evidence, mapping mode, and relationship-family distinctions.

## Goals

- Project `DesignAsset`, `KnowledgeAssertion`, and `ArchitectureUnit` vertices from pinned PostgreSQL read models.
- Represent direct asset-to-3A semantics as `DesignAsset <- ASSERTION_SUBJECT - KnowledgeAssertion -> ArchitectureUnit`.
- Keep direct membership, traced coverage, exemptions, blocked mappings, asset relationships, assertion relationships, and architecture-unit mappings distinguishable.
- Bind every projected vertex and edge to one exact application-service Scope and one immutable Nebula Manifest.
- Build deterministically from immutable PostgreSQL source Manifests and publish only after full parity gates pass.
- Resolve ACTIVE server-side for ordinary reads and retain PostgreSQL fallback.
- Reuse the existing three-slot lifecycle, Gateway boundary, Projector retry model, and parity implementation.

## Non-Goals

- Authoring or editing Knowledge Assertions through NebulaGraph.
- Generating missing assertions from names, embeddings, or an LLM.
- Promoting `TRACE`, `EXEMPT`, or `BLOCKED` coverage into direct architecture membership.
- Supporting cross-Scope graph edges or ordinary client-selected Manifests.
- Replacing the existing PostgreSQL 3A navigation and fallback queries.
- Delivering multi-node operations, Kubernetes topology, backup/restore, or scale certification in this increment.
- Claiming billion-scale readiness from local single-node evidence.

## Existing Authoritative Inputs

The semantic graph is built only from already-published, exact-Scope PostgreSQL records:

| Input | Purpose |
| --- | --- |
| `ProjectionManifest` | Pins Baseline, Profile, knowledge generation, relationship version, source revisions, and content digest. |
| `KnowledgeProjectionNode` | Supplies accepted, Baseline-bound Knowledge Assertions and accepted asset identities. |
| `KnowledgeProjectionEdge` | Supplies versioned assertion-to-assertion relationships. |
| `ArchitectureUnitProjection` | Supplies BIZ, SYS, and TECH architecture units. |
| `ArchitectureUnitMemberProjection` | Connects an accepted assertion or asset semantic identity to an architecture unit. |
| `ArchitectureUnitMappingProjection` | Supplies explicit unit-to-unit realization and dependency mappings. |
| `ArchitectureCoverageManifest` | Pins full-catalog coverage inputs and results. |
| `ArchitectureAssetCoverageProjection` | Supplies every governed asset's `DIRECT`, `TRACE`, `EXEMPT`, or `BLOCKED` coverage state and path evidence. |
| `AssetNode` and `RelationshipCurrent` | Supply canonical graph identities and current typed asset relationships at the pinned relationship watermark. |

Only published source Manifests are eligible. Source rows must match the same `applicationServiceId`, `scopePath`, and `baselineId`. A build fails closed when its knowledge and coverage generations are incompatible or when a referenced endpoint cannot be resolved.

## Manifest Binding

`NebulaProjectionManifest` remains the immutable output-generation control record. The implementation adds explicit source bindings rather than relying only on untyped JSON:

- `sourceProjectionManifestId`;
- `sourceCoverageManifestId`;
- `knowledgeGenerationId`;
- `coverageGenerationId`;
- `relationshipVersion`;
- `catalogVersion` and `catalogDigest`;
- `semanticSchemaVersion`, initially `nebula.3a.semantic.v1`.

The existing `generationId` remains the physical Nebula output generation and must not be confused with the knowledge or coverage source generation. `sourceWatermarks`, expected counts, bucket digests, and content digest remain immutable build evidence.

Before BUILDING begins, the Projector verifies:

1. both source Manifests are published and belong to the exact Scope;
2. both source Manifests reference the same published Baseline;
3. Profile identity and schema versions are supported;
4. source counts and digests are present;
5. no other BUILDING Manifest exists for the Scope.

## Semantic Graph Model

### Vertex Families

`DesignAsset` represents a governed catalog identity. Its logical identity is `assetType + assetId`. Properties include display identity, node type, mapping mode, reason code, coverage digest, catalog version, and lifecycle state. A blocked or exempt asset remains visible but has no invented architecture target.

`KnowledgeAssertion` represents an accepted, Baseline-bound assertion. Properties include assertion ID, semantic identity, layer, aspect, confidence, evidence digest, source revision, and assertion content digest. Counter-evidence detail remains in PostgreSQL and is referenced by digest rather than copied into the online graph.

`ArchitectureUnit` represents a projected BIZ, SYS, or TECH unit. Properties include unit identity, layer, kind, parent identity, canonical English name, localized Chinese name, criticality, completeness, evidence count, and content digest.

Every VID uses the existing fixed-length generation-qualified digest over exact Scope, Manifest, vertex family, and logical identity.

### Edge Families

The graph uses distinct edge families with explicit direction:

| Edge | Direction | Meaning |
| --- | --- | --- |
| `ASSERTION_SUBJECT` | `KnowledgeAssertion -> DesignAsset` | The assertion governs this exact asset identity. |
| `CLASSIFIED_AS` | `KnowledgeAssertion -> ArchitectureUnit(BIZ)` | The asserted asset is classified into a business capability, process, or business object. |
| `REALIZED_BY` | `KnowledgeAssertion -> ArchitectureUnit(SYS)` | The asserted asset is realized by an application, service, component, or data domain. |
| `DEPLOYED_ON` | `KnowledgeAssertion -> ArchitectureUnit(TECH)` | The asserted asset depends on a platform, runtime, infrastructure unit, or technology service. |
| `ASSERTION_RELATION` | `KnowledgeAssertion -> KnowledgeAssertion` | A versioned typed assertion relationship; `relationCode` remains a property. |
| `ASSET_RELATION` | `DesignAsset -> DesignAsset` | A current typed asset relationship at the pinned watermark. |
| `ARCHITECTURE_RELATION` | `ArchitectureUnit -> ArchitectureUnit` | An explicit architecture-unit mapping; `mappingFamily` remains a property. |

The target unit layer determines `CLASSIFIED_AS`, `REALIZED_BY`, or `DEPLOYED_ON`. This is a deterministic projection policy over an explicit accepted membership, not inference from names. A missing membership never creates one of these edges.

### Mapping Modes

- `DIRECT`: the asset has an accepted assertion and a matching `ArchitectureUnitMemberProjection`. Emit `ASSERTION_SUBJECT` and one assertion-to-unit semantic edge.
- `TRACE`: preserve the typed asset relationship path from `ArchitectureAssetCoverageProjection.pathEvidence`; the path terminates at an asset with a direct assertion membership. Do not synthesize a new assertion for the traced asset.
- `EXEMPT`: project the asset with its exemption reason and evidence digest; emit no architecture target edge unless an explicit accepted membership exists.
- `BLOCKED`: project the asset with a bounded diagnostic reference and reason code; emit no architecture target edge.

Multiple direct targets for the same asset and layer are rejected unless distinct accepted assertions and evidence make the multiplicity explicit. Unresolved endpoints, unsupported layers, and cross-generation references block the Manifest.

## Stable Edge Ranks

Nebula edge ranks remain signed positive BIGINT values and are never truncated hashes.

- Current asset relationships use the authoritative relationship event `graphVersion` pinned by the Manifest.
- Assertion relationships use their authoritative relationship event version when available; otherwise the PostgreSQL knowledge projection persists an assigned `projectionOrdinal`.
- Assertion-subject and assertion-to-unit edges are unique for their source, target, and edge family, so rank `1` is valid after duplicate detection.
- Architecture mappings persist a `projectionOrdinal` in the immutable architecture mapping projection when parallel mappings share endpoints and family.

The implementation adds ordinals to existing derived projection rows where no authoritative monotonic version exists. It does not add a second one-row-per-edge registry solely for Nebula, avoiding duplicate billion-row storage.

## Component Boundaries

### Semantic Source Repository

`apps/graph-projector` gains a read-only source repository. It loads pinned source Manifests and keyset-paginates immutable source rows by stable identity. Every query includes exact Scope and source generation predicates. It never reads "latest" during a build.

### Semantic Materializer

A pure Core materializer validates source compatibility and emits typed semantic vertices and edges in deterministic order. It owns mapping-mode rules, layer-to-edge-family policy, duplicate detection, endpoint validation, content digests, expected counts, and parity tuples. It has no database or Gateway dependency.

### Generation Projector

The Graph Projector partitions work by semantic family and stable key range. A checkpoint key is `manifestId + family + logicalPartition`. Batch replay is idempotent. Restart resumes the exact partition without updating the legacy relationship-Outbox checkpoint.

### Typed Gateway Contract

Add an internal `/v1/semantic-projections` contract with a discriminated union for the three vertex and seven edge families. Each request carries exact Scope, ProjectionIdentity, semantic schema version, partition, and source digest. The Gateway rejects unknown families, invalid properties, cross-Scope endpoints, cross-Manifest endpoints, missing ordinals, and source-digest mismatch.

The existing `/v1/projections` legacy path remains available during migration and cannot activate a semantic Manifest.

### Active Manifest Resolver

The Go Gateway gains an `ActiveManifestResolver` backed by PostgreSQL. Ordinary query requests provide exact Scope and bounded query parameters only. The Gateway reads `NebulaProjectionHead.activeManifestId`, resolves the corresponding compatible Manifest, pins that identity for the request, and constructs generation-qualified VIDs. A caller-supplied Manifest is rejected on the ordinary route.

Internal validation may request a BUILDING Manifest through a separate authenticated route. That route is not exposed to ordinary users or Agents.

## Build And Publication Flow

```text
Published knowledge Manifest + published coverage Manifest
                         |
                         v
             create Nebula BUILDING Manifest
                         |
                         v
         source repository -> semantic materializer
                         |
                         v
         deterministic, checkpointed Gateway batches
                         |
                         v
       counts + bucket digests + semantic probes
                         |
              mismatch /        \ match
                 v                v
              FAILED       PostgreSQL pointer publish
                                    |
                          old ACTIVE -> PREVIOUS
```

Publication uses the existing Scope lock and optimistic head version. Gateway batch completion alone cannot publish. Every required partition must be healthy, expected counts must match, all bucket digests must match, semantic probes must agree with PostgreSQL, and there must be no unresolved dead letter.

## Query Contract

The first ordinary semantic query is asset-to-3A lookup:

```text
architectureScope + assetType + assetId + finite budget
```

The result contains:

- exact Scope and resolved ACTIVE ProjectionIdentity;
- the Design Asset and its mapping mode;
- governing Knowledge Assertions and evidence digests;
- BIZ, SYS, and TECH targets grouped by semantic edge family;
- traced asset path when mapping mode is `TRACE`;
- explicit exemption or blocked reason when no target exists;
- query budget, truncation state, source runtime, and fallback state.

The query never merges results from two Manifests. Unit-to-unit navigation and impact analysis may follow `ARCHITECTURE_RELATION` and `ASSET_RELATION`, but only within the same resolved Manifest and finite budget.

## PostgreSQL Fallback

The existing PostgreSQL architecture read model remains the compatibility oracle. The application query layer calls Nebula first when an ACTIVE semantic Manifest is healthy. On graph unavailability, unsupported semantic schema, or missing active projection, it executes the equivalent PostgreSQL query and marks `sourceRuntime = POSTGRESQL_FALLBACK`.

Parity mismatch does not silently fall back while publishing; it fails the build. Runtime fallback is a read-availability behavior and cannot make an invalid Manifest ACTIVE.

## Reconciliation

Activation requires complete, deterministic comparison:

1. counts by vertex and edge family;
2. bucket digests over canonical tuples sorted by family and logical identity;
3. semantic probes for direct BIZ/SYS/TECH membership, traced mapping, blocked mapping, assertion relationship, architecture realization, and bounded upstream/downstream traversal.

The existing `compareGenerationParity` contract is extended with family-specific totals and probe evidence. Sampling alone cannot pass activation. Mismatch evidence records bounded bucket IDs and probe IDs, never unbounded raw graph data.

## Failure Handling

- Missing or unpublished source Manifest: fail with `SEMANTIC_SOURCE_MANIFEST_REQUIRED`.
- Baseline, Profile, Scope, or generation mismatch: fail with `SEMANTIC_SOURCE_IDENTITY_MISMATCH`.
- Missing asset, assertion, or unit endpoint: fail with `SEMANTIC_ENDPOINT_UNRESOLVED`.
- Multiple unexplained direct targets: fail with `SEMANTIC_MEMBERSHIP_AMBIGUOUS`.
- Invalid or duplicate rank: fail with `SEMANTIC_EDGE_ORDINAL_INVALID`.
- Gateway partial failure: retain BUILDING and retry from the partition checkpoint.
- Dead letter or parity mismatch: mark the Manifest failed and leave ACTIVE unchanged.
- PostgreSQL control-plane outage: ordinary graph resolution fails closed; the application may use explicit PostgreSQL fallback.
- Nebula outage: PostgreSQL writes remain available and semantic reads use explicit fallback where supported.

Diagnostics expose stable codes and hashed references. They do not expose credentials, raw nGQL, cross-Scope identifiers, or unbounded source payloads.

## Compatibility And Rollout

1. Build the semantic graph in parallel with the legacy current-relationship graph.
2. Verify a BUILDING Manifest through internal authenticated queries.
3. Run complete parity and rollback rehearsal on the local single-node profile.
4. Enable ordinary asset-to-3A reads behind a Scope-level feature flag.
5. Keep PostgreSQL fallback and the legacy graph path until all supported callers use the semantic response contract.
6. Remove the legacy graph path only through a later approved cleanup.

No migration rewrites authored assets, Knowledge Assertions, Baselines, or architecture revisions.

## Implementation Evidence

The current implementation increment is locally verified in the owning Scope `com.huawei.celon.desiner`:

- `pnpm db:generate` passed after adding the semantic source-binding fields and generation checkpoint persistence.
- `pnpm --filter @specforge/core typecheck` and `pnpm --filter @specforge/graph-projector typecheck` passed.
- Focused root Vitest passed 8 files and 27 tests covering source pagination, deterministic materialization/query, bounded builder receipts/checkpoints, fallback identity safety, generation compatibility, Gateway client behavior, and the local integration fixture.
- Gateway `go test ./...` passed for `cmd/server`, `internal/httpapi`, `internal/nebula`, and `internal/postgres` with a writable temporary `GOCACHE`.
- The Go Gateway resolves ACTIVE from PostgreSQL through `database/sql` and `pgx`; the local graph Compose profile supplies its canonical database URL and `deploy_default` network.
- `deploy/graph/verify-semantic-projection.ps1` verifies graph health and exact-Scope query shape. It intentionally does not claim live semantic build/publish parity until a running semantic build fixture is available.

This increment is implementation evidence, not production-scale certification. External multi-node operations, live build/publish rehearsal, backup/restore, Kubernetes, and `10M`/`100M`/`1B` scale claims remain deferred.

## Verification Strategy

- Core tests: source identity, mapping modes, layer policy, duplicate handling, deterministic digests, and stable ranks.
- Repository tests: exact-Scope and generation predicates, keyset pagination, immutable source Manifest binding, and restart checkpoints.
- Gateway tests: typed union validation, ACTIVE resolution, no caller-selected Manifest, cross-generation rejection, and sanitized errors.
- Lifecycle tests: failed build leaves ACTIVE unchanged, successful publish moves ACTIVE to PREVIOUS, rollback restores PREVIOUS, and cleanup cannot target ACTIVE.
- Parity tests: family totals, complete bucket digests, direct/trace/blocked probes, and mismatch evidence.
- Integration tests: PostgreSQL source snapshot to Gateway batch, restart replay, semantic query, and PostgreSQL fallback.
- Live compatibility tests: local Nebula 3.8 single-node build, query, publish, rollback, and rebuild. This is compatibility evidence, not production-scale certification.

## Acceptance Criteria

- Every projected record belongs to one exact Scope, Baseline, source Manifest set, and Nebula Manifest.
- Every ordinary query resolves ACTIVE server-side and returns one Manifest identity.
- A direct asset-to-3A result traverses an accepted Knowledge Assertion; no generic direct asset-to-unit edge exists.
- BIZ, SYS, and TECH targets remain distinguishable as `CLASSIFIED_AS`, `REALIZED_BY`, and `DEPLOYED_ON`.
- `TRACE`, `EXEMPT`, and `BLOCKED` remain explicit and do not become authored membership.
- Asset, assertion, and architecture relationships remain distinct edge families.
- Missing endpoints, ambiguous membership, cross-Scope data, and cross-generation data fail closed.
- Complete counts, bucket digests, and semantic probes match PostgreSQL before publication.
- Failed validation never changes ACTIVE; rollback and cleanup retain the existing three-slot guarantees.
- PostgreSQL remains authoritative, MCP remains the only authored-design-fact write boundary, and production-scale claims remain deferred.

## 中文本地化覆盖

### 状态与问题

本文已于 2026-08-20 获产品负责人批准。英文内容为规范定义，所属应用服务为 `com.huawei.celon.desiner`，所属 Scope 路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`，设计变更会话为 `design-change-session:ce663776-075b-426f-a631-89c7b6b72dba`，实施计划为 `docs/superpowers/plans/2026-08-20-nebula-3a-semantic-projection-core.md`。

上一阶段已经实现 PostgreSQL 三槽控制、BUILDING/ACTIVE/PREVIOUS 生命周期、包含 Manifest 的图身份、带代次投递元数据和确定性一致性比较基础能力。本次实现增量已在本地完成语义来源绑定、确定性物化、类型化 Gateway、PostgreSQL ACTIVE 解析、有界构建检查点、查询回退和兼容性验证；运行中的语义构建/发布、多节点运维和规模认证仍保持延期。现有通用图节点和关系不能解释资产为什么属于某个业务、系统或技术架构单元；如果直接创建资产到架构单元的通用关系，会隐藏 Knowledge Assertion、混淆直接映射与追溯映射，并让图数据库看起来像是在编写权威语义。

### 目标与非目标

本阶段把 `DesignAsset`、`KnowledgeAssertion` 和 `ArchitectureUnit` 从固定的 PostgreSQL 读模型投影到 NebulaGraph。直接资产到 3A 的语义必须表达为“Knowledge Assertion 指向资产，同时指向架构单元”。直接成员、追溯覆盖、豁免、阻塞、资产关系、断言关系和架构单元关系必须保持可区分。所有图记录绑定同一个精确 Scope 和不可变 Manifest，只有完整一致性校验通过后才能发布。

本阶段不通过 Nebula 编写或编辑断言，不根据名称、向量或大模型生成缺失断言，不把 TRACE、EXEMPT 或 BLOCKED 自动提升为直接成员，不允许跨 Scope 关系或普通调用方选择 Manifest，也不交付生产多节点、Kubernetes、备份恢复和规模认证。

### 权威输入与 Manifest 绑定

语义图只读取已发布的 PostgreSQL 记录：`ProjectionManifest`、`KnowledgeProjectionNode`、`KnowledgeProjectionEdge`、`ArchitectureUnitProjection`、`ArchitectureUnitMemberProjection`、`ArchitectureUnitMappingProjection`、`ArchitectureCoverageManifest`、`ArchitectureAssetCoverageProjection`、`AssetNode` 和固定关系水位下的 `RelationshipCurrent`。

`NebulaProjectionManifest` 增加显式来源绑定：知识投影 Manifest、覆盖 Manifest、知识代次、覆盖代次、关系版本、目录版本与摘要，以及 `nebula.3a.semantic.v1` 语义 Schema 版本。Nebula 输出 `generationId` 与知识或覆盖来源代次是三个不同身份，禁止混用。构建前必须验证两个来源 Manifest 已发布、Scope 与 Baseline 一致、Profile 和 Schema 受支持、摘要完整，并且当前 Scope 没有另一个 BUILDING。

### 语义图模型

`DesignAsset` 表示受治理目录资产，保存资产类型、资产 ID、显示身份、映射模式、原因码、覆盖摘要、目录版本和生命周期状态。`KnowledgeAssertion` 表示已接受且绑定 Baseline 的断言，保存断言 ID、语义身份、层级、方面、置信度、证据摘要、来源修订和内容摘要。`ArchitectureUnit` 表示 BIZ、SYS 或 TECH 单元，保存单元身份、层级、种类、父单元、英文规范名称、中文本地化名称、关键度、完整度、证据数量和内容摘要。

关系保持独立语义：`ASSERTION_SUBJECT` 从断言指向资产；BIZ 单元使用 `CLASSIFIED_AS`，SYS 单元使用 `REALIZED_BY`，TECH 单元使用 `DEPLOYED_ON`；断言关系使用 `ASSERTION_RELATION`；资产关系使用 `ASSET_RELATION`；架构单元关系使用 `ARCHITECTURE_RELATION`。目标单元层级决定三种断言到单元关系，这是对显式已接受成员事实的确定性投影策略，不是根据名称推断。

DIRECT 资产生成断言主体关系和断言到单元关系。TRACE 资产保留到终点直接成员资产的有类型资产关系路径，不为追溯资产合成新断言。EXEMPT 和 BLOCKED 资产保留原因与证据摘要，不创建虚假架构目标。无法解析端点、层级不受支持、跨代引用或无法解释的多个直接目标都会阻止 Manifest。

### 稳定关系 Rank

Nebula rank 必须是正的有符号 BIGINT，禁止使用截断哈希。当前资产关系使用固定 Manifest 水位下的权威 `graphVersion`；断言关系优先使用权威关系事件版本，没有事件版本时由 PostgreSQL 知识投影持久化 `projectionOrdinal`；断言主体和断言到单元关系在重复校验后使用唯一 rank `1`；存在并行同端点关系的架构映射在不可变投影中持久化 `projectionOrdinal`。本设计不新增仅为 Nebula 服务的十亿行独立序号注册表。

### 组件与数据流

Graph Projector 新增只读语义来源仓库，按精确 Scope、来源代次和稳定 Keyset 分页读取不可变投影。Core 中的纯语义 Materializer 校验来源兼容性，执行映射模式和层级策略，检测重复与缺失端点，并产生确定顺序的顶点、关系、摘要、数量和 parity tuple。

Projector 按语义家族和稳定 Key 分区，检查点身份为 `manifestId + family + logicalPartition`，重启后从同一 Manifest 继续，不更新旧 relationship-outbox 检查点。Gateway 增加内部 `/v1/semantic-projections` 强类型契约，只接受三种顶点和七种关系家族，并拒绝未知家族、跨 Scope、跨 Manifest、缺少 rank 和来源摘要不一致。

Go Gateway 增加 PostgreSQL `ActiveManifestResolver`。普通查询只提交精确 Scope 和有界参数，Gateway 从 `NebulaProjectionHead` 解析 ACTIVE 并固定请求身份，普通调用方不能提交 Manifest。内部验证通过独立鉴权路由读取 BUILDING，不对普通用户或 Agent 开放。

### 当前实现证据

`pnpm db:generate`、Core/Graph Projector 类型检查、8 个文件 27 项聚焦 Vitest 测试、Gateway `go test ./...` 和图配置检查已通过。Gateway 已通过 `database/sql + pgx` 从 PostgreSQL 解析 ACTIVE，本地 Compose 已为 Gateway 配置规范数据库 URL 和 `deploy_default` 网络。`deploy/graph/verify-semantic-projection.ps1` 只验证健康与精确 Scope 查询；在运行中的语义构建夹具出现前，不宣称实时构建/发布 parity 已完成。外部多节点、生产运维和规模认证继续延期。

### 构建、发布与查询

已发布的知识 Manifest 和覆盖 Manifest用于创建 Nebula BUILDING Manifest。来源仓库读取固定数据，Materializer 生成确定性批次，Gateway 幂等写入并更新 Manifest 分区检查点。所有分区健康、数量一致、桶摘要一致、语义探针一致且没有死信后，才通过现有 Scope 锁和乐观版本切换 PostgreSQL 指针；失败时标记构建失败并保持 ACTIVE 不变。

首个普通查询是资产到 3A 查询，输入为精确 Scope、资产类型、资产 ID 和有限预算。返回值包含 ACTIVE 投影身份、资产映射模式、治理断言及证据摘要、按 BIZ/SYS/TECH 分组的目标、TRACE 路径、EXEMPT 或 BLOCKED 原因、预算与截断状态、来源运行时和回退状态。一次查询禁止混合两个 Manifest。

现有 PostgreSQL 架构读模型继续作为兼容性判定标准。ACTIVE 语义图健康时优先查询 Nebula；图不可用、Schema 不受支持或缺少活动投影时，应用查询层执行等价 PostgreSQL 查询并明确标记 `POSTGRESQL_FALLBACK`。发布校验失败不能通过运行时回退绕过。

### 一致性、失败与兼容

激活前必须比较各顶点和关系家族数量、完整确定性桶摘要，以及直接 BIZ/SYS/TECH、TRACE、BLOCKED、断言关系、架构实现和有限上下游遍历语义探针。只做抽样不能通过激活。错误使用稳定错误码和哈希诊断引用，不暴露凭据、原始 nGQL、跨 Scope 身份或无限源数据。

缺少来源 Manifest、来源身份不匹配、端点无法解析、成员歧义、rank 无效、死信或 parity 不一致都会让构建失败并保持 ACTIVE。Gateway 或 Projector 中断后按 Manifest 分区检查点恢复。PostgreSQL 控制面不可用时活动代次解析失败关闭；Nebula 不可用时 PostgreSQL 写入继续，支持的语义读取显式回退。

语义图将与旧关系图并行构建，先用内部鉴权查询验证 BUILDING，再执行完整 parity 和回滚演练，之后通过 Scope 功能开关启用普通资产到 3A 查询。所有调用方迁移前保留 PostgreSQL 回退和旧图路径；旧路径删除必须另行设计审批。

### 验收标准

每个投影记录必须绑定精确 Scope、Baseline、来源 Manifest 集合和 Nebula Manifest。普通查询必须由服务端解析 ACTIVE，并只返回一个 Manifest。直接资产到 3A 结果必须经过已接受 Knowledge Assertion，不存在通用资产到单元关系。BIZ、SYS、TECH 分别以 `CLASSIFIED_AS`、`REALIZED_BY` 和 `DEPLOYED_ON` 表达；TRACE、EXEMPT、BLOCKED 保持显式且不成为权威成员；资产、断言和架构关系保持不同家族。

缺失端点、成员歧义、跨 Scope 和跨代数据必须失败关闭。发布前 PostgreSQL 与 Nebula 的完整数量、桶摘要和语义探针必须一致。失败校验不能改变 ACTIVE，回滚和清理继续满足三槽安全规则。PostgreSQL 始终是权威库，MCP 始终是设计事实唯一写入边界，生产规模能力仍保持延期。
