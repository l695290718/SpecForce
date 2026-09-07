# Design-Catalog Feature Curation Design

## Status

Proposed and approved for implementation. This design corrects the Feature-catalog backfill boundary without changing the separate source-code discovery governance path.

## Context

The current Feature-catalog backfill command reads `ARCHITECTURE_OVERVIEW`. That profile correctly requires current `DESIGN_CATALOG` and `SOURCE_CODE` evidence for an Agent to explain an application system. It is too strict for a deterministic curation operation that only classifies already-authored SpecForge assets into Service Features and Functional Features. As a result, the initial Feature catalog cannot be written until a source connector, full scan, semantic review, promotion, reconciliation, and baseline publication are all complete.

Existing authored assets already have exact Scope ownership, English canonical content, Chinese human-facing overlays, durable revisions, and typed relationships. The curation operation must be able to use those facts without pretending that it has scanned source code or inferred implementation semantics.

## Decision

1. Add a distinct `DESIGN_CATALOG_CURATION` system-knowledge profile. Its enterprise-minimum evidence requirement is a current, complete `DESIGN_CATALOG` source and a non-blocked exact-Scope reconciliation state. It does not accept `SOURCE_CODE` as a substitute and does not require it.
2. Keep `ARCHITECTURE_OVERVIEW`, `CHANGE_ASSESSMENT`, and `RUNTIME_DIAGNOSIS` unchanged. They continue to fail closed when their required external evidence is absent, stale, partial, conflicted, or unreconciled.
3. Make `feature-catalog:backfill` request only `DESIGN_CATALOG_CURATION`. It still performs readiness evaluation first, then receipt-bound paginated `read_system_knowledge`, then one bounded `apply_feature_change_set` through MCP.
4. Feature planning remains conservative: only the existing relationship ontology permits direct links; indirect mappings require an existing evidenced relationship; unsupported or unproven mappings remain explicit exceptions. No source-derived, field-level, or implementation relationship is invented.
5. A Scope whose latest reconciliation is `MISSING` or `UNVERIFIED`, but not `BLOCKED`, may receive a curation receipt only when the catalog source is complete, current, conflict-free, and has no pending candidates. A `BLOCKED` reconciliation remains a hard denial.
6. Source-code inventory is a separate future increment. It must expose the complete connector-run lifecycle through MCP, retain source-minimized observations, complete semantic review/promotion, reconcile, and publish a Baseline before it can satisfy `ARCHITECTURE_OVERVIEW`.

## Consequences

- Existing authored design assets can be written into bilingual Feature records now, while the write remains exact-Scope, receipt-bound, atomic, and auditable.
- A successful curation receipt means only that authored design facts are fit for curation. It does not assert source-code coverage, implementation correctness, runtime health, or zero drift.
- The UI may show Feature value/behavior traceability earlier, but any source-dependent assessment must continue to report unavailable source evidence.
- The readiness policy, profile schema, MCP input validation, feature backfill command, tests, ADR-0045, ADR-0047, Proposal, Context Pack, and reconciliation evidence must move together.

## Alternatives

- Lower the existing `ARCHITECTURE_OVERVIEW` policy: rejected because it would allow source-dependent system understanding without source evidence.
- Write Feature assets directly with an administrative bypass: rejected because it breaks receipt-bound knowledge consumption and hides unavailable evidence.
- Wait for the full source scanner before populating Features: rejected because it blocks deterministic curation of already-governed authored design assets for no semantic benefit.

## Constraints

- Exact Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative; search and graph are derived projections.
- MCP remains the only write boundary for Feature records and typed relationships.
- English is canonical; complete Chinese overlays remain mandatory for human-facing Feature fields.
- No profile may weaken the evidence requirements of `ARCHITECTURE_OVERVIEW`, `CHANGE_ASSESSMENT`, or `RUNTIME_DIAGNOSIS`.

## Verification

- Unit tests prove profile-specific readiness: catalog-only curation allows a healthy authored catalog without source code; architecture overview remains denied in the same snapshot.
- MCP tool tests prove exact Scope authorization and receipt binding for the new profile.
- Backfill tests prove the command selects `DESIGN_CATALOG_CURATION`, never writes after denial, and creates bilingual, ontology-valid Feature Change Sets after allowance.
- A live dry run returns `ALLOW`, then an apply writes only the exact Scope's Feature assets and links. Readback verifies English/Chinese details, bounded graph, coverage, and zero sibling-Scope data.

## 中文本地化覆盖内容

### 标题

设计目录特性编排设计

### 状态

本设计已获准进入实施。它修正特性目录回填的边界，不改变独立的源码发现治理链路。

### 背景

当前特性目录回填使用 `ARCHITECTURE_OVERVIEW`。该 Profile 对 Agent 理解整个应用系统时正确要求当前 `DESIGN_CATALOG` 和 `SOURCE_CODE` 证据，但对仅把已编写 SpecForge 资产确定性归类为服务特性和功能特性的编排操作过于严格。因此，在完成源码连接器、全量扫描、语义审核、提升、对账和基线发布前，初始特性目录无法写入。

现有编写型资产已经具备精确 Scope 归属、英文规范字段、中文本地化、人类可读修订历史和有类型关系。编排必须能消费这些事实，但不得假装已经扫描源码或推导出实现语义。

### 决策

1. 新增独立的 `DESIGN_CATALOG_CURATION` 系统知识 Profile。其企业最低证据要求为当前且完整的 `DESIGN_CATALOG` 来源与非 `BLOCKED` 的精确 Scope 对账状态；它既不以 `SOURCE_CODE` 替代目录，也不要求源码。
2. 保持 `ARCHITECTURE_OVERVIEW`、`CHANGE_ASSESSMENT` 和 `RUNTIME_DIAGNOSIS` 不变；外部证据缺失、过期、不完整、冲突或未对账时仍必须失败关闭。
3. `feature-catalog:backfill` 仅请求 `DESIGN_CATALOG_CURATION`：先评估就绪度，再按回执分页读取 `read_system_knowledge`，最后通过 MCP 提交单个有界 `apply_feature_change_set`。
4. 特性规划保持保守：仅使用现有关系本体允许的直接关系；间接映射必须具备已有证据关系；不支持或无法证明的映射必须保留为明确例外；不得虚构源码、字段或实现关系。
5. 当最新对账为 `MISSING` 或 `UNVERIFIED` 但非 `BLOCKED` 时，只要目录来源完整、当前、无冲突且没有待处理候选，Scope 可以获得编排回执；`BLOCKED` 仍是硬拒绝。
6. 源码盘点仍是后续独立增量：必须通过 MCP 暴露完整连接器运行生命周期，保留最小化源码观察，完成语义审核/提升、对账与 Baseline 发布后，才可满足 `ARCHITECTURE_OVERVIEW`。

### 后果

- 已编写设计资产可立即写入双语 Feature，且写入仍保持精确 Scope、回执绑定、原子性和可审计性。
- 成功的编排回执只表示已编写设计事实适合归类，不能声明源码覆盖、实现正确性、运行健康或零漂移。
- UI 可以更早展示特性的价值/行为追溯，但依赖源码的评估仍必须报告源码证据不可用。

### 备选方案

- 未降低现有 `ARCHITECTURE_OVERVIEW` 策略，因为这会让依赖源码的系统理解在没有源码证据时放行。
- 未采用管理绕过直接写 Feature，因为这会破坏回执绑定的知识消费并隐藏缺失证据。
- 未等待完整扫描器再填充 Feature，因为这会无语义收益地阻塞已治理编写资产的确定性编排。

### 约束

- 精确 Scope 固定为 `com.huawei.celon.desiner` 及其对应 `scopePath`。
- PostgreSQL 保持权威；搜索与图仅为派生投影。
- Feature 与有类型关系只能通过 MCP 写入。
- 英文为规范字段，面向人的 Feature 字段必须具备完整中文覆盖。
- 新 Profile 不得削弱其他三个现有 Profile 的证据要求。

### 验证

- 单元测试证明目录编排 Profile 可在无源码但目录健康时放行，而同一快照的架构概览仍被拒绝。
- MCP 测试证明新 Profile 的精确 Scope 授权和回执绑定。
- 回填测试证明命令选择 `DESIGN_CATALOG_CURATION`，拒绝时不写入，放行后生成双语且本体合法的 Feature Change Set。
- 实时干跑必须返回 `ALLOW`；应用后只写入精确 Scope 的 Feature 资产与关系，并回读验证中英文详情、有界图、覆盖和兄弟 Scope 零泄露。
