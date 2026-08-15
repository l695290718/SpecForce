# Designer 3A v6 Semantic Unit Expansion Design

## Status

- Design approved for specification; implementation has not started.
- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Written-design session: `design-change-session:09030b6d-8552-45a6-aab4-0c12a81d7b44`.
- English is canonical. Chinese is the complete human-facing localization.

## Context

The published Designer v5 Baseline contains 4 architecture units, 38 memberships, and 3 cross-layer mappings. It intentionally leaves four valid design assets unclassified because each needs an explicit architecture-unit decision:

- `api-specforge-ai-generation`
- `api-specforge-graph-query`
- `api-specforge-web-console`
- `obs-specforge-mcp-audit`

All four assets exist in the exact Designer Scope, have canonical English content and Chinese overlays, and have typed relationship evidence. Their semantic boundaries must be authored explicitly. Names alone, graph proximity, and shared implementation files are not classification evidence.

## Goals

- Publish an additive, immutable v6 Baseline derived from the accepted v5 snapshot.
- Create one explicit SYS architecture unit for each deferred responsibility.
- Add exactly one membership for each selected asset.
- Add only cross-layer mappings backed by existing typed relationships and accepted v5 memberships.
- Preserve exact-Scope authorization, bilingual review, MCP-only authoring, PostgreSQL authority, deterministic projection, and v5 historical readability.

## Non-Goals

- Classifying any asset other than the four named candidates.
- Reassigning existing v5 memberships or changing existing v5 unit semantics.
- Creating same-layer Map mappings for Web Console calls; those relationships remain available in the detailed Network view.
- Inferring business capabilities, ownership, dependencies, or technical deployment from names.
- Cleaning graph-verification fixtures; that is a separate P1 increment.
- Claiming enterprise-wide 3A completeness.

## Considered Approaches

### 1. Additive v6 complete snapshot

Carry forward the accepted v5 snapshot, add four independently defined units and memberships, and add only three evidence-backed SYS-to-TECH mappings. Publish the result as a new immutable Baseline. This is the selected approach because it preserves history and makes every new semantic decision reviewable.

### 2. Extend existing SYS units

Place the four assets in the MCP Governance Gateway or 3A Projection Service. Rejected because it collapses distinct product responsibilities and contradicts the v5 decision to defer them for dedicated unit design.

### 3. Bulk classification from names or graph topology

Generate units and mappings from identifiers, paths, or nearest neighbors. Rejected because it turns correlation into architecture fact and weakens source-owner review.

## Architecture Unit Decisions

| Unit identity | Layer | Kind | Canonical name | Chinese name | Parent | Direct member |
| --- | --- | --- | --- | --- | --- | --- |
| `unit:sys:specforge-web-console` | SYS | APPLICATION | SpecForge Web Console | SpecForge Web 控制台 | `unit:biz:specforge-governed-design-facts` | `api-specforge-web-console` |
| `unit:sys:specforge-ai-generation-service` | SYS | SERVICE | AI generation service | AI 生成服务 | `unit:biz:specforge-governed-design-facts` | `api-specforge-ai-generation` |
| `unit:sys:specforge-asset-graph-query-service` | SYS | SERVICE | Asset graph query service | 资产图查询服务 | `unit:biz:specforge-governed-design-facts` | `api-specforge-graph-query` |
| `unit:sys:specforge-mcp-audit-observability-service` | SYS | SERVICE | MCP audit observability service | MCP 审计可观测服务 | `unit:biz:specforge-governed-design-facts` | `obs-specforge-mcp-audit` |

The audit unit is SYS, not TECH. It owns an observable system responsibility and consumes audit data; PostgreSQL remains the supporting TECH unit. This distinction allows the existing `OBSERVES` relationship to support an explicit SYS-to-TECH mapping without treating an observability design asset as infrastructure.

Parent identities express that the four units realize the governed design-fact capability. Parentage does not fabricate a Map edge. A Map mapping is created only when the evidence matrix below supports it.

## Evidence Matrix

| Source | Existing typed evidence | Accepted target membership | v6 result |
| --- | --- | --- | --- |
| `api-specforge-ai-generation` | `READS` and `WRITES` `data-specforge-ai-generation` | The data model is a v5 member of `unit:tech:specforge-postgresql-authority` | Add `SERVICE_TO_TECHNOLOGY` mapping from AI generation service to PostgreSQL authority |
| `api-specforge-graph-query` | `READS` `data-specforge-asset-graph` | The data model is a v5 member of `unit:tech:specforge-postgresql-authority` | Add `SERVICE_TO_TECHNOLOGY` mapping from asset graph query service to PostgreSQL authority |
| `obs-specforge-mcp-audit` | `OBSERVES` `data-specforge-audit` | The data model is a v5 member of `unit:tech:specforge-postgresql-authority` | Add `SERVICE_TO_TECHNOLOGY` mapping from audit observability service to PostgreSQL authority |
| `api-specforge-web-console` | `CALLS` AI generation and graph query APIs; governed by the core-service reuse rule | Both called APIs become SYS members in v6 | Preserve the typed same-layer relationships in Network; add no cross-layer Map mapping |

Each mapping revision must carry the exact relationship identity used as evidence. If a relationship or accepted target membership is missing at implementation time, the affected mapping is blocked; it is not replaced by a weaker heuristic.

## v6 Snapshot Contract

v6 is a complete Baseline snapshot, not a delta interpreted at read time.

- Baseline ID: `knowledge-baseline:designer:3a:v6`.
- Unit count: 8.
- Membership count: 42.
- Mapping count: 6.
- Layer totals: BIZ 1, SYS 6, TECH 1.
- New unclassified count for the declared four-asset set: 0.
- The 9 known `specforge-graph-verification-*` fixtures remain excluded.

Existing v5 units, memberships, and mappings are copied into new immutable revisions without semantic changes. The four new unit revisions, four memberships, and three mappings use stable identities and versioned revision IDs. Replaying the same v6 idempotency key must return the same governed records and must not create duplicate revisions.

## Governance Flow

1. Open a new implementation Design Change Session in the exact Designer Scope; do not reuse the written-design session.
2. Read the published v5 Baseline, all four candidate assets in `en` and `zh`, and all relationship identities referenced by the evidence matrix.
3. Fail closed if v5 is not `PUBLISHED`, the projection is not `READY`, the Scope differs, bilingual content is incomplete, or any required source is missing.
4. Submit one MCP architecture-fact batch containing the complete 8/42/6 snapshot.
5. Create a T1 Review Bundle whose coverage applies only to the declared v6 source set.
6. Approve and promote only the reviewed architecture fact revisions.
7. Require reconciliation status `CONVERGED` before publishing `knowledge-baseline:designer:3a:v6`.
8. Build and publish the v6 projection, then read it back through both public MCP architecture query paths.
9. Close the implementation session only after the code/data checks and MCP readback evidence agree.

## Failure Handling

- A missing bilingual field, evidence relationship, parent unit, target membership, or exact Scope match blocks the batch before authoring.
- A partially accepted batch cannot be published as v6.
- A failed promotion, reconciliation, Baseline publication, or projection leaves v5 as the latest known-good Baseline.
- A Web Console unit without cross-layer evidence is published without a Map mapping; lack of a mapping is explicit and is not an error.
- Any blocked implementation records `MCP synchronization blocked`, the reason, owner, and retry trigger. It must not be described as complete.

## Verification

- Focused tests validate unit layer/kind pairs, stable identities, complete-snapshot counts, bilingual fields, mapping endpoint identity, and idempotent retry.
- MCP readback verifies the exact Scope, `8/42/6`, BIZ/SYS/TECH totals, and zero unclassified candidates in the declared set.
- Unit-neighborhood readback verifies each new unit contains exactly its intended direct member.
- Mapping readback verifies the three new mappings cite the expected typed relationships and the Web Console has no invented cross-layer mapping.
- The pinned v5 Baseline remains readable as `4/38/3`.
- Design-fact synchronization, reconciliation, focused type checks, and `git diff --check` must pass before closing the implementation session.

## Acceptance Criteria

- The exact Designer Scope publishes a `PUBLISHED` v6 Baseline and `READY` projection.
- v6 contains exactly 8 units, 42 memberships, and 6 mappings.
- Each new unit has complete canonical English and Chinese human-facing content.
- Each of the four deferred assets appears exactly once as a direct unit member.
- Only the three evidence-backed SYS-to-TECH mappings are added.
- v5 remains unchanged and queryable.
- No graph-verification fixture is included.
- Repository records, MCP records, evidence IDs, and session IDs agree.

## 中文本地化覆盖

### 状态与背景

- 设计已经批准进入书面 Spec；尚未开始实施。
- 所属应用服务：`com.huawei.celon.desiner`。
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- 书面设计会话：`design-change-session:09030b6d-8552-45a6-aab4-0c12a81d7b44`。

Designer 已发布的 v5 Baseline 包含 4 个架构单元、38 个成员归属和 3 条跨层映射。AI 生成 API、资产图查询 API、Web Console API 和 MCP 审计可观测性设计被有意保留为未分类，因为它们需要独立的架构单元决策。四项资产都存在于精确 Designer Scope，具备中英文内容和有类型关系证据；不能仅根据名称、图邻近关系或共享代码文件进行分类。

### 目标与边界

v6 在已接受 v5 快照上追加四个独立 SYS 单元：Web Console 应用、AI 生成服务、资产图查询服务和 MCP 审计可观测服务。每个候选资产只新增一个直接成员归属。现有 v5 单元、成员和映射保持语义不变，并以新的不可变修订写入完整 v6 快照。

本增量不分类其他资产，不重分配 v5 成员，不按名称推断关系，不清理图验证夹具，也不宣称企业级 3A 全量完成。Web Console 对 AI 与图查询的调用属于 SYS 同层关系，继续在详细关系网络中展示，不伪造成跨层 Map 映射。

### 单元与映射决策

- `unit:sys:specforge-web-console`：SYS/APPLICATION，中文名“SpecForge Web 控制台”，成员为 `api-specforge-web-console`。
- `unit:sys:specforge-ai-generation-service`：SYS/SERVICE，中文名“AI 生成服务”，成员为 `api-specforge-ai-generation`。
- `unit:sys:specforge-asset-graph-query-service`：SYS/SERVICE，中文名“资产图查询服务”，成员为 `api-specforge-graph-query`。
- `unit:sys:specforge-mcp-audit-observability-service`：SYS/SERVICE，中文名“MCP 审计可观测服务”，成员为 `obs-specforge-mcp-audit`。

审计可观测单元归入 SYS，而不是 TECH，因为它负责系统级可观测行为并消费审计数据；PostgreSQL 才是支撑它的 TECH 单元。AI 生成 API 对 AI 数据模型的读写、图查询 API 对资产图模型的读取，以及审计设计对审计数据的观察，分别支撑三条指向 PostgreSQL 权威存储的 `SERVICE_TO_TECHNOLOGY` 映射。任何必需关系或目标成员缺失时，对应映射必须阻塞，不能降级为启发式推断。

### 快照、流程与验收

v6 的固定目标是 8 个单元、42 个成员归属、6 条映射，层级统计为 BIZ 1、SYS 6、TECH 1。Baseline ID 为 `knowledge-baseline:designer:3a:v6`。9 条已知图验证夹具继续排除。

实施时必须新建精确 Scope 会话，通过 MCP 读取 v5、四项候选资产的中英文内容和证据关系，并提交完整 8/42/6 快照。T1 审核、批准、晋升、`CONVERGED` 对账、Baseline 发布和 `READY` 投影必须顺序完成。失败时 v5 保持为已知可用版本；不得把部分结果描述为 v6。

验收必须证明 v6 精确回读为 8/42/6，四项资产各出现一次，只有三条有证据的新增跨层映射，v5 仍可按 4/38/3 查询，夹具未混入，仓库记录与 MCP 记录及会话 ID 完全一致。
