# Design-Fact Dual-Record Governance

## Status

**Accepted as repository policy; implemented and locally verified.** `AGENTS.md`, `docs/adr/README.md`, and the governance specification enforce the repository-side policy. The seven baseline ADR records, matching Proposals, Context Packs, typed links, and independent Evidence records are persisted and reconciled through the MCP write boundary.

- Stable ADR/MCP ID: `adr-design-fact-dual-record-governance`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge exposes architectural decisions and design facts to both reviewers in Git and agents through MCP. A repository-only ADR is reviewable but not queryable by the design center; an MCP-only record is queryable but lacks the immutable change history and ordinary code-review workflow. Missing scope, localization, links, or evidence also makes a fact unsafe to use for impact analysis and context generation.

The project requires English canonical content, complete Chinese human-facing overlays, exact application-service isolation, typed directional relationships, and explicit tracking for deferred or blocked work. The governance specification also requires the implementation and its matching design facts to be committed together.

## Decision

Adopt a dual-record governance policy. Git is the reviewable engineering record; SpecForge, written only through the MCP boundary, is the queryable operational design record. Every non-trivial architectural change receives a stable repository ADR and a matching MCP ADR under the exact owning Scope. New or changed assets, contracts, rules, state transitions, APIs, events, models, relationships, user workflows, and agent-facing context receive their corresponding canonical assets, Proposals, Context Packs, or typed links.

English fields are canonical. Chinese localized sections are complete human-facing overlays and must not mutate technical identifiers or executable contract values. Completion requires matching IDs, exact scope, complete localization, verified relationships, and evidence in both records. If MCP cannot be written or verified, the ADR must say `MCP synchronization blocked`, record the failure and retry trigger, and create or update a tracked backlog fact; it must not claim full completion.

## Alternatives

1. **Git-only governance.** Rejected because agents and the Design Center cannot query the authoritative operational fact through MCP.
2. **MCP-only governance.** Rejected because review history, branch context, and immutable repository evidence would be lost.
3. **Best-effort localization and links.** Rejected because incomplete bilingual content and untyped relationships undermine human review, authorization, and impact analysis.
4. **Implicit global scope or default-service fallback.** Rejected because it can expose or mutate facts outside the authorized application service.

## Consequences

Positive consequences:

- Reviewers and agents see the same stable decision identity and canonical content.
- Scope, localization, links, and evidence become explicit acceptance criteria rather than tribal knowledge.
- Deferred capability remains discoverable with an owner, rationale, and retry trigger.
- Impact analysis and Context Pack generation can trace decisions to assets and implementation evidence.

Tradeoffs:

- Every non-trivial change has synchronization and verification work in addition to code review.
- MCP outages or missing connectors block full completion and require backlog hygiene.
- Reconciliation tooling must detect missing, mismatched, and out-of-scope facts as the inventory grows.

## Constraints

- This ADR governs facts owned by `com.huawei.celon.desiner` and its exact canonical Scope path only.
- MCP is the only system-of-record write boundary for ADRs, Proposals, Context Packs, and typed links.
- PostgreSQL is authoritative for persisted authored assets and relationship events; graph stores are derived projections.
- IDs are stable across Git and MCP; links are directional, typed, and scope-safe.
- English canonical fields and complete Chinese localized sections are mandatory for human-facing decision content.
- Technical identifiers, Scope values, protocol structures, relation codes, and executable values remain language-neutral.
- Cross-service decisions require an explicitly authorized platform Scope and typed links; they must not be duplicated as unrelated local facts.

## Evidence

- **Implemented:** `AGENTS.md` defines the dual-record completion policy, exact Scope requirement, bilingual requirement, MCP-only write boundary, evidence requirement, and distinction between implemented, locally verified, and deferred behavior.
- **Implemented:** `docs/adr/README.md` defines stable filenames, required sections, MCP Record requirements, PostgreSQL authority, and blocked-synchronization handling.
- **Implemented:** `docs/superpowers/specs/2026-07-17-design-fact-governance-design.md` defines fact classification, bilingual canonical rules, stable IDs, typed links, and completion workflow.
- **Locally verified:** repository inspection confirms the three policy records and the exact Designer Scope path are present; this ADR and ADR 0006 use stable IDs and all required sections.
- **Locally verified:** `pnpm design-facts:sync` persisted all seven manifest ADR IDs, matching Proposals, Context Packs, typed links, Evidence assets, and `VALIDATES` links through the MCP stdio write boundary using the exact Designer scope.
- **Locally verified:** `pnpm design-facts:check` read the scoped MCP graph and reported all seven decisions as verified with no missing, mismatched, out-of-scope, or blocked records.

## MCP Record

- Matching MCP ADR ID: `adr-design-fact-dual-record-governance`
- Exact owning `architectureScope`: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related repository records: `AGENTS.md`, `docs/adr/README.md`, `docs/superpowers/specs/2026-07-17-design-fact-governance-design.md`, and `docs/adr/0006-transactional-outbox-graph-projection.md`.
- Matching Proposal, Context Pack, typed MCP links, and persisted Evidence references: complete for the baseline manifest; each Evidence record has a directional `VALIDATES` link to its owning ADR.
- **MCP ADR synchronization:** complete and reconciled for the baseline manifest through `pnpm design-facts:sync` and `pnpm design-facts:check`; both commands use the MCP stdio boundary and the exact owning scope.

## 中文本地化 / Chinese Localization

### 完成更新

本 ADR 的双记录治理能力已于 2026-07-17 在本地完成并验证：七条基线 ADR、关联 Proposal、Context Pack、定向关系和独立 Evidence 资产均通过 MCP 写入 PostgreSQL。每条 Evidence 均以 `VALIDATES` 关系关联到所属 ADR。`pnpm design-facts:check` 已从同一应用服务 Scope 的 MCP 图回读全部记录，结果为七条 verified，且没有缺失、不匹配、越界或阻塞项。

### 状态

**已作为仓库政策接受；已部分实现并完成本地验证。** `AGENTS.md`、`docs/adr/README.md` 和治理规范已经约束仓库侧政策。MCP 持久化、对账报告以及完整等价的运行时记录，在 MCP 写入边界可用并完成核验前均为**延期/受阻**。

- 稳定 ADR/MCP ID：`adr-design-fact-dual-record-governance`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

### 背景

SpecForge 同时通过 Git 面向评审者、通过 MCP 面向代理公开架构决策和设计事实。仅有仓库 ADR 虽然可评审，却不能被设计中心查询；仅有 MCP 记录虽然可查询，却缺少不可变的变更历史和普通代码评审流程。缺少 Scope、本地化、链接或证据，也会使事实无法安全地用于影响分析和上下文生成。

项目要求英文规范内容、完整的中文面向人的覆盖、精确的应用服务隔离、有类型且有方向的关系，以及对延期或受阻工作的明确跟踪。治理规范还要求实现及其匹配的设计事实一起提交。

### 决策

采用双记录治理政策。Git 是可评审的工程记录；SpecForge 是只能通过 MCP 边界写入的可查询运行时设计记录。每个非平凡架构变更都必须有稳定的仓库 ADR，并在精确所属 Scope 下拥有匹配的 MCP ADR。新增或变更的资产、契约、规则、状态转换、API、事件、模型、关系、用户工作流和代理上下文，都必须获得对应的规范资产、Proposal、Context Pack 或有类型链接。

英文字段是规范内容。中文章节是完整的面向人的本地化覆盖，不得修改技术标识符或可执行契约值。完成条件要求两条记录具有匹配 ID、精确 Scope、完整本地化、已核验关系和证据。如果 MCP 无法写入或核验，ADR 必须写明 `MCP synchronization blocked`，记录失败原因和重试触发条件，并创建或更新待办事实；不得声称完全完成。

### 备选方案

1. **仅使用 Git 治理。** 拒绝，因为代理和设计中心无法通过 MCP 查询权威运行时事实。
2. **仅使用 MCP 治理。** 拒绝，因为会失去评审历史、分支上下文和不可变的仓库证据。
3. **尽力提供本地化和链接。** 拒绝，因为不完整的双语内容和无类型关系会削弱人工评审、授权和影响分析。
4. **隐式全局 Scope 或默认服务回退。** 拒绝，因为可能暴露或修改授权应用服务之外的事实。

### 后果

积极后果：评审者和代理看到相同的稳定决策身份及规范内容；Scope、本地化、链接和证据成为明确验收标准而非口头知识；延期能力带着负责人、理由和重试触发条件保持可发现；影响分析和 Context Pack 生成可以从决策追踪到资产和实现证据。

权衡：每个非平凡变更除代码评审外还需要同步与核验工作；MCP 中断或缺少连接器会阻止完全完成并要求维护待办；随着事实清单增长，必须有对账工具发现缺失、不匹配和越界事实。

### 约束

- 本 ADR 仅治理 `com.huawei.celon.desiner` 及其精确规范 Scope 路径所属的事实。
- MCP 是 ADR、Proposal、Context Pack 和有类型链接的唯一系统记录写入边界。
- PostgreSQL 是持久化已编写资产和关系事件的权威来源；图存储是派生投影。
- Git 与 MCP 之间的 ID 必须稳定一致；链接必须有方向、有类型且 Scope 安全。
- 面向人的决策内容必须有英文规范字段和完整中文本地化章节。
- 技术标识符、Scope 值、协议结构、关系代码和可执行值保持语言中立。
- 跨服务决策必须使用明确授权的平台 Scope 和有类型链接，不得作为无关的本地事实重复创建。

### 证据

- **已实现：** `AGENTS.md` 定义双记录完成政策、精确 Scope 要求、双语要求、MCP 唯一写入边界、证据要求，以及已实现、本地验证和延期行为的区分。
- **已实现：** `docs/adr/README.md` 定义稳定文件名、必需章节、MCP Record 要求、PostgreSQL 权威性和同步受阻处理。
- **已实现：** `docs/superpowers/specs/2026-07-17-design-fact-governance-design.md` 定义事实分类、双语规范规则、稳定 ID、有类型链接和完成流程。
- **已本地验证：** 仓库检查确认上述三份政策记录及精确 Designer Scope 路径存在；本 ADR 与 ADR 0006 使用稳定 ID 且包含全部必需章节。
- **延期/受阻：** 本次会话无法获得等价 MCP 记录、已核验的 MCP 链接/证据，也没有可报告缺失/不匹配/越界事实的对账命令或测试。

### MCP 记录

- 匹配的 MCP ADR ID：`adr-design-fact-dual-record-governance`
- 精确所属 `architectureScope`：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 相关仓库记录：`AGENTS.md`、`docs/adr/README.md`、`docs/superpowers/specs/2026-07-17-design-fact-governance-design.md` 和 `docs/adr/0006-transactional-outbox-graph-projection.md`。
- 匹配的 Proposal、Context Pack、有类型 MCP 链接、待办事实以及持久化证据引用：本次会话未验证。
- **MCP 同步受阻：** 当前可用工具没有 SpecForge ADR/设计记录写入端点。待 MCP 持久化工具可用后重试；在治理完成前，必须持久化并对账稳定 ID、精确 Scope、英文规范字段、完整中文覆盖、有类型链接和证据。
