# 3A Readable Member Relationships Design

## Status / 状态

Approved design on 2026-08-23. Implementation has not started.

已于 2026-08-23 确认设计，尚未开始实施。

## Problem / 问题

The 3A Network view now loads every governed unit and its direct members, but it only renders unit mappings and membership edges. It does not show the typed, direct relationships between loaded members. The current cluster click handler also toggles collapse and expansion with the same action while hidden members continue to participate in layout. A user can therefore click a unit and see an ambiguous or apparently unchanged graph.

当前 3A 网络图已加载全部架构单元及其直接成员，但仅渲染单元映射和成员归属边，尚未显示已加载成员之间的有类型直接关系。现有单元点击同时承担折叠和展开，而隐藏成员仍参与布局，用户点击后可能看到语义含混或近似无变化的图谱。

## Goals / 目标

- Show bounded, direct typed relationships whose two endpoints are already-loaded direct members.
- Default to a readable, larger member expansion instead of forcing every member into the first camera frame.
- Make a click on a collapsed unit always expand it; clicking an expanded unit selects and focuses it.
- Make the visible graph, rather than hidden nodes, drive layout.
- Preserve one exact-Scope, Baseline-bound, generation-qualified query and the PostgreSQL authority boundary.

- 展示两端均属于已加载直接成员、且受预算约束的有类型直接关系。
- 默认显示更多成员，同时保持首屏可读。
- 折叠单元点击后必然展开；已展开单元点击后仅选中并聚焦。
- 由实际可见子图驱动布局，而非让隐藏节点继续占用布局空间。
- 保持精确 Scope、Baseline 和 Generation 约束，以及 PostgreSQL 的权威边界。

## Non-Goals / 非目标

- Do not include TRACE coverage assets, inferred paths, or cross-Scope facts.
- Do not change authored 3A units, memberships, mappings, or assertion relationships.
- Do not expose unbounded assertion-level impact analysis in the overview graph.
- Do not replace Sigma/WebGL, Graphology, PostgreSQL, or the derived graph projection.

- 不纳入 TRACE 覆盖资产、推断路径或跨 Scope 事实。
- 不修改已编写的 3A 单元、成员归属、映射或断言关系。
- 不在概览图中暴露无界的断言级影响分析。
- 不替换 Sigma/WebGL、Graphology、PostgreSQL 或派生图投影。

## Query Contract / 查询契约

`unitGraph` gains two additive options:

- `includeMemberRelations?: boolean`, defaulting to `false` for compatibility;
- `budget.maxMemberRelations`, validated independently and defaulting to `120` for the Network overview.

When both `includeMembers` and `includeMemberRelations` are true, the result keeps the existing unit, member, mapping, and `ARCHITECTURE_MEMBERSHIP` edges and additionally returns direct assertion relationship edges. Each returned relationship must have both `sourceAssertionId` and `targetAssertionId` in the returned direct-member assertion set. The response gains the additive fidelity `UNIT_WITH_MEMBERS_AND_RELATIONS`.

`unitGraph` 新增两个兼容性选项：

- `includeMemberRelations?: boolean`，默认 `false`；
- `budget.maxMemberRelations`，独立校验，网络概览默认 `120`。

当 `includeMembers` 与 `includeMemberRelations` 同时为 `true` 时，结果保留既有单元、成员、映射及 `ARCHITECTURE_MEMBERSHIP` 边，并额外返回直接断言关系边。每条关系的 `sourceAssertionId` 和 `targetAssertionId` 都必须属于本次已返回直接成员集合。响应新增兼容性的 fidelity：`UNIT_WITH_MEMBERS_AND_RELATIONS`。

## Bounded Retrieval and Isolation / 有界读取与隔离

The repository receives a dedicated batched member-relationship read. Its predicate includes the exact application-service Scope, full Scope path, generation, Baseline, and projection manifest identity, plus `sourceAssertionId IN memberIds AND targetAssertionId IN memberIds`. It must not reuse the existing one-sided dependency lookup, because that lookup may return an edge to a node outside the visible member set.

Rows are ordered deterministically by descending confidence, relation code, source assertion ID, target assertion ID, and relationship identity. The repository reads `maxMemberRelations + 1` rows. If exceeded, the response returns a deterministic prefix and reports `MEMBER_RELATION_BUDGET_EXCEEDED` and `CONTINUATION_REQUIRED`; it never claims the overview is complete.

仓储新增专用的批量成员关系读取。其条件必须包含精确应用服务 Scope、完整 Scope 路径、Generation、Baseline、投影 Manifest，以及 `sourceAssertionId IN memberIds AND targetAssertionId IN memberIds`。不得复用单侧依赖查询，因为后者可能返回连向可见成员集合外节点的边。

查询按置信度降序、关系编码、源断言 ID、目标断言 ID 和关系 ID 稳定排序，读取 `maxMemberRelations + 1` 条。超限时返回稳定前缀，并报告 `MEMBER_RELATION_BUDGET_EXCEEDED` 与 `CONTINUATION_REQUIRED`，不得把概览描述为完整结果。

## Default Visibility and Interaction / 默认可见性与交互

The loaded graph is distinct from the visible graph:

- All governed unit clusters are always visible.
- The initial expanded set is deterministic: first select one relation-bearing unit from each BIZ, SYS, and TECH layer, then select remaining units by member-relationship degree, member count, and unit identity until at most 36 direct members are visible. The current 42-member Designer projection therefore opens substantially more content while keeping a bounded camera view.
- Only edges whose endpoints are visible render. Unit mappings remain visible regardless of member expansion. Membership and member-relationship edges appear when both relevant endpoints are visible.
- A click on a collapsed unit expands that unit and recalculates the visible layout. A click on an expanded unit only selects, focuses, and opens its normal details. It does not silently collapse it.
- An explicit, localized `Collapse selected unit` control is available only for a selected expanded cluster. Search selection of a hidden member first expands its owner.

加载图与可见图必须分离：

- 所有架构单元始终可见。
- 初始展开集合必须稳定：先从 BIZ、SYS、TECH 每层选择一个具有成员关系的单元，再按成员关系度、成员数和单元 ID 选择其余单元，直到最多可见 36 个直接成员。当前 Designer 的 42 个成员将默认展示更多内容，同时保持相机视图有界。
- 仅两端可见的边可渲染。单元映射不受成员展开影响；成员归属边和成员关系边仅在相关端点可见时显示。
- 点击折叠单元会展开该单元并重算可见布局。点击已展开单元只会选中、聚焦并打开既有详情，不会隐式折叠。
- 仅当选中已展开单元时显示本地化的 `Collapse selected unit` 控件。通过搜索选中隐藏成员时，先展开其所属单元。

## Rendering and Layout / 渲染与布局

Graphology continues to hold the complete, bounded response. A pure visible-subgraph selector supplies both Sigma reducers and the layout worker, so hidden nodes and hidden edges cannot distort forces, camera fitting, or selection neighborhoods. Expansion keeps stored positions where possible, then runs one short, cancellable refinement layout. No click issues additional network requests.

Graphology 继续保存完整的有界响应。纯可见子图选择器同时供 Sigma reducer 和布局 Worker 使用，隐藏节点和边不得影响力导向、相机适配或选中邻域。展开尽可能保留已有位置，再执行一次短暂、可取消的精细布局；点击不触发额外网络请求。

## Errors and Partial Results / 错误与部分结果

- An empty member-relationship result is valid and renders the unit/member topology normally.
- A member-relationship query error fails the overview explicitly; it never falls back to external facts or fabricates edges.
- Budget overflow remains visible in the existing partial-result treatment and includes the new reason.
- Scope, Baseline, generation, and projection identity mismatches remain hard errors before merge.

- 成员关系为空是合法结果，仍正常渲染单元与成员拓扑。
- 成员关系查询失败必须显式失败，不得回退到外部事实或伪造边。
- 预算超限沿用既有部分结果提示，并包含新原因。
- Scope、Baseline、Generation 和投影身份不匹配在合并前保持硬错误。

## Verification / 验证

- Core and handler tests validate the additive relation option, fidelity, budget, and partial reason.
- Repository tests prove both-endpoint predicates, exact identity predicates, deterministic ordering, and truncation detection.
- Knowledge-query tests cover member relationship conversion and prevent external endpoints from entering the result.
- Graph tests cover deterministic default expansion, one-way click expansion, explicit collapse, visibility-consistent edges, and layout input filtering.
- One final browser and Docker validation verifies the initial visible-member count, typed relation legend, expansion, collapse, camera controls, no duplicate request, and no console or API errors.

## Design-Fact Governance / 设计事实治理

Before implementation, open an exact Designer-Scope design-change session. The completed increment updates ADR 0025, the linked Proposal, Context Pack, 3A query API contract, projection read model, relationship links, baseline manifest, and evidence through MCP. The session closes only after focused verification, MCP synchronization, and scoped read-back converge.

实施前必须打开精确 Designer Scope 的设计变更会话。完成后通过 MCP 更新 ADR 0025、关联 Proposal、Context Pack、3A 查询 API 契约、投影读模型、关系链接、基线 Manifest 和验证证据；仅在针对性验证、MCP 同步与精确 Scope 回读全部收敛后关闭会话。
