# Governed 3A Architecture Fact Authoring Design

## Status

Approved design direction, pending implementation approval. This document defines the authoring and onboarding increments and does not claim that either increment is implemented.

- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design session: `design-change-session:efd5df8b-492f-4e8c-949f-94f66b541cc7`
- Related decision: `adr-readable-3a-architecture-mapping`
- Implementation plans:
  - `docs/superpowers/plans/2026-08-15-governed-3a-architecture-fact-authoring.md`
  - `docs/superpowers/plans/2026-08-15-designer-3a-fact-onboarding.md`

## Current State

The read side is implemented. SpecForge can materialize and query `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, and `ArchitectureUnitMappingProjection`, and the Web can render a bounded Map or Network view. The current published Designer generation contains zero governed architecture-unit rows because the projector receives no canonical architecture-unit source facts.

The generic `KnowledgeAssertion` API is not a safe substitute. It accepts arbitrary `factType` values, but the current promotion mapper supports only established design-asset and typed-relationship fact types. Promotion also assumes a governed scan session and source observations. Treating authored architecture units as scanned assertions would either fail during promotion or create a false provenance chain.

## Goals

1. Make architecture units, memberships, and cross-layer mappings first-class, immutable, exact-Scope authored facts.
2. Make MCP the only runtime write boundary for those facts.
3. Reuse the existing review, promotion decision, Working Stream, ChangeSet, reconciliation, Baseline, and projection lifecycle without pretending that authored facts came from a scanner.
4. Keep PostgreSQL authoritative and architecture-unit projection tables rebuildable.
5. Support bounded, idempotent batch writes suitable for Agents and enterprise repositories.
6. Use the completed capability to publish an evidence-backed initial BIZ-to-SYS-to-TECH map for the Designer Scope.
7. Keep ambiguous classifications as review blockers or rejected candidates; never invent canonical semantics from names, graph communities, or layout.

## Non-goals

- No Web authoring surface.
- No automatic approval or automatic Baseline publication.
- No cross-application-service authoring batch.
- No portfolio-level multi-Scope map.
- No direct write to projection tables or a graph database.
- No replacement of `KnowledgeAssertion` for scanned and continuously observed system facts.
- No AI-generated authoritative architecture semantics. An Agent may prepare candidates, but approval remains governed.

## Considered Approaches

### 1. Store architecture facts as generic `KnowledgeAssertion` rows

Rejected. The current promotion path maps assertions to design assets or typed relationships and binds promotion evidence to a finalized scan session. Extending every scanned-knowledge assumption to accommodate manually authored architecture units would weaken provenance and overload a model that serves a different lifecycle.

### 2. Write directly to `ArchitectureUnitProjection` tables

Rejected. Those rows are generation-bound derived data. Direct writes would make the projection an authoring store, bypass Baseline review, and make rebuilds destructive.

### 3. Add a parallel, architecture-only approval system

Rejected. Separate review and Baseline mechanisms would duplicate governance rules and create incompatible audit semantics.

### 4. Add first-class architecture fact revisions and extend the shared governance envelope

Selected. Architecture facts use their own typed canonical tables and validators, while `KnowledgeReviewBundle`, `KnowledgePromotionDecision`, `KnowledgeChangeSet`, reconciliation, and Baseline manifests gain additive architecture-revision references. Scan-based assertions and authored architecture facts retain distinct provenance but converge through one publication lifecycle.

## Canonical Information Model

### Architecture fact batch

`ArchitectureFactBatch` is the MCP submission and idempotency envelope. It contains:

- stable `id` and caller-supplied `idempotencyKey`;
- exact `applicationServiceId` and full `scopePath`;
- `designChangeSessionId`;
- actor and provider-neutral provenance;
- ordered unit, membership, and mapping revision IDs;
- evidence references, source digest, status, and timestamps.

The server calculates the canonical digest. Repeating the same key and digest returns the existing receipt. Reusing the key with different normalized content fails with `ARCHITECTURE_FACT_IDEMPOTENCY_CONFLICT`.

### Architecture unit revision

`ArchitectureUnitRevision` is an immutable authored revision with:

- `id`, stable `unitIdentity`, and monotonic `revision`;
- `layer` and profile-governed `kind`;
- optional same-layer `parentUnitIdentity`;
- required English `canonicalName` and `canonicalDescription`;
- required Chinese `localizedContent.zh.name` and `localizedContent.zh.description`;
- aliases, criticality, evidence references, provenance, content digest, and status;
- exact Scope, batch ID, optional ChangeSet ID, and timestamps.

The initial generic kind matrix remains:

- BIZ: `CAPABILITY`, `PROCESS`, `BUSINESS_OBJECT`;
- SYS: `APPLICATION`, `SERVICE`, `COMPONENT`, `DATA_DOMAIN`;
- TECH: `PLATFORM`, `RUNTIME`, `INFRASTRUCTURE`, `TECHNOLOGY_SERVICE`.

### Architecture-unit membership revision

`ArchitectureUnitMembershipRevision` explicitly assigns one accepted design assertion or promoted asset identity to one unit. It contains:

- `id`, stable `membershipIdentity`, and revision;
- `unitIdentity`;
- exactly one resolvable member selector: accepted assertion ID or promoted asset type and ID;
- semantic identity, optional asset type, confidence, evidence references, provenance, digest, and status;
- exact Scope, batch ID, optional ChangeSet ID, and timestamps.

Membership is an authored canonical fact. `ArchitectureUnitMemberProjection` remains the generation-specific derived row.

### Architecture-unit mapping revision

`ArchitectureUnitMappingRevision` explicitly maps one unit to another and contains:

- `id`, stable `mappingIdentity`, and revision;
- source and target unit identities;
- mapping family, confidence, evidence references, and optional contributing relationship identities;
- provenance, digest, status, exact Scope, batch ID, optional ChangeSet ID, and timestamps.

The overview permits only BIZ-to-SYS and SYS-to-TECH families. Reverse traversal is a query concern, not a second canonical mapping. Same-layer dependencies remain typed design relationships and are shown only in drill-down or Network mode.

### Status and immutability

Revision status is `CANDIDATE`, `ACCEPTED`, or `REJECTED`. Candidate content becomes immutable after submission. Review changes status and records an actor decision; modifying semantic content creates a new revision and batch. A published Baseline references exact accepted revision IDs, so later revisions cannot rewrite an earlier generation.

## Shared Governance Extension

The existing governance records gain additive architecture references:

- `KnowledgeReviewBundle.architectureFactRevisionIds`;
- `KnowledgePromotionDecision.approvedArchitectureFactRevisionIds`;
- `KnowledgePromotionReceipt.architectureFactRevisionIds`;
- `KnowledgeChangeSet.architectureFactRevisionIds`;
- `BaselineManifest.architectureFactRevisionIds`.

Existing assertion and identity-candidate fields remain compatible. Digest functions include the new sorted arrays. Empty architecture arrays produce the same semantic behavior for existing flows.

Architecture promotion is implemented by a dedicated service because it has authored provenance rather than scan-session provenance. It still requires an approved shared Review Bundle, the same design-change session, an active Working Stream, an independent authorized reviewer when policy requires one, and a durable promotion receipt. It may not call the scan-specific `promoteKnowledgeCandidates` path.

## MCP Contracts

### `submit_3a_architecture_fact_batch`

Input:

- exact `architectureScope`;
- `designChangeSessionId`, `id`, and `idempotencyKey`;
- provider-neutral provenance;
- bounded arrays of units, memberships, and mappings;
- non-empty evidence references.

Behavior:

1. Authorize `knowledge:write` against the exact Scope.
2. Verify the open design-change session belongs to the same Scope and actor policy.
3. Normalize and validate the complete batch before writing.
4. Resolve parents, membership targets, and mapping endpoints inside the same Scope.
5. Persist immutable candidate revisions and one batch atomically.
6. Return the batch ID, revision IDs, digest, blockers, and an idempotent receipt.

Initial bounds are 100 units, 1,000 memberships, 500 mappings, and 4 MiB canonical payload per batch. Larger imports page over multiple independent batches under one design-change session.

### Shared review tools

`create_knowledge_review_bundle` and `decide_knowledge_review_bundle` gain additive architecture revision arrays. A bundle is blocked when:

- English or Chinese human-facing content is incomplete;
- a parent, membership target, or mapping endpoint is unresolved;
- a unit kind does not belong to its layer;
- a mapping crosses Scope or uses an unsupported layer transition;
- evidence is missing;
- the batch is partial or its digest does not match persisted candidates.

### `promote_3a_architecture_facts`

Input contains exact Scope, approved promotion decision ID, architecture batch ID, and Working Stream ID. The service locks the batch and decision, verifies exact revision sets and digests, marks approved revisions accepted, creates an idempotent promotion receipt and ChangeSet references, and appends governance/outbox events in one PostgreSQL transaction.

The existing reconciliation, Baseline publication, projection-build request, status query, and design-session close tools remain the publication sequence.

## Publication Flow

```text
Agent reads current scoped catalog and relationships
  -> submit_3a_architecture_fact_batch
  -> shared Review Bundle
  -> authorized APPROVE or REJECT decision
  -> promote_3a_architecture_facts
  -> KnowledgeChangeSet
  -> exact-Scope reconciliation
  -> immutable KnowledgeBaseline
  -> request_3a_projection_build
  -> projector reads accepted architecture revisions from Baseline
  -> ArchitectureUnitProjection / MemberProjection / MappingProjection
  -> MCP and Web read-back
```

No stage writes a graph store. Projection publication fails closed if any accepted architecture revision is absent, out of Scope, inconsistent with the Baseline, or references an unresolved endpoint.

## Projector Integration

`PrismaProjectionBuildRepository.loadBatch` must load architecture revisions from the published Baseline on the final batch. It converts accepted canonical revisions into the existing `ArchitectureUnitMaterializationInput`; generation, Baseline, and Projection Manifest identity are assigned by the projector, never stored as authored input.

The current `emptyArchitectureUnitInput(job)` remains valid only when the Baseline contains no architecture revision IDs. If IDs are present but cannot be loaded exactly, the build fails with a named error rather than publishing an empty map.

The projection digest includes normalized architecture source digests. Repeating a build for the same Baseline and profile produces the same unit, membership, mapping, ordering, and content digests.

## Designer Scope Onboarding

The initial onboarding is a separate governed data operation performed after the generic capability is implemented.

1. Read the current published Designer Baseline, scoped catalog, typed relationships, API contracts, data models, rules, state machines, ADRs, runtime, storage, deployment, and quality facts through MCP/query boundaries.
2. Build an evidence matrix. Every proposed unit, membership, and mapping cites existing stable IDs and evidence references.
3. Propose a minimal coherent architecture slice rather than classifying every asset immediately. The target is at least one complete BIZ-to-SYS-to-TECH chain plus the directly supporting units needed to explain it.
4. Submit candidates only through `submit_3a_architecture_fact_batch`.
5. Keep ambiguous or weakly evidenced classifications blocked or rejected; record missing coverage as a backlog fact with owner, trigger, and rationale.
6. Review, promote, reconcile, publish a new Baseline, build a new projection, and verify Map and neighborhood read-back.

The onboarding plan must not hard-code invented business names. Exact unit names and memberships are chosen only after reading the live scoped facts during implementation.

## Authorization and Isolation

- Every MCP write and read carries the exact application-service Scope.
- The authenticated token may grant several application services, but each request operates on exactly one authorized Scope.
- Batch endpoints, parent references, members, mappings, decisions, streams, ChangeSets, Baselines, and projections must share the same Scope.
- Error responses do not reveal whether an identity exists in a sibling Scope.
- No database query may resolve an endpoint by logical ID without including both `applicationServiceId` and `scopePath`.

## Consistency, Concurrency, and Recovery

- Canonical content and revision arrays are sorted before hashing.
- Batch submission, promotion, and ChangeSet creation use PostgreSQL advisory or row locks scoped by application service, Scope path, and stable operation ID.
- An identical retry returns the original receipt; a conflicting retry fails closed.
- Partial batch writes roll back atomically.
- Projection jobs are asynchronous and generation-specific. A failed new generation does not replace the previous published generation.
- Reconciliation compares exact revision IDs, digests, ChangeSet, relationship version, and Scope before Baseline publication.
- MCP synchronization failure is recorded as `MCP synchronization blocked` and prevents completion claims.

## Scale and Storage

Architecture units are expected to be much smaller than raw design-fact and relationship graphs, while memberships may be large. PostgreSQL remains appropriate because the authoritative workload is transactional, exact-Scope, versioned, and review-oriented.

- Compound indexes begin with `applicationServiceId` and `scopePath`.
- Logical identity and revision indexes support deterministic history lookup.
- Accepted-revision and ChangeSet indexes support Baseline assembly.
- Membership indexes support unit-to-member and member-to-unit lookup.
- Mapping indexes support source, target, and family lookup.
- Batches are bounded and paged; the system never requires one enterprise-wide transaction.
- A graph database remains an optional derived projection for traversal at very large relationship scale and is not required for canonical authoring.

## Observability and Audit

Durable governance events are emitted for batch submission, review bundle creation, decision, promotion, reconciliation, Baseline publication, projection completion, and failure. Logs and receipts include stable IDs and digests but do not include full source excerpts or credentials.

Operational counters include submitted/rejected batches, idempotent retries, blocked review reasons, promotion latency, projection lag, unresolved memberships, and mapping completeness per exact Scope.

## Acceptance Criteria

### Generic capability

- A valid bilingual exact-Scope batch can be submitted twice idempotently.
- A conflicting retry, cross-Scope endpoint, invalid layer-kind pair, unresolved member, unsupported transition, or missing evidence is rejected atomically.
- An unapproved batch cannot enter a ChangeSet or Baseline.
- Approval and promotion create immutable accepted revisions, a receipt, ChangeSet references, and audit/outbox events.
- A Baseline containing architecture revision IDs produces deterministic non-empty projection rows.
- Existing Baselines with no architecture revision IDs remain compatible and produce the explicit empty governed-unit state.
- Existing scan-based knowledge promotion remains behaviorally compatible.

### Designer onboarding

- The initial batch is derived from live exact-Scope facts and retains evidence to those facts.
- At least one readable BIZ-to-SYS-to-TECH chain is present after publication without inferred or synthetic semantics.
- Map and neighborhood MCP queries return the same Baseline, generation, unit identities, memberships, and mappings as PostgreSQL projection rows.
- The Web Map renders the chain, Inspector shows bilingual content and evidence metadata, and no sibling-Scope data appears.
- Remaining unclassified facts are counted and represented as explicit backlog coverage rather than grouped into an artificial unit.

## Deferred Work

- Web architecture authoring remains deferred. Owner: SpecForge Product. Trigger: a separately approved human authoring workflow. Rationale: MCP remains the only runtime write boundary.
- Cross-Scope portfolio authoring and aggregation remain deferred. Owner: SpecForge Architecture. Trigger: explicit multi-Scope read authorization and aggregation semantics. Rationale: this increment guarantees exact application-service isolation.
- AI classification suggestions remain deferred. Owner: SpecForge AI and Governance. Trigger: an evidence-backed suggestion contract and evaluation policy. Rationale: suggestions must not become authoritative automatically.
- Bulk classification of every existing Designer asset remains incremental. Owner: SpecForge Architecture. Trigger: completion of the first published chain and a measured coverage review. Rationale: correctness is preferred over mass speculative classification.

---

# 受治理的 3A 架构事实写入设计

## 状态

设计方向已批准，等待实施确认。本文定义写入能力与首批数据上线两个增量，不代表相关代码或数据已经完成。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计会话：`design-change-session:efd5df8b-492f-4e8c-949f-94f66b541cc7`
- 相关决策：`adr-readable-3a-architecture-mapping`

## 问题与目标

当前只读 Map、查询协议和派生投影已经完成，但 Designer 最新发布代际中没有任何受治理的架构单元。原因不是页面读取错误，而是系统缺少架构单元、成员和跨层映射的规范写入模型。

不能把这些内容简单伪装成普通 `KnowledgeAssertion`。现有断言晋升流程只支持既定设计资产与有类型关系，并且要求扫描会话来源；手工编写的架构语义不应伪造扫描来源。也不能直接写投影表，因为投影必须能够根据 Baseline 重建。

本设计选择新增一等的架构事实修订，同时扩展现有审核、决策、ChangeSet、对账、Baseline 与投影发布外壳。PostgreSQL 保存权威事实，MCP 是唯一运行时写边界，图数据库和页面图形继续作为派生消费者。

## 规范事实

系统新增四类规范记录：

1. `ArchitectureFactBatch`：承载精确 Scope、设计变更会话、幂等键、来源、证据、修订 ID 与内容摘要。
2. `ArchitectureUnitRevision`：保存稳定单元身份、版本、BIZ/SYS/TECH 层、类型、父单元、英文规范名称与描述、完整中文覆盖、别名、关键度和证据。
3. `ArchitectureUnitMembershipRevision`：把同 Scope 的已接受断言或已晋升资产显式归属到架构单元。
4. `ArchitectureUnitMappingRevision`：显式记录 BIZ 到 SYS、SYS 到 TECH 的有方向映射和证据。

候选提交后内容不可修改；审核只能接受或拒绝。语义变化必须产生新修订。Baseline 固定引用具体修订 ID，因此后续修订不会改写历史代际。

## 共享治理扩展

现有 `KnowledgeReviewBundle`、`KnowledgePromotionDecision`、`KnowledgePromotionReceipt`、`KnowledgeChangeSet` 和 Baseline Manifest 增加架构事实修订 ID 数组。原有断言与身份候选字段保持兼容，摘要计算纳入排序后的新增数组。

架构事实使用专用晋升服务，因为其来源是显式编写而不是扫描；但仍然必须经过共享 Review Bundle、授权审批人、活动 Working Stream、ChangeSet、对账和 Baseline 发布，不建立第二套治理体系。

## MCP 写入流程

`submit_3a_architecture_fact_batch` 接收精确 Scope、开放的设计变更会话、幂等键、来源、证据以及有界的单元、成员和映射数组。服务端先完整校验，再在一个事务中写入候选修订和批次回执。相同键与相同摘要返回已有结果；相同键与不同内容失败关闭。

共享审核工具增加架构修订列表。英文或中文缺失、端点未解析、类型与层不匹配、跨 Scope、映射方向不支持、证据缺失或批次不完整都会阻止批准。

`promote_3a_architecture_facts` 只接受已批准的 Review Bundle 与精确一致的修订集合，在一个 PostgreSQL 事务中生成接受状态、晋升回执、ChangeSet 引用和治理事件。之后沿用现有对账、Baseline 发布、投影构建和会话关闭工具。

## 投影与发布

投影器在最终批次中按 Baseline 指定的架构修订 ID 读取已接受事实，并转换成现有 `ArchitectureUnitMaterializationInput`。generation、Baseline 和 Projection Manifest 身份由投影器赋值，不写回规范事实。

Baseline 不包含架构修订时，继续发布明确的空架构单元结果；Baseline 声明了修订但无法精确读取时，投影必须失败，不能静默发布空 Map。相同 Baseline 和 Profile 的重复构建必须产生相同排序与摘要。

## Designer 首批数据上线

通用能力完成后，再执行独立的数据上线计划：通过 MCP 和查询边界读取当前 Designer Scope 的 API、数据模型、规则、状态机、ADR、运行时、存储、部署和质量事实，建立证据矩阵，只提交有明确证据的单元、成员和映射。

首批目标不是一次性分类所有资产，而是发布一条可解释、可回读的 BIZ 到 SYS 到 TECH 完整链路。证据不足的内容保持阻塞或拒绝，并将覆盖缺口登记为带负责人、触发条件和原因的待办。实施时不得预先硬编码或臆造业务名称。

## 隔离、幂等与规模

每个请求只处理一个精确 Scope。即使一个 Token 被授权多个应用服务，也必须逐 Scope 调用。所有端点解析必须同时带 `applicationServiceId` 和 `scopePath`，错误信息不能泄露兄弟 Scope 是否存在同名记录。

批次、晋升和 ChangeSet 使用 Scope 级锁与确定性摘要；相同重试幂等，冲突重试失败，部分写入整体回滚。单批初始上限为 100 个单元、1,000 个成员、500 个映射和 4 MiB 规范化载荷，大规模导入通过同一设计会话下的多个独立批次分页完成。

PostgreSQL 适合保存事务型、版本化、需审核的权威事实。架构单元数量通常远少于原始关系；成员表通过 Scope、单元、成员与 ChangeSet 组合索引扩展。图数据库仅用于超大关系图的派生遍历，不参与权威写入。

## 验收标准

- 合法双语批次可幂等重试；冲突、跨 Scope、无证据、错误类型和未解析端点会原子拒绝。
- 未批准批次不能进入 ChangeSet 或 Baseline。
- 批准后生成不可变修订、回执、ChangeSet 和审计事件。
- 包含架构修订的 Baseline 能生成确定性非空投影；旧 Baseline 保持兼容。
- Designer 首批事实来自实时精确 Scope 数据，至少形成一条真实 BIZ 到 SYS 到 TECH 链路。
- MCP、PostgreSQL 投影和 Web Map 对 Baseline、代际、单元、成员和映射的读回一致。
- 未分类内容显式计数并进入覆盖待办，不创建虚假的“其他”单元。

