# ADR-0047: First-Class Service And Functional Feature Assets

## Status

Accepted design; implementation has not started.

- Stable ADR ID: `adr-first-class-feature-assets`.
- Proposal: `proposal-first-class-feature-assets` (`reviewing`).
- Context Pack: `context-pack-first-class-feature-assets`.
- Owner: SpecForge Product Architecture and Design Governance.
- Scope: `com.huawei.celon.desiner`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design session: `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`.
- Specification: `docs/superpowers/specs/2026-09-02-first-class-feature-assets-design.md`.

## Context

SpecForge can govern contracts, rules, data, behavior, architecture, decisions, changes, and evidence, but it lacks a first-class value-to-function layer. Requirements cannot currently trace through a stakeholder-visible outcome to the functional behaviors and implementation assets that deliver it. Treating Feature as a label, 3A unit, API alias, or strict tree would lose independent identity, reuse, versioning, and impact semantics.

## Decision

1. Add `serviceFeature` and `functionalFeature` as two concrete types in the independent conceptual Feature asset family, using the existing scoped `DesignAsset` lifecycle rather than new tables.
2. Define Service Feature as an externally visible, stakeholder-valued outcome and Functional Feature as an independently verifiable system behavior. English canonical content and structurally complete Chinese overlays are mandatory.
3. Own every Feature in one exact application-service Scope. Permit same-Scope many-to-many `FunctionalFeature --CONTRIBUTES_TO--> ServiceFeature` relationships; defer cross-Scope reuse to a separately governed template/reference design.
4. Relate Functional Features to APIs, events, rules, state machines, quality requirements, data models/entities/fields, implementation identities, decisions, proposals, observations, and current-version evidence through the typed relationship ontology. Feature-to-3A mappings do not turn Features into architecture units.
5. Make `apply_feature_change_set` the primary MCP write boundary. It supports dry-run, idempotency, optimistic concurrency, bounded batches, stable errors, and one PostgreSQL transaction across authored assets, revisions, graph nodes, relationship events, audit, and Outbox.
6. Keep the Web Feature workspace read-only. Provide scoped pagination, bilingual details, and a bounded interactive relationship graph.
7. Separate authored lifecycle from computed coverage, evidence, and consistency dimensions. Verification evidence is valid only for the current Feature version/content digest.
8. Deliver in P0 core governance, P1 Web/search/coverage, and P2 system-knowledge/downstream reconciliation increments. Each requires its own implementation preflight, evidence, MCP synchronization, and reconciliation.

## Consequences

- Positive: requirements gain an explicit, queryable path from value through system behavior to contracts, data, implementation, and evidence.
- Positive: same-Scope reuse avoids duplicate Functional Features without weakening isolation.
- Positive: atomic Change Sets prevent partially persisted Feature graphs.
- Tradeoff: the asset type union, localization maps, repository catalog, ontology, projections, MCP contracts, Web navigation, and downstream consumers must all evolve together.
- Tradeoff: derived delivery truth requires version-bound evidence and cannot be inferred reliably from relationship presence alone.
- Deferred: cross-Scope Feature reuse, enterprise templates, automated implementation discovery, and production-scale graph certification require separate decisions.

## Alternatives

- A single `feature` type with a subtype inside the current string payload was rejected because subtype filtering and constraints would be weak.
- Dedicated ServiceFeature and FunctionalFeature tables were rejected because they duplicate the established authored-asset lifecycle.
- Independent asset and relationship writes were rejected because partial success creates inconsistent graphs.
- Strict parent-child composition was rejected because a Functional Feature may contribute to multiple Service Features.

## Evidence

- Industry review used the OMG summary of ISO/IEC/IEEE 29148, SEBoK function definitions, ITU-T Feature terminology, and the OASIS SOA service-functionality model; the sources support external value, functional decomposition, and reusable capability, while confirming that the exact two-type taxonomy must be explicit in SpecForge.
- `rg` inspection of `prisma/schema.prisma`, `packages/core/src/types.ts`, and `packages/core/src/relationships/ontology.ts` confirmed the existing generic `DesignAsset`, canonical-English/localized-overlay contract, exact-Scope identity, and typed relationship ledger.
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner ...` returned OPEN session `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`, read 463 scoped assets, and recorded reconciliation `UNVERIFIED` rather than blocked.
- `pnpm exec vitest run scripts/sync-design-facts.test.ts scripts/reconcile-design-facts.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'` passed 2 files and 33 tests for the synchronization and reconciliation contracts.
- `$env:SPECFORGE_DESIGN_FACT_IDS='first-class-feature-assets'; pnpm design-facts:sync` returned `complete` for `adr-first-class-feature-assets`; the first attempted write was rejected without partial persistence until the Chinese ADR arrays matched the canonical structure.
- `$env:SPECFORGE_DESIGN_FACT_IDS='first-class-feature-assets'; pnpm design-facts:check` returned no missing, mismatched, out-of-Scope, or blocked records and verified `first-class-feature-assets`.
- No implementation or runtime verification is claimed by this ADR.

## Constraints

- MCP remains the only Feature write boundary; Web remains read-only.
- PostgreSQL remains authoritative; graph and search stores remain derived projections.
- Direct Feature reads cannot bypass system-knowledge readiness enforcement for Agent understanding.
- Missing, stale, denied, or unavailable evidence is reported explicitly and never converted to zero impact or verified status.
- Repository and MCP records must share stable IDs and exact Scope before this design is considered synchronized.

## 中文本地化覆盖内容

### 标题

一等服务特性与功能特性资产

### 状态

设计已接受，尚未开始实现。稳定 ADR、Proposal、Context Pack、负责人、精确 Scope、设计会话和规格路径见文首元数据。

### 背景

SpecForge 已能治理契约、规则、数据、行为、架构、决策、变更和证据，但缺少连接价值与功能的一等设计层。需求目前无法从利益相关方可感知的结果追踪到交付它的功能行为和实现资产。把 Feature 当成标签、3A 单元、API 别名或严格树结构都会丢失独立身份、复用、版本和影响语义。

### 决策

1. 将 `serviceFeature` 和 `functionalFeature` 作为独立 Feature 概念资产族的两种具体类型，复用现有 Scope `DesignAsset` 生命周期，不新建专表。
2. 服务特性表示外部可见且具有利益相关方价值的结果；功能特性表示可独立验证的系统行为。英文规范内容与结构完整的中文覆盖均为强制要求。
3. 每个 Feature 归属一个精确应用服务 Scope；允许同 Scope 内多对多的“功能特性贡献到服务特性”关系；跨 Scope 复用延期到独立治理的模板/引用设计。
4. 通过关系本体把功能特性连接到 API、事件、规则、状态机、质量需求、模型/实体/字段、实现身份、决策、提案、观测和当前版本证据。Feature 到 3A 的映射不会把它变成架构单元。
5. 以 `apply_feature_change_set` 作为主要 MCP 写入边界，支持预演、幂等、乐观并发、有界批次、稳定错误，并在一个 PostgreSQL 事务中提交资产、修订、图节点、关系事件、审计和 Outbox。
6. Web 特性工作区保持只读，提供 Scope 分页、双语详情和有边界交互关系图。
7. 将人工生命周期与计算得到的覆盖、证据和一致性维度分离；验证证据只有绑定当前 Feature 版本/摘要时才有效。
8. 分 P0 核心治理、P1 Web/搜索/覆盖和 P2 系统知识/下游对账交付；每阶段都需要独立实施预检、证据、MCP 同步和对账。

### 后果

- 需求可以从价值明确追踪到系统行为、契约、数据、实现和证据。
- 同 Scope 复用减少功能特性重复，同时不削弱隔离。
- 原子 Change Set 防止残缺 Feature 图。
- 资产类型、本地化、目录、关系本体、投影、MCP、Web 和下游消费者需要协同演进。
- 交付事实依赖绑定版本的证据，不能只凭存在关系就可靠推导。
- 跨 Scope 复用、企业模板、自动实现发现和生产规模图认证分别延期决策。

### 备选方案

- 未采用 Payload 内隐藏子类型的单一 `feature`，因为筛选和约束较弱。
- 未建立两张 Feature 专表，因为会复制现有资产生命周期。
- 未采用资产和关系分次写入，因为部分成功会形成不一致图。
- 未采用严格父子组合，因为一个功能特性可以贡献到多个服务特性。

### 证据

- 业界审阅使用 OMG 对 ISO/IEC/IEEE 29148 的摘要、SEBoK 功能定义、ITU-T Feature 术语和 OASIS SOA 服务功能模型；这些来源支持外部价值、功能分解和可复用能力，同时确认 SpecForge 必须明确自己的二类特性定义。
- 对 `prisma/schema.prisma`、`packages/core/src/types.ts` 和 `packages/core/src/relationships/ontology.ts` 的只读检查确认现有通用资产、英文规范字段与中文覆盖、精确 Scope 身份和关系账本。
- 精确 Scope 预检返回 OPEN 会话 `design-change-session:8c02a714-28d0-49bd-8154-77d26adc42e1`，读取 463 条资产，最近对账为 `UNVERIFIED` 而非阻塞。
- 设计事实同步与对账脚本的 2 个测试文件、33 项测试全部通过。
- 仅选择 `first-class-feature-assets` 的 MCP 同步返回 `complete`；首次写入因中文 ADR 数组结构不匹配而被无部分落库地拒绝，修正后成功。
- 同一设计事实的对账结果中缺失、不匹配、越 Scope 和阻塞均为零，并验证 `first-class-feature-assets`。
- 本 ADR 不声明任何实现或运行验证已经完成。

### 约束

- Feature 只能通过 MCP 写入，Web 保持只读。
- PostgreSQL 保持权威，图和搜索只作为派生投影。
- Agent 不能使用直接 Feature 查询绕过系统知识门禁。
- 缺失、过期、拒绝或不可用证据必须明确报告，不能转换为零影响或已验证状态。
- 仓库与 MCP 记录只有在稳定 ID 与精确 Scope 匹配后才算同步。
