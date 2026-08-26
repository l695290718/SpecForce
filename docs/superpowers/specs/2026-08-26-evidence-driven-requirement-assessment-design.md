# Evidence-Driven Requirement Assessment Center Design

**Status:** Approved written design; implementation not started  
**Scope:** `com.huawei.celon.desiner`  
**Owner:** SpecForge Requirement Intelligence  
**Design session:** `design-change-session:786660d0-4029-4f5f-9b9a-189af77cbae8`

## Goal

Turn SpecForge's scoped design catalog into an evidence-driven decision system for incoming requirements. A product manager, architect, and coding Agent must consume one versioned assessment while seeing role-appropriate detail. The assessment determines feasibility, identifies impact, compares solution options, estimates human effort and AI execution cost, and preserves the evidence behind every material conclusion.

The first release accepts a natural-language requirement and asks bounded structured questions for missing goals, acceptance criteria, quality targets, exact application-service Scope, and exclusions. It uses one primary implementation Agent plus one independent review Agent as the standard execution profile.

## Product Principle

Design assets become valuable when they participate in every change decision rather than remaining passive documentation. The assessment therefore follows four rules:

1. AI may interpret requirements and compare options, but it cannot invent supporting evidence.
2. Deterministic policy evaluates hard constraints; model output cannot override authorization, ADRs, invariants, compatibility policy, or reconciliation blocks.
3. Every estimate is a range with confidence and uncertainty, never an unsupported point commitment.
4. PostgreSQL-authored facts remain authoritative. Graph and search services are bounded, rebuildable read projections.

## Users And Views

All roles read the same `RequirementAssessment` revision.

- The **product view** emphasizes feasibility, business impact, option differences, delivery ranges, risks, and questions requiring confirmation.
- The **architecture view** emphasizes typed relationships, 3A mappings, ADR constraints, compatibility, cross-Scope dependencies, evidence gaps, and trade-offs.
- The **Agent view** exposes a machine-readable task breakdown, allowed change boundary, prohibited outcomes, relevant code and design references, verification obligations, and Token budget.

Role views may suppress irrelevant detail but cannot alter the verdict, evidence, estimate, or revision identity.

## Architecture

### Assessment Orchestrator

Requirement assessment is an asynchronous, durable workflow rather than one synchronous model call. A `RequirementAssessmentRun` owns idempotency, stage checkpoints, lease and heartbeat fencing, cancellation, bounded retries, and resume from the last persisted stage. It reuses the operational semantics of the existing Impact Analysis Worker while keeping assessment-specific stages independent.

Run lifecycle:

```text
QUEUED -> RESOLVING_EVIDENCE -> ANALYZING -> ESTIMATING
       -> REVIEWING -> COMPLETE
```

`WAITING_FOR_EVIDENCE`, `WAITING_FOR_PROJECTION`, `FAILED`, `CANCELLATION_REQUESTED`, and `CANCELLED` cover non-happy paths. The run writes an immutable output revision only after a fenced stage transition; retries with the same idempotency key cannot create duplicate accepted assessments.

### Requirement Intake

Requirement Intake accepts natural-language intent and creates a versioned `RequirementBrief`. A bounded clarification flow fills only decision-critical gaps:

- desired business outcome;
- exact owning application-service Scope;
- acceptance criteria;
- quality and compliance targets;
- known deadlines or compatibility constraints;
- explicit exclusions.

Model-produced assumptions remain visibly distinct from user-confirmed facts. Intake never silently selects a default Scope.

### Evidence Resolver

The Evidence Resolver reads only authorized assets in the exact selected Scope. It gathers relevant capabilities, domains, data models, fields, APIs, events, state machines, business rules, quality requirements, integrations, ADRs, Proposals, Context Packs, 3A mappings, typed relationships, ownership, code references, runtime evidence, and reconciliation state.

Retrieval is bounded and reproducible. Every returned item carries a stable ID, revision, content digest, evidence source, and relevance reason. The resolver freezes an immutable `AssessmentEvidenceSnapshot` containing the catalog waterline, relationship-event waterline, projection checkpoint, ruleset version, ordered evidence manifest, prompt-template digest, Model Profile revision, and Agent Execution Profile revision. A top-level digest alone is not considered sufficient historical evidence.

Cross-Scope dependencies may be reported only through explicit authorization. An unauthorized dependency is represented as a redacted unresolved dependency and never leaks its identity or content. Phase 1 evaluates exactly one owning Scope; later authorized composition must join independently produced per-Scope sub-assessments rather than broadening one run's read boundary.

### Feasibility Engine

The Feasibility Engine combines deterministic constraints with model-assisted semantic reasoning.

Deterministic evaluation owns authorization, Scope isolation, blocking ADRs, business invariants, state-transition legality, contract compatibility, required quality thresholds, reconciliation status, and mandatory evidence coverage. The AI Provider owns requirement decomposition, semantic matching, option generation, and evidence-grounded explanation.

The verdict is one of:

- `FEASIBLE`: no known hard blocker and sufficient evidence supports an implementation path;
- `CONDITIONAL`: feasible only after explicit prerequisites or decisions are satisfied;
- `BLOCKED`: a known policy, dependency, permission, compatibility, or architectural constraint prevents delivery;
- `INSUFFICIENT_EVIDENCE`: critical facts are missing or stale, so the system cannot make a reliable decision.

Each verdict includes confidence, evidence coverage, blocking reasons, assumptions, unknowns, and freshness. Coverage is computed against a versioned requirement-kind evidence policy. For example, a breaking API change requires contract, caller, data, compatibility, test, quality, and ownership evidence. Missing mandatory categories deterministically cap confidence; model output cannot raise that cap.

### Impact Planner

The Impact Planner starts from requirement capabilities and traverses typed relationships through bounded, policy-controlled queries. It distinguishes direct impact, indirect impact, cross-team dependency, cross-Scope unresolved dependency, and optional opportunity.

The resulting work breakdown covers design, data, API, event, state, rule, implementation, migration, compatibility, security, testing, observability, rollout, rollback, documentation, Proposal, ADR, Context Pack, and reconciliation work. A relationship hop count is diagnostic evidence, not an effort score by itself.

### Effort And Token Estimator

The estimator first produces provider-neutral `AIWorkUnits`. One AI Work Unit is a normalized score for implementing and verifying one bounded, low-complexity change under the versioned reference Agent Execution Profile; it is not a Token, hour, or billing unit. Model Profiles and Agent Execution Profiles together convert Work Units into execution-time and Token ranges. Human effort and AI execution cost remain separate measures.

Before empirical calibration, the human estimate contains size class, `planningRange`, `riskAdjustedRange`, critical path, external wait time, confidence, and `HEURISTIC` calibration status. The AI estimate contains primary-Agent units, review-Agent units, expected repair loops, planning and risk-adjusted Token ranges, estimated elapsed Agent time, cache assumptions, and cost range for the selected profiles. `CALIBRATED_P50_P90` labels are allowed only after the profile meets a configured minimum representative sample count and backtesting threshold; otherwise percentile terminology is forbidden.

Token estimation includes:

- context assembly and retrieval;
- primary Agent reasoning and generation;
- tool observations, build output, and test output;
- expected verification and repair loops;
- independent review;
- review-driven correction;
- design-fact synchronization and reconciliation.

The estimator never equates asset count with effort. It weighs change kind, semantic complexity, relationship impact, code evidence, migration risk, quality constraints, external ownership, and uncertainty.

### Independent Reviewer

The independent review Agent receives the immutable brief, the same evidence snapshot, deterministic findings, proposed options, task breakdown, and estimates. It uses a separately versioned review template and deterministic checklist, does not receive private reasoning from the primary Agent, and records its own Model Profile, budget, and output digest. Deployments may require a different model or provider for stronger independence, but a different provider is not mandatory in Phase 1.

Review cannot silently rewrite the original result. It produces findings and a disposition. A failed review keeps the assessment at `ASSESSED`; only a passing or explicitly resolved review can produce `REVIEWED`. Material findings require a new assessment revision; an accountable human records the resolution and cannot edit the original review output.

## Core Records

### RequirementBrief

The brief contains a stable requirement ID, revision, exact Scope, canonical English intent, Chinese localization for human-facing content, confirmed facts, model assumptions, acceptance criteria, quality targets, constraints, exclusions, source references, author, and timestamps.

### RequirementAssessment

The assessment contains:

- requirement and assessment revisions;
- exact Scope and actor authorization snapshot reference;
- feasibility verdict, confidence, coverage, and freshness;
- direct and indirect impacted facts;
- hard constraints and unresolved dependencies;
- recommended and alternative solution options;
- versioned work breakdown;
- human effort estimate;
- AI Work Units and Model Profile estimates;
- assumptions, unknowns, and sensitivity factors;
- evidence matrix and design-context digest;
- independent-review result;
- lifecycle status and supersession link.

Lifecycle:

```text
DRAFT -> EVIDENCE_READY -> ASSESSED -> REVIEWED -> ACCEPTED -> SUPERSEDED
                                      \-> STALE
```

`BLOCKED` and `INSUFFICIENT_EVIDENCE` are feasibility verdicts, not terminal lifecycle states. Their reports remain useful but cannot enter `ACCEPTED` until a later revision resolves the blocking condition.

An accepted assessment becomes `STALE` when an affected evidence digest changes, its Requirement Brief is superseded, a blocking governance rule or ADR changes, reconciliation becomes blocked, or its evidence waterline is outside the configured validity policy. `STALE` records retain `invalidatedBy`, `invalidatedAt`, and their original `validAtWaterline`. A Model Profile or Agent Execution Profile change does not rewrite the old estimate, but selecting a different profile requires a new assessment revision. Implementation preflight rejects stale assessments.

### RequirementAssessmentRun

The run record contains the exact Scope, requirement revision, idempotency key, status, stage checkpoint, lease owner and expiry, heartbeat, retry counters, cancellation state, evidence snapshot ID, model invocation references, partial diagnostics, terminal reason, and output assessment revision. Run records are operational state; accepted reports remain immutable decision records.

### AssessmentEvidenceSnapshot

The snapshot preserves enough identity to reproduce and audit an assessment: exact Scope, authorization decision reference, catalog and relationship waterlines, projection checkpoint, ordered asset and relationship revision manifests, ruleset revision, prompt and review-template digests, provider/profile revisions, coverage-policy revision, and one aggregate digest. Historical read-back must resolve the recorded versions or report that reproducibility is externally blocked.

### ModelProfile

A Model Profile is a versioned operational configuration, not a design truth. It records provider and model identity, context limits, observed input/output/tool amplification factors, caching policy, price assumptions, expected review overhead, supported tool profile, effective dates, and calibration sample count.

The assessment always preserves the exact Model Profile revision used. If no compatible profile exists, the system returns AI Work Units without fabricated Token or cost values.

### AgentExecutionProfile

An Agent Execution Profile records the primary and review roles, selected Model Profile per role, tool set, context-assembly strategy, maximum context and output budgets, retry and repair policy, concurrency, cache behavior, verification commands, stop conditions, and overrun policy. Phase 1 ships the approved reference profile: one primary implementation Agent followed by one independent review Agent.

Estimates are advisory. An execution budget is a separate governed envelope with soft warning thresholds, a hard stop or explicit approval rule, and auditable budget changes. Exceeding an estimate never silently increases the execution budget.

### ExecutionActual

After delivery, an `ExecutionActual` records model revisions, input/output/cached Tokens where observable, elapsed Agent time, tool invocations, verification cycles, failed attempts, review findings, human intervention, actual person-days, and final changed assets. Provider-specific unavailable metrics remain null rather than inferred as facts.

Actuals calibrate future ranges by organization, technology stack, task type, and execution profile. Calibration may adjust statistical coefficients but cannot weaken deterministic governance rules.

## Estimation Contract

The estimator builds a task graph rather than returning one opaque score. Each task receives:

- a base work class;
- change-kind multiplier: create, compatible change, breaking change, migrate, or retire;
- semantic and code-complexity factors;
- direct and indirect dependency factors;
- data, security, quality, and external-owner risk factors;
- evidence and uncertainty factors;
- required verification and governance work.

The aggregate produces a planning range, risk-adjusted range, and sensitivity explanation. Before calibration, these are heuristic planning bounds and have no probability claim. After the configured sample and backtesting gates pass, `P50` represents the median modeled outcome under stated assumptions and `P90` represents the modeled 90th percentile; neither is an absolute maximum.

Confidence must decrease when evidence is missing, stale, contradictory, weakly linked to code, or based on an uncalibrated Model Profile. A low-confidence result may still guide discovery but cannot be presented as a delivery commitment.

## Data Flow

```text
Natural-language requirement
  -> structured RequirementBrief
  -> user-confirmed critical fields
  -> durable RequirementAssessmentRun
  -> exact-Scope immutable evidence snapshot
  -> deterministic constraints
  -> semantic feasibility and options
  -> typed impact graph and task graph
  -> human and AI estimates
  -> independent Agent review
  -> user acceptance
  -> MCP-authored Proposal and Context Pack drafts
  -> later implementation session and reconciliation
  -> ExecutionActual calibration feedback
```

Acceptance of an assessment does not authorize implementation and does not mutate existing assets. Proposal, ADR, Context Pack, and typed-link creation remains behind the existing exact-Scope MCP write boundary. Implementation requires a separate Design Change Session.

## Failure And Degradation

- Missing critical design facts returns `INSUFFICIENT_EVIDENCE` and lists the required evidence.
- Unauthorized Scope access fails closed; redacted dependency indicators reveal no target content.
- An unavailable graph projection falls back to bounded PostgreSQL relationship reads. Confidence remains unchanged when the authoritative query satisfies the same evidence contract; coverage and confidence decrease only when projection-only semantics are unavailable, the query is truncated, or the required checkpoint cannot be met.
- An unavailable AI Provider preserves deterministic findings and marks semantic sections incomplete.
- A missing Model Profile returns AI Work Units only.
- Contradictory authoritative facts block acceptance until reconciled.
- Independent-review failure leaves the report at `ASSESSED`.
- Partial retrieval always reports coverage, truncation, and continuation information; empty results never mean approval.

## Security And Privacy

Prompts contain only authorized, task-relevant, bounded evidence. Secrets, credentials, unrestricted source repositories, and unrelated Scope catalogs are excluded. Governance Profile and deterministic policy have higher precedence than task intent; requirement text, repository content, source comments, imported documents, and design descriptions are untrusted evidence data and cannot alter policy, Scope, tool permissions, budgets, or exemptions. Prompt assembly preserves trust labels and instruction/data separation.

Assessment logs record IDs and digests by default rather than full sensitive payloads. Model Profile configuration must declare whether a provider is approved for the data classification involved; an unapproved provider blocks semantic processing but not deterministic local checks.

## Rollout

### Phase 1: Explainable Assessment

Implement durable assessment runs, Requirement Brief intake, immutable exact-Scope evidence snapshots, deterministic feasibility and coverage rules, bounded impact planning, heuristic planning and risk-adjusted ranges, configurable Model and Agent Execution Profiles, MockAIProvider reasoning, independent review, staleness invalidation, role views, and immutable report versions.

### Phase 2: Code And Runtime Evidence

Add governed repository mappings, code ownership, contract/schema observations, test coverage, deployment topology, and selected runtime evidence. Improve feasibility and impact precision without changing the report contract.

### Phase 3: Calibrated Prediction

Persist Execution Actuals, compare estimates with outcomes, calibrate by stack and execution profile, monitor drift, and publish explainable P50/P90 quality metrics. No accuracy claim is allowed before representative evidence exists.

External requirement-platform connectors and explicitly authorized cross-Scope portfolio views remain separate increments.

## Acceptance Criteria

- Product, architecture, and Agent views resolve to the same assessment revision and verdict.
- Equivalent inputs at the same design waterline produce identical deterministic findings and evidence digests.
- Every hard constraint and material conclusion has a design, code, runtime, or explicit-assumption reference.
- Unauthorized Scope content never appears in prompts, logs, caches, reports, or reviewer context.
- The report returns feasibility, impact, human planning/risk-adjusted ranges, AI Work Units, and model-specific Token ranges when compatible profiles exist; `P50/P90` labels appear only for profiles that pass calibration gates.
- Primary and review Agent estimates and actuals remain separately observable.
- Missing evidence, unavailable providers, unavailable projections, and failed review degrade explicitly and never become high-confidence acceptance.
- Accepted assessments can create Proposal and Context Pack drafts only through MCP.
- Actual execution can be linked back to the exact requirement, assessment, design-context digest, Model Profile, and changed assets.
- Assessment runs are idempotent, cancellable, resumable, lease-fenced, and cannot publish duplicate terminal revisions.
- Accepted assessments become stale when governed evidence or validity conditions change, and stale assessments cannot authorize implementation preflight.
- English canonical content and complete Chinese localization are available for all human-facing assessment content.

## Non-Goals

- Guaranteeing an exact delivery date, person-day count, Token bill, or financial cost.
- Automatically modifying accepted design assets or production code.
- Implicit cross-Scope discovery or aggregation.
- Replacing project planning, staffing, or accountable human approval.
- Training a proprietary prediction model during Phase 1.
- Integrating every enterprise requirement-management platform in the first release.

---

# 证据驱动的需求评估中心设计

**状态：** 已批准的书面设计，尚未开始实施  
**范围：** `com.huawei.celon.desiner`  
**负责人：** SpecForge Requirement Intelligence  
**设计会话：** `design-change-session:786660d0-4029-4f5f-9b9a-189af77cbae8`

## 目标

把 SpecForge 的 Scope 隔离设计资产目录转化为面向需求的证据决策系统。产品经理、架构师和 Coding Agent 使用同一份有版本的评估，只呈现不同层次的信息。评估负责判断可行性、识别影响、比较方案、估算人工工作量和 AI 执行成本，并保留每个重要结论的证据。

第一阶段接收自然语言需求，并通过有界的结构化追问补齐目标、验收条件、质量要求、精确应用服务 Scope 和排除项。标准执行模式为一个主实施 Agent 加一个独立审查 Agent。

## 产品原则

设计资产只有进入每次变更决策，才能从被动文档转化为生产力。评估遵循四项原则：

1. AI 可以理解需求和比较方案，但不能伪造证据。
2. 确定性策略负责硬约束；模型不能覆盖权限、ADR、不变量、兼容策略或对账阻断。
3. 所有估算都必须提供区间、置信度和不确定性，不能给出无依据的单点承诺。
4. PostgreSQL 中的已编写事实保持权威；图谱和搜索服务只是有界、可重建的读取投影。

## 用户与视图

所有角色读取同一 `RequirementAssessment` 版本。

- **产品视图**关注可行性、业务影响、方案差异、交付区间、风险和待确认事项。
- **架构视图**关注有类型关系、3A 映射、ADR 约束、兼容性、跨 Scope 依赖、证据缺口和方案权衡。
- **Agent 视图**提供机器可读的任务拆分、允许修改范围、禁止结果、相关代码与设计引用、验证义务和 Token 预算。

角色视图可以隐藏无关细节，但不能改变结论、证据、估算和版本身份。

## 架构组件

### 评估编排器

需求评估是异步、持久化的工作流，而不是一次同步模型调用。`RequirementAssessmentRun` 负责幂等、阶段检查点、租约与心跳隔离、取消、有界重试和从最近持久化阶段恢复。运行语义复用现有 Impact Analysis Worker 的成熟模式，但评估阶段保持独立。

运行生命周期为：

```text
QUEUED -> RESOLVING_EVIDENCE -> ANALYZING -> ESTIMATING
       -> REVIEWING -> COMPLETE
```

`WAITING_FOR_EVIDENCE`、`WAITING_FOR_PROJECTION`、`FAILED`、`CANCELLATION_REQUESTED` 和 `CANCELLED` 覆盖异常路径。只有通过租约隔离的阶段转换才能写入不可变输出版本；同一幂等键重试不能创建重复的已接受评估。

### 需求接入

需求接入组件接收自然语言意图并创建有版本的 `RequirementBrief`。追问只补齐业务目标、精确 Scope、验收条件、质量与合规目标、兼容限制和明确排除项。模型推断必须与用户确认事实分开显示，系统不得静默选择默认 Scope。

### 证据解析

证据解析器只读取精确 Scope 内已授权的资产，包括能力、领域、数据模型、字段、API、事件、状态机、业务规则、质量需求、集成、ADR、Proposal、Context Pack、3A 映射、有类型关系、负责人、代码引用、运行证据和对账状态。

检索必须有界且可复现；每项证据携带稳定 ID、版本、内容摘要、来源和相关性理由。解析器冻结不可变 `AssessmentEvidenceSnapshot`，记录资产目录水位、关系事件水位、投影检查点、规则集版本、有序证据清单、Prompt 模板摘要、Model Profile 版本和 Agent Execution Profile 版本。只有一个顶层摘要不足以充当历史证据。

跨 Scope 内容必须明确授权。未授权依赖只显示为脱敏的未解析依赖，不得泄露身份或内容。第一阶段只评估一个所属 Scope；未来授权组合必须连接各 Scope 独立产生的子评估，不能扩大单次运行的读取边界。

### 可行性引擎

确定性规则负责授权、Scope 隔离、阻断性 ADR、业务不变量、状态转换、契约兼容、质量门槛、对账状态和证据覆盖；AI Provider 负责需求拆解、语义匹配、方案生成和基于证据的解释。

结论只能为：

- `FEASIBLE`：没有已知硬阻塞，且证据足以支持实施路径；
- `CONDITIONAL`：只有满足明确前提或完成决策后才可行；
- `BLOCKED`：已知策略、依赖、权限、兼容或架构约束阻止交付；
- `INSUFFICIENT_EVIDENCE`：关键事实缺失或过期，无法可靠判断。

每个结论必须提供置信度、证据覆盖率、阻断原因、假设、未知项和新鲜度。覆盖率按有版本的需求类型证据策略计算。例如破坏性 API 变更必须覆盖契约、调用方、数据、兼容规则、测试、质量和负责人证据。缺少必需类别时，由确定性规则限制置信度上限，模型不能突破该上限。

### 影响规划

影响规划器从需求涉及的能力出发，通过有类型、有界、受策略控制的关系查询，区分直接影响、间接影响、跨团队依赖、跨 Scope 未解析依赖和可选机会。

任务分解覆盖设计、数据、API、事件、状态、规则、实现、迁移、兼容、安全、测试、可观测性、发布、回滚、文档、Proposal、ADR、Context Pack 和对账。关系跳数只能作为诊断证据，不能直接等同于工作量。

### 工作量与 Token 估算

估算器先生成与供应商无关的 `AIWorkUnits`。一个 AI Work Unit 表示在有版本的参考 Agent Execution Profile 下，实现并验证一个有界、低复杂度变更的归一化分值；它不是 Token、工时或计费单位。Model Profile 与 Agent Execution Profile 共同把 Work Units 换算为执行时间和 Token 区间。人工工作量与 AI 执行成本保持为两个独立指标。

在完成经验校准前，人工估算提供规模等级、`planningRange`、`riskAdjustedRange`、关键路径、外部等待时间、置信度和 `HEURISTIC` 校准状态。AI 估算提供主 Agent 与审查 Agent 的 Work Units、预计修复循环、规划 Token 区间、风险修正 Token 区间、预计 Agent 时间、缓存假设和费用区间。只有档案达到最低代表性样本数并通过回测门槛后，才允许使用 `CALIBRATED_P50_P90` 标签；否则禁止使用百分位术语。

Token 必须覆盖上下文检索、主 Agent 推理与生成、工具反馈、验证修复循环、独立审查、审查后修复以及设计事实同步和对账。估算不得把资产数量直接当作工作量，而要考虑变更类型、语义复杂度、关系影响、代码证据、迁移风险、质量约束、外部责任方和未知项。

### 独立审查

独立审查 Agent 接收不可变需求摘要、同一证据快照、确定性结论、候选方案、任务分解和估算。它使用独立版本的审查模板和确定性检查清单，不接收主 Agent 的私有推理，并单独记录 Model Profile、预算和输出摘要。部署可以要求不同模型或供应商来增强独立性，但第一阶段不强制使用不同供应商。

审查不能静默覆盖原始结果，只能输出发现和处理结论。审查失败时，评估停留在 `ASSESSED`；只有审查通过或问题被明确解决后才能进入 `REVIEWED`。重要发现必须生成新的评估版本；责任人记录解决结论，不能修改原始审查输出。

## 核心记录

### RequirementBrief

包含稳定需求 ID、版本、精确 Scope、英文规范意图、中文本地化、用户确认事实、模型假设、验收条件、质量目标、约束、排除项、来源、作者和时间。

### RequirementAssessment

包含需求与评估版本、精确 Scope、授权快照引用、可行性结论、置信度、覆盖率、新鲜度、直接与间接影响、硬约束、未解析依赖、推荐与备选方案、任务分解、人工估算、AI Work Units、模型估算、假设、未知项、敏感因素、证据矩阵、设计上下文摘要、独立审查结果和生命周期状态。

生命周期为：

```text
DRAFT -> EVIDENCE_READY -> ASSESSED -> REVIEWED -> ACCEPTED -> SUPERSEDED
                                      \-> STALE
```

`BLOCKED` 和 `INSUFFICIENT_EVIDENCE` 是可行性结论，不是生命周期终态。报告仍然有价值，但在后续版本解除阻塞前不能进入 `ACCEPTED`。

受影响证据摘要变化、Requirement Brief 被替代、阻断性治理规则或 ADR 更新、对账转为阻塞，或证据水位超出有效期策略时，已接受评估转为 `STALE`。记录必须保留 `invalidatedBy`、`invalidatedAt` 和原始 `validAtWaterline`。Model Profile 或 Agent Execution Profile 变化不会重写旧估算，但选择不同档案必须生成新评估版本。实施预检必须拒绝失效评估。

### RequirementAssessmentRun

运行记录包含精确 Scope、需求版本、幂等键、状态、阶段检查点、租约持有者与到期时间、心跳、重试次数、取消状态、证据快照 ID、模型调用引用、部分诊断、终止原因和输出评估版本。运行记录属于操作状态；已接受报告保持为不可变决策记录。

### AssessmentEvidenceSnapshot

证据快照保存足以复现和审计评估的信息：精确 Scope、授权决策引用、资产目录与关系水位、投影检查点、有序资产和关系版本清单、规则集版本、Prompt 与审查模板摘要、Provider 与档案版本、覆盖策略版本和聚合摘要。历史回读必须能够解析记录的版本，否则明确报告外部复现阻塞。

### ModelProfile

模型档案是有版本的运行配置，不是设计真相。它记录供应商与模型身份、上下文限制、输入/输出/工具放大系数、缓存策略、价格假设、审查开销、工具能力、生效时间和校准样本数。评估必须保存所用档案版本；没有兼容档案时只返回 AI Work Units，不伪造 Token 或费用。

### AgentExecutionProfile

Agent 执行档案记录主 Agent 与审查 Agent 角色、各角色所选 Model Profile、工具集、上下文组装策略、最大上下文与输出预算、重试与修复策略、并发、缓存行为、验证命令、停止条件和超限策略。第一阶段提供已确认的参考档案：一个主实施 Agent，随后一个独立审查 Agent。

估算只提供建议；执行预算是独立的受治理信封，具有软告警阈值、硬停止或显式审批规则，并审计预算变更。超过估算不能静默提高执行预算。

### ExecutionActual

交付完成后记录可观测的输入、输出和缓存 Token、Agent 时间、工具调用、验证循环、失败次数、审查发现、人工介入、实际人日和最终变更资产。供应商不提供的指标保持为空，不能推断成事实。

实际值按组织、技术栈、任务类型和执行模式校准未来区间。校准只能调整统计系数，不能削弱确定性治理规则。

## 估算契约

估算器建立任务图，而不是返回不透明总分。每项任务具有基础工作类别、变更类型、语义与代码复杂度、直接与间接依赖、数据/安全/质量/外部责任风险、证据与不确定性以及验证和治理工作。

汇总结果必须提供规划区间、风险修正区间和敏感性说明。校准前这些只是启发式规划边界，不包含概率声明。通过样本和回测门槛后，`P50` 表示已声明假设下模型结果的中位数，`P90` 表示模型结果的第 90 百分位；二者都不是绝对上限。

设计证据缺失、过期、矛盾、与代码关联较弱或模型档案未经校准时，置信度必须下降。低置信度结果可以指导调研，但不能作为交付承诺。

## 数据流

```text
自然语言需求
  -> 结构化 RequirementBrief
  -> 用户确认关键字段
  -> 持久化 RequirementAssessmentRun
  -> 精确 Scope 不可变证据快照
  -> 确定性约束判断
  -> AI 可行性与方案推演
  -> 有类型影响图和任务图
  -> 人工与 AI 估算
  -> 独立 Agent 审查
  -> 用户接受
  -> 通过 MCP 创建 Proposal 和 Context Pack 草案
  -> 后续独立实施会话及对账
  -> ExecutionActual 校准回流
```

接受评估不等于授权实施，也不会修改现有资产。Proposal、ADR、Context Pack 和有类型关系仍只能通过精确 Scope 的 MCP 写入边界创建；代码实施必须另开 Design Change Session。

## 失败与降级

- 缺少关键设计事实时返回 `INSUFFICIENT_EVIDENCE`，并列出需要补充的证据。
- Scope 未授权时失败关闭，脱敏依赖提示不得透露目标内容。
- 图投影不可用时回退到 PostgreSQL 有界关系查询。权威查询满足同一证据契约时置信度不变；只有缺少投影专属语义、查询被截断或无法满足所需检查点时，才降低覆盖率和置信度。
- AI Provider 不可用时保留确定性结果并标记语义部分未完成。
- 模型档案缺失时只返回 AI Work Units。
- 权威事实矛盾时阻止接受，直到完成对账。
- 独立审查不通过时停留在 `ASSESSED`。
- 部分检索必须返回覆盖率、截断和续读信息；空结果不能解释为批准。

## 安全与隐私

提示词只包含已授权、与任务相关且有界的证据。不得包含密钥、凭据、无限制源码仓库或无关 Scope 目录。Governance Profile 和确定性策略的优先级高于任务意图；需求文本、仓库内容、源码注释、导入文档和设计描述都是不可信证据数据，不能修改策略、Scope、工具权限、预算或豁免。Prompt 组装必须保留信任标签并隔离指令与数据。

评估日志默认保存 ID 和摘要，而不是完整敏感载荷。模型档案必须声明供应商是否获准处理对应数据密级；未获准时阻断语义处理，但仍可执行本地确定性检查。

## 分阶段交付

### 第一阶段：可解释评估

实现持久化评估运行、需求摘要、精确 Scope 不可变证据快照、确定性可行性与覆盖规则、有界影响规划、启发式规划与风险修正区间、可配置 Model Profile 与 Agent Execution Profile、MockAIProvider 推理、独立审查、失效处理、角色视图和不可变报告版本。

### 第二阶段：代码与运行证据

增加受治理的仓库映射、代码归属、契约与 Schema 观测、测试覆盖、部署拓扑和选定运行证据，在不改变报告契约的前提下提升精度。

### 第三阶段：校准预测

持久化实际执行结果，比较估算与实际值，按技术栈和执行模式校准，监控偏移并发布可解释的 P50/P90 质量指标。没有代表性证据前不得宣称准确率。

外部需求平台连接器和明确授权的跨 Scope 组合视图保持为独立增量。

## 验收标准

- 三类角色视图必须解析到同一评估版本和结论。
- 相同设计水位下的等价输入必须生成相同的确定性结论和证据摘要。
- 每条硬约束和重要结论必须关联设计、代码、运行证据或明确假设。
- 未授权 Scope 内容不能进入提示词、日志、缓存、报告或审查上下文。
- 存在兼容档案时，报告输出可行性、影响、人工规划/风险修正区间、AI Work Units 和模型 Token 区间；只有通过校准门槛的档案才能显示 `P50/P90`。
- 主 Agent 与审查 Agent 的估算和实际值分别可观测。
- 缺证据、Provider 不可用、投影不可用和审查失败必须显式降级，不能形成高置信度接受。
- 接受后的 Proposal 和 Context Pack 草案只能通过 MCP 创建。
- 实际执行结果可以追溯到需求、评估、设计上下文摘要、模型档案和最终变更资产。
- 评估运行必须幂等、可取消、可恢复且受租约隔离，不能发布重复终态版本。
- 受治理证据或有效条件变化时，已接受评估必须失效，失效评估不能用于实施预检。
- 所有面向人的评估内容均有英文规范字段和完整中文本地化。

## 非目标

- 保证精确交付日期、人日、Token 账单或财务成本。
- 自动修改正式设计资产或生产代码。
- 隐式跨 Scope 发现或聚合。
- 替代项目排期、人员安排或责任人的人工批准。
- 第一阶段训练专用预测模型。
- 第一阶段连接所有企业需求管理平台。
