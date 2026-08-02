# Unified 3A Knowledge Initialization

**Status:** Phase 3 scanner foundation and provider-neutral MockAI semantic candidate generation implemented; signed packaging, identity matching, 3A projections, and migration hardening remain pending. The Windows standalone artifact check is environment-blocked by pnpm symlink permissions.

**Owning architecture scope:** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

**Decision records:** ADR-0018 refines, but does not invalidate, ADR-0015.

## Problem

SpecForge must initialize trustworthy architecture knowledge for existing enterprise systems and keep it usable by people and coding Agents. Source code, schemas, interface definitions, documents, and runtime inventories describe different parts of a system. No single source contains complete business meaning, and asking users to confirm every extracted fact does not scale.

The current product is configured for Huawei's product-family hierarchy, but the core must remain reusable by organizations with different hierarchies, terminology, languages, governance, and architectural styles. The model must also support systems that do not use domain-driven design.

## Goals

- Represent Business Architecture, System Architecture, and Technical Architecture as coordinated perspectives over one canonical fact graph.
- Initialize a baseline from existing systems through coding Agents without requiring users to deploy scanner infrastructure.
- Preserve evidence, provenance, contradictions, confidence, review decisions, and exact application-service authorization.
- Publish internally consistent baselines atomically and derive reproducible Knowledge Layers (KLs), diagrams, reports, and Context Packs.
- Keep organization-specific vocabulary and hierarchy outside the generic core.
- Scale storage and processing incrementally while PostgreSQL remains authoritative.

## Non-Goals

- Continuous inbound synchronization, runtime discovery, CMDB and gateway connectors, outbound proposals, and external `APPLY` are deferred.
- The first increment does not automatically merge facts across application-service scopes.
- The design does not make DDD mandatory.
- The design does not make a graph database authoritative.
- The design does not claim a completed billion-edge capacity benchmark.

## Industry Alignment

The model follows the concerns rather than copying one framework mechanically:

- [ISO/IEC/IEEE 42010:2022](https://www.iso.org/standard/74393.html) supports explicit architecture viewpoints and model kinds.
- [ArchiMate guidance](https://archimate-community.pages.opengroup.org/workgroups/archimate-101/) separates Business, Application, and Technology concerns and adds motivation and implementation dimensions. SpecForge maps its System layer to software realization without requiring ArchiMate notation.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/) motivates first-class provenance for assertions, evidence, activities, and responsible agents.
- [OASIS OSLC Configuration Management 1.0](https://www.oasis-open.org/standard/oslc-configuration-management-version-1-0/) distinguishes mutable streams from immutable baselines.
- [W3C SHACL](https://www.w3.org/TR/shacl/) provides a useful reference for versioned graph-shape validation; SpecForge may adopt equivalent constraints without requiring RDF storage.

## Conceptual Model

### 3A perspectives

| Layer | Question | Typical facts |
| --- | --- | --- |
| Business Architecture (`BIZ`) | Why does the enterprise operate this way? | capabilities, actors, business objects, processes, policies, business rules, terms |
| System Architecture (`SYS`) | How does software realize the business intent? | bounded contexts or modules, application services, logical entities, state machines, APIs, events, integrations |
| Technical Architecture (`TECH`) | How is the software built, deployed, and operated? | repositories, dependencies, frameworks, middleware, physical schemas, deployment units, observability and security controls |

Each fact also has an aspect: `structure`, `behavior`, `information`, `contract`, or `constraint`. Motivation, decisions, provenance, evolution, ownership, permissions, and localization are cross-cutting dimensions rather than additional architecture layers.

Data and behavior cross layers through typed links instead of duplicated records. For example, a business object is realized by a logical entity and persisted by a physical table; a business rule is enforced by a system invariant or policy; a business process is realized by a workflow or state machine; and an API semantic contract belongs to `SYS` while its gateway and protocol deployment belong to `TECH`.

### Semantic identity and assertions

SpecForge uses one semantic identity with multiple source and layer assertions. It must not collapse every observation into one mutable owner value. A Business assertion may state the normative meaning while a System assertion reports observed implementation. Both can remain valid and contradictory until reviewed. Drift is a first-class result, not a reason to discard one side.

An assertion contains:

- semantic identity and fact type;
- layer and aspect;
- source observation and evidence references;
- asserted value, confidence, matching evidence, counter-evidence, and unresolved questions;
- responsible extractor or Agent identity;
- exact Scope and revision metadata;
- review and promotion state.

Identity mapping is itself a governed candidate. An `IdentityCandidate` contains confidence, matching evidence, counter-evidence, and a review decision. An extractor cannot silently equate similarly named concepts.

### Authoritative and derived records

Authoritative PostgreSQL records are:

- typed design-asset revisions and typed relationship revisions;
- Evidence and provenance;
- existing federation `SourceObservation`, `Candidate`, `Promotion`, and `Reconciliation` records;
- identity-mapping candidates and review decisions;
- atomic `ChangeSet` records;
- mutable Working Streams and immutable Baselines;
- semantically distinct Requirements, Proposals, and ADRs.

Derived records are:

- Business, System, and Technical KL projections;
- diagrams, catalogs, matrices, alignment reports, health reports, and drift reports;
- generated documentation and task-specific Context Packs;
- graph-store projections and caches.

A reconciliation or alignment result is a timestamped derived snapshot, not an authored architecture fact.

## Baselines And Projections

### Atomic ChangeSet

A `ChangeSet` commits asset revisions, relationship revisions, evidence references, and a monotonic sequence in one PostgreSQL transaction. A Baseline selects a committed ChangeSet watermark plus explicit exceptions. Partial scans, unresolved blocking conflicts, or failed reconciliation cannot publish an active Baseline.

Working Streams are mutable. Published Baselines are immutable. Absence from an incomplete or unavailable source never means deletion from the current Baseline.

### Knowledge Layers

KLs are versioned derived projections, not independent editable stores. Normal queries use deterministic live projections or short-lived caches. Only pinned, attested, or Context-Pack-referenced snapshots are retained long term.

Every persisted KL snapshot has a manifest containing:

- `architectureScope` and `baselineId`;
- projection type and projection-schema version;
- source asset revisions and relationship version;
- query or filter definition;
- content digest and generation timestamp.

Deterministic structured projections must be reproducible. AI-generated narratives are not assumed reproducible. For those outputs, SpecForge stores the actual output, provider, model, prompt, parameters, and input digest. Acceptance means that the original pinned Context Pack remains retrievable, not that a later model call produces identical prose.

## Extensibility

### Core

The generic core owns a configurable Scope registry, versioned metamodel, revisions, relationships, evidence, streams, baselines, MCP governance, authorization, reconciliation, and projection contracts. It must not contain Huawei or Celon constants.

### Profiles and connectors

- Analysis profiles: Generic System by default, with optional DDD, Workflow, Data Pipeline, and Integration profiles.
- Source connectors and extractors: Git or repository, OpenAPI or AsyncAPI, database schema, documents, and later runtime or CMDB sources.
- Organization profiles: hierarchy types, aliases, canonical and required locales, governance policy, and namespaced extensions.

Profiles may extend mappings but cannot override core type identity, relation direction, Scope enforcement, or authority rules. Organization extensions must be namespaced.

The current Huawei organization profile keeps `productFamily -> product -> subProduct -> module -> applicationService`, with application service as the current minimum write dimension. Locale policy remains `canonicalLocale=en`, `requiredLocales=[zh]`, and `supportedLocales=[en, zh]`. Core locale types must no longer be hardcoded to an `en | zh` union even though this deployment requires both.

## Initialization Pipeline

1. An Agent selects one application service authorized by its token.
2. The server creates an exact-Scope Initialization Session.
3. A signed ephemeral connector or scanner runs locally in the workspace.
4. Extractors submit redacted Evidence and deterministic Observations in idempotent batches.
5. An analysis profile creates evidence-backed semantic Candidates.
6. Identity resolution creates or reviews `IdentityCandidate` records.
7. Validation and risk policy assemble T0-T3 ReviewBundles, preserving conflicts.
8. Authorized promotion occurs only through MCP.
9. PostgreSQL publishes an atomic immutable Baseline after reconciliation succeeds.
10. SpecForge derives 3A KLs and task-specific Context Packs.
11. Read-only reconciliation checks source, baseline, projection, localization, and Scope consistency.

The local Agent is the trust boundary for source access. The server manages sessions, authorization, observations, candidates, review, and baselines. The server does not execute repository build scripts, and full source upload is disabled by default.

## Failure Semantics

- A partial scan reports coverage gaps and cannot activate a Baseline.
- An unsupported framework is recorded as a coverage gap, not silently ignored.
- Business and System conflicts remain visible and reviewable.
- One profile failure does not invalidate successful independent extractors, but it may block completeness.
- An unavailable source retains the previous Baseline; absence is not deletion.
- Cross-Scope candidates fail closed and require explicit future governance.
- Secrets and personal data are redacted before Evidence submission.
- Failed reconciliation prevents active-Baseline publication.

## Scale Model

Use append-only revisions, content digests, idempotent batches, and monotonic ChangeSet sequences. Partition authoritative data by enterprise or tenant, Scope, time, and where necessary a stable hash. Large Evidence payloads may move to external object storage while PostgreSQL retains metadata and digests. KL queries use incremental materialization and bounded caches. Graph projections consume the existing durable outbox asynchronously and can be rebuilt from PostgreSQL.

A Baseline stores a manifest and watermark rather than copying all facts. Billion-scale delivery requires separate capacity tests, partition validation, operational budgets, and projection-lag SLOs before production claims.

## Delivery Increments

1. Generic foundation: configurable scopes and locales, versioned metamodel, assertions, identity candidates, ChangeSets, Streams, Baselines, and projection manifests. **Implemented in the current increment:** core contracts, profile-neutral scope registry, assertion validation, content digests, PostgreSQL tables and migration, and scoped MCP operations.
2. Initialization governance: exact-Scope sessions, authorization, idempotent ingestion, ReviewBundles, promotion, and reconciliation.
3. Generic scanning: signed local scanner, repository and contract extractors, Generic System profile, and coverage reporting.
4. 3A projections: BIZ, SYS, and TECH KLs, alignment and drift views, and pinned Context Packs.
5. Migration and hardening: move Huawei constants into an organization profile, preserve current APIs and data, then add scale and failure testing.

## Current Implementation Boundary

The current increment adds a local scanner foundation and a provider-neutral semantic candidate stage on top of initialization governance. It reads a bounded, explicitly allowlisted file set without executing project commands, creates a deterministic manifest and source-minimized structural observations, and submits the report through the exact-Scope MCP/Connector boundary with idempotent PostgreSQL persistence. MockAIProvider analyzes persisted observations into bilingual, evidence-backed candidate assertions with confidence, counter-evidence, and unresolved questions; one PostgreSQL transaction persists those candidates and assembles a ReviewBundle. Incomplete scan coverage or incomplete candidate coverage produces a blocked bundle. The flow never accepts facts, commits a non-empty ChangeSet, or publishes a Baseline automatically. It does not yet sign scanner packages, provide real Agent transport, perform identity matching, publish a real 3A KL, or replace the Huawei runtime registry. Existing design-asset writes and federation flows remain compatible. The production Web build compiled, typechecked, generated all static pages, and failed only while Next.js copied pnpm standalone symlinks because the current Windows host disallows symlink creation. Retry after enabling Windows Developer Mode or using a build environment with symlink support.

## Acceptance Criteria

- The core starts without the Huawei profile, while the current deployment behaves compatibly when that profile is enabled.
- A non-DDD fixture can be initialized with the Generic System profile.
- Repeated identical scans are idempotent.
- Conflicting layer assertions are preserved and reported.
- Partial scans, blocked reviews, and reconciliation failures cannot activate a Baseline.
- A Baseline reproduces its asset and relationship revisions and deterministic KL context.
- KL generation cannot create new authoritative facts.
- The exact content of a pinned Context Pack remains retrievable.
- Exact Scope, MCP-only promotion, permission, and localization constraints remain enforced.
- A graph outage does not compromise PostgreSQL authoring or authority.

## Chinese Localization

### 问题与目标

SpecForge 需要为企业存量系统建立可信的架构知识，并持续服务于人和 Coding Agent。源码、数据库 Schema、接口文件、文档和运行清单只描述系统的一部分，任何单一来源都无法提供完整业务语义；逐条人工确认在大规模系统中也不可行。

本设计把业务架构、系统架构和技术架构作为同一规范事实图上的三个协调视角。它要求保留证据、来源、冲突、置信度、审核结论和精确应用服务权限，通过原子基线发布一致状态，并派生可追溯的 KL、图表、报告和 Context Pack。当前华为层级继续作为组织 Profile 使用，但通用核心不得依赖华为、Celon 或 DDD。

### 3A 与事实模型

- 业务架构 `BIZ` 描述能力、参与者、业务对象、流程、政策、业务规则和术语。
- 系统架构 `SYS` 描述模块、应用服务、逻辑实体、状态机、API、事件和集成如何实现业务意图。
- 技术架构 `TECH` 描述代码库、依赖、框架、中间件、物理 Schema、部署、可观测性和安全控制。

结构、行为、信息、契约和约束是事实的 Aspect；动机、决策、来源、演进、归属、权限和本地化是横切维度。跨层概念通过有方向的类型化关系连接，不能复制成彼此独立的真相。

系统采用“一个语义身份、多个来源或层级断言”。业务层可以表达规范意图，系统层可以表达实际实现，两者即使冲突也必须保留并形成漂移结果。每项断言携带证据、反证、置信度、未决问题、提取身份、Scope 和修订信息。身份映射本身也是需要证据和审核的候选，不能因为名称相似就自动合并。

### 权威记录、基线与 KL

PostgreSQL 中的资产修订、关系修订、Evidence、来源、现有联邦 Observation/Candidate/Promotion/Reconciliation、身份候选、ChangeSet、Working Stream、Baseline、Requirement、Proposal 和 ADR 是权威记录。3A KL、图表、矩阵、对齐或漂移报告、生成文档、Context Pack 和图数据库内容都是派生结果。

ChangeSet 必须在一个 PostgreSQL 事务中提交资产修订、关系修订、证据引用和单调序号。Working Stream 可变，发布后的 Baseline 不可变。部分扫描、阻塞冲突或对账失败不能发布活动 Baseline；来源暂时不可用也不能被解释为删除。

KL 是可版本化派生投影，不是独立可编辑存储。长期保存的快照必须记录 Scope、Baseline、投影类型和 Schema 版本、来源修订、关系版本、查询条件、摘要和生成时间。确定性结构化投影必须可重建；AI 叙述保存真实输出以及模型、Prompt、参数和输入摘要，验收标准是原始固定 Context Pack 可读取，而不是重新生成相同文本。

### 扩展与初始化流程

通用核心负责 Scope 注册、版本化元模型、修订、关系、Evidence、Stream、Baseline、MCP 治理、授权、对账和投影契约。分析 Profile 包括默认 Generic System 以及可选 DDD、Workflow、Data Pipeline 和 Integration。Connector 或 Extractor 负责 Git、OpenAPI/AsyncAPI、数据库 Schema、文档及后续运行时来源。组织 Profile 负责层级、别名、语言和治理规则，扩展必须带命名空间，且不能覆盖核心类型、关系方向、Scope 和权威规则。

当前华为 Profile 保留“产品族、产品、子产品、模块、应用服务”五级结构，应用服务仍是最小写入维度；语言策略为英文规范、中文必填。核心本身必须支持可配置语言集合。

Agent 先选择 Token 已授权的应用服务，服务端建立精确 Scope 的 Initialization Session；签名临时扫描器在本地工作区提取脱敏 Evidence 和确定性 Observation；分析 Profile 形成语义 Candidate；身份解析、规则校验和 T0-T3 ReviewBundle 保留冲突并完成审核；正式提升只能通过 MCP；成功对账后 PostgreSQL 原子发布不可变 Baseline，再生成 3A KL 和任务 Context Pack。服务端不得执行项目构建脚本，默认也不得上传完整源码。

### 失败、规模与交付

部分扫描、框架不支持、Profile 失败、跨 Scope 候选和对账失败都必须显式报告并阻止错误基线发布。业务与系统冲突必须保留。数据按追加修订、内容摘要、幂等批次和 ChangeSet 序列管理，并按租户、Scope、时间或稳定哈希分区；大证据可外置对象存储，图数据库通过 Outbox 异步重建。亿级关系能力必须经过单独容量和故障测试后才能声明。

交付依次分为通用基础、初始化治理、通用扫描、语义候选、3A 投影、迁移与加固。当前已实现通用基础、初始化治理、扫描器基础和 Provider 无关的 MockAI 语义候选生成：核心契约、Profile 无关 Scope 注册表、断言校验、内容摘要、PostgreSQL 表与迁移、精确 Scope MCP 操作、ReviewBundle、覆盖不足 fail-closed、MCP-only 提升决策、ChangeSet 提升门禁、确定性文件清单、最小化源码结构观察、幂等扫描报告持久化、双语候选摘要和原子 ReviewBundle 组装。当前仍未实现签名扫描包、真实 Agent 传输、身份匹配、发布真实 3A KL，也未替换 Huawei 运行时注册表。Web 生产构建已完成编译、类型检查和静态页面生成，但在 Next.js 复制 pnpm standalone 符号链接时因当前 Windows 主机禁止创建符号链接而受阻；启用 Windows Developer Mode 或使用支持符号链接的构建环境后重试。持续同步、CMDB 和运行时连接器、出站 Proposal、外部 `APPLY`、自动跨 Scope 合并、生产对象存储和完整亿级基准测试保持延期。
