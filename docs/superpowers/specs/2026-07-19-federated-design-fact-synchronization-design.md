# Federated Design-Fact Synchronization

## Status

Approved design. Implementation remains pending.

- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Purpose

SpecForge must govern design facts for both itself and external systems. Existing systems must be able to join without an initial code change, establish a trustworthy baseline from observable evidence, and then keep implementation and design aligned through controlled bidirectional synchronization.

The system is a federated design-fact control plane, not a universal last-writer-wins database. It preserves source ownership, Scope isolation, provenance, review history, and implementation evidence while presenting one queryable design graph through MCP.

## Goals

- Onboard an existing application service through read-only connectors.
- Discover APIs, data models, events, dependencies, deployment facts, and evidence from supported sources.
- Keep inferred facts separate from accepted design facts until policy permits promotion.
- Detect additions, removals, modifications, broken mappings, and semantic conflicts continuously.
- Support controlled outbound proposals without directly mutating legacy systems by default.
- Bind repository changes, MCP records, implementation evidence, and synchronization state to stable identities.
- Prove consistency per application-service Scope and block completion when required facts drift.

## Non-Goals

- Automatically infer undocumented business intent with authoritative status.
- Directly change production databases or deployed systems during initial onboarding.
- Treat every connected source as equally authoritative.
- Provide cross-application-service reads without explicit data-dimension authorization.
- Deliver every connector and every outbound execution mode in the first implementation slice.

## Architectural Decision

Adopt a connector-based federated synchronization architecture with five bounded capabilities:

1. **Connector Runtime** authenticates to external systems and exposes capability-declared discovery, observation, proposal, and optional apply operations.
2. **Discovery Pipeline** normalizes external observations into candidate design facts with provenance and confidence.
3. **Identity and Authority Service** maps external identities to stable SpecForge assets and resolves field-level ownership policy.
4. **Reconciliation Engine** compares accepted facts, observed facts, and previous synchronization state without mutating either side during a check.
5. **Change Orchestrator** manages Design Change Sessions, durable delivery through an Outbox, reviewed promotions, outbound proposals, and completion gates.

MCP remains the only authored system-of-record write boundary for accepted SpecForge facts. PostgreSQL remains authoritative for authored assets, candidate facts, mappings, policies, conflicts, synchronization state, Outbox records, and audit events. Graph databases remain derived projections for traversal and impact analysis.

## Connector Contract

Every connector declares its supported capabilities rather than pretending to be fully bidirectional:

| Capability | Meaning | Default permission |
| --- | --- | --- |
| `DISCOVER` | Perform an initial bounded inventory scan | Allowed with read authorization |
| `OBSERVE` | Detect incremental external changes | Allowed with read authorization |
| `PROPOSE` | Produce a patch, pull request, migration proposal, or equivalent review artifact | Explicit opt-in |
| `APPLY` | Mutate an external system after approval | Disabled by default |

The initial connector set should cover Git repositories, OpenAPI documents, and PostgreSQL schema metadata. Later connectors may cover event registries, CMDB, CI/CD, runtime traces, and other design platforms through the same contract.

A connector never decides architectural truth. It emits source observations and optional outbound proposals. Authority and promotion are governed centrally.

## Existing-System Onboarding

An existing system follows this workflow:

1. Register the enterprise hierarchy and exact application-service Scope.
2. Grant a service identity the minimum connector permissions for that Scope.
3. Configure one or more read-only connector instances.
4. Run a dry discovery scan and persist an immutable scan snapshot.
5. Normalize observations and match them to stable asset identities.
6. Place unmatched or changed observations in a Candidate Fact workspace.
7. Auto-accept only high-confidence facts allowed by an explicit policy; route all others to review.
8. Freeze the reviewed set as Baseline version 1.
9. Start incremental observation from connector-specific checkpoints.

The initial scan never silently publishes inferred business semantics. API routes, database columns, constraints, and source-code references may be high-confidence technical facts. Business meanings, ownership, rules, and architectural intent remain candidates unless supported by authoritative documents or explicit approval.

## Canonical Fact Envelope

Every accepted fact, candidate fact, and observation uses a common envelope:

- stable SpecForge asset identity;
- exact `architectureScope` and owning application service;
- asset type and schema version;
- English canonical human-facing fields; accepted human-facing facts require a complete Chinese localization overlay, while raw observations may retain source-language content until promotion;
- technical payload kept language-neutral;
- source system, connector instance, external identity, external version, and source timestamp;
- normalized content digest and observation timestamp;
- authority policy version, confidence, and promotion status;
- related Design Change Session and repository commit when applicable;
- typed relationships and evidence references.

External identities are mapped through a durable key consisting of connector instance, source namespace, external asset type, and external ID. Display names are never identity keys.

## Authority and Conflict Model

Authority is configurable by Scope, asset type, and field path. The default policy is:

- External implementation sources are authoritative for observable implementation facts such as routes, signatures, database structure, deployment versions, and runtime evidence.
- SpecForge is authoritative for ADRs, Proposals, business semantics, governance state, Chinese localization, and approved design intent.
- Shared descriptive fields and relationships require version-aware reconciliation.
- Concurrent changes to a shared or ambiguously owned field create a Conflict and block automatic promotion or outbound synchronization.

Resolution strategies are `ACCEPT_EXTERNAL`, `KEEP_SPECFORGE`, `MERGE`, and `REMAP_IDENTITY`. Every resolution records actor, reason, before/after digests, policy version, Scope, and timestamp.

Last-writer-wins is forbidden for governed design facts.

## Continuous Inbound Synchronization

Connectors may receive Webhooks, consume change streams, or perform scheduled scans. All methods produce idempotent Observation events with a connector checkpoint. The inbound path is:

`External change -> Observation -> Normalize -> Identity match -> Authority evaluation -> Candidate or accepted update -> Relationship projection -> Impact analysis`

An Observation may update an accepted fact automatically only when the field is externally authoritative, the identity match is unambiguous, the policy explicitly permits promotion, and all Scope checks pass. Otherwise it creates a candidate, drift item, or conflict.

Deletion is represented as a tombstone observation. It does not immediately erase historical design facts. Policy determines whether the asset becomes deprecated, removed, or conflicted.

## Controlled Outbound Synchronization

The default outbound mode is `PROPOSE`. A SpecForge design change generates a reviewable artifact appropriate to the target:

- Git patch or pull request for code and repository documents;
- OpenAPI patch for API contracts;
- migration proposal for database schema;
- change request for systems without a reviewable repository interface.

Each artifact carries the Design Change Session ID and expected target digest. After the external change is merged or applied, the connector observes the resulting implementation and the Reconciliation Engine verifies convergence. The Design Change Session closes only after that independent observation succeeds.

`APPLY` requires an explicit connector capability, Scope-specific authorization, an approved Change Session, optimistic concurrency against the expected target version, and a complete audit record. Production database mutation remains disabled by default.

## Design Change Sessions and Reliable Delivery

A non-trivial change opens a Design Change Session before authored facts or outbound proposals are modified. The session records Scope, actor or Agent identity, intent, affected facts, expected evidence, and lifecycle state.

Accepted MCP writes and synchronization commands produce durable Outbox entries in the same PostgreSQL transaction as their local state change. This extends the existing transactional Outbox contract with federation event types rather than creating a second delivery subsystem. Workers deliver events idempotently and retain retry history. A temporary connector outage does not lose the change, but required undelivered work keeps the session incomplete and blocks protected-branch completion.

The primary consistency key is a normalized content digest. Repository commit IDs are recorded as traceability metadata but are not the sole correctness key because pre-commit synchronization cannot know the final commit ID.

## Reconciliation and Consistency Proof

Reconciliation is read-only. It must never repair drift as a side effect of checking it.

The engine compares canonical facts, localized overlays, source observations, identity mappings, relationships, evidence, Scope, and connector checkpoints. It reports:

- `UNDECLARED_CHANGE`
- `MISSING_FACT`
- `CONTENT_DRIFT`
- `LOCALIZATION_DRIFT`
- `RELATIONSHIP_DRIFT`
- `EVIDENCE_DRIFT`
- `SCOPE_DRIFT`
- `IDENTITY_CONFLICT`
- `DELIVERY_BLOCKED`
- `SOURCE_UNREACHABLE`

Each Scope receives a deterministic reconciliation snapshot and Merkle root built from normalized fact digests. A root mismatch narrows recursively to changed assets; it does not replace per-fact diagnostics.

Local checks provide fast feedback. CI performs the authoritative read-only gate against the configured SpecForge environment. Protected branches reject missing Change Session references, unresolved blocking drift, incomplete evidence, missing bilingual human-facing content, or required undelivered Outbox records.

## Scope Isolation and Security

- Every connector instance belongs to one exact application-service Scope.
- Credentials are referenced through a secret provider and are never stored in design payloads.
- Discovery, observation, proposal, apply, conflict resolution, and cross-service reads are separately authorized.
- An Agent may read another application service only when granted the corresponding data-dimension permission.
- Connector workers receive the minimum source permissions needed for their declared capability.
- Raw source payload retention is configurable; normalized provenance and audit metadata remain mandatory.

## Failure Handling

- Transient source or network failures retry with bounded exponential backoff and preserve checkpoints.
- Invalid credentials or revoked authorization suspend the connector and create a blocking operational fact.
- Ambiguous identity matches never auto-merge.
- Out-of-Scope observations are rejected and audited.
- Schema-version incompatibility quarantines the observation without advancing its checkpoint.
- Partial scans do not replace a prior complete baseline.
- A failed outbound proposal or apply operation keeps the Change Session open and records the retry trigger.

## Scale and Operability

Observations and Outbox entries are append-oriented and partitionable by Scope, connector, and time. Candidate facts and active conflicts are query-optimized separately from immutable audit history. Reconciliation operates incrementally from checkpoints and digests; complete rescans are explicit recovery operations.

Operational metrics include connector freshness, scan duration, observation lag, candidate volume, conflict age, Outbox lag, reconciliation result, and per-Scope convergence status. No dashboard aggregates unauthorized Scope data.

## Delivery Decomposition

This architecture is delivered as four independently reviewable increments:

1. **Governance Core:** canonical envelope, Connector SPI, authority policy, candidate facts, identity mappings, Change Sessions, Outbox, and read-only reconciliation contracts.
2. **Legacy Baseline:** Git, OpenAPI, and PostgreSQL read-only discovery; dry-run inventory; candidate review; Baseline versioning.
3. **Continuous Inbound:** Webhook or polling checkpoints, incremental observations, drift detection, policy-controlled promotion, and impact analysis triggers.
4. **Controlled Outbound:** Git/OpenAPI `PROPOSE`, convergence verification, then optional connector-specific `APPLY` under stronger authorization.

The first implementation plan must cover only increment 1. Each later increment receives its own specification and implementation plan after the previous contracts are verified.

## Testing Strategy

- Contract tests verify every connector capability and normalized envelope.
- Golden fixtures verify deterministic normalization and digest generation.
- Property tests verify idempotency, checkpoint monotonicity, and stable identity mapping.
- Authorization tests prove exact Scope isolation and capability separation.
- Reconciliation tests cover every drift category and prove checks are read-only.
- Failure-injection tests cover retries, duplicate events, reordered events, partial scans, and unavailable sources.
- End-to-end tests onboard a fixture legacy service, approve a baseline, observe drift, generate a proposal, and verify convergence.

## Acceptance Criteria

- A legacy application service can be discovered without changing its source system.
- Initial observations remain candidates until authority policy permits promotion.
- Stable mappings prevent duplicate assets across repeated scans.
- External implementation drift is visible with provenance and impact links.
- SpecForge-originated changes produce reviewable outbound proposals by default.
- A Change Session cannot close until required synchronization and independent convergence checks succeed.
- Reconciliation detects content, localization, relationship, evidence, Scope, identity, and delivery drift without mutating data.
- CI can block protected-branch completion on governed inconsistency.

## Chinese Localization / 中文本地化

### 目的

SpecForge 不仅要治理自身设计事实，还要作为企业内外部系统的联邦式设计事实控制平面。存量系统无需先改代码，即可通过只读连接器完成扫描、建立可信基线，并在后续持续发现实现变化、设计漂移和影响范围。

### 核心决策

系统采用连接器架构，并将连接器能力拆分为 `DISCOVER`、`OBSERVE`、`PROPOSE` 和 `APPLY`。默认只启用只读发现和观察；SpecForge 的反向变更默认生成补丁、Pull Request、迁移提案或变更请求，不直接修改外部系统。`APPLY` 必须由具体连接器显式支持，并经过独立授权、审批和乐观并发检查。

MCP 仍然是正式设计事实的唯一写入边界。PostgreSQL 保存正式资产、候选事实、身份映射、权威策略、冲突、同步水位、Outbox 和审计记录；图数据库只保存用于影响分析的派生投影。

### 存量系统接入

存量应用首先注册精确的应用服务 Scope，然后配置 Git、OpenAPI、PostgreSQL 等只读连接器。首次扫描只生成不可变扫描快照和候选事实。系统根据稳定外部身份进行匹配，避免重复创建资产；高置信度技术事实只有在策略明确允许时才能自动接受，业务语义、所有权和架构意图默认需要审核。审核后的事实被冻结为第一版 Baseline，之后连接器从水位继续增量观察。

### 权威来源与冲突

权威规则可以按照 Scope、资产类型和字段路径配置。默认情况下，外部系统对实际 API 路由、签名、数据库结构、部署版本和运行证据负责；SpecForge 对 ADR、Proposal、业务语义、治理状态和中文翻译负责。共享字段发生并发变化或来源不明确时，系统创建 Conflict 并阻止自动覆盖，禁止对治理事实使用最后写入者获胜。

### 双向同步

外部变化通过 Observation、标准化、身份匹配、权威判断后，进入候选区、漂移列表或正式事实。删除以墓碑事件表达，不直接清除历史。SpecForge 发起的变化先生成带 Design Change Session ID 和目标摘要的评审产物；外部系统合并后，由连接器重新观察真实实现，只有再次对账收敛，变更会话才能关闭。

### 一致性保证

对账检查必须只读，不能在检查过程中自动修复。系统检查英文规范内容、中文翻译、关系、证据、Scope、身份映射和投递状态，并按 Scope 生成确定性的摘要树根。Git 提交号用于追踪，规范化内容摘要才是主要一致性依据。本地检查负责快速反馈，CI 对受保护主干执行权威门禁；缺少变更会话、存在阻断漂移、证据不完整、双语内容缺失或 Outbox 未完成时，禁止合入。

### 分阶段交付

第一阶段只实现治理核心：统一事实信封、连接器 SPI、候选事实、身份映射、字段级权威策略、变更会话、Outbox 和只读对账契约。后续分别实现存量扫描基线、持续入站同步，以及受控的 PR/提案回写。每一阶段独立设计、测试和评审。
