# Unified 3A Knowledge Initialization And Derived Knowledge Layers

## Status

**Accepted. The profile-neutral knowledge foundation and Phase 1 Baseline path are implemented, locally verified, synchronized through MCP, and read back in the exact Scope. Derived 3A projections and later enterprise hardening remain deferred.**

- Stable ADR/MCP ID: `adr-unified-3a-knowledge-initialization`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Proposal: `proposal-unified-3a-knowledge-initialization`
- Context Pack: `context-pack-unified-3a-knowledge-initialization`

## Context

Enterprise initialization must recover business, system, and technical architecture without assuming one company-specific methodology. The same implementation evidence can support several architectural claims, claims may conflict, and organization or analysis profiles may change independently from the underlying facts. A monolithic document or one mutable assertion per concept would erase provenance and make later reconciliation unsafe.

## Decision

Model Business Architecture, System Architecture, and Technical Architecture as three governed perspectives over one exact-Scope knowledge stream. Keep Evidence, Source Observation, Semantic Candidate, Knowledge Assertion, ReviewBundle, PromotionDecision, ChangeSet, Baseline, and Projection Manifest as distinct records. Multiple assertions may share one semantic identity when their evidence, source, confidence, or validity differs; disagreement remains visible until review resolves it.

Organization profiles map enterprise hierarchy and terminology. Analysis profiles select perspective, grouping, and rendering. Neither profile changes canonical facts. The generic core must work without a Huawei profile. English remains canonical and accepted human-facing records require a complete Chinese overlay.

Promotion is MCP-only and fail-closed. It validates exact Scope, evidence, identity, localization, risk, and actor separation, then writes canonical assets and typed relationships atomically in PostgreSQL. A durable reconciliation receipt proves the promoted records agree with the finalized Scan Session and ChangeSet. Only a converged receipt can publish an immutable Baseline. Business, System, and Technical Knowledge Layers, Context Packs, reports, and graph views are reproducible projections pinned to a Baseline and profile version.

Phase 1 implements the generic contracts, source-minimized scanning, semantic candidate review, atomic promotion, reconciliation, and Baseline publication. Phase 2 introduces deterministic 3A projections. Phase 3 expands connectors and continuous observation. Phase 4 adds CodeHub/CI enforcement. Phase 5 covers enterprise migration, object storage, graph projection, and billion-scale certification.

## Alternatives

1. **Store one mutable architecture document.** Rejected because it loses per-fact provenance, conflict, identity, and incremental review.
2. **Make 3A layers independent systems of record.** Rejected because the layers would drift and duplicate facts.
3. **Embed the Huawei profile in the core ontology.** Rejected because enterprise-specific hierarchy and terminology are not universal semantics.
4. **Overwrite lower-confidence assertions.** Rejected because conflicting evidence must remain visible and auditable.
5. **Publish a Baseline directly from approved candidates.** Rejected because canonical persistence and typed links require durable reconciliation first.
6. **Use the graph database as the authored fact store.** Rejected because PostgreSQL provides the authoritative transactional and audit boundary; graph stores are derived.

## Consequences

- One fact stream can produce consistent Business, System, and Technical views.
- Profiles can evolve without rewriting canonical facts.
- Conflicting assertions remain traceable instead of being silently overwritten.
- Context Packs and reports can pin exact Baseline and profile versions.
- Partial scans, blocked reviews, failed promotion, and failed reconciliation leave the active Baseline unchanged.
- Phase 1 is useful without waiting for graph storage or 3A visualization.
- Projection schemas and profile migration require explicit versioning and compatibility policies.
- Complete billion-scale behavior remains a separate certification program, not an inference from the 100,000-observation test.

## Constraints

- The generic core must initialize a non-Huawei and non-DDD fixture without loading a Huawei profile.
- Every record and relationship is bound to one exact application-service Scope.
- Evidence, observations, candidates, assertions, accepted facts, and projections must never be conflated.
- Canonical identity is deterministic; ambiguous identity blocks automatic promotion.
- English is canonical and accepted human-facing content requires complete Chinese localization.
- Promotion and publication are MCP-governed operations; direct authored PostgreSQL writes are forbidden.
- PostgreSQL remains authoritative; graph and 3A Knowledge Layers are rebuildable projections.
- Projection manifests pin Baseline ID, profile ID/version, schema version, source revisions, and relationship version.
- Phase 2-5 capabilities remain deferred until separately implemented, verified, synchronized, and read back.

## Evidence

- **Foundation and Phase 1 implementation:** Commits through `226cae8` implement the profile-neutral contracts, exact-Scope persistence, deterministic scanner, semantic review, identity matching, risk policy, atomic promotion, reconciliation, and immutable Baseline publication.
- **Stage verification:** `pnpm legacy-baseline:verify` exited `0`; the report records all ten stages as `PASSED`, including 155 Core tests, focused MCP tests, PostgreSQL integration, real signed-binary E2E, 100,000-observation scale, typecheck, and production build.
- **Failure semantics:** Focused unit, integration, E2E, and scale tests verify that coverage gaps, unsafe input, Scope mismatch, actor conflict, ambiguous identity, batch overflow, promotion mismatch, and non-converged reconciliation fail closed without replacing the previous Baseline.
- **Storage semantics:** Promotion tests verify one PostgreSQL transaction for canonical assets, typed links, Evidence, relationship/federation outboxes, ChangeSet, and receipt; graph state remains derived.
- **Deferred boundary:** No test or record in this increment claims delivered 3A projection rendering, live enterprise connectors, CodeHub enforcement, production object storage, or billion-scale certification.
- **MCP closure evidence:** Full synchronization returned 16 `complete` decisions; MCP read-back returned 16 `verified` decisions with no missing, mismatched, out-of-Scope, or blocked records; exact-Scope federation reconciliation returned `blocking:false` with no issues.

## MCP Record

- Matching ADR: `adr-unified-3a-knowledge-initialization`
- Matching Proposal: `proposal-unified-3a-knowledge-initialization`
- Matching Context Pack: `context-pack-unified-3a-knowledge-initialization`
- Related decisions: `adr-agent-driven-legacy-baseline-discovery` and `adr-federated-design-fact-synchronization`
- Related authoritative assets: `data-specforge-assets`, `data-specforge-asset-graph`, and `api-specforge-mcp-tools`
- Relationship policy: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` related assets and decisions; Evidence `VALIDATES` ADR.

## Chinese Localization

### 标题

统一 3A 知识初始化与派生知识层

### 背景

企业初始化需要恢复业务架构、系统架构和技术架构，同时不能假设某一种企业专属方法。相同实现证据可以支持多个架构断言，断言之间可能冲突，组织 Profile 和分析 Profile 也可能独立于底层事实演进。单一大文档或每个概念只有一个可变断言会丢失来源，并使后续对账变得不安全。

### 决策

把业务架构、系统架构和技术架构建模为同一个精确 Scope 知识流上的三个受治理视角。Evidence、Source Observation、Semantic Candidate、Knowledge Assertion、ReviewBundle、PromotionDecision、ChangeSet、Baseline 和 Projection Manifest 必须保持为不同记录。同一语义身份可以具有多条断言，只要其证据、来源、置信度或有效期不同；冲突在评审解决前保持可见。

组织 Profile 映射企业层级和术语，分析 Profile 选择视角、分组和呈现方式，二者都不能修改规范事实。通用核心必须在没有华为 Profile 的情况下运行。英文是规范内容，正式面向人的记录必须具有完整中文覆盖。

提升只能通过 MCP 执行并且必须失败关闭。提升过程校验精确 Scope、证据、身份、本地化、风险和角色分离，然后在 PostgreSQL 中原子写入规范资产及有类型关系。持久化对账回执证明提升结果与已完成扫描会话和 ChangeSet 一致；只有已收敛回执才能发布不可变 Baseline。业务、系统和技术知识层、Context Pack、报告和图视图都是固定到 Baseline 与 Profile 版本的可重现投影。

第一阶段实现通用契约、源码最小化扫描、语义候选评审、原子提升、对账和 Baseline 发布。第二阶段实现确定性 3A 投影。第三阶段扩展连接器和持续观察。第四阶段增加 CodeHub/CI 门禁。第五阶段完成企业迁移、对象存储、图投影和亿级认证。

### 备选方案

1. **存储一个可变架构文档。** 拒绝，因为会丢失逐事实来源、冲突、身份和增量评审能力。
2. **让三个 3A 层分别成为记录源。** 拒绝，因为各层会漂移并重复事实。
3. **把华为 Profile 固化到核心本体。** 拒绝，因为企业层级和术语不是通用语义。
4. **用高置信断言覆盖低置信断言。** 拒绝，因为冲突证据必须保持可见和可审计。
5. **从已批准候选直接发布 Baseline。** 拒绝，因为规范持久化和有类型关系必须先经过持久对账。
6. **使用图数据库作为编写事实的记录源。** 拒绝，因为 PostgreSQL 承担权威事务和审计边界，图存储仅为派生结果。

### 后果

- 一个事实流可以产生一致的业务、系统和技术视图。
- Profile 可以演进而不重写规范事实。
- 冲突断言保持可追溯，不会被静默覆盖。
- Context Pack 和报告可以固定精确 Baseline 与 Profile 版本。
- 部分扫描、阻塞评审、提升失败和对账失败不会改变活动 Baseline。
- 第一阶段无需等待图存储或 3A 可视化即可投入使用。
- 投影 Schema 和 Profile 迁移需要显式版本与兼容策略。
- 完整亿级行为需要独立认证，不能从 10 万条观察测试直接推断。

### 约束

- 通用核心必须在不加载华为 Profile 的情况下初始化非华为、非 DDD Fixture。
- 每条记录和关系只能属于一个精确应用服务 Scope。
- Evidence、观察、候选、断言、正式事实和投影绝不能混为一体。
- 规范身份必须确定；身份歧义会阻止自动提升。
- 英文是规范内容，正式面向人的内容必须具有完整中文本地化。
- 提升和发布是 MCP 治理操作，禁止直接向 PostgreSQL 写入编写事实。
- PostgreSQL 保持权威，图和 3A 知识层是可重建投影。
- 投影清单必须固定 Baseline ID、Profile ID/版本、Schema 版本、源修订和关系版本。
- 第二至第五阶段必须在独立实现、验证、同步和回读前保持延期状态。

### 证据

- **基础与第一阶段实现：** 截至 `226cae8` 的提交实现了 Profile 无关契约、精确 Scope 持久化、确定性扫描器、语义评审、身份匹配、风险策略、原子提升、对账和不可变 Baseline 发布。
- **阶段验证：** `pnpm legacy-baseline:verify` 退出码为 `0`；报告对全部十个阶段记录为 `PASSED`，包括 155 项 Core 测试、MCP 定向测试、PostgreSQL 集成、真实签名二进制端到端、10 万条观察规模、类型检查和生产构建。
- **失败语义：** 单元、集成、端到端和规模测试证明覆盖缺口、不安全输入、Scope 不匹配、角色冲突、身份歧义、批次超限、提升不匹配和未收敛对账都会失败关闭，并保留之前的 Baseline。
- **存储语义：** 提升测试证明规范资产、有类型关系、Evidence、关系/联邦 Outbox、ChangeSet 和回执在一个 PostgreSQL 事务中提交；图状态保持派生。
- **延期边界：** 本增量没有任何测试或记录声称已经交付 3A 投影呈现、实时企业连接器、CodeHub 门禁、生产对象存储或亿级认证。
- **MCP 闭环证据：** 完整同步返回 16 项 `complete` 决策；MCP 回读返回 16 项 `verified` 决策，且无缺失、不匹配、越界或阻塞记录；精确 Scope 联邦对账返回 `blocking:false` 且无问题。

### MCP 记录

- 匹配 ADR：`adr-unified-3a-knowledge-initialization`
- 匹配 Proposal：`proposal-unified-3a-knowledge-initialization`
- 匹配 Context Pack：`context-pack-unified-3a-knowledge-initialization`
- 相关决策：`adr-agent-driven-legacy-baseline-discovery`、`adr-federated-design-fact-synchronization`
- 相关权威资产：`data-specforge-assets`、`data-specforge-asset-graph`、`api-specforge-mcp-tools`
- 关系策略：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 相关资产与决策；Evidence `VALIDATES` ADR。
