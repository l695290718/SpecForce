# ADR-0041: Evidence-Driven Requirement Assessment Center

## Status

Accepted design for Phase 1 under the exact Designer Scope. This record registers the design facts; implementation remains a separate governed increment.

## Context

SpecForge stores scoped design assets, typed relationships, 3A mappings, ownership, and reconciliation evidence. Those facts become materially useful when a requirement can be evaluated against a reproducible, authorized catalog slice. Asset counts or unconstrained model prompts cannot establish feasibility, impact, human effort, or AI execution cost.

The product needs one versioned assessment that serves product managers, architects, and coding Agents. Role views may emphasize different details, but the verdict, evidence, estimates, revision, and Scope must remain identical. Phase 1 uses natural-language intake, bounded structured questions, one primary implementation Agent, one independent review Agent, a MockAIProvider, and no real model call.

Design evidence must remain distinct from implementation evidence. Code ownership, repository mappings, test coverage, deployment topology, runtime capacity, and historical delivery outcomes are later evidence required before code-level feasibility or calibrated prediction can be claimed.

## Decision

1. Use a hybrid, evidence-driven assessment. AI decomposes intent, matches semantics, proposes options, and explains conclusions. Deterministic rules own authorization, exact-Scope isolation, blocking ADRs, invariants, state-transition legality, contract compatibility, quality thresholds, reconciliation, and mandatory coverage. AI cannot invent evidence or raise a deterministic confidence cap.
2. Persist a durable asynchronous `RequirementAssessmentRun` with idempotency, checkpoints, lease and heartbeat fencing, cancellation, bounded retries, and resume. Stages are `QUEUED`, `RESOLVING_EVIDENCE`, `WAITING_FOR_EVIDENCE`, `WAITING_FOR_PROJECTION`, `ANALYZING`, `ESTIMATING`, `REVIEWING`, `COMPLETE`, `FAILED`, `CANCELLATION_REQUESTED`, and `CANCELLED`.
3. Freeze an immutable `AssessmentEvidenceSnapshot` containing exact Scope, authorization reference, catalog and relationship waterlines, projection checkpoint, ordered asset and relationship revisions, ruleset and coverage revisions, prompt and review-template digests, Model Profile revision, Agent Execution Profile revision, and aggregate content digest.
4. Publish one versioned report with `FEASIBLE`, `CONDITIONAL`, `BLOCKED`, or `INSUFFICIENT_EVIDENCE`, confidence, evidence coverage, direct and indirect impact, blockers, assumptions, unknowns, options, work breakdown, human planning and risk-adjusted ranges, AI Work Units, model-specific Token ranges, review findings, freshness, and evidence references.
5. Separate planning ranges from calibrated percentiles. Phase 1 emits `planningRange` and `riskAdjustedRange` with `HEURISTIC` calibration. `P50/P90` is forbidden until representative samples and backtesting pass. Without a compatible Model Profile, emit AI Work Units and no fabricated Token or cost value.
6. Keep `ModelProfile` and `AgentExecutionProfile` separate. The former describes model identity, capability, context limits, pricing assumptions, cache behavior, and calibration. The latter describes Agent roles, selected models, tools, context assembly, budgets, retries, repair loops, concurrency, verification commands, stop conditions, and overrun policy.
7. Make stale assessments unusable for implementation. An accepted assessment becomes `STALE` when affected evidence changes, the brief is superseded, a blocking ADR or rule changes, reconciliation is blocked, or the evidence waterline expires. Preserve `invalidatedBy`, `invalidatedAt`, and `validAtWaterline`; implementation preflight rejects stale results.
8. Fail closed and degrade explicitly. Unauthorized Scope access returns no target content. Missing critical evidence yields `INSUFFICIENT_EVIDENCE`. PostgreSQL remains authoritative; graph outage may use bounded PostgreSQL relationship reads only when the same evidence contract is satisfied. Untrusted repository content and imported documents cannot override governance, Scope, tools, budgets, or exemptions.
9. Keep formal authoring behind MCP. Accepting an assessment does not authorize implementation or mutate formal assets. Proposal, ADR, Context Pack, and typed-link writes remain behind the exact-Scope MCP boundary, and implementation requires a separate Design Change Session.

## Alternatives

1. Pure rules: rejected because they cannot decompose ambiguous intent or explain useful semantic options.
2. Pure AI: rejected because it is difficult to reproduce, audit, scope, and fail closed when evidence is missing or contradictory.
3. Hybrid evidence-driven assessment: selected because deterministic policy protects hard boundaries while AI adds semantic interpretation and option generation.

## Consequences

- Feasibility becomes evidence-backed and can explicitly return `INSUFFICIENT_EVIDENCE`.
- Impact analysis can produce a bounded work breakdown across design, code, migration, compatibility, testing, rollout, rollback, documentation, and governance.
- Provider-neutral AI Work Units and versioned profiles make AI execution cost comparable; Token estimates remain conditional.
- Immutable evidence snapshots and waterlines make historical reports auditable and reproducible.
- Phase 1 can assess architecture and design feasibility, but not code-level feasibility, calibrated delivery accuracy, or production capacity without later evidence.
- Persistence, workers, MCP, Web, and reconciliation implementation are required; this ADR is the design gate, not a feature completion claim.

## Constraints

- All records belong to exact Scope `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL is authoritative for authored assessments, snapshots, actuals, and relationship events; graph stores remain derived projections.
- Phase 1 uses `MockAIProvider`; `OpenAIProvider` remains unconfigured.
- Phase 1 does not train a proprietary prediction model, promise an exact date, guarantee a Token bill, perform implicit cross-Scope aggregation, or connect every external platform.
- Phase 2 adds governed repository, code, ownership, contract/schema, deployment, and selected runtime evidence.
- Phase 3 calibrates against persisted execution actuals, monitors drift, and publishes P50/P90 only after representative samples and backtesting.
- MCP synchronization, read-back, and implementation preflight are separate completion gates.

## Evidence

- Approved implementation plan: `docs/superpowers/plans/2026-08-26-requirement-assessment-center.md`.
- Initial preflight returned `DESIGN_CONTEXT_FACT_NOT_FOUND` because the new IDs were not registered; retry is triggered by successful synchronization and reconciliation.
- Focused manifest tests and `git diff --check` are the Task 1 repository checks.

## MCP Record

- ADR: `adr-requirement-assessment-center`
- Proposal: `proposal-requirement-assessment-center`
- Context Pack: `context-pack-requirement-assessment-center`
- Managed facts: `api-specforge-requirement-assessment`, `data-specforge-requirement-assessment`, `data-specforge-assessment-evidence-snapshot`, `data-specforge-model-profile`, `data-specforge-agent-execution-profile`, `rule-specforge-assessment-acceptance`, `quality-specforge-assessment-confidence`.

## 中文本地化覆盖

### 背景

SpecForge 已经维护按 Scope 隔离的设计资产、有类型关系、3A 映射、负责人和对账证据。只有当需求能够基于可复现且经过授权的目录切片进行评估时，这些记录才具有决策价值。第一阶段使用自然语言输入、有界结构化追问、一个主实施 Agent、一个独立审查 Agent 和 MockAIProvider，不接入真实模型。代码归属、仓库映射、测试覆盖、部署拓扑、运行容量和历史交付结果属于后续实现证据。

### 决策

1. 采用证据驱动的混合评估，AI 负责意图拆解、语义匹配、方案生成和解释；确定性规则负责授权、精确 Scope、阻断项、契约、质量、对账和证据覆盖。
2. 持久化可恢复的异步 `RequirementAssessmentRun`，支持幂等、检查点、租约、取消、重试和恢复。
3. 冻结绑定精确 Scope、目录/关系水位、资产修订、规则修订、Prompt 摘要、模型档案和执行档案的不可变 `AssessmentEvidenceSnapshot`。
4. 所有角色共享一份包含可行性、覆盖率、影响、阻塞项、未知项、工作拆分、人工区间、AI Work Units、Token 区间、审核发现和证据引用的有版本报告。
5. 第一阶段只输出 `planningRange` 和 `riskAdjustedRange`，校准状态为 `HEURISTIC`；没有代表性样本和回测前禁止 P50/P90，没有兼容 Model Profile 时不伪造 Token 或费用。
6. 拆分 `ModelProfile` 与 `AgentExecutionProfile`，分别描述模型能力与 Agent 工作流、工具、预算、审核和执行假设。
7. 证据变化、需求替代、阻断性 ADR/规则变化、对账阻塞或水位过期时，已接收评估变为 `STALE`，实施预检必须拒绝使用。
8. 未授权 Scope 不返回目标内容，关键证据缺失返回 `INSUFFICIENT_EVIDENCE`；PostgreSQL 保持权威，图投影不可用时只能在满足同一证据契约的情况下回退到有界关系读取。
9. 正式 Proposal、ADR、Context Pack 和有类型关系仍必须通过精确 Scope 的 MCP 写入；接受评估不等于授权实施。

### 备选方案

1. 纯规则评估：否决，因为不能可靠拆解含糊意图，也不能提供有价值的语义方案比较。
2. 纯 AI 评估：否决，因为证据缺失或矛盾时难以复现、审计、限定范围和失败关闭。
3. 证据驱动的混合评估：采纳，确定性策略保护硬边界，AI 负责语义理解和方案生成。

### 后果

- 需求可行性变为有证据支持的判断，证据不足时明确返回 `INSUFFICIENT_EVIDENCE`。
- 影响分析能够覆盖设计、代码、迁移、兼容、测试、发布、回滚、文档和治理工作。
- 通过 AI Work Units 以及有版本的模型/执行档案，AI 执行成本可以比较。
- 不可变证据快照和水位让历史报告可审计、可复现。
- 第一阶段不能声称代码级可行性、校准后的交付准确度或生产容量。
- 后续仍需实现持久化、Worker、MCP、Web 和对账能力。

### 约束

- 所有记录属于精确 Scope `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- PostgreSQL 对评估、快照、实际执行结果和关系事件保持权威，图数据库仅为派生投影。
- 第一阶段使用 `MockAIProvider`，`OpenAIProvider` 保持未配置。
- 第二阶段增加仓库、代码、负责人、契约/Schema、部署和选定运行证据；第三阶段基于实际执行值校准并在回测后发布 P50/P90。
- MCP 同步、回读和实施预检是独立完成门禁。

### 证据

- 已批准实施计划：`docs/superpowers/plans/2026-08-26-requirement-assessment-center.md`。
- 新事实集合的首次精确 Scope 预检因事实尚未登记返回 `DESIGN_CONTEXT_FACT_NOT_FOUND`；同步和对账完成后重试。
- manifest 聚焦测试和 `git diff --check` 是 Task 1 的仓库检查。
