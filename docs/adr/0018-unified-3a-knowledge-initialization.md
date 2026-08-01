# Unified 3A Knowledge Initialization And Derived Knowledge Layers

## Status

**Accepted design. MCP design facts are synchronized and read back; implementation has not started.**

- Stable ADR/MCP ID: `adr-unified-3a-knowledge-initialization`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Refines: `adr-agent-driven-legacy-baseline-discovery`

## Context

ADR-0015 established Agent-driven, evidence-backed discovery for existing application services. The broader architecture still needs a generic ontology for Business, System, and Technical Architecture; a precise distinction between authoritative facts and Knowledge Layer projections; atomic versioning; and a way to keep Huawei-specific hierarchy and terminology outside the reusable core.

Enterprise sources can assert conflicting truths at different layers. A business policy can describe intended behavior while code or an API describes current behavior. Flattening these assertions loses drift evidence. Treating every KL as an editable copy creates multiple systems of record and prevents reproducible Agent context.

## Decision

Adopt `docs/superpowers/specs/2026-08-01-unified-3a-knowledge-initialization-design.md`.

Model Business (`BIZ`), System (`SYS`), and Technical (`TECH`) Architecture as versioned perspectives over one authoritative fact graph. Facts also carry a structure, behavior, information, contract, or constraint aspect. Motivation, governance, provenance, evolution, Scope, permission, and localization are cross-cutting dimensions.

Use one semantic identity with multiple source and layer assertions. Preserve normative and observed assertions, evidence, counter-evidence, confidence, and conflicts. Identity mapping is a reviewed candidate rather than an implicit name match.

Keep typed asset revisions, typed relationship revisions, Evidence, existing federation observations and candidates, promotion decisions, identity candidates, ChangeSets, Streams, Baselines, Requirements, Proposals, and ADRs authoritative in PostgreSQL. A ChangeSet atomically commits asset revisions, relationship revisions, Evidence references, and a monotonic sequence. Working Streams are mutable and published Baselines are immutable.

Treat 3A KLs, diagrams, catalogs, matrices, reports, generated documentation, Context Packs, caches, and graph stores as derived projections. Persist only pinned or attested projection snapshots long term, each with Scope, Baseline, projection schema, source revisions, relationship version, query, digest, and generation time. Preserve actual AI narrative output and its generation metadata instead of claiming deterministic regeneration.

Separate the generic core from Analysis Profiles, Source Connectors or Extractors, and Organization Profiles. The default Generic System profile supports non-DDD systems. DDD, Workflow, Data Pipeline, and Integration remain optional profiles. The current Huawei hierarchy and English-canonical, Chinese-required policy move toward an organization profile; profile extensions are namespaced and cannot override core semantics, authority, relation direction, or Scope enforcement.

Reuse the existing federation `SourceObservation`, `Candidate`, `Promotion`, and `Reconciliation` lifecycle. Do not introduce a parallel discovery persistence model. Baseline publication fails closed for partial coverage, blocking conflict, cross-Scope candidate, or failed reconciliation.

## Alternatives

1. **Make 3A three independent stores.** Rejected because duplicated facts drift and no store can reliably explain cross-layer alignment.
2. **Keep one mutable value per fact.** Rejected because normative business intent and observed implementation can legitimately disagree.
3. **Store KL output as authored truth.** Rejected because projections then become competing authorities and cannot be safely regenerated.
4. **Put Huawei hierarchy and terms in the core.** Rejected because it blocks adoption by organizations with different models.
5. **Require DDD for System Architecture.** Rejected because workflow, integration, pipeline, layered, and legacy systems need neutral analysis.
6. **Create new scan-specific Observation and Candidate tables.** Rejected because the federation lifecycle already owns ingestion, promotion, audit, and reconciliation semantics.
7. **Use a graph database as the primary source of truth.** Rejected because authored assets, transactional publication, audit, and recovery remain PostgreSQL responsibilities.

## Consequences

- Positive: One fact graph supports 3A views without duplicating systems of record.
- Positive: Conflicts become visible drift evidence instead of destructive overwrites.
- Positive: Baselines and pinned Context Packs can identify the exact revisions used by an Agent.
- Positive: Generic and non-DDD systems can be onboarded while Huawei behavior remains configurable.
- Positive: Existing federation governance and durable MCP writes are reused.
- Tradeoff: Versioned assertions, identity candidates, ChangeSets, and projection manifests add schema and workflow complexity.
- Tradeoff: Profile compatibility and metamodel migrations require explicit versioning.
- Tradeoff: Billion-scale readiness needs partitioning and asynchronous projections now, plus separate capacity proof later.
- Tradeoff: Human review remains necessary for high-risk meaning, conflict, and cross-Scope implications.

## Constraints

- Every initialization, assertion, promotion, ChangeSet, Baseline, projection, and Context Pack is bound to one exact authorized application-service Scope.
- PostgreSQL remains authoritative; graph stores and KLs remain derived and rebuildable.
- Promotion of accepted facts and typed links occurs only through MCP.
- English remains canonical and Chinese remains required for human-facing content in the current organization profile; the core locale set is configurable.
- Organization and analysis profiles cannot override core identity, relation, authority, or Scope semantics.
- Partial scans, unsupported coverage, unresolved blocking conflict, and failed reconciliation cannot activate a Baseline.
- The server does not execute repository build scripts and full source upload is disabled by default.
- Initial implementation must preserve current API and stored-data compatibility during profile extraction.
- Continuous synchronization, live runtime connectors, external `APPLY`, automatic cross-Scope merging, production object storage, and complete billion-scale capacity certification remain deferred.

## Evidence

- **Design review:** On 2026-08-01 the user accepted the unified 3A perspectives, profile-neutral core, derived KL model, assertion conflicts, ChangeSet and Baseline semantics, and phased delivery.
- **Industry review:** ISO/IEC/IEEE 42010, ArchiMate, W3C PROV-O, OSLC Configuration Management, and W3C SHACL were reviewed as architecture-viewpoint, provenance, baseline, and validation references.
- **Pre-implementation design read:** `pnpm design-context:preflight -- --intent "Formalize the approved unified 3A knowledge initialization architecture and profile-neutral legacy discovery model." --affected "adr-agent-driven-legacy-baseline-discovery,adr-federated-design-fact-synchronization,data-specforge-assets,data-specforge-asset-graph,api-specforge-mcp-tools" --evidence "approved bilingual design review,ADR and manifest validation,MCP design-fact synchronization and read-back"` read 119 exact-Scope assets and opened `design-change-session:e51c9bff-6a1f-4ed2-8e75-887b67042203`.
- **Repository consistency:** `node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts` passed 1 file and 9 tests, including ADR-0018 registration and 16 unique repository and MCP IDs.
- **MCP persistence:** `pnpm design-facts:sync` returned all 16 baseline decisions as complete, including ADR-0018 and its generated Proposal, Context Pack, Evidence, and typed links.
- **MCP read-back:** `pnpm design-facts:check` verified all 16 decisions with empty `missing`, `mismatched`, `outOfScope`, and `blocked` results.
- **Implementation evidence:** None. This ADR authorizes design and planning only.

## MCP Record

- Matching MCP ADR ID: `adr-unified-3a-knowledge-initialization`
- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-unified-3a-knowledge-initialization`
- Matching Context Pack: `context-pack-unified-3a-knowledge-initialization`
- Related assets: `data-specforge-assets`, `data-specforge-asset-graph`, `api-specforge-mcp-tools`, `adr-agent-driven-legacy-baseline-discovery`, and `adr-federated-design-fact-synchronization`
- Required typed links: Proposal `--IMPLEMENTS_DECISION-->` ADR; Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal; ADR `--DECIDES-->` related assets; Evidence `--VALIDATES-->` ADR
- Current status: MCP synchronized and read back from the configured canonical PostgreSQL authority; implementation remains pending.

## Chinese Localization

### 标题

统一 3A 知识初始化与派生知识层

### 背景

ADR-0015 已经确定由 Agent 驱动、基于证据发现存量应用。整体架构仍需要通用的业务架构、系统架构和技术架构本体，需要严格区分权威事实与知识层投影，需要原子版本机制，并需要把华为专属层级和术语移出可复用核心。

企业不同来源可能对同一概念给出冲突断言。业务政策描述预期行为，代码或 API 描述当前行为。把它们压平会丢失漂移证据；把每个 KL 当成可编辑副本则会产生多个权威源，并使 Agent 上下文无法重现。

### 决策

采用 `docs/superpowers/specs/2026-08-01-unified-3a-knowledge-initialization-design.md`。

把业务架构 `BIZ`、系统架构 `SYS` 和技术架构 `TECH` 建模为同一权威事实图上的版本化视角。事实同时具有结构、行为、信息、契约或约束 Aspect；动机、治理、来源、演进、Scope、权限和本地化属于横切维度。

采用“一个语义身份、多个来源和层级断言”。规范意图与实际实现可以同时存在，必须保留证据、反证、置信度和冲突。身份映射必须作为候选接受审核，不能仅按名称隐式合并。

资产修订、关系修订、Evidence、现有联邦 Observation 和 Candidate、提升结论、身份候选、ChangeSet、Stream、Baseline、Requirement、Proposal 和 ADR 在 PostgreSQL 中保持权威。ChangeSet 在一个事务中原子提交资产修订、关系修订、Evidence 引用和单调序号；Working Stream 可变，发布的 Baseline 不可变。

3A KL、图表、目录、矩阵、报告、生成文档、Context Pack、缓存和图数据库都是派生投影。只长期保存固定或带证明的快照，并记录 Scope、Baseline、投影 Schema、来源修订、关系版本、查询、摘要和生成时间。AI 叙述保存真实输出和生成元数据，不宣称可以确定性重生成。

通用核心与 Analysis Profile、Source Connector 或 Extractor、Organization Profile 分离。默认 Generic System Profile 必须支持非 DDD 系统；DDD、Workflow、Data Pipeline 和 Integration 都是可选 Profile。当前华为层级和英文规范、中文必填策略逐步迁入组织 Profile；扩展必须使用命名空间，且不能覆盖核心语义、权威规则、关系方向或 Scope 校验。

复用现有联邦 `SourceObservation`、`Candidate`、`Promotion` 和 `Reconciliation` 生命周期，不新建平行的扫描持久化模型。部分扫描、阻塞冲突、跨 Scope 候选或对账失败时，Baseline 发布必须失败关闭。

### 备选方案

1. 把 3A 建成三个独立存储：拒绝，因为重复事实会漂移，跨层对齐也缺少统一依据。
2. 每项事实只保留一个可变值：拒绝，因为业务规范意图和实际实现可能合理冲突。
3. 把 KL 输出作为编写事实：拒绝，因为投影会成为竞争权威且无法安全重建。
4. 把华为层级和术语写入核心：拒绝，因为其他组织无法复用。
5. 强制系统架构采用 DDD：拒绝，因为工作流、集成、数据流水线、分层和存量系统需要中性模型。
6. 新建扫描专属 Observation 和 Candidate 表：拒绝，因为现有联邦生命周期已经负责摄取、提升、审计和对账。
7. 使用图数据库作为主权威源：拒绝，因为编写事务、原子发布、审计和恢复仍属于 PostgreSQL。

### 后果

- 积极影响：一套事实图可以生成 3A 视图，而不会产生多个记录系统。
- 积极影响：冲突成为可分析的漂移证据，而不是被覆盖。
- 积极影响：Baseline 和固定 Context Pack 可以精确定位 Agent 使用的修订。
- 积极影响：通用和非 DDD 系统可以接入，华为行为仍可配置。
- 积极影响：复用现有联邦治理和持久 MCP 写入链路。
- 权衡：版本化断言、身份候选、ChangeSet 和投影清单会增加 Schema 与流程复杂度。
- 权衡：Profile 兼容和元模型迁移需要显式版本管理。
- 权衡：亿级就绪要求当前预留分区和异步投影，并在后续单独证明容量。
- 权衡：高风险语义、冲突和跨 Scope 影响仍需要人工审核。

### 约束

- 每个初始化、断言、提升、ChangeSet、Baseline、投影和 Context Pack 必须绑定一个精确且已授权的应用服务 Scope。
- PostgreSQL 保持权威；图数据库和 KL 必须是可重建派生结果。
- 正式事实和类型化关系只能通过 MCP 提升。
- 当前组织 Profile 继续要求英文为规范、中文为面向人内容必填；核心语言集合必须可配置。
- 组织 Profile 和分析 Profile 不能覆盖核心身份、关系、权威或 Scope 语义。
- 部分扫描、覆盖不支持、未解决的阻塞冲突和对账失败不能激活 Baseline。
- 服务端不得执行项目构建脚本，默认禁止上传完整源码。
- 首期实现必须在抽取 Profile 时保持现有 API 和存量数据兼容。
- 持续同步、实时连接器、外部 `APPLY`、自动跨 Scope 合并、生产对象存储和完整亿级容量认证保持延期。

### 证据

- **设计评审：** 用户于 2026-08-01 确认统一 3A 视角、Profile 无关核心、派生 KL、冲突断言、ChangeSet 与 Baseline 语义以及分阶段交付。
- **业界审视：** 已参考 ISO/IEC/IEEE 42010、ArchiMate、W3C PROV-O、OSLC 配置管理和 W3C SHACL 对视角、来源、基线和校验的定义。
- **实现前设计读取：** 上述 `pnpm design-context:preflight` 命令读取了 119 项精确 Scope 资产，并创建 `design-change-session:e51c9bff-6a1f-4ed2-8e75-887b67042203`。
- **仓库一致性：** `node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts` 通过 1 个文件和 9 项测试，其中包含 ADR-0018 注册以及 16 个唯一仓库和 MCP ID。
- **MCP 持久化：** `pnpm design-facts:sync` 返回全部 16 项基线决策均为完成，其中包含 ADR-0018 及其生成的 Proposal、Context Pack、Evidence 和类型化关系。
- **MCP 回读：** `pnpm design-facts:check` 验证全部 16 项决策，`missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空。
- **实现证据：** 当前没有。本 ADR 仅批准设计与后续计划。

### MCP 记录

- 匹配 MCP ADR ID：`adr-unified-3a-knowledge-initialization`
- 精确所属 Scope：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 匹配 Proposal：`proposal-unified-3a-knowledge-initialization`
- 匹配 Context Pack：`context-pack-unified-3a-knowledge-initialization`
- 相关资产：`data-specforge-assets`、`data-specforge-asset-graph`、`api-specforge-mcp-tools`、`adr-agent-driven-legacy-baseline-discovery` 和 `adr-federated-design-fact-synchronization`
- 当前状态：已通过 MCP 写入配置的规范 PostgreSQL 权威库并完成回读；实现仍待开始。
