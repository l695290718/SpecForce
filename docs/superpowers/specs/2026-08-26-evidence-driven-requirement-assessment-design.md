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

Retrieval is bounded and reproducible. Every returned item carries a stable ID, revision or digest, evidence source, and relevance reason. Cross-Scope dependencies may be reported only through explicit authorization. An unauthorized dependency is represented as a redacted unresolved dependency and never leaks its identity or content.

### Feasibility Engine

The Feasibility Engine combines deterministic constraints with model-assisted semantic reasoning.

Deterministic evaluation owns authorization, Scope isolation, blocking ADRs, business invariants, state-transition legality, contract compatibility, required quality thresholds, reconciliation status, and mandatory evidence coverage. The AI Provider owns requirement decomposition, semantic matching, option generation, and evidence-grounded explanation.

The verdict is one of:

- `FEASIBLE`: no known hard blocker and sufficient evidence supports an implementation path;
- `CONDITIONAL`: feasible only after explicit prerequisites or decisions are satisfied;
- `BLOCKED`: a known policy, dependency, permission, compatibility, or architectural constraint prevents delivery;
- `INSUFFICIENT_EVIDENCE`: critical facts are missing or stale, so the system cannot make a reliable decision.

Each verdict includes confidence, evidence coverage, blocking reasons, assumptions, unknowns, and freshness.

### Impact Planner

The Impact Planner starts from requirement capabilities and traverses typed relationships through bounded, policy-controlled queries. It distinguishes direct impact, indirect impact, cross-team dependency, cross-Scope unresolved dependency, and optional opportunity.

The resulting work breakdown covers design, data, API, event, state, rule, implementation, migration, compatibility, security, testing, observability, rollout, rollback, documentation, Proposal, ADR, Context Pack, and reconciliation work. A relationship hop count is diagnostic evidence, not an effort score by itself.

### Effort And Token Estimator

The estimator first produces provider-neutral `AIWorkUnits`. Model Profiles then convert those units into execution-time and Token ranges. Human effort and AI execution cost remain separate measures.

The human estimate contains size class, `P50` and `P90` person-day ranges, critical path, external wait time, and confidence. The AI estimate contains primary-Agent units, review-Agent units, expected repair loops, `P50` and `P90` Tokens, estimated elapsed Agent time, cache assumptions, and cost for the selected Model Profile.

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

The independent review Agent receives the immutable brief, evidence manifest, deterministic findings, proposed options, task breakdown, and estimates. It checks for omitted impacts, unsupported claims, contradictions, permission leakage, underestimated migration or verification, and incorrect confidence.

Review cannot silently rewrite the original result. It produces findings and a disposition. A failed review keeps the assessment at `ASSESSED`; only a passing or explicitly resolved review can produce `REVIEWED`.

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
```

`BLOCKED` and `INSUFFICIENT_EVIDENCE` are feasibility verdicts, not terminal lifecycle states. Their reports remain useful but cannot enter `ACCEPTED` until a later revision resolves the blocking condition.

### ModelProfile

A Model Profile is a versioned operational configuration, not a design truth. It records provider and model identity, context limits, observed input/output/tool amplification factors, caching policy, price assumptions, expected review overhead, supported tool profile, effective dates, and calibration sample count.

The assessment always preserves the exact Model Profile revision used. If no compatible profile exists, the system returns AI Work Units without fabricated Token or cost values.

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

The aggregate produces a range and sensitivity explanation. `P50` represents the most likely bounded outcome under stated assumptions. `P90` includes identified major repair and dependency risks; it is not an absolute maximum.

Confidence must decrease when evidence is missing, stale, contradictory, weakly linked to code, or based on an uncalibrated Model Profile. A low-confidence result may still guide discovery but cannot be presented as a delivery commitment.

## Data Flow

```text
Natural-language requirement
  -> structured RequirementBrief
  -> user-confirmed critical fields
  -> exact-Scope evidence resolution
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
- An unavailable graph projection falls back to bounded PostgreSQL relationship reads and lowers confidence.
- An unavailable AI Provider preserves deterministic findings and marks semantic sections incomplete.
- A missing Model Profile returns AI Work Units only.
- Contradictory authoritative facts block acceptance until reconciled.
- Independent-review failure leaves the report at `ASSESSED`.
- Partial retrieval always reports coverage, truncation, and continuation information; empty results never mean approval.

## Security And Privacy

Prompts contain only authorized, task-relevant, bounded evidence. Secrets, credentials, unrestricted source repositories, and unrelated Scope catalogs are excluded. Assessment logs record IDs and digests by default rather than full sensitive payloads. Model Profile configuration must declare whether a provider is approved for the data classification involved; an unapproved provider blocks semantic processing but not deterministic local checks.

## Rollout

### Phase 1: Explainable Assessment

Implement Requirement Brief intake, exact-Scope evidence resolution, deterministic feasibility rules, bounded impact planning, rule-based human and AI Work Unit ranges, configurable Model Profiles, MockAIProvider reasoning, independent review, role views, and immutable report versions.

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
- The report returns feasibility, impact, human `P50/P90`, AI Work Units, and model-specific Token `P50/P90` when a compatible profile exists.
- Primary and review Agent estimates and actuals remain separately observable.
- Missing evidence, unavailable providers, unavailable projections, and failed review degrade explicitly and never become high-confidence acceptance.
- Accepted assessments can create Proposal and Context Pack drafts only through MCP.
- Actual execution can be linked back to the exact requirement, assessment, design-context digest, Model Profile, and changed assets.
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

### 需求接入

需求接入组件接收自然语言意图并创建有版本的 `RequirementBrief`。追问只补齐业务目标、精确 Scope、验收条件、质量与合规目标、兼容限制和明确排除项。模型推断必须与用户确认事实分开显示，系统不得静默选择默认 Scope。

### 证据解析

证据解析器只读取精确 Scope 内已授权的资产，包括能力、领域、数据模型、字段、API、事件、状态机、业务规则、质量需求、集成、ADR、Proposal、Context Pack、3A 映射、有类型关系、负责人、代码引用、运行证据和对账状态。

检索必须有界且可复现；每项证据携带稳定 ID、版本或摘要、来源和相关性理由。跨 Scope 内容必须明确授权。未授权依赖只显示为脱敏的未解析依赖，不得泄露身份或内容。

### 可行性引擎

确定性规则负责授权、Scope 隔离、阻断性 ADR、业务不变量、状态转换、契约兼容、质量门槛、对账状态和证据覆盖；AI Provider 负责需求拆解、语义匹配、方案生成和基于证据的解释。

结论只能为：

- `FEASIBLE`：没有已知硬阻塞，且证据足以支持实施路径；
- `CONDITIONAL`：只有满足明确前提或完成决策后才可行；
- `BLOCKED`：已知策略、依赖、权限、兼容或架构约束阻止交付；
- `INSUFFICIENT_EVIDENCE`：关键事实缺失或过期，无法可靠判断。

每个结论必须提供置信度、证据覆盖率、阻断原因、假设、未知项和新鲜度。

### 影响规划

影响规划器从需求涉及的能力出发，通过有类型、有界、受策略控制的关系查询，区分直接影响、间接影响、跨团队依赖、跨 Scope 未解析依赖和可选机会。

任务分解覆盖设计、数据、API、事件、状态、规则、实现、迁移、兼容、安全、测试、可观测性、发布、回滚、文档、Proposal、ADR、Context Pack 和对账。关系跳数只能作为诊断证据，不能直接等同于工作量。

### 工作量与 Token 估算

估算器先生成与供应商无关的 `AIWorkUnits`，再由模型档案换算执行时间和 Token 区间。人工工作量与 AI 执行成本保持为两个独立指标。

人工估算提供规模等级、`P50/P90` 人日、关键路径、外部等待时间和置信度。AI 估算提供主 Agent 和审查 Agent 的 Work Units、预计修复循环、`P50/P90 Token`、预计 Agent 时间、缓存假设和所选模型的费用。

Token 必须覆盖上下文检索、主 Agent 推理与生成、工具反馈、验证修复循环、独立审查、审查后修复以及设计事实同步和对账。估算不得把资产数量直接当作工作量，而要考虑变更类型、语义复杂度、关系影响、代码证据、迁移风险、质量约束、外部责任方和未知项。

### 独立审查

独立审查 Agent 接收不可变的需求摘要、证据清单、确定性结论、候选方案、任务分解和估算，检查遗漏影响、无证据结论、矛盾、权限泄露、低估的迁移或验证工作以及错误置信度。

审查不能静默覆盖原始结果，只能输出发现和处理结论。审查失败时，评估停留在 `ASSESSED`；只有审查通过或问题被明确解决后才能进入 `REVIEWED`。

## 核心记录

### RequirementBrief

包含稳定需求 ID、版本、精确 Scope、英文规范意图、中文本地化、用户确认事实、模型假设、验收条件、质量目标、约束、排除项、来源、作者和时间。

### RequirementAssessment

包含需求与评估版本、精确 Scope、授权快照引用、可行性结论、置信度、覆盖率、新鲜度、直接与间接影响、硬约束、未解析依赖、推荐与备选方案、任务分解、人工估算、AI Work Units、模型估算、假设、未知项、敏感因素、证据矩阵、设计上下文摘要、独立审查结果和生命周期状态。

生命周期为：

```text
DRAFT -> EVIDENCE_READY -> ASSESSED -> REVIEWED -> ACCEPTED -> SUPERSEDED
```

`BLOCKED` 和 `INSUFFICIENT_EVIDENCE` 是可行性结论，不是生命周期终态。报告仍然有价值，但在后续版本解除阻塞前不能进入 `ACCEPTED`。

### ModelProfile

模型档案是有版本的运行配置，不是设计真相。它记录供应商与模型身份、上下文限制、输入/输出/工具放大系数、缓存策略、价格假设、审查开销、工具能力、生效时间和校准样本数。评估必须保存所用档案版本；没有兼容档案时只返回 AI Work Units，不伪造 Token 或费用。

### ExecutionActual

交付完成后记录可观测的输入、输出和缓存 Token、Agent 时间、工具调用、验证循环、失败次数、审查发现、人工介入、实际人日和最终变更资产。供应商不提供的指标保持为空，不能推断成事实。

实际值按组织、技术栈、任务类型和执行模式校准未来区间。校准只能调整统计系数，不能削弱确定性治理规则。

## 估算契约

估算器建立任务图，而不是返回不透明总分。每项任务具有基础工作类别、变更类型、语义与代码复杂度、直接与间接依赖、数据/安全/质量/外部责任风险、证据与不确定性以及验证和治理工作。

汇总结果必须提供区间和敏感性说明。`P50` 表示在已声明假设下最可能的有界结果；`P90` 包含已识别的主要返工和依赖风险，但不是绝对上限。

设计证据缺失、过期、矛盾、与代码关联较弱或模型档案未经校准时，置信度必须下降。低置信度结果可以指导调研，但不能作为交付承诺。

## 数据流

```text
自然语言需求
  -> 结构化 RequirementBrief
  -> 用户确认关键字段
  -> 精确 Scope 证据检索
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
- 图投影不可用时回退到 PostgreSQL 有界关系查询并降低置信度。
- AI Provider 不可用时保留确定性结果并标记语义部分未完成。
- 模型档案缺失时只返回 AI Work Units。
- 权威事实矛盾时阻止接受，直到完成对账。
- 独立审查不通过时停留在 `ASSESSED`。
- 部分检索必须返回覆盖率、截断和续读信息；空结果不能解释为批准。

## 安全与隐私

提示词只包含已授权、与任务相关且有界的证据。不得包含密钥、凭据、无限制源码仓库或无关 Scope 目录。评估日志默认保存 ID 和摘要，而不是完整敏感载荷。模型档案必须声明供应商是否获准处理对应数据密级；未获准时阻断语义处理，但仍可执行本地确定性检查。

## 分阶段交付

### 第一阶段：可解释评估

实现需求摘要、精确 Scope 证据解析、确定性可行性规则、有界影响规划、基于规则的人工与 AI Work Unit 区间、可配置模型档案、MockAIProvider 推理、独立审查、角色视图和不可变报告版本。

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
- 存在兼容模型档案时，报告输出可行性、影响、人工 `P50/P90`、AI Work Units 和 Token `P50/P90`。
- 主 Agent 与审查 Agent 的估算和实际值分别可观测。
- 缺证据、Provider 不可用、投影不可用和审查失败必须显式降级，不能形成高置信度接受。
- 接受后的 Proposal 和 Context Pack 草案只能通过 MCP 创建。
- 实际执行结果可以追溯到需求、评估、设计上下文摘要、模型档案和最终变更资产。
- 所有面向人的评估内容均有英文规范字段和完整中文本地化。

## 非目标

- 保证精确交付日期、人日、Token 账单或财务成本。
- 自动修改正式设计资产或生产代码。
- 隐式跨 Scope 发现或聚合。
- 替代项目排期、人员安排或责任人的人工批准。
- 第一阶段训练专用预测模型。
- 第一阶段连接所有企业需求管理平台。
