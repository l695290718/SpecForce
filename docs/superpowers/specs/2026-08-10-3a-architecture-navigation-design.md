# SpecForge 3A Architecture Navigation Workspace

## Design status

Collaboratively approved in conversation; written-spec review is pending before implementation planning.

- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc`
- Related ADRs: `adr-deterministic-3a-knowledge-projections`, `adr-architecture-overview-home`, `adr-mcp-first-architecture`, `adr-application-service-scope-isolation`

## Context

SpecForge already has a deterministic 3A projection contract and MCP derive operation, but the Web console has no dedicated read-only 3A browser. Users currently see generic design-asset pages and a relationship graph, not a guided path from business intent to system realization and technical implementation.

The first browser increment must be useful for an enterprise application service without loading its complete fact graph. It must preserve the existing rules: PostgreSQL is authoritative for authored facts, graph stores are derived, the application service is the minimum write dimension, English is canonical, Chinese is a required human-facing overlay, and MCP remains the formal write boundary.

## Goals

- Provide a read-only architecture navigation workspace at `/architecture/3a`.
- Make business-to-system-to-technology tracing the primary user task.
- Show only the selected exact Scope and a published Baseline by default.
- Start with a bounded focus path and progressively expand it.
- Allow search from any architecture layer and bidirectional tracing.
- Expose explicit alignment, Baseline drift, Evidence, and linked design assets without inventing facts.
- Keep the same query semantics available to Web and MCP clients.
- Remain usable when a Scope contains millions or billions of relationships.

## Non-goals

- Editing, approving, rejecting, promoting, or publishing architecture facts in the Web UI.
- Loading a whole application-service graph into the browser.
- Cross-application-service comparison or aggregation.
- Automatic semantic inference from names, labels, or visual proximity.
- Candidate promotion, external `APPLY`, live source connectors, or new AI reasoning.
- Replacing the existing generic relationship graph; the 3A workspace is a separate architecture view.

## User model and primary flow

The primary user is an architect or engineer who wants to answer: "Which technical implementation realizes this business capability, and what business intent is affected by this technical fact?"

1. The user opens `/architecture/3a?scope=<applicationServiceId>`.
2. The server resolves the exact authorized application-service Scope.
3. The page selects the latest `PUBLISHED` Baseline unless a valid published Baseline is present in the URL.
4. The page opens the BIZ catalog as the initial focus source without loading every relationship.
5. The user searches or selects a fact.
6. The page renders a bounded path across BIZ, SYS, and TECH lanes.
7. The user expands a branch, reverses traversal, or selects another node as the new focus.
8. The detail drawer exposes bilingual content, typed relationships, Evidence, revisions, unresolved questions, and links to existing design assets.
9. The user may switch to Alignment, Drift, or List mode. All state is represented in the URL so the result can be bookmarked and shared.

## Information architecture

### Route and navigation

Add a top-level navigation item labelled `3A Architecture` / `3A 架构` after Workspace and before Design Assets. The route is `/architecture/3a` and carries the existing `scope` query parameter.

The route accepts:

- `scope`: application-service identifier; required for data reads.
- `baseline`: published Baseline identifier; defaults to the latest published Baseline.
- `focus`: assertion or derived node identifier; optional.
- `tab`: `architecture`, `alignment`, or `drift`; defaults to `architecture`.
- `mode`: `lanes` or `list`; defaults to `lanes` on desktop and `list` on narrow screens.
- `locale`: existing application locale state; it does not change canonical stored content.

Invalid, missing, or unauthorized Scope values fail closed and do not reveal data counts, labels, or asset identifiers.

### Page regions

- `BaselineToolbar`: Scope, published Baseline, Profile/version, global search, tabs, and view mode.
- `ArchitectureLanes`: three stable horizontal lanes labelled BIZ, SYS, and TECH.
- `FocusPath`: selected node, path summary, expand controls, truncation status, and traversal history.
- `ArchitectureDetailDrawer`: selected fact and its governance evidence.
- `ProjectionStateBanner`: no Baseline, projection lag, unavailable reader, permission denial, and truncated results.

### Three-lane architecture view

The default view uses three stable lanes:

- BIZ: capabilities, processes, actors, business objects, policies, rules, and terms.
- SYS: modules, application services, domains, logical entities, state machines, APIs, events, and integrations.
- TECH: repositories, dependencies, frameworks, middleware, physical schemas, deployment units, observability, and security controls.

Nodes have a stable dimension and show the canonical English name, localized Chinese name when available, fact type, confidence marker, and evidence count. Edges show direction, typed relationship code, and confidence. The layout never infers a relationship from name similarity.

The selected node remains visually anchored while branch expansion adds bounded results. A selected node can be promoted to the focus without changing the Baseline or writing any fact.

### List fallback

List mode renders the same nodes and edges as an ordered path inspector. It is the default for narrow screens and the explicit fallback when a result exceeds the visual layout budget. It provides keyboard-friendly expansion, stable pagination, and the same detail drawer content.

## Read architecture

### Shared query boundary

Introduce a `ThreeAProjectionQueryService` as the shared semantic boundary for Web and MCP read operations. The service owns Scope validation, Baseline resolution, Profile binding, query budgets, cursor semantics, and DTO mapping. Web pages must not assemble 3A relationships directly from Prisma records.

The existing deterministic `deriveKnowledgeProjection` remains the complete projection algorithm. The browser query service is a bounded reader over the same contracts; it does not become a second authoring store and does not replace the derive operation.

### Query operations

The query boundary exposes these read operations:

| Operation | Purpose | Required scope |
| --- | --- | --- |
| `listPublishedBaselines` | List published Baselines and their projection metadata | exact Scope |
| `searchArchitectureFacts` | Search BIZ, SYS, and TECH assertions with cursor pagination | exact Scope |
| `traceArchitecturePath` | Expand a focus node in a direction under a bounded budget | exact Scope and Baseline |
| `getArchitectureFactDetail` | Read fact, localization, Evidence, relationships, revisions, and asset references | exact Scope and Baseline |
| `getArchitectureAlignment` | Read aligned and unaligned cross-layer assertions | exact Scope and Baseline |
| `getBaselineDrift` | Compare two published Baselines | exact Scope and both Baselines |

The Web route may call server-side query functions or internal route handlers. MCP may expose equivalent read tools. Both clients use the same service and DTOs.

### Storage and projection selection

- PostgreSQL remains authoritative for Baselines, accepted assertions, relationship revisions, Evidence, localization, and Projection Manifest metadata.
- A PostgreSQL Reader is the explicit baseline implementation and supports bounded development and fallback deployments.
- A NebulaGraph Reader is used only when the runtime explicitly selects it and its checkpoint satisfies the requested Baseline relationship version.
- A graph checkpoint that is behind the request returns a typed projection-lag state. The service must not silently return stale graph data or silently switch readers after a graph error.
- The reader returns a common DTO, including `truncated`, `nextCursor`, `completion`, and `projectionVersion` fields so the UI can explain partial results.

### Scope and authority rules

Every query carries both `applicationServiceId` and `scopePath`. The server compares both fields with the authorized principal and the selected Baseline. Every relationship endpoint validates both endpoints before returning an edge. No cross-Scope relationship or count is returned by the browser increment.

MCP is the only write boundary for ADRs, Proposals, Context Packs, design facts, and typed links. The Web 3A workspace has no mutation handlers.

## Interaction and scale policy

### Progressive expansion

The browser does not enforce a fixed global hop limit. It uses per-request budgets:

- node budget;
- edge budget;
- response-time budget;
- payload budget;
- continuation cursor.

The first request returns the focus node and directly related cross-layer paths. Each branch can be expanded independently. When a budget is reached, the response includes a deterministic truncation reason and cursor. Deep or broad impact analysis is delegated to the existing asynchronous impact-analysis capability and is not rendered as an unbounded browser graph.

### Alignment

The Alignment tab groups explicit typed relationships by source layer, target layer, domain, and relationship code. It shows aligned assertion pairs, unaligned assertion IDs, confidence, and Evidence coverage. It must not present a guessed alignment score as an authored fact.

### Drift

The Drift tab compares the selected published Baseline with its previous published Baseline by semantic identity. It shows `ADDED`, `REMOVED`, `CHANGED`, and `UNCHANGED`. Candidates, working streams, and unpublished facts are excluded from the official view.

### Detail drawer

The detail drawer shows:

- canonical English content and Chinese localized overlay;
- layer, aspect, fact type, domain cluster, confidence, and status;
- incoming and outgoing typed relationships;
- Evidence and source observation references;
- revision, Baseline, Profile, and projection version;
- unresolved questions and counter-evidence;
- linked existing design assets where an explicit identity mapping exists.

The drawer provides navigation links, not edit controls.

## Failure and empty states

- No published Baseline: show the Scope and explain that the official architecture view is unavailable until a Baseline is published.
- Baseline exists but projection metadata is missing: show a blocking projection state with a retryable operational reference.
- Graph projection lag: show required relationship version and current checkpoint; do not show stale graph results.
- Result truncated: show budget category, returned count, continuation cursor, and expand action.
- Missing localization or Evidence: show a completeness warning on the affected node; do not synthesize content.
- Missing focus node: preserve the selected Baseline and return to the searchable catalog.
- Unauthorized Scope: fail closed without data-dependent details.
- Service or reader unavailable: show a sanitized error code and preserve the URL state for retry.

## Localization and accessibility

English is canonical. Human-facing labels and decision content require a complete Chinese overlay using existing localization rules. Technical identifiers, Scope IDs, digests, relationship codes, and projection versions remain unchanged by locale.

The lane view has keyboard focus order, visible focus treatment, semantic labels for nodes and edges, and a list-mode equivalent. Reduced-motion behavior follows the existing Web conventions. Text must not overlap nodes, drawers, controls, or responsive breakpoints.

## Verification and acceptance

### Core and query tests

- same Baseline/Profile/Scope/input produces the same digest and DTO ordering;
- unpublished or incomplete Baselines are rejected;
- sibling-Scope assertions and relationships fail closed;
- explicit typed relationships are the only source of cross-layer alignment;
- cursor continuation is deterministic and does not duplicate nodes;
- node, edge, payload, and time budgets return stable truncation metadata;
- PostgreSQL and NebulaGraph Readers return equivalent scoped fixtures;
- graph checkpoint lag fails closed;
- Baseline drift compares only published Baselines;
- Evidence, localization, and asset links are returned without mutation.

### Web tests

- navigation preserves Scope and reaches `/architecture/3a`;
- Baseline, focus, tab, locale, and mode survive refresh;
- BIZ default search, any-layer search, and bidirectional traversal work;
- the detail drawer exposes the expected read-only content and no edit controls;
- Alignment, Drift, empty, lag, truncation, permission, and reader-error states render;
- desktop lane view and mobile/list fallback render without overlap or blank canvas;
- keyboard navigation and reduced-motion behavior pass focused checks.

### Operational checks

- exact Scope Web smoke for `com.huawei.celon.desiner`;
- MCP read operation and Web query use the same DTO fixtures;
- design-fact synchronization and read-back verify the matching Proposal, ADR, Context Pack, Evidence, and typed links;
- exact-Scope federation reconciliation returns `blocking:false`;
- no Web mutation path can write an authored asset.

## Delivery boundary

This design covers the first productized 3A browser for one authorized application-service Scope and published Baselines. It does not claim that all enterprise semantic knowledge has been discovered or that the whole graph is renderable. External live connectors, automatic promotion, CodeHub enforcement, cross-Scope comparison, production object storage, and billion-scale certification remain separate work.

Implementation must use a new exact-Scope design session, update the matching repository ADR/Proposal/Context Pack and MCP records through the MCP write boundary, and close with command-level evidence before being marked complete.

## 中文设计说明

### 设计状态

本设计已在协作讨论中确认，书面 Spec 仍需用户审阅；审阅通过后才能进入实施计划。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc`
- 关联 ADR：`adr-deterministic-3a-knowledge-projections`、`adr-architecture-overview-home`、`adr-mcp-first-architecture`、`adr-application-service-scope-isolation`

### 背景与目标

SpecForge 已经具备确定性 3A 投影契约和 MCP 派生工具，但 Web 控制台没有独立的 3A 浏览页面。用户现在只能看到通用设计资产页和关系图谱，无法沿着“业务意图到系统实现再到技术实现”的路径浏览架构。

本增量为单个企业应用服务提供只读的 3A 架构导航。它默认只读取已发布 Baseline，不加载完整关系图，不创建或修改事实。PostgreSQL 继续保存权威事实，图数据库只能作为派生投影；英文是规范内容，中文是面向人的必需覆盖；MCP 继续是正式写入边界。

### 页面与用户流程

新增一级菜单“3A 架构”，路由为 `/architecture/3a`，位于工作台之后、设计资产之前，并继承现有 `scope`。页面支持 Baseline、焦点、页签、视图模式和语言状态的 URL 恢复。

默认“架构导航”使用三条固定泳道：

- `BIZ`：业务能力、流程、参与者、业务对象、政策、规则和术语；
- `SYS`：模块、应用服务、领域、逻辑实体、状态机、API、事件和集成；
- `TECH`：代码库、依赖、框架、中间件、物理 Schema、部署、可观测性和安全控制。

初始页面打开 BIZ 目录，选择节点后只加载有界路径。任何层都可以搜索，节点支持上下游双向追溯。右侧抽屉展示英文规范内容、中文覆盖、事实类型、Aspect、置信度、关系、Evidence、来源修订、未决问题和已明确映射的设计资产。页面没有编辑按钮。

### 读取架构

Web 和 MCP 共用 `ThreeAProjectionQueryService`，由它负责 Scope 校验、Baseline 解析、Profile 绑定、查询预算、游标和 DTO。Web 不直接拼接 Prisma 记录，浏览器也不直接执行写入。

查询能力包括：列出已发布 Baseline、搜索任意层事实、按焦点展开路径、读取事实详情、读取跨层对齐和比较两个已发布 Baseline 的漂移。

PostgreSQL 是 Baseline、断言、关系、Evidence、本地化和 Projection Manifest 的权威存储。NebulaGraph 只有在显式选择且检查点满足所需关系版本时用于关系遍历。图检查点落后时显示“投影同步中”，不得静默读取旧图或隐式切换读取器。PostgreSQL 与 NebulaGraph 必须返回相同的 Scope、方向、节点、边和截断原因。

### 规模与状态

页面不设置固定的全局跳数上限，而是采用节点、边、响应时间、载荷和游标预算。首次返回焦点和直接跨层路径，分支可以独立继续展开；达到预算时返回确定性的截断原因和继续游标。深层或大范围分析转入已有异步影响分析能力。

对齐页展示显式类型关系、已对齐路径、未对齐事实、低置信度关系和 Evidence 缺口，不生成猜测性的对齐事实。漂移页默认比较选中的已发布 Baseline 与前一个已发布 Baseline，展示新增、删除、变化和未变化。

页面必须明确处理：没有 Baseline、投影元数据缺失、图检查点落后、结果截断、本地化或 Evidence 缺失、焦点不存在、权限不足和读取服务不可用。权限错误失败关闭，不显示数据数量或名称。

### 验收与边界

验收覆盖精确 Scope、已发布 Baseline、任意层搜索、双向追溯、确定性游标、PG/Nebula 结果一致、投影延迟失败关闭、Baseline 漂移、双语内容、URL 恢复、只读行为、桌面泳道、移动端列表降级、键盘操作和错误状态。

本设计不包含事实编辑、审批、Baseline 发布、跨应用服务聚合、全量全景图、候选提升、实时连接器、外部 `APPLY`、CodeHub 门禁、生产对象存储或亿级认证。实现前必须创建新的精确 Scope 设计会话，通过 MCP 更新匹配 ADR、Proposal、Context Pack、Evidence 和类型关系，并以命令级证据关闭会话。
