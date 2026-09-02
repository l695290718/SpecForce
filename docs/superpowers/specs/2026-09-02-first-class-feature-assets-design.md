# First-Class Service And Functional Feature Assets

## Status And Ownership

This specification defines the approved design for first-class Feature assets in SpecForge. It records design only; no runtime implementation is claimed. English is canonical, and the Chinese section is the complete human-facing localization overlay.

- Owner: SpecForge Product Architecture and Design Governance.
- Owning Scope: `com.huawei.celon.desiner`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- ADR: `adr-first-class-feature-assets` / `docs/adr/0047-first-class-feature-assets.md`.
- Proposal: `proposal-first-class-feature-assets`.
- Context Pack: `context-pack-first-class-feature-assets`.
- Design session: `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`.

## 1. Purpose And Vocabulary

Feature becomes an independent design-asset family beside APIs, events, data models, business rules, state machines, quality requirements, ADRs, Proposals, and Context Packs. It is not an alias for a 3A architecture unit and is not an implementation module.

A **Service Feature** is an externally visible, stakeholder-valued outcome that an application service can deliver within a defined scenario and boundary. A **Functional Feature** is an independently describable and verifiable system behavior that contributes to one or more Service Features. Functional Features describe what the system must do, not classes, tables, algorithms, or deployment components.

Industry terminology is not uniform. This design adopts the external-value interpretation of Feature found in systems engineering and product-management guidance, the top-down decomposition of functions used in functional architecture, and the reusable-capability interpretation of service features used in telecommunications standards. The SpecForge glossary is therefore explicit and authoritative for this product.

## 2. Asset Types And Canonical Contracts

Persist two concrete `DesignAsset` types under the conceptual Feature family:

- `serviceFeature`
- `functionalFeature`

Both reuse the existing scoped authored-asset, revision, search-projection, graph-ledger, relationship-event, and Outbox infrastructure. No separate Feature table or second persistence path is introduced.

Common canonical fields are `id`, `name`, `description`, `domainId`, `createdAt`, `updatedAt`, `architectureScope`, `status`, `owner`, `tags`, and `acceptanceCriteria`. English canonical narrative is required. `localizedContent.zh` must contain structurally complete translations for every human-facing narrative field. IDs, status codes, relationship codes, and other machine identifiers are not translated.

A Service Feature additionally records actors, scenario, value outcome, benefit hypothesis, and service boundary/non-goals. A Functional Feature additionally records trigger, observable behavior, preconditions, postconditions, and exception behaviors. Inputs and outputs are represented by typed links to contracts and data assets when such assets exist; the Feature payload must not duplicate an API schema or data model.

IDs are stable and unique across all assets inside the exact Scope because the current authoritative key is `(applicationServiceId, scopePath, id)`. Recommended prefixes are `sf-` and `ff-`; changing a Feature kind requires a governed replacement rather than silently changing the asset type under the same ID.

## 3. Scope And Authorization

Every Feature is owned by one exact application-service Scope. Service-to-Functional Feature relationships and all implementation links are limited to that same Scope in this increment. A caller may read or write only through an exact grant and must never infer access from a parent Scope, sibling Scope, dashboard selection, or token that lacks the required operation.

Cross-Scope Feature relationships are not supported. Reuse across application services is deferred to a separately governed enterprise template or reference mechanism; copying content does not preserve a live cross-Scope relationship.

MCP is the only design-asset write boundary. The Web application is read-only for Feature assets and relationships. Web reads use the same scoped application services and authorization policies; visible controls never grant permission.

## 4. Relationship Semantics

The canonical value-to-behavior relationship is:

```text
FunctionalFeature --CONTRIBUTES_TO--> ServiceFeature
```

It is same-Scope, directional, many-to-many, non-exclusive, and impact-propagating in both traversal directions. The reverse presentation label is "supported by". This avoids ownership semantics while allowing a reusable Functional Feature to support multiple Service Features.

Feature-aware ontology rules extend existing codes where their meaning already fits and add codes only where the semantics are genuinely new:

- API or operation `EXPOSES` a Functional Feature.
- Functional Feature `CONSUMES` or `EMITS` an Event contract.
- Business Rule `GOVERNS` a Service or Functional Feature.
- Functional Feature `READS` or `WRITES` a Data Model, Entity, or Field. Finer create/update/delete modes may be relationship metadata until separately justified as ontology codes.
- State Machine `CONTROLS` a Functional Feature when it defines its lifecycle behavior.
- Quality Requirement `VERIFIES` a Service or Functional Feature.
- Evidence `VALIDATES` the exact version or content digest of a Feature.
- Proposal `IMPACTS` a Service or Functional Feature; ADR `DECIDES` it; Observability Design `OBSERVES` it.
- Components or modules may `REALIZE` a Functional Feature when those node types have an authored, scope-safe identity.

Service Features may map to BIZ capabilities or processes, and Functional Features may map to SYS services or components through the existing asset-to-3A mapping mechanism. Feature assets remain design assets rather than becoming 3A units.

## 5. Atomic MCP Change Set

The primary write operation is `apply_feature_change_set`. One request may create or update Service Features, Functional Features, and their typed relationships. It carries the exact `architectureScope`, design-change session ID, correlation ID, idempotency key, expected asset versions, and bounded asset/relationship collections.

The operation supports `dryRun`. Dry-run performs the same authorization, localization, contract, identity, relationship, concurrency, and budget checks but persists nothing. Apply mode commits canonical assets, authored revisions, graph nodes, current relationships, relationship events, audit data, and durable Outbox records in one PostgreSQL transaction. Search and derived graph projections are invalidated or queued from the committed event; they are never authoritative participants in the transaction.

Validation rejects missing English content, incomplete Chinese overlays, duplicate or colliding IDs, stale expected versions, missing endpoints, cross-Scope endpoints, illegal source/target types, duplicate links, self-links, unregistered relationship codes, oversized payloads, and requests outside configured budgets. Any failure rolls back the whole Change Set and returns stable machine-readable error codes plus bounded item-level details. An idempotent replay returns the original receipt without creating new revisions or events.

The MCP surface also provides bounded Feature detail, list, graph, and coverage reads for the Web application and explicit diagnostics. Agents that need system understanding must still call `evaluate_system_knowledge_readiness` and consume `read_system_knowledge`; direct Feature reads do not bypass that gate.

## 6. Derived Governance State

Authored lifecycle is separate from computed delivery truth:

- `lifecycleStatus`: `DRAFT`, `ACTIVE`, `DEPRECATED`, or `RETIRED`.
- `coverageStatus`: `UNMAPPED`, `PARTIAL`, or `COMPLETE`.
- `evidenceStatus`: `NO_EVIDENCE`, `IMPLEMENTED`, or `VERIFIED`.
- `consistencyStatus`: `UNKNOWN`, `CONSISTENT`, `DRIFTED`, or `STALE`.

Coverage is computed from required relationship classes and the Feature kind; not every Functional Feature requires an API or persisted data. Implementation and verification require Evidence bound to the current Feature version/content digest, repository commit, command/result, and verification time. Stale evidence cannot produce `VERIFIED`. Drift is independent of coverage and evidence and may coexist with any of their values.

Retirement invalidates active Feature relationships through relationship events. A referenced Feature is not physically deleted. Historical revisions and evidence remain queryable under authorization.

## 7. Web Read Experience

The Feature workspace provides scoped, paginated lists for Service and Functional Features, bilingual detail views, coverage and consistency indicators, and a bounded relationship graph. It does not provide editing controls.

The default graph expands `Service Feature -> Functional Feature -> first-level related assets`. Users may expand entities, fields, architecture mappings, and technical realizations on demand. The graph supports WebGL rendering, drag, zoom, pan, type filters, localized labels, relationship explanations, and highlighted impact paths. Query budgets prevent loading the entire Scope at once.

## 8. System Knowledge And Downstream Use

Feature summaries and current relationship waterlines become part of bounded system knowledge after readiness succeeds. Context Pack generation, requirement assessment, impact analysis, and design-to-implementation reconciliation may consume Features only through versioned contracts and must retain exact Scope and evidence provenance.

A requirement can therefore trace through `Service Feature -> Functional Feature -> contract/rule/data/behavior -> implementation/evidence`. Missing coverage, stale evidence, denied Scope, or unavailable projections must be reported explicitly rather than represented as zero impact or complete knowledge.

## 9. Delivery Phases

- **P0:** Core types and localization, ontology, atomic Change Set, PostgreSQL transaction and idempotency, bounded MCP detail/list reads, focused contract and isolation tests.
- **P1:** Search projection, Web list/detail/graph, coverage computation, bilingual UI, bounded graph interaction and browser acceptance.
- **P2:** System-knowledge inclusion, Context Pack and requirement-assessment consumption, implementation evidence and drift reconciliation.

Each phase requires a new exact-Scope implementation session, matching ADR/Proposal/Context Pack updates, MCP synchronization, focused evidence, and reconciliation. This design does not claim any phase implemented.

## 10. Acceptance And Failure Criteria

P0 is acceptable only when valid mixed Feature batches commit atomically; invalid localization, concurrency, ontology, identity, authorization, or Scope cases roll back; idempotent replay is stable; and PostgreSQL remains authoritative. P1 additionally requires paginated scoped reads, complete bilingual rendering, usable bounded graph interaction, and no cross-Scope counts or nodes. P2 additionally requires readiness-gated system knowledge, current-version evidence, explainable derived states, and drift detection without treating projection failure as authored-data loss.

Named failures distinguish authorization denial, Scope mismatch, validation failure, version conflict, budget exceeded, missing endpoint, relationship violation, unavailable projection, stale evidence, and internal transaction failure. Responses never reveal inaccessible asset identities or contents.

## 11. Alternatives Rejected

A single `feature` type with a subtype hidden in the current string payload was rejected because indexed filtering and type constraints would be weaker. Separate ServiceFeature and FunctionalFeature tables were rejected because they would duplicate the established authored-asset lifecycle. Independent asset and relationship writes were rejected because partial success would create incomplete graphs. A strict parent-child tree was rejected because Functional Features can contribute to multiple Service Features.

## 12. Industry References

- ISO/IEC/IEEE 29148 Feature interpretation, summarized in the OMG SysML issue tracker: <https://issues.omg.org/issues/SYSML2-481>.
- SEBoK Function glossary and functional decomposition: <https://sebokwiki.org/wiki/Function_%28glossary%29>.
- ITU-T Q.1290 reusable Feature definition: <https://www.itu.int/rec/T-REC-Q.1290>.
- OASIS SOA service-functionality model: <https://docs.oasis-open.org/soa-rm/soa-ra/v1.0/soa-ra-v1.0.html>.

## 中文本地化覆盖

### 状态与归属

本文定义 SpecForge 一等特性资产的已确认设计，仅登记设计，不声明任何运行实现已经交付。英文是规范内容，本节是完整的中文本地化覆盖。负责人、精确 Scope、ADR、Proposal、Context Pack 和设计会话见文首元数据。

### 1. 目标与术语

特性成为与 API、事件、数据模型、业务规则、状态机、质量需求、ADR、变更提案和上下文包并列的独立设计资产族。它不是 3A 架构单元的别名，也不是实现模块。

**服务特性**是在明确场景和边界内，由应用服务向外部参与者交付、具有利益相关方价值且可感知的结果。**功能特性**是支撑一个或多个服务特性、可以独立描述和验证的系统行为。功能特性描述系统必须做什么，不描述类、表、算法或部署组件。

业界对 Feature 没有完全统一的术语。本文吸收系统工程和产品管理中“对外价值”的理解、功能架构中的自顶向下功能分解，以及通信标准中“可复用服务能力”的理解；SpecForge 本文词汇表是本产品的明确权威定义。

### 2. 资产类型与规范契约

在 Feature 概念资产族下持久化 `serviceFeature` 和 `functionalFeature` 两种具体 `DesignAsset` 类型。两者复用现有的 Scope 资产、修订、搜索投影、图账本、关系事件和 Outbox 基础设施，不新建 Feature 专表或第二条持久化路径。

公共规范字段包括 ID、英文名称与描述、领域、时间、精确 Scope、生命周期、负责人、标签和验收标准。英文叙述必填；`localizedContent.zh` 必须对全部面向人的叙述字段提供结构完整的中文翻译。机器 ID 和状态/关系代码不翻译。

服务特性额外记录服务对象、场景、价值结果、收益假设和服务边界/非目标。功能特性额外记录触发条件、可观察行为、前置条件、后置条件和异常行为。存在正式契约或数据资产时，输入输出通过有类型关系表达，禁止在 Feature Payload 中复制 API Schema 或数据模型。

ID 在精确 Scope 的全部设计资产中唯一且稳定，建议使用 `sf-` 和 `ff-` 前缀。变更特性类型必须创建受治理的替代资产，不能在同一 ID 下静默改类型。

### 3. Scope 与授权

每个 Feature 只归属一个精确应用服务 Scope。本增量中的服务特性、功能特性和实现资产关系都只能位于同一 Scope。调用方必须具备精确授权，不能从父级、兄弟 Scope、仪表盘选择或缺少操作权限的 Token 推断访问权。

当前不支持跨 Scope Feature 关系。跨应用服务复用延期到独立治理的企业模板或引用机制；复制内容不会保留跨 Scope 实时关系。MCP 是唯一设计资产写入边界，Web 只读，并复用相同的 Scope 服务和授权策略。

### 4. 关系语义

规范价值到行为关系为 `FunctionalFeature --CONTRIBUTES_TO--> ServiceFeature`。它是同 Scope、有方向、多对多、非独占关系，两个遍历方向都参与影响分析；反向展示为“由……支撑”。

API 或操作通过 `EXPOSES` 暴露功能特性；功能特性消费或发布事件；业务规则治理特性；功能特性读取或写入模型、实体或字段；状态机控制功能特性生命周期；质量需求验证特性；Evidence 验证精确版本或摘要；Proposal、ADR 和可观测性设计沿用影响、决策和观测语义；具有正式身份的模块或组件可以实现功能特性。优先扩展现有关系代码的合法端点，只有语义确实缺失时才新增关系代码。

服务特性可以映射 BIZ 能力或流程，功能特性可以映射 SYS 服务或组件，但 Feature 仍是设计资产，不转化为 3A 单元。

### 5. 原子 MCP Change Set

主写入操作是 `apply_feature_change_set`，一次请求可新增或更新服务特性、功能特性及其有类型关系。请求必须携带精确 Scope、设计变更会话、关联 ID、幂等键、预期版本和有数量上限的资产/关系集合。

`dryRun` 执行与正式写入相同的授权、本地化、契约、身份、关系、并发和预算校验，但不落库。正式执行在同一 PostgreSQL 事务中提交规范资产、修订、图节点、当前关系、关系事件、审计和持久 Outbox。搜索与派生图只由提交事件触发失效或排队，不参与权威事务。

英文缺失、中文不完整、ID 冲突、预期版本过期、端点缺失、跨 Scope、端点类型非法、重复或自关联、关系代码未注册、Payload 过大或超预算都会被拒绝。任一失败整体回滚，并返回稳定错误码和有界逐项详情。幂等重放返回原回执，不新增修订或事件。

MCP 为 Web 和显式诊断提供有界详情、列表、图和覆盖读取；Agent 理解系统仍必须先评估知识就绪度，再读取有界系统知识，不能用直接 Feature 查询绕过门禁。

### 6. 派生治理状态

人工维护的生命周期与计算得到的交付事实分离：生命周期为草稿、有效、已弃用或已退役；覆盖状态为未映射、部分或完整；证据状态为无证据、已实现或已验证；一致性状态为未知、一致、漂移或过期。

覆盖度按特性类型及其必要关系计算，并非每个功能特性都必须有 API 或持久数据。实现与验证证据必须绑定当前 Feature 版本/内容摘要、仓库提交、命令结果和验证时间；旧证据不能产生已验证状态。漂移与覆盖、证据彼此独立。退役通过关系事件失效现行关系，不能物理删除仍被引用的 Feature，历史修订和证据在授权下继续可查。

### 7. Web 只读体验

特性工作区提供精确 Scope 下分页的服务/功能特性列表、双语详情、覆盖与一致性指标，以及有边界的关系图，不提供编辑控件。图默认展开“服务特性到功能特性到一级关联资产”，实体、字段、架构映射和技术实现按需展开。图支持 WebGL、拖动、缩放、平移、类型过滤、本地化标签、关系解释和影响路径高亮；查询预算禁止一次加载整个 Scope。

### 8. 系统知识与下游使用

就绪评估通过后，Feature 摘要及当前关系水位进入有边界系统知识。Context Pack、需求评估、影响分析和设计实现对账只能通过版本化契约消费 Feature，并保留精确 Scope 和证据来源。

需求由此可以追踪到服务特性、功能特性、契约/规则/数据/行为以及实现证据。覆盖缺失、证据过期、Scope 拒绝或投影不可用必须明确报告，不能显示为零影响或知识完整。

### 9. 交付阶段

- **P0：** 核心类型与本地化、关系本体、原子 Change Set、PostgreSQL 事务与幂等、有界 MCP 详情/列表读取及聚焦契约/隔离测试。
- **P1：** 搜索投影、Web 列表/详情/图、覆盖计算、双语界面、有边界图交互与浏览器验收。
- **P2：** 系统知识接入、Context Pack 与需求评估消费、实现证据和漂移对账。

每个阶段都需要新的精确 Scope 实施会话、匹配的 ADR/Proposal/Context Pack 更新、MCP 同步、聚焦证据和对账。本文不声明任何阶段已经实现。

### 10. 验收与失败标准

P0 必须证明合法混合 Feature 批次原子提交，非法本地化、并发、本体、身份、授权和 Scope 情况整体回滚，幂等重放稳定，PostgreSQL 继续权威。P1 还必须证明分页 Scope 读取、完整双语渲染、可用的有边界图交互，并且无跨 Scope 数字或节点。P2 还必须证明系统知识受就绪门禁控制、证据绑定当前版本、派生状态可解释、漂移可检测，且投影失败不被解释为权威数据丢失。

错误必须区分授权拒绝、Scope 不匹配、校验失败、版本冲突、超预算、端点缺失、关系违规、投影不可用、证据过期和内部事务失败；响应不得泄露无权访问的资产身份或内容。

### 11. 未采用方案

没有采用单一 `feature` 类型加字符串 Payload 子类型，因为索引筛选和类型约束较弱；没有建立两张 Feature 专表，因为会复制现有资产生命周期；没有采用资产和关系分次独立写入，因为部分成功会产生残缺图；没有采用严格父子树，因为功能特性可以支撑多个服务特性。

### 12. 业界参考

参考来源包括 ISO/IEC/IEEE 29148 在 OMG SysML 问题记录中的 Feature 解释、SEBoK 功能定义与分解、ITU-T Q.1290 的可复用 Feature 定义，以及 OASIS SOA 服务功能模型，链接见英文部分。
