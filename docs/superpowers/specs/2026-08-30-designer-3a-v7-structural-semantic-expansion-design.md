# Designer 3A v7 Structural Semantic Expansion Design

## Status

- Design approved for specification; implementation has not started.
- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Written-design session: `design-change-session:4cb5f6c8-c471-45d6-911e-f6fac2420696`.
- Preflight design-context digest: `865eefd12d68ed7e1bea2dfe0f572128502253009eda7e8cda0b3ef4e9b1dc65`.
- English is canonical. Chinese is the complete human-facing localization.

## Context

The published Designer v6 structural Baseline contains 8 architecture units, 42 direct memberships, and 6 cross-layer mappings. It established trustworthy publication mechanics and several explicit system boundaries, but it is intentionally narrow: one business capability and one technology unit carry most of the Scope. The separate enterprise coverage generation reaches all 307 selected authored facts, yet coverage does not turn every fact into a structural architecture unit.

The next increment must make the architecture useful for change decisions and impact analysis rather than merely adding nodes to a diagram. It therefore expands the semantic skeleton across Business Architecture (BIZ), System Architecture (SYS), and Technology Architecture (TECH), while keeping authored design assets as the evidence-bearing source of truth.

Fourteen current asset-to-3A mapping results are `BLOCKED` because terminal coverage identifiers and structural member identifiers use different identity forms, such as `data-specforge-assets` and `dataModel:specforge-assets`. These are identity-consistency defects, not evidence that fourteen new architecture units are required. They must be repaired independently before v7 publication.

SpecForge is an online design-asset management platform. Every application-service Scope owns its design assets, architecture knowledge, 3A Baselines, projections, and dashboards independently. Platform schemas, MCP governance, projection algorithms, and analysis methods are reusable; concrete architecture units and design facts are not inherited across Scopes. An authorized Agent may read multiple Scopes, but v7 authoring and publication remain exact-Scope operations.

## Goals

- Expand the Designer Scope from the narrow v6 structure toward a balanced semantic skeleton of up to 6 BIZ, 12 SYS, and 5 TECH units.
- Preserve valid v6 unit identities where their responsibility remains semantically valid.
- Generate evidence-bound architecture candidates only when an authorized Agent explicitly starts the analysis through MCP.
- Keep generated candidates separate from the authoritative Baseline until review, promotion, reconciliation, and immutable publication succeed.
- Make asset-to-unit membership, BIZ-to-SYS realization, and SYS-to-TECH dependency decisions traceable to exact design assets and typed relationships.
- Repair the known identity mismatch before v7 publication so mapping status is not distorted by identifier formatting.
- Preserve v6 as an immutable, readable historical Baseline and fail closed to v6 whenever v7 cannot be published atomically.
- Provide complete canonical English and Chinese human-facing content for every candidate, decision, review explanation, and publication record.

## Non-Goals

- Automatically creating 3A architecture whenever an asset is written.
- Treating the target unit counts as quotas or fabricating evidence to reach them.
- Inferring authoritative structure from names, source paths, graph proximity, clustering, or implementation files alone.
- Copying, inheriting, or merging concrete architecture units from another Scope.
- Providing a cross-Scope aggregate architecture Baseline or comparison view in this increment.
- Replacing PostgreSQL authority with a graph database; graph data remains a derived projection.
- Reclassifying coverage, governance, localization, or evidence records as structural units merely to increase graph density.
- Implementing continuous legacy scanning or external connector synchronization as part of v7.

## Considered Approaches

### 1. Capability-first, Agent-initiated, evidence-constrained expansion

An authorized Agent explicitly requests analysis through MCP. The system reads the exact-Scope catalog, typed relationships, current Baseline, and reconciliation state, then proposes a bounded candidate structure. Every candidate and relationship carries evidence, confidence, and unresolved questions. Review and promotion precede publication. This is the selected approach because it balances architecture usefulness with governance and auditability.

### 2. Graph clustering as the architecture authority

Cluster all design assets by relationship density and publish the clusters as units. Rejected because graph proximity is correlation, not architectural intent; dense governance records would also dominate the result and produce unstable boundaries.

### 3. Split only the overloaded v6 units

Decompose the MCP Governance Gateway and PostgreSQL Authority while leaving the rest unchanged. Rejected because it optimizes the current shape rather than modeling the product's business capabilities, system responsibilities, and technology services coherently.

### 4. Fixed 6/12/5 target

Require all 23 proposed units to be published. Rejected because a unit without sufficient evidence would become an invented design fact. The counts are candidate ceilings and balance targets, not completion metrics.

## Candidate Architecture Structure

The following set is the maximum v7 candidate structure. A candidate enters the published Baseline only when the evidence and validation rules in this specification pass. Existing stable identities are retained where noted.

### Business Architecture Candidates

| Unit identity | Canonical name | Chinese name | Responsibility |
| --- | --- | --- | --- |
| `unit:biz:specforge-governed-design-facts` | Governed Design Asset Management | 受治理的设计资产管理 | Author, review, reconcile, publish, and query trustworthy scoped design assets. Existing v6 identity retained. |
| `unit:biz:specforge-architecture-knowledge-management` | Architecture Knowledge Management | 架构知识管理 | Organize 3A knowledge, semantic units, Baselines, projections, and architecture navigation. |
| `unit:biz:specforge-change-decision-agent-context-governance` | Change Decision And Agent Context Governance | 变更决策与 Agent 上下文治理 | Supply governed design context, attest changes, and keep implementation decisions aligned with design facts. |
| `unit:biz:specforge-legacy-system-knowledge-onboarding` | Legacy System Knowledge Onboarding | 存量系统知识接入 | Turn existing-system observations into reviewable semantic candidates without automatic authority. |
| `unit:biz:specforge-impact-requirement-intelligence` | Impact And Requirement Intelligence | 影响与需求智能分析 | Assess feasibility, impact, effort, risk, and AI execution cost from governed architecture knowledge. |
| `unit:biz:specforge-enterprise-integration-compliance` | Enterprise Integration And Compliance | 企业集成与合规治理 | Govern authorized cross-Scope contracts, external integrations, auditability, and policy compliance. |

### System Architecture Candidates

| Unit identity | Canonical name | Chinese name | Primary responsibility |
| --- | --- | --- | --- |
| `unit:sys:specforge-web-console` | SpecForge Web Console | SpecForge Web 控制台 | Human-facing scoped navigation, review, architecture visualization, and operational workflows. Existing v6 identity retained. |
| `unit:sys:specforge-mcp-governance-gateway` | MCP Governance Gateway | MCP 治理网关 | Exact-Scope MCP write boundary, authorization, validation, idempotency, and governed operation dispatch. Existing v6 identity retained. |
| `unit:sys:specforge-design-catalog-relationship-service` | Design Catalog And Relationship Service | 设计目录与关系服务 | Authoritative catalog access, typed relationship lifecycle, identity lookup, and scoped relationship validation. |
| `unit:sys:specforge-3a-projection-service` | 3A Knowledge And Projection Service | 3A 知识与投影服务 | Architecture-fact lifecycle, Baseline publication, projection build, and 3A query preparation. Existing v6 identity retained with refined semantics. |
| `unit:sys:specforge-asset-graph-query-service` | Asset Graph And Impact Query Service | 资产图与影响查询服务 | Bounded relationship traversal, architecture mapping, impact analysis, and query budgets. Existing v6 identity retained. |
| `unit:sys:specforge-ai-generation-service` | AI Generation Service | AI 生成服务 | Provider-neutral generation of proposals, ADRs, rules, tests, Context Packs, and analysis candidates. Existing v6 identity retained. |
| `unit:sys:specforge-scan-intake-baseline-discovery-service` | Scan Intake And Baseline Discovery Service | 扫描接入与基线发现服务 | Receive scan observations, establish inventory waterlines, and prepare reviewable initial knowledge. |
| `unit:sys:specforge-connector-orchestration-service` | Connector Orchestration Service | 连接器编排服务 | Coordinate external repositories and enterprise systems without granting them direct authored-data authority. |
| `unit:sys:specforge-requirement-assessment-service` | Requirement Assessment Service | 需求评估服务 | Produce feasibility, effort, impact, risk, and token estimates from exact-Scope evidence. |
| `unit:sys:specforge-federation-reconciliation-service` | Federation And Reconciliation Service | 联邦与对账服务 | Reconcile authorized external or cross-Scope candidates and preserve source ownership and verification state. |
| `unit:sys:specforge-agent-context-attestation-service` | Agent Context And Attestation Service | Agent 上下文与变更证明服务 | Deliver bounded L0/L1/L2 design context and validate signed change attestations. |
| `unit:sys:specforge-mcp-audit-observability-service` | MCP Audit And Observability Service | MCP 审计与可观测服务 | Record governed operations, Outbox activity, evidence, failures, and operational health. Existing v6 identity retained with refined semantics. |

### Technology Architecture Candidates

| Unit identity | Canonical name | Chinese name | Responsibility |
| --- | --- | --- | --- |
| `unit:tech:specforge-postgresql-authority` | PostgreSQL Authoritative Store | PostgreSQL 权威存储 | Authoritative persistence for authored assets, relationships, governance records, and publication state. Existing v6 identity retained. |
| `unit:tech:specforge-derived-graph-projection-runtime` | Derived Graph Projection Runtime | 派生图投影运行时 | Replaceable graph projection and traversal acceleration; never the authored-data authority. |
| `unit:tech:specforge-worker-execution-runtime` | Worker Execution Runtime | Worker 执行运行时 | Durable asynchronous execution, retry, scheduling, and projection/scan job isolation. |
| `unit:tech:specforge-mcp-protocol-runtime` | MCP Protocol Runtime | MCP 协议运行时 | Provider-neutral transport and protocol runtime used by coding Agents and enterprise clients. |
| `unit:tech:specforge-cryptographic-trust-service` | Cryptographic Trust Service | 密码学信任服务 | Token verification, signature validation, key rotation, and change-attestation trust anchors. |

## Candidate Analysis And Publication Lifecycle

### Explicit initiation

No asset write automatically authors or republishes 3A structure. An authorized Agent must explicitly start a candidate analysis for one exact application-service Scope. The implementation introduces `analyze_3a_architecture_candidates` as the single candidate-generation entry point. It extends the existing governance lifecycle and does not create a direct publication shortcut.

The request includes the exact `architectureScope`, current official Baseline identity, analysis intent, optional bounded asset selection, and an idempotency key. The Agent's token may authorize multiple Scopes, but each invocation targets exactly one Scope.

### Evidence snapshot

The analysis reads a fixed snapshot of:

- the exact-Scope design catalog and canonical/localized content;
- typed relationships and their relationship version;
- the latest official v6 Baseline and READY projection;
- the latest coverage generation and mapping results;
- current reconciliation status and catalog waterline;
- relevant ADRs, Proposals, Context Packs, rules, contracts, data models, APIs, events, quality records, and evidence records.

The analysis snapshot is identified by a content digest. Candidate review becomes stale if the catalog, relationship version, Baseline, or relevant reconciliation state changes before promotion.

### Candidate set

The result is persisted as an independent, exact-Scope Candidate Set. It contains proposed unit revisions, direct memberships, BIZ-to-SYS realizations, SYS-to-TECH dependencies, retained v6 identities, excluded candidates, confidence, evidence references, unresolved questions, and validation issues.

Candidate generation may rank or suggest decisions with AI, graph analysis, and deterministic rules. None of those mechanisms grants authority. Names, graph paths, and source layout are supporting signals only; accepted design assets and typed relationships remain the evidence boundary.

### MCP contract and Candidate Set state

The minimum MCP surface is:

- `analyze_3a_architecture_candidates`: validates the exact Scope and official source Baseline, captures the evidence snapshot, and idempotently creates or returns a Candidate Set.
- `get_3a_architecture_candidate_set`: reads one authorized Candidate Set with its candidates, exclusions, evidence, issues, waterlines, and review eligibility.
- Existing `create_knowledge_review_bundle`, `decide_knowledge_review_bundle`, `promote_3a_architecture_facts`, `publish_knowledge_baseline`, and `request_3a_projection_build` operations remain the only route from candidate to official Baseline.

A Candidate Set stores its stable ID, exact Scope, source Baseline, catalog digest, relationship version, design-context digest, candidate revisions, exclusions, issues, evidence references, actor, timestamps, and content digest. Its lifecycle is `GENERATING -> READY | BLOCKED`; a relevant source-waterline change moves `READY` to `STALE`; review moves `READY` to `APPROVED | REJECTED`; successful promotion moves `APPROVED` to `PROMOTED`. State changes are audited and cannot overwrite an immutable content digest. Candidate status never substitutes for Baseline `PUBLISHED` status.

### Review and promotion

The Candidate Set enters the existing T1 knowledge-governance path:

1. Create a complete ReviewBundle bound to the Design Change Session and evidence snapshot.
2. Validate scope, identity, bilingual content, evidence, membership uniqueness, cross-layer closure, and source waterlines.
3. Record approved, rejected, and unresolved candidate revisions explicitly.
4. Promote only approved architecture-fact revisions through MCP.
5. Require exact-Scope reconciliation status `CONVERGED`.
6. Publish `knowledge-baseline:designer:3a:v7` as a complete immutable snapshot.
7. Build and publish the v7 3A projection, enterprise coverage projection, and asset-to-3A mapping generation.
8. Read back the published result through the public MCP architecture queries before closing the implementation session.

Direct database writes, partial Baseline publication, and implicit approval are forbidden.

## Identity Consistency Repair

Before Candidate Set approval, the implementation must normalize the fourteen known terminal-to-member identity mismatches through an explicit, deterministic identity resolution rule. The repair must not mutate historical v6 revisions or silently rewrite authored asset IDs.

The canonical asset identity is the exact pair of asset type and stable asset ID. Coverage terminal references and structural memberships must resolve to that pair through a versioned adapter or canonical identity field. Legacy display forms such as `dataModel:<id>` may remain readable aliases, but they cannot define a second logical asset.

Acceptance requires zero mapping `BLOCKED` results caused by the known formatting mismatch. A genuinely missing, ambiguous, unauthorized, or semantically unresolved asset may still be `BLOCKED`, but it must use a distinct reason code and evidence.

## Structural Semantics And Validation Rules

### Unit evidence

- Every published unit has at least one accepted exact-Scope design asset as evidence.
- A unit definition includes canonical English name and description, complete Chinese localization, layer, kind, responsibility, evidence references, and revision identity.
- A candidate without sufficient evidence remains excluded or unresolved; it is never published to satisfy a count target.

### Membership

- An asset has exactly one primary structural membership in a Baseline.
- Additional trace or coverage mappings are allowed but cannot masquerade as primary membership.
- Conflicting primary memberships block the affected candidates; the system never chooses silently.
- Governance and evidence assets may trace to structural members without becoming architecture units themselves.

### Cross-layer closure

- Every published SYS unit realizes at least one BIZ unit through explicit accepted evidence.
- Every published TECH unit is used by at least one SYS unit through explicit accepted evidence.
- Same-layer relationships remain visible in the detailed Network view and are not converted into cross-layer realization mappings.
- Unsupported BIZ-to-TECH shortcuts are not created.

### Scope and authorization

- Candidate analysis, review, promotion, Baseline publication, and projection publication all use the same exact Scope.
- An Agent authorized for several application services invokes the lifecycle independently for each Scope.
- Cross-Scope evidence is allowed only through an explicit authorized integration contract and remains externally owned; it cannot become a local primary membership.
- Error responses do not disclose assets or counts from unauthorized Scopes.

### Versioning and compatibility

- v6 remains immutable, official, and queryable by its pinned Baseline and projection identities.
- Semantically valid v6 unit identities are retained in v7; new responsibilities receive new stable identities.
- v7 is a complete snapshot, not a runtime delta over v6.
- A failed v7 attempt leaves v6 as the latest known-good Baseline.
- Projection and coverage generation identities remain immutable and content-addressed.

## Failure Handling

- Missing evidence, bilingual content, relationship targets, exact-Scope authorization, or official source Baseline blocks Candidate Set readiness.
- Ambiguous identity, duplicate primary membership, unsupported realization, or orphan TECH/SYS units block promotion.
- A changed catalog digest, relationship version, Baseline, or reconciliation state marks the review stale and requires re-analysis or explicit reconciliation.
- A failed promotion, reconciliation, Baseline publication, or projection publication cannot expose a partially current v7.
- Retry uses stable idempotency keys and either returns the identical result or fails with an immutable-content conflict.
- Failures are written to audit and Outbox records with owner, reason, evidence, and retry trigger.
- Any unresolved MCP persistence failure is recorded as `MCP synchronization blocked`; completion cannot be claimed.

## Verification Strategy

Verification is performed once after the implementation stage rather than after every small edit.

- Contract tests validate the candidate request, exact-Scope authorization, idempotency, snapshot digest, and stale-review behavior.
- Unit tests validate layer/kind pairs, bilingual requirements, stable IDs, identity normalization, membership uniqueness, and cross-layer closure.
- Integration tests exercise Candidate Set persistence, ReviewBundle evaluation, approval/rejection, promotion, reconciliation, immutable v7 publication, and failure rollback.
- Readback tests compare PostgreSQL authority, MCP Baseline queries, projection manifests, 3A Map/Network queries, coverage results, mapping results, and Agent Context Pack references.
- Regression tests pin v6 at 8 units, 42 memberships, and 6 mappings and prove it remains readable and unchanged.
- UI checks verify the v7 architecture is navigable without treating coverage-only records as structural units.
- Design-fact reconciliation verifies matching repository and MCP IDs, bilingual overlays, typed links, exact Scope, and closing evidence.

## Acceptance Criteria

- An authorized Agent can explicitly request a bounded v7 candidate analysis through MCP for the exact Designer Scope.
- Candidate results are persisted independently and never become authoritative without T1 review, promotion, and `CONVERGED` reconciliation.
- The candidate set evaluates up to 6 BIZ, 12 SYS, and 5 TECH units; only evidence-complete units are published.
- Every published SYS unit realizes at least one BIZ unit, and every published TECH unit is used by at least one SYS unit.
- Every primary member appears exactly once; conflicting membership fails closed.
- Existing valid v6 unit identities remain stable, and v6 remains queryable as 8/42/6.
- The fourteen known identity-format mismatches no longer produce mapping `BLOCKED` results.
- v7 publishes atomically as an immutable complete Baseline with READY projections and consistent MCP readback.
- English canonical content and complete Chinese human-facing localization are present for all new decisions and review content.
- Repository specification, ADR/Proposal/Context Pack records created during implementation, MCP facts, typed links, evidence, and Design Change Session IDs reconcile without missing, mismatched, out-of-scope, or blocked entries.

## Deferred Follow-Ups

- Cross-Scope aggregate architecture views and comparison remain deferred until separately designed with explicit authorization and disclosure controls.
- Continuous legacy scanning, connector delivery, and external APPLY remain separate federation increments.
- Candidate quality evaluation across multiple enterprise applications requires real adoption evidence and is not claimed by the Designer-only v7 rollout.

## 中文本地化覆盖

### 状态与背景

- 设计已批准进入书面 Spec，尚未开始实施。
- 所属应用服务为 `com.huawei.celon.desiner`。
- 所属 Scope 路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- 书面设计会话为 `design-change-session:4cb5f6c8-c471-45d6-911e-f6fac2420696`。
- 预检设计上下文摘要为 `865eefd12d68ed7e1bea2dfe0f572128502253009eda7e8cda0b3ef4e9b1dc65`。

Designer 已发布的 v6 结构基线包含 8 个架构单元、42 个直接成员归属和 6 条跨层映射。它已经证明治理发布机制和若干系统边界有效，但结构仍然偏窄：一个业务能力和一个技术单元承载了 Scope 中的大部分内容。独立的企业覆盖生成已经覆盖 307 条选定设计事实，但“被覆盖”不等于“成为结构架构单元”。

v7 的目的不是简单增加图节点，而是形成可支撑变更决策和影响分析的 BIZ、SYS、TECH 三层语义骨架。设计资产及其有类型关系仍是架构结论的证据来源。

当前 14 条资产到 3A 映射因身份格式不一致而 `BLOCKED`，例如覆盖终点使用 `data-specforge-assets`，结构成员使用 `dataModel:specforge-assets`。这是身份一致性缺陷，不代表需要新增 14 个架构单元，必须在 v7 发布前独立修复。

SpecForge 是在线设计资产管理平台。每个应用服务 Scope 独立拥有自己的设计资产、架构知识、3A 基线、投影和仪表盘。平台 Schema、MCP 治理、投影算法和分析方法可以复用，但具体架构单元和设计事实不能跨 Scope 继承。Agent 即使被授权读取多个 Scope，v7 的编写和发布仍必须逐个精确 Scope 执行。

### 目标与非目标

v7 将 Designer Scope 扩充到最多 6 个 BIZ、12 个 SYS 和 5 个 TECH 候选单元。现有 v6 单元在职责仍成立时保留稳定身份。只有获得授权的 Agent 通过 MCP 显式发起分析时，系统才生成候选；普通设计资产写入不得自动编写或发布 3A。

候选必须与权威基线隔离，经过审核、晋升、对账和不可变发布后才可生效。成员归属、BIZ 到 SYS 的实现关系、SYS 到 TECH 的依赖关系都必须回溯到精确设计资产和有类型关系。v6 保持不可变、可查询；v7 任一环节失败时继续使用 v6。

本设计不把 6/12/5 当作必须凑齐的指标，不根据名称、源码路径、图聚类或实现文件直接推断权威架构，不从其他 Scope 复制或继承具体架构单元，不提供跨 Scope 聚合基线，也不把图数据库变成权威存储。持续存量扫描和外部连接器同步仍属于后续独立增量。

### 方案选择

采用“能力优先、Agent 显式发起、证据约束”的方案。Agent 通过 MCP 指定一个精确 Scope，系统读取固定水位的设计目录、有类型关系、当前基线和对账状态，形成带证据、置信度和未决问题的候选结构。候选必须先审核再晋升发布。

不采用图聚类作为权威，因为图邻近只表示相关性，治理记录还可能扭曲聚类结果；不只拆分 v6 中过载的单元，因为那无法形成完整的产品能力和系统职责模型；不强制发布全部 23 个候选，因为证据不足的单元不能成为设计事实。

### 候选架构结构

BIZ 候选包括：受治理的设计资产管理、架构知识管理、变更决策与 Agent 上下文治理、存量系统知识接入、影响与需求智能分析、企业集成与合规治理。

SYS 候选包括：SpecForge Web 控制台、MCP 治理网关、设计目录与关系服务、3A 知识与投影服务、资产图与影响查询服务、AI 生成服务、扫描接入与基线发现服务、连接器编排服务、需求评估服务、联邦与对账服务、Agent 上下文与变更证明服务、MCP 审计与可观测服务。

TECH 候选包括：PostgreSQL 权威存储、派生图投影运行时、Worker 执行运行时、MCP 协议运行时、密码学信任服务。

`unit:biz:specforge-governed-design-facts`、Web Console、MCP 治理网关、3A 投影、资产图查询、AI 生成、MCP 审计和 PostgreSQL 权威存储等语义仍成立的 v6 单元保留稳定身份；新增职责使用新的稳定 ID。候选数量是结构上限，不是发布配额。

### 候选分析与发布生命周期

Agent 必须通过 MCP 显式发起单个应用服务 Scope 的候选分析。请求包含精确 `architectureScope`、当前官方基线、分析意图、可选的有界资产范围和幂等键。一个 Token 可以授权多个 Scope，但每次调用只能操作一个 Scope。

分析读取固定快照：精确 Scope 的设计目录、中英文内容、有类型关系和关系版本、v6 官方基线与 READY 投影、最新覆盖生成与映射结果、对账状态、目录水位，以及相关 ADR、Proposal、Context Pack、规则、契约、数据模型、API、事件、质量与证据记录。快照通过内容摘要标识；审核期间相关水位变化会使候选过期。

结果作为独立 Candidate Set 持久化，包含候选单元修订、直接成员、BIZ 到 SYS 的实现、SYS 到 TECH 的依赖、保留的 v6 身份、排除项、置信度、证据、未决问题和校验问题。AI、图分析和确定性规则都只能用于建议，不能自动取得权威地位。

实施新增 `analyze_3a_architecture_candidates` 作为唯一候选生成入口，负责校验精确 Scope 和官方源基线、固定证据快照，并通过幂等键创建或返回 Candidate Set；新增 `get_3a_architecture_candidate_set` 用于授权回读候选、排除项、证据、问题、水位和审核资格。候选转为官方基线仍只能使用现有 `create_knowledge_review_bundle`、`decide_knowledge_review_bundle`、`promote_3a_architecture_facts`、`publish_knowledge_baseline` 和 `request_3a_projection_build` 治理链路。

Candidate Set 持久化稳定 ID、精确 Scope、源基线、目录摘要、关系版本、设计上下文摘要、候选修订、排除项、问题、证据、操作者、时间和内容摘要。状态机为 `GENERATING -> READY | BLOCKED`；相关源水位变化使 `READY` 进入 `STALE`；审核使 `READY` 进入 `APPROVED | REJECTED`；成功晋升使 `APPROVED` 进入 `PROMOTED`。状态变化必须审计，不能覆盖不可变内容摘要；Candidate 状态不能替代 Baseline 的 `PUBLISHED` 状态。

候选进入现有 T1 知识治理链路：创建绑定设计变更会话的完整 ReviewBundle，校验 Scope、身份、双语、证据、归属唯一性、跨层闭环和水位；明确记录通过、拒绝和未决候选；仅通过 MCP 晋升批准的架构事实；要求精确 Scope 对账为 `CONVERGED`；发布完整不可变的 `knowledge-baseline:designer:3a:v7`；随后构建 v7 3A 投影、企业覆盖投影和资产到 3A 映射，并通过公共 MCP 查询回读。禁止直接写数据库、部分发布和隐式批准。

### 身份修复与结构规则

实现必须通过显式、确定性、版本化的身份解析规则修复 14 条已知格式不一致。规范资产身份是资产类型与稳定资产 ID 的精确组合。`dataModel:<id>` 等历史展示形式可以保留为可读别名，但不能形成第二个逻辑资产。修复不得修改历史 v6 修订，也不得静默重写已编写资产 ID。

每个发布单元至少有一项已接受的精确 Scope 设计资产作为证据，并具备英文规范名称和描述、完整中文覆盖、层级、类型、职责、证据与修订身份。每项资产只能有一个主要结构归属，可以存在多个辅助 Trace 或 Coverage 映射；主要归属冲突必须阻断，系统不能静默选择。

每个 SYS 单元至少通过明确证据实现一个 BIZ 单元；每个 TECH 单元至少被一个 SYS 单元使用。同层关系继续在 Network 视图展示，不能伪造成跨层映射，也不能创建无证据的 BIZ 到 TECH 捷径。治理和证据资产可以追踪到结构成员，但不必成为架构单元。

候选分析、审核、晋升、基线发布和投影发布必须使用同一精确 Scope。跨 Scope 证据只能通过获得授权的显式集成契约读取，并保持外部所有权，不能成为本地主要成员。错误响应不得泄露未授权 Scope 的资产或数量。

### 版本兼容与失败处理

v6 保持不可变、官方和可按固定基线与投影查询。v7 是完整快照，不是运行时叠加在 v6 上的增量。投影与覆盖生成身份继续保持不可变和内容寻址。v7 失败时，v6 仍是最后已知可用基线。

缺失证据、双语内容、关系目标、精确 Scope 权限或官方源基线会阻止候选就绪。身份歧义、重复主要归属、无证据实现关系、孤立 SYS/TECH 单元会阻止晋升。目录摘要、关系版本、基线或对账状态变化会使审核过期，必须重新分析或显式对账。

晋升、对账、基线发布或投影发布失败时，不能暴露半完成的 v7。重试使用稳定幂等键，只能返回完全相同的结果，否则以不可变内容冲突失败。失败必须进入审计和 Outbox，记录负责人、原因、证据和重试触发条件。MCP 持久化未解决时必须记录 `MCP synchronization blocked`，不能声明完成。

### 验证与验收

实施阶段结束后统一验证，不在每个小编辑后频繁重复。契约测试覆盖候选请求、精确 Scope 授权、幂等、快照摘要和过期审核；单元测试覆盖层级/类型、双语、稳定 ID、身份规范化、归属唯一性和跨层闭环；集成测试覆盖 Candidate Set、ReviewBundle、批准/拒绝、晋升、对账、不可变 v7 发布和失败回退。

回读测试需要比较 PostgreSQL 权威记录、MCP 基线查询、投影清单、3A Map/Network 查询、覆盖结果、映射结果和 Agent Context Pack 引用。回归测试固定 v6 为 8/42/6，并证明仍可读且未变化。页面验证确保 v7 可导航，并且覆盖记录不会被错误显示为结构单元。设计事实对账必须保证仓库和 MCP 的 ID、中英文、关系、Scope、证据与会话一致。

最终验收要求：授权 Agent 可以通过 MCP 为精确 Designer Scope 显式请求有界候选分析；候选独立持久化，在 T1 审核、晋升和 `CONVERGED` 对账前不具备权威性；最多评估 6 BIZ、12 SYS、5 TECH，仅发布证据完整单元；每个 SYS 实现至少一个 BIZ，每个 TECH 被至少一个 SYS 使用；主要成员不重复；v6 稳定可按 8/42/6 查询；14 条已知身份格式问题不再导致 `BLOCKED`；v7 原子发布为完整不可变基线并具有 READY 投影；所有新增人类可读内容具备英文规范和完整中文覆盖；仓库记录与 MCP 事实、关系、证据和会话对账无缺失、无不匹配、无越界、无阻塞。

### 延期事项

跨 Scope 聚合架构视图和对比能力继续延期，等待独立的授权与披露控制设计。持续存量扫描、连接器交付和外部 APPLY 仍是独立联邦增量。跨多个企业应用评估候选质量需要真实使用证据，不能由 Designer 单 Scope 的 v7 发布宣称完成。
