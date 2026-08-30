# System Knowledge Readiness Gate Design

## Status

Accepted design for the exact Designer application-service Scope. The first implementation increment is complete and locally verified; production source onboarding and operations remain deferred.

- Owning application service: `com.huawei.celon.desiner`
- Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:214866ac-190d-4182-a7ac-6b0d869b40f9`
- English is canonical. The Chinese section is the complete human-facing localization.

## Problem

An authorized Agent can scan an existing system, submit deterministic observations through MCP, review and promote semantic candidates, reconcile them, and publish a Baseline. That does not by itself prove that SpecForge contains enough current knowledge to answer every later question about the system.

SpecForge needs a fail-closed read boundary that distinguishes approved design intent from externally observable implementation and runtime facts. An Agent may treat SpecForge as its sole read source only when the exact requested knowledge profile, selectors, source coverage, freshness, authority, and reconciliation state are sufficient at a declared point in time.

## Goals

1. Give Agents one MCP-first way to determine whether SpecForge is sufficient for a specific system-understanding request.
2. Hard-block deterministic answers when required knowledge is stale, incomplete, conflicted, unauthorized, or unreconciled.
3. Return an auditable, immutable, exact-Scope readiness receipt bound to the caller, query, policy, and source waterlines.
4. Keep diagnostic access available to explicitly authorized governance operators without allowing diagnostic data to masquerade as current system truth.
5. Reuse published Baselines, coverage projections, connector cursors, full-snapshot finalization, tombstones, conflicts, and reconciliation receipts already stored in PostgreSQL.

## Non-Goals

- Implementing new source scanners, enterprise connectors, scheduling, polling, webhooks, or external `APPLY`.
- Automatically promoting observations or semantic candidates.
- Claiming real-time knowledge when only periodic observations exist.
- Providing cross-Scope aggregation in the first increment.
- Adding a Web administration page in the first increment.
- Certifying billion-scale performance or production identity integration.

## Authority Boundary

- SpecForge is authoritative for approved ADRs, Proposals, business semantics, governance state, published architecture, localization, and accepted design intent.
- External implementation sources remain authoritative for code, API signatures, database structures, deployment versions, and runtime evidence until those observations are received, reviewed when required, promoted, reconciled, and represented by a current SpecForge receipt.
- A scan observation is evidence, not automatically an accepted design fact.
- PostgreSQL is authoritative for authored facts, source observations, policies, receipts, waterlines, reconciliation, and audit. Graph stores remain rebuildable derived projections.
- `SELF_CONTAINED` means sufficient for one registered Profile and selector set as of a stated time. It never means that SpecForge knows every fact about the application service forever.

## Knowledge Dimensions And Profiles

The server owns the mapping from a registered Profile to required dimensions and sources. Callers cannot omit a mandatory dimension or source.

Initial dimensions:

- `DESIGN_INTENT`: accepted ADRs, rules, architecture units, contracts, ownership, and approved semantics.
- `IMPLEMENTATION`: observed code structure, APIs, schemas, tests, and deployment structure.
- `RUNTIME`: observed deployment versions, calls, health, and selected runtime evidence.

Initial Profiles:

- `ARCHITECTURE_OVERVIEW`: `DESIGN_INTENT` plus the implementation sources required to explain the current structural system.
- `CHANGE_ASSESSMENT`: `DESIGN_INTENT`, `IMPLEMENTATION`, and the test or deployment evidence required by policy.
- `RUNTIME_DIAGNOSIS`: `IMPLEMENTATION` plus `RUNTIME` evidence.

An enterprise policy defines minimum required sources and maximum freshness windows. An exact-Scope policy may add sources or tighten freshness, but cannot weaken the enterprise minimum. Policy updates use MCP governance writes and increment a policy version that invalidates older receipts.

## Readiness States

Each required dimension and the overall request return one of three states. The overall state is the most restrictive required state.

- `SELF_CONTAINED`: SpecForge may be used as the sole source for this exact Profile, selector set, caller grant, and `asOf` boundary.
- `SOURCE_CHECK_REQUIRED`: required evidence is missing, stale, incomplete, not configured, awaiting a complete snapshot, or awaiting governed promotion.
- `BLOCKED`: authorization, Scope, identity, conflict, policy, or reconciliation conditions forbid a deterministic answer.

Authorization is checked before diagnostic state is loaded. An unauthorized caller receives only `KNOWLEDGE_SCOPE_ACCESS_DENIED`; the response does not reveal whether the target Scope, sources, or facts exist.

## Readiness Inputs

The evaluator reads the following under one exact Scope:

- the active published Baseline and its immutable source binding;
- catalog and relationship waterlines;
- Profile and policy versions;
- required source registrations and authority policy;
- latest completed full snapshots and boundary digests;
- connector cursors, run states, `observedAt`, `receivedAt`, and freshness SLOs;
- pending observations, candidates, promotion state, and tombstone closure;
- unresolved identity or semantic conflicts;
- latest durable reconciliation receipt;
- the caller subject and effective grant digest.

A DELTA stream can prove a change but cannot prove completeness or absence. Completeness requires a finalized `FULL_SNAPSHOT` or another policy-approved authoritative source with an equivalent boundary and deletion contract.

Waterlines and time windows are both mandatory. A known waterline change invalidates a receipt immediately. A silent external source becomes stale when its freshness SLO expires even when no SpecForge waterline changed. Future timestamps, excessive clock skew, and late observations cannot renew freshness incorrectly.

## Data Model

### `KnowledgeReadinessPolicy`

An MCP-governed exact-Scope policy overlay with an enterprise minimum:

- stable policy ID and version;
- Profile ID;
- required dimensions and source roles;
- source authority class;
- maximum freshness windows and clock-skew limits;
- complete-snapshot requirements;
- blocking conflict and reconciliation rules;
- bounded response budgets;
- receipt retention policy.

### `SystemKnowledgeReadinessReceipt`

An immutable PostgreSQL operational receipt:

- `receiptId` and deterministic reuse key;
- exact `architectureScope`;
- caller subject ID and effective grant digest;
- Profile ID, dimensions, selectors digest, purpose, and locale;
- policy ID and version;
- Baseline IDs and source-manifest digests;
- catalog, relationship, connector, snapshot, and reconciliation waterlines;
- per-dimension and overall state;
- coverage and freshness summaries;
- `reasonCodes` and non-executable `remediationActions`;
- `asOf`, `validUntil`, creation time, and audit metadata;
- receipt digest.

The deterministic reuse key includes Scope, caller grant digest, Profile, selector digest, policy version, and all source waterlines. An unchanged evaluation returns the same receipt instead of inserting another row. Receipts are immutable while retained. Expiration may archive operational detail, but the receipt digest, decision, caller, Scope, policy, waterline summary, and timestamps remain available for audit according to retention policy.

The receipt is a derived trust decision, not a replacement authority for design assets or source observations.

## MCP Contracts

### `evaluate_system_knowledge_readiness`

Optional planning and diagnostic operation.

Input:

```text
architectureScope
knowledgeProfile
selectors[]
purpose
locale
```

Output:

```text
receiptId
trustStatus
dimensionStatuses[]
asOf
validUntil
coverageSummary
freshnessSummary
reasonCodes[]
remediationActions[]
```

The caller selects a registered Profile and business selectors. The server resolves mandatory dimensions, sources, policies, and budgets.

### `read_system_knowledge`

The authoritative Agent consumption operation. A separate evaluate call is not required. The tool may accept a prior receipt ID as an optimization, but it always revalidates caller, Scope, query digest, policy, freshness, and waterlines before returning facts.

Evaluation and the first bounded read occur in one PostgreSQL `REPEATABLE READ` transaction. A denied result returns no asset body:

```text
accessDecision: DENY
trustStatus: SOURCE_CHECK_REQUIRED | BLOCKED
asOf
reasonCodes[]
remediationActions[]
```

An allowed result returns:

```text
accessDecision: ALLOW
trustEnvelope
assets[]
relationships[]
responseCompleteness: COMPLETE | PARTIAL
nextCursor?
```

The trust envelope includes receipt ID, Profile, selector digest, Scope, `asOf`, policy version, and source waterline digest. Agent responses derived from the result must retain the Profile and `asOf` boundary.

## Pagination And Snapshot Safety

Large reads use a signed continuation cursor bound to the receipt ID, caller grant digest, query digest, policy version, sort key, and all source waterlines. Every continuation revalidates those values before reading the next page. A changed waterline returns `KNOWLEDGE_RECEIPT_STALE`; pages from different generations cannot be combined.

Trust completeness and response completeness are independent. `SELF_CONTAINED` may accompany a `PARTIAL` page, but the Agent must follow the cursor before describing a complete inventory. Responses enforce asset-count, relationship-count, byte-size, and execution-time budgets.

## Diagnostic Boundary And Compatibility

Ordinary Agent tokens use the readiness-gated operation. Low-level reads of raw observations, candidates, conflicts, expired receipts, or stale assets require `knowledge:diagnostic`. Diagnostic responses are marked `DIAGNOSTIC_ONLY` and are audited.

Compatibility is staged:

1. Add the gated v1 readiness operations and emit deprecation audit for ordinary use of low-level reads.
2. Migrate default Agent grants and Context Packs to the gated operation.
3. End the compatibility window by denying low-level reads to ordinary Agent grants.
4. Preserve low-level diagnostic reads only for governance subjects with explicit permission.

Existing clients do not receive silently different asset payloads. Permission and tool migration are versioned and observable.

## Reason Codes

- `KNOWLEDGE_SOURCE_NOT_CONFIGURED`
- `KNOWLEDGE_COVERAGE_INCOMPLETE`
- `KNOWLEDGE_STALE`
- `KNOWLEDGE_FULL_SNAPSHOT_REQUIRED`
- `KNOWLEDGE_PENDING_PROMOTION`
- `KNOWLEDGE_RECONCILIATION_BLOCKED`
- `KNOWLEDGE_CONFLICT_UNRESOLVED`
- `KNOWLEDGE_RECEIPT_STALE`
- `KNOWLEDGE_POLICY_VIOLATION`
- `KNOWLEDGE_RESPONSE_BUDGET_EXCEEDED`
- `KNOWLEDGE_SCOPE_ACCESS_DENIED`

Remediation actions are typed suggestions such as `START_FULL_SCAN`, `RESUME_CONNECTOR`, `REVIEW_CANDIDATES`, `RESOLVE_CONFLICT`, or `RUN_RECONCILIATION`. Executing them requires an independently authorized state-changing MCP operation.

## Observability And Audit

Per-Scope metrics include readiness decisions by Profile and reason, receipt reuse, evaluation latency, stale-source age, incomplete snapshot age, pending candidate age, reconciliation age, denied diagnostic attempts, pagination invalidations, and response-budget failures. Metrics and logs do not aggregate or reveal unauthorized Scope data.

Every evaluation records the caller, Scope, Profile, selector digest, policy, source waterline digest, decision, reason codes, and receipt ID. Asset bodies are not copied into the audit record.

## Acceptance Tests

1. A published Baseline, complete required source coverage, in-SLO observations, closed tombstones, and converged reconciliation produce `SELF_CONTAINED`.
2. Missing sources, incomplete coverage, DELTA-only evidence where completeness is required, incomplete full snapshots, or open tombstones produce `SOURCE_CHECK_REQUIRED`.
3. Pending observations or candidates prevent an older Baseline from being represented as current.
4. Unresolved conflicts or non-converged reconciliation produce `BLOCKED`.
5. Catalog, relationship, Baseline, connector, snapshot, policy, or grant changes invalidate existing receipts and cursors.
6. TTL expiry invalidates a receipt even when internal waterlines do not change.
7. Future timestamps, clock skew, late arrivals, and repeated timestamps cannot refresh a source incorrectly.
8. Scope denial returns no target existence, connector, coverage, or conflict information.
9. A Scope overlay cannot weaken enterprise minimum policy.
10. Identical caller, query, policy, and waterlines reuse one immutable receipt.
11. Concurrent mutation cannot pass validation and return facts from another waterline.
12. Continuation pages reject mixed waterlines and expose `PARTIAL` until exhausted.
13. Ordinary Agents cannot use diagnostic reads after migration; governance reads remain audited and `DIAGNOSTIC_ONLY`.
14. End to end: scan, review, promote, reconcile, publish, and read; then introduce source drift or freshness expiry and observe immediate denial; rescan and reconverge to restore access.

## First Implementation Increment

The first increment delivers:

- Core policy and readiness evaluators;
- additive PostgreSQL policy and immutable receipt persistence;
- exact-Scope `evaluate_system_knowledge_readiness` and `read_system_knowledge` MCP tools;
- atomic first-page reads and waterline-bound continuation cursors;
- enterprise-minimum plus restrictive Scope policy composition;
- reason codes, remediation actions, audit, and bounded metrics;
- staged ordinary-versus-diagnostic permission migration;
- focused unit, PostgreSQL integration, MCP authorization, concurrency, pagination, and end-to-end tests;
- matching ADR, Proposal, Context Pack, managed assets, typed relationships, Evidence, backlog state, and MCP reconciliation.

`RUNTIME_DIAGNOSIS` is registered in the first increment, but returns `SOURCE_CHECK_REQUIRED` until the Scope has policy-approved runtime sources. No fake runtime evidence is seeded.

## Deferred Work

- Live enterprise source registration, credentials, scheduling, retry/dead-letter operations, and source-owner acceptance.
- Cross-Scope readiness aggregation and comparison.
- Web policy administration and readiness dashboards.
- Automatic remediation execution.
- External identity-provider integration and production service identities.
- Production-scale capacity certification and long-term receipt archival infrastructure.

Each deferred capability requires its own exact-Scope design session, ADR or Proposal as applicable, evidence, MCP synchronization, and backlog owner, trigger, and rationale.

---

# 系统知识可信读取门禁设计

## 状态

已接受的设计，归属精确 Designer 应用服务 Scope；尚未开始实施。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:214866ac-190d-4182-a7ac-6b0d869b40f9`
- 英文是规范内容，本节是完整的中文本地化覆盖。

## 问题

获授权 Agent 可以扫描存量系统，通过 MCP 提交确定性观察，审核并提升语义候选，完成对账并发布 Baseline。但这些能力本身不能证明 SpecForge 已经拥有足够且足够新的知识，可以回答后续关于系统的所有问题。

SpecForge 需要一个失败关闭的读取边界，区分已批准的设计意图和外部可观测的实现、运行事实。只有当精确查询 Profile、选择范围、来源覆盖、新鲜度、权威策略和对账状态在某个明确时间点均满足要求时，Agent 才能把 SpecForge 作为唯一读取来源。

## 目标

1. 为 Agent 提供一个 MCP-first 的统一入口，判断 SpecForge 是否足以回答某次系统理解请求。
2. 必要知识过期、缺失、冲突、越权或未收敛时，硬性阻止确定性回答。
3. 返回不可变、可审计、精确 Scope 的可信收据，并绑定调用者、查询、策略和来源水位。
4. 允许获得显式授权的治理人员读取诊断数据，但禁止诊断数据伪装成当前系统事实。
5. 复用 PostgreSQL 中已有的正式 Baseline、覆盖投影、连接器游标、全量快照终结、Tombstone、冲突和对账收据。

## 非目标

- 不实现新的来源扫描器、企业连接器、调度、轮询、Webhook 或外部 `APPLY`。
- 不自动提升观察或语义候选。
- 在只有周期性观察时不声明实时知识。
- 第一阶段不提供跨 Scope 聚合。
- 第一阶段不增加 Web 管理页面。
- 不声明十亿级性能认证或生产身份集成已经完成。

## 权威边界

- SpecForge 对正式 ADR、Proposal、业务语义、治理状态、已发布架构、本地化和已接受设计意图保持权威。
- 外部实现来源对代码、API 签名、数据库结构、部署版本和运行证据保持权威，直到这些观察被接收、按需审核、提升、对账，并由当前有效的 SpecForge 收据覆盖。
- 扫描观察是证据，不会自动成为已接受设计事实。
- PostgreSQL 对设计事实、来源观察、策略、收据、水位、对账和审计保持权威；图存储仍是可重建的派生投影。
- `SELF_CONTAINED` 只表示某个已注册 Profile 和选择范围在指定时间点足够可信，绝不表示 SpecForge 永久掌握该应用服务的全部事实。

## 知识维度与 Profile

由服务端把已注册 Profile 映射到必要维度和来源，调用方不能省略强制维度或来源。

初始维度：

- `DESIGN_INTENT`：已接受 ADR、规则、架构单元、契约、归属和正式语义。
- `IMPLEMENTATION`：已观察代码结构、API、Schema、测试和部署结构。
- `RUNTIME`：已观察部署版本、调用、健康状态和选定运行证据。

初始 Profile：

- `ARCHITECTURE_OVERVIEW`：`DESIGN_INTENT` 加上解释当前系统结构所需的实现来源。
- `CHANGE_ASSESSMENT`：`DESIGN_INTENT`、`IMPLEMENTATION` 以及策略要求的测试或部署证据。
- `RUNTIME_DIAGNOSIS`：`IMPLEMENTATION` 加 `RUNTIME` 证据。

企业策略定义最低必要来源和最大新鲜度窗口；精确 Scope 策略只能增加来源或收紧新鲜度，不能削弱企业最低要求。策略通过 MCP 治理写入，策略版本变化会使旧收据失效。

## 可信状态

每个必要维度和整体请求返回以下三种状态之一，整体状态取最严格的必要状态：

- `SELF_CONTAINED`：在该 Profile、选择范围、调用者授权和 `asOf` 边界内，可以只使用 SpecForge。
- `SOURCE_CHECK_REQUIRED`：必要证据缺失、过期、不完整、未配置、等待全量快照或等待受治理提升。
- `BLOCKED`：授权、Scope、身份、冲突、策略或对账条件禁止确定性回答。

必须先鉴权，再加载诊断状态。无权限调用者只收到 `KNOWLEDGE_SCOPE_ACCESS_DENIED`，不能获知目标 Scope、来源或事实是否存在。

## 判定输入

评估器在一个精确 Scope 下读取：

- 活动正式 Baseline 及其不可变来源绑定；
- 目录和关系水位；
- Profile 和策略版本；
- 必要来源注册与权威策略；
- 最新完整快照及边界摘要；
- 连接器游标、运行状态、`observedAt`、`receivedAt` 和新鲜度 SLO；
- 待处理观察、候选、提升状态和 Tombstone 闭环；
- 未解决身份或语义冲突；
- 最新持久化对账收据；
- 调用主体和有效授权摘要。

DELTA 流只能证明变化，不能证明完整性或不存在。完整性需要已终结的 `FULL_SNAPSHOT`，或具备等价边界和删除契约的策略认可权威来源。

水位与时间窗口必须同时校验。已知水位变化立即使收据失效；即使内部水位不变，外部来源超过新鲜度 SLO 后也必须过期。未来时间、过大时钟漂移和迟到观察不能错误刷新来源状态。

## 数据模型

### `KnowledgeReadinessPolicy`

由 MCP 治理的精确 Scope 策略覆盖，受企业最低策略约束，包含稳定 ID 和版本、Profile、必要维度和来源角色、来源权威分类、最大新鲜度与时钟漂移、完整快照要求、冲突与对账规则、响应预算和收据保留策略。

### `SystemKnowledgeReadinessReceipt`

不可变 PostgreSQL 运行收据，包含收据 ID 和确定性复用键、精确 Scope、调用主体与授权摘要、Profile、维度、选择器摘要、用途、语言、策略版本、Baseline 与来源 Manifest 摘要、各类水位、分维度与整体状态、覆盖和新鲜度概要、原因码、不可执行修复建议、`asOf`、`validUntil`、审计信息和收据摘要。

确定性复用键包含 Scope、调用者授权摘要、Profile、选择器摘要、策略版本和全部来源水位。状态没有变化时返回同一收据，不新增记录。收据在保留期内不可修改；过期后可以归档运行明细，但必须按保留策略保存收据摘要、判定、调用者、Scope、策略、水位概要和时间用于审计。

收据只是派生可信判定，不能替代设计资产或来源观察的权威地位。

## MCP 契约

### `evaluate_system_knowledge_readiness`

这是可选的规划和诊断操作。输入精确 Scope、已注册 Profile、业务选择器、用途和语言；输出收据 ID、可信状态、分维度状态、时间边界、覆盖/新鲜度概要、原因码和修复建议。必要维度、来源、策略和预算由服务端解析。

### `read_system_knowledge`

这是 Agent 使用系统知识的权威操作，不要求提前调用 evaluate。可以提供已有收据 ID 作为优化，但返回事实前仍要校验调用者、Scope、查询摘要、策略、新鲜度和水位。

评估和第一页有界读取在一个 PostgreSQL `REPEATABLE READ` 事务内完成。拒绝时不返回任何资产正文，只返回 `DENY`、可信状态、时间、原因码和修复建议。允许时返回 `ALLOW`、可信信封、资产、关系、响应完整性和可选游标。可信信封必须包含收据、Profile、选择器摘要、Scope、`asOf`、策略版本和来源水位摘要；Agent 基于结果回答时必须保留 Profile 和 `asOf` 边界。

## 分页与快照安全

大数据读取使用签名游标，绑定收据 ID、调用授权摘要、查询摘要、策略版本、排序键和全部来源水位。每个续页都重新校验，水位变化返回 `KNOWLEDGE_RECEIPT_STALE`，禁止拼接不同代次页面。

可信完整性和响应完整性相互独立。`SELF_CONTAINED` 可以伴随 `PARTIAL` 页面，但 Agent 必须耗尽游标后才能描述完整清单。响应强制执行资产数、关系数、字节数和执行时间预算。

## 诊断边界与兼容性

普通 Agent Token 使用可信门禁操作。读取原始观察、候选、冲突、过期收据或过期资产需要 `knowledge:diagnostic`，响应标记 `DIAGNOSTIC_ONLY` 并记录审计。

兼容迁移分四步：增加门禁操作并对普通低层读取产生弃用审计；把默认 Agent 授权和 Context Pack 迁移到门禁操作；兼容窗口结束后拒绝普通 Agent 低层读取；仅保留治理主体显式授权的诊断读取。现有客户端不会静默收到语义不同的资产载荷，权限和工具迁移必须版本化且可观察。

## 原因码与修复动作

原因码包括来源未配置、覆盖不足、知识过期、需要全量快照、等待提升、对账阻塞、冲突未解决、收据过期、策略违规、响应超预算和 Scope 无权访问。

修复动作是 `START_FULL_SCAN`、`RESUME_CONNECTOR`、`REVIEW_CANDIDATES`、`RESOLVE_CONFLICT`、`RUN_RECONCILIATION` 等类型化建议。执行修复必须通过独立授权的状态变更 MCP 操作。

## 可观测性与审计

按 Scope 记录各 Profile 的判定与原因、收据复用、评估延迟、来源过期时长、快照不完整时长、候选等待时长、对账年龄、被拒诊断、分页失效和预算失败。指标和日志不能聚合或泄露未授权 Scope 数据。

每次评估记录调用者、Scope、Profile、选择器摘要、策略、来源水位摘要、判定、原因码和收据 ID，不复制资产正文。

## 验收测试

1. Baseline 已发布、必要来源完整、观察在 SLO 内、Tombstone 闭环且对账收敛时返回 `SELF_CONTAINED`。
2. 来源缺失、覆盖不足、需要完整性的场景只有 DELTA、全量快照未完成或 Tombstone 未闭环时返回 `SOURCE_CHECK_REQUIRED`。
3. 新观察或候选未处理时，禁止旧 Baseline 被表示为当前事实。
4. 冲突未解决或对账未收敛时返回 `BLOCKED`。
5. 目录、关系、Baseline、连接器、快照、策略或授权变化使旧收据和游标失效。
6. 即使内部水位未变化，TTL 到期也使收据失效。
7. 未来时间、时钟漂移、迟到数据和重复时间戳不能错误刷新来源。
8. Scope 拒绝不泄露目标存在性、连接器、覆盖或冲突信息。
9. Scope 策略不能削弱企业最低要求。
10. 相同调用者、查询、策略和水位复用同一不可变收据。
11. 并发变化不能通过旧校验并返回新水位事实。
12. 分页拒绝混合水位，在耗尽前明确标记 `PARTIAL`。
13. 迁移后普通 Agent 不能诊断读取；治理读取仍有审计并标记 `DIAGNOSTIC_ONLY`。
14. 端到端验证扫描、审核、提升、对账、发布和读取；引入漂移或过期后立即拒绝；重扫并重新收敛后恢复。

## 第一实施增量

第一增量交付 Core 策略与判定器、增量 PostgreSQL 策略和不可变收据、两个精确 Scope MCP 工具、原子第一页与水位绑定游标、企业最低与 Scope 收紧策略合成、原因码/修复建议/审计/有界指标、普通与诊断权限迁移、聚焦单元/数据库/MCP 授权/并发/分页/端到端测试，以及匹配的 ADR、Proposal、Context Pack、托管资产、有类型关系、Evidence、待办状态和 MCP 对账。

第一增量注册 `RUNTIME_DIAGNOSIS`，但在 Scope 没有策略认可运行来源时返回 `SOURCE_CHECK_REQUIRED`，不铺设虚假运行证据。

## Implementation Status

The first increment is implemented for the exact Designer Scope. It includes the Core readiness evaluator, PostgreSQL policy and immutable receipt persistence, atomic `REPEATABLE READ` MCP reads, signed waterline-bound cursors, bounded readiness metrics, compatibility enforcement, prompts and governance guidance, and focused unit, authorization, pagination, concurrency, and end-to-end coverage. The matching ADR, DesignFactManifest, Proposal, Context Pack, managed assets, typed links, and evidence are synchronized through MCP.

The implementation does not claim production source connectors, continuous legacy scanning, cross-Scope aggregation, Web policy administration, external production identity, automatic remediation, or production capacity certification. Those capabilities remain separate backlog facts and require their own exact-Scope design sessions and evidence.

### 实施状态

第一增量已针对精确 Designer Scope 实现。内容包括 Core 就绪判定器、PostgreSQL 策略与不可变收据、原子 `REPEATABLE READ` MCP 读取、绑定来源水位的签名游标、有界就绪指标、兼容模式门禁、提示词与治理指导，以及单元、授权、分页、并发和端到端聚焦测试。对应 ADR、DesignFactManifest、Proposal、Context Pack、托管资产、有类型关系和 Evidence 已通过 MCP 同步。

本增量不声明已交付生产来源连接器、持续存量扫描、跨 Scope 聚合、Web 策略管理、外部生产身份、自动修复或生产容量认证。这些能力仍作为独立待办事实管理，并要求各自的精确 Scope 设计会话和证据。

## 延期工作

- 企业真实来源注册、凭据、调度、重试/死信运维和来源负责人验收。
- 跨 Scope 可信聚合和比较。
- Web 策略管理与可信状态仪表盘。
- 自动执行修复动作。
- 外部身份提供商和生产服务身份集成。
- 生产规模容量认证与长期收据归档基础设施。

每项延期能力都需要独立的精确 Scope 设计会话、适用的 ADR 或 Proposal、证据、MCP 同步，以及带负责人、触发条件和理由的待办事实。
