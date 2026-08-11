# Readable 3A Architecture Mapping Design

## Status

Approved direction, pending written-spec review. This document defines a future implementation increment and does not claim that the behavior is implemented.

## Scope

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design session: `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`
- Existing decisions: `adr-3a-architecture-navigation-workspace`, `adr-scalable-3a-exploration`, `adr-webgl-3a-graph-exploration`
- Primary surface: `/architecture/3a?tab=architecture&mode=graph`

## Problem

The current Overview is a bounded relationship network, but it is not a readable architecture map. The observed Designer Scope loads 151 nodes and 234 edges into a 454-by-576-pixel canvas. Labels are suppressed to protect rendering density, while edges retain similar visual weight. The result is a graph hairball: the data is present, but the user cannot answer which business capability is realized by which system service and which technology platform supports that service.

The current graph also mixes two different jobs:

1. architecture comprehension: understand the BIZ, SYS, and TECH structure and their primary mappings;
2. network exploration: inspect detailed design facts, arbitrary typed links, neighborhoods, and impact paths.

One force-directed view cannot optimize both jobs. The default must prioritize architecture comprehension, while the existing GitNexus-aligned network remains available as an advanced exploration view.

## Confirmed product decisions

The user selected the following decisions:

1. The default view prioritizes the BIZ, SYS, and TECH architecture structure and cross-layer mappings.
2. Primary nodes represent semantic architecture units, not design-asset types and not algorithmic communities.
3. Selecting an architecture unit replaces the overview with a bounded local graph, opens an explanatory inspector, and preserves a breadcrumb back to the overview.
4. The overview shows only cross-layer mappings. Same-layer dependencies appear after drill-down.

## Goals

1. Make the default 3A view readable without requiring zoom, hover, or prior graph knowledge.
2. Show a clear BIZ to SYS to TECH realization chain.
3. Preserve exact-Scope, Baseline, Projection, authorization, and PostgreSQL authority boundaries.
4. Derive architecture units only from explicit authored semantics; never invent a business capability or system component from graph topology.
5. Keep the existing full relationship network for advanced exploration and impact analysis.
6. Make truncation, unclassified facts, missing mappings, and partial results explicit.

## Non-goals

- Do not replace the existing bounded Network exploration mode.
- Do not treat API, rule, event, data-model, or quality asset types as top-level architecture units.
- Do not use graph-community detection as the canonical architecture structure.
- Do not infer undocumented architecture units in the browser.
- Do not aggregate data across application-service Scopes.
- Do not make the Web UI an authoring surface; architecture semantics continue to be written through MCP.

## Considered approaches

### 1. Semantic architecture map (selected)

Use explicit business capabilities, processes, business objects, applications, services, components, platforms, runtimes, infrastructure, and technology services as the primary units. Design assets become members of those units. This produces an explainable enterprise architecture view and stable identities across builds.

Trade-off: the source facts and projection profile must carry explicit architecture-unit membership. Existing unclassified assets cannot be silently grouped.

### 2. Design-asset-type map (rejected as the default)

Group nodes as APIs, rules, data models, events, state machines, integrations, quality requirements, and observability assets. This is easy to derive from current records but represents an asset inventory, not a 3A architecture.

This remains useful as a filter and drill-down summary.

### 3. Algorithmic community map (rejected as canonical)

Use graph density to create communities. This produces visually compact clusters, but labels and membership can change when unrelated edges change. The result is difficult to govern, compare, and explain to enterprise users.

Algorithmic clustering may continue to support Network layout, but it cannot define canonical architecture units.

## Information model

### Architecture unit

An architecture unit is a versioned, exact-Scope projection of explicitly authored semantic facts.

Required fields:

- `unitIdentity`: stable identity within the application-service Scope;
- `layer`: `BIZ`, `SYS`, or `TECH`;
- `unitKind`: profile-governed kind code;
- `canonicalName`: required English canonical name;
- `canonicalDescription`: required English canonical description;
- `localizedName.zh-CN` and `localizedDescription.zh-CN`: required human-facing Chinese overlay;
- `parentUnitIdentity`: optional explicit hierarchy within the same layer;
- `memberCount` and counts by accepted asset type;
- `criticality`, evidence coverage, and mapping completeness;
- `contentDigest`, Baseline, Projection, generation, application-service ID, and full Scope path.

The generic profile provides these initial kind families:

- BIZ: `CAPABILITY`, `PROCESS`, `BUSINESS_OBJECT`;
- SYS: `APPLICATION`, `SERVICE`, `COMPONENT`, `DATA_DOMAIN`;
- TECH: `PLATFORM`, `RUNTIME`, `INFRASTRUCTURE`, `TECHNOLOGY_SERVICE`.

Profiles may extend these codes, but a code must declare its owning layer and localized label. An asset without an explicit unit reference remains unclassified and contributes to a visible completeness metric.

### Architecture-unit membership

Membership links one projection assertion to one architecture unit in the same exact Scope and generation. Membership records carry their source assertion, evidence references, confidence, and content digest. Membership is derived from authored facts and can be rebuilt; it is not an additional authored truth.

### Cross-layer mapping

The overview contains only mappings whose source and target units are in different architecture layers. A mapping aggregates explicit typed relationships between member assertions and preserves:

- source and target unit identities;
- source and target layers;
- normalized mapping family;
- contributing relationship types and count;
- minimum and aggregate confidence;
- evidence coverage and unresolved-link count;
- stable mapping digest.

The renderer never creates a mapping merely because two units are close in the graph. BIZ-to-SYS mappings express realization or enablement. SYS-to-TECH mappings express deployment, runtime, persistence, or technology support. Unsupported relation types remain available in Network mode and do not appear in the default map.

## Projection and storage

PostgreSQL remains authoritative for authored facts and relationship events. Architecture units, memberships, and unit mappings are immutable, rebuildable projection records owned by a published Baseline and Projection generation.

The projector materializes three derived read models:

1. `ArchitectureUnitProjection` for unit summaries;
2. `ArchitectureUnitMemberProjection` for assertion membership;
3. `ArchitectureUnitMappingProjection` for aggregated cross-layer mappings.

The exact database names may follow the repository naming convention during implementation. Every unique key and index must begin with `applicationServiceId`, `scopePath`, and generation identity. Graph stores remain optional derived consumers and are never required to render the default map.

Projection publication is blocked when a unit or mapping crosses Scope, references a missing endpoint, lacks an English canonical identity, or has an invalid layer-kind combination. Missing Chinese human-facing localization is reported as a governance failure under the existing bilingual policy.

## Query contracts

Add two operations to the existing versioned 3A query boundary rather than changing the meaning of the current `overview` operation:

### `architectureMap`

Input:

- exact Scope, Baseline, and Projection identity;
- optional layer, unit-kind, relation-family, criticality, and text filters;
- explicit per-layer and mapping budgets;
- optional continuation.

Output:

- ordered architecture units;
- aggregated cross-layer mappings;
- total and returned counts per layer;
- unclassified fact counts;
- mapping completeness and evidence-coverage summaries;
- continuation and explicit partial reasons;
- deterministic result digest.

The default budget is at most 12 units per layer and 60 cross-layer mappings. The UI shows returned-versus-total counts and never disguises truncation as completeness.

### `architectureUnitNeighborhood`

Input:

- exact identity and selected `unitIdentity`;
- direction, relationship families, member asset types, and bounded depth;
- continuation and finite query budget.

Output:

- selected unit detail;
- adjacent architecture units across layers;
- selected-unit member facts;
- same-layer dependencies relevant to the selected unit;
- contributing typed relationships and evidence;
- continuation and explicit partial reasons.

Existing `overview`, `impact`, `search`, `detail`, and `trace` operations retain their meanings and compatibility.

Equivalent exact-Scope MCP read tools must expose the two new operations. Architecture-unit semantics and membership facts remain MCP-only writes.

## User experience

### View model

The Architecture tab exposes two distinct graph representations:

- Map: default readable 3A architecture mapping;
- Network: the existing GitNexus-aligned bounded relationship exploration.

Force, Tree, and Circles controls belong to Network. Map uses a deterministic structured layout and does not expose force-layout controls.

### Map overview

Desktop uses three ordered vertical columns from left to right: BIZ, SYS, and TECH. Mobile uses the same reading order from top to bottom. Each layer has a stable header, returned-versus-total count, and completeness state.

Architecture units are compact labeled nodes with:

- an always-visible canonical or localized name;
- a unit-kind label;
- member count;
- a small completeness or warning indicator when needed.

The initial view shows no raw design-asset nodes. It uses deterministic ordering by explicit parent hierarchy, criticality, name, and stable identity. The layout must not move after it settles.

Only cross-layer mappings are drawn. Edges use restrained curves from BIZ to SYS and SYS to TECH. Multiple contributing relationships are bundled into one mapping edge. The edge label appears on focus or selection and states the mapping family and relationship count.

Hover or keyboard focus highlights one unit and its cross-layer chain. Unrelated units and mappings dim but remain visible. Selection is URL-addressable and does not refetch the overview.

### Drill-down

Selecting a unit changes the canvas to a bounded local graph. A breadcrumb records `3A Map > selected unit` and returns to the previous map state without losing filters or camera position.

The local graph includes:

- the selected architecture unit;
- directly mapped units in adjacent layers;
- member design facts for the selected unit;
- relevant same-layer dependencies;
- only the relationships needed to explain those nodes.

A desktop inspector opens on the right; mobile uses a bottom sheet. The inspector shows canonical English and the active localized overlay, unit kind, parent, member counts by asset type, cross-layer mappings, evidence coverage, unresolved gaps, Baseline, Projection, and digest. Selecting a member fact reuses the existing fact-detail experience.

### Search and filtering

Map search matches unit names, aliases, kinds, and member semantic identities, but returns units as the primary result. Filters include layer, unit kind, mapping family, criticality, completeness, and unclassified status.

Search selection focuses the matching unit and its chain. Filters update the URL. Empty filters never cause a hidden cross-Scope or unbounded query.

### Density and overflow

When a layer exceeds its budget, the layer header shows the returned and total counts and offers bounded continuation or catalog navigation. The renderer does not create an `Other` unit because that would imply a false semantic grouping.

At narrow widths, users inspect one layer transition at a time: BIZ-to-SYS or SYS-to-TECH. The control is a segmented transition selector, not horizontal page overflow.

## Visual system and motion

The Map is an enterprise architecture work surface, not a decorative network. BIZ uses amber accents, SYS uses blue accents, and TECH uses teal accents within the existing balanced neutral UI. Color is redundant with layer labels and position.

The signature interaction is a readable realization chain: focusing a business unit reveals a continuous, restrained path through system units to technology units. Other animation is secondary.

Motion rules:

- the first render may draw the three layer columns and mapping paths once;
- drill-down uses a finite transition from the selected unit into its local graph;
- no ambient force motion runs in Map;
- `prefers-reduced-motion` removes path drawing and camera interpolation without removing focus or hierarchy.

All labels must fit their nodes at supported mobile and desktop widths. Focus, selection, and mapping explanations must be available by keyboard and not depend on hover.

## State and URL behavior

Add URL state without invalidating existing links:

- `graphRepresentation=map|network`, default `map`;
- `unit=<unitIdentity>` for drill-down;
- `transition=BIZ_SYS|SYS_TECH` for narrow-screen inspection;
- existing Scope, Baseline, Projection, filters, direction, and graph-view parameters remain supported.

Changing layout-only or selection-only state must not discard the loaded result. Changing Scope, Baseline, Projection, or server filters resets incompatible unit selection and opens a new exact-identity query.

## Error and empty states

- No published projection: retain the existing Baseline/Projection guidance.
- No semantic units: report that the projection contains facts but no governed architecture-unit mapping; do not fall back silently to algorithmic clusters.
- Unclassified facts: show the count and allow bounded inspection through the catalog.
- Missing mappings: show isolated units and an explicit completeness warning.
- Partial result: show returned-versus-total counts and partial reasons.
- Projection unavailable: keep the last valid map visible when identity still matches, mark it stale, and allow retry.
- WebGL unavailable: Map may use a semantic DOM/SVG or Canvas renderer because its bounded structured result is small; Network retains the existing WebGL fallback.

## Component boundaries

- `architecture-map-workspace`: map query lifecycle, URL state, filters, drill navigation, and stale-result handling;
- `architecture-map-layout`: deterministic three-layer layout and responsive transition layout;
- `architecture-map-renderer`: structured nodes, bundled mappings, focus, keyboard interaction, and reduced motion;
- `architecture-unit-inspector`: bilingual unit, membership, mapping, evidence, and gap details;
- existing `architecture-graph-workspace` and Sigma components: advanced Network exploration only;
- projector and query packages: semantic-unit materialization, exact-Scope persistence, budgets, continuation, and deterministic digests.

Each component consumes typed contracts and must be testable without reading implementation internals of the other components.

## Verification

Focused verification must cover:

1. deterministic unit and mapping materialization from explicit authored facts;
2. rejection of missing endpoints, cross-Scope memberships, and invalid layer-kind combinations;
3. exact-Scope, Baseline, Projection, authorization, and continuation checks;
4. stable digests and ordering across repeated builds;
5. backward compatibility of existing graph operations and URLs;
6. default map budgets, explicit truncation, unclassified counts, and mapping completeness;
7. BIZ-to-SYS-to-TECH overview rendering with always-visible unit labels;
8. drill-down, breadcrumb return, inspector, keyboard navigation, and URL persistence;
9. mobile transition view without horizontal page overflow;
10. bilingual completeness and reduced-motion behavior;
11. browser acceptance showing that the same 151-node/234-edge source projection is represented by a bounded semantic map rather than a graph hairball;
12. MCP synchronization and exact-Scope reconciliation of the ADR, Proposal, Context Pack, contracts, data model, and typed links.

## Acceptance criteria

- A user can identify at least one complete BIZ-to-SYS-to-TECH realization chain without zooming or hovering.
- Every visible overview node is a governed semantic architecture unit with an always-visible label.
- The default overview contains no same-layer edge and no raw design-asset node.
- Selecting a unit opens a bounded local graph and inspector, and returning restores the prior overview state.
- Missing classification or mappings are explicit; the system never invents semantic groupings.
- The default map remains readable at supported mobile and desktop widths.
- Network mode retains the current GitNexus-aligned exploration behavior.
- All reads and writes remain exact-Scope; PostgreSQL remains authoritative for authored facts and relationship events.

## Deferred work

- Editing architecture-unit semantics in the Web UI remains deferred; owner: SpecForge Product; trigger: a separately approved authoring workflow; rationale: MCP remains the only write boundary.
- Cross-application-service portfolio maps remain deferred; owner: SpecForge Architecture; trigger: explicit multi-Scope authorization and aggregation design; rationale: the current product guarantees exact application-service isolation.
- Algorithmic suggestions for missing architecture-unit membership remain deferred; owner: SpecForge AI and Governance; trigger: evidence-backed candidate/review workflow; rationale: suggestions must never become canonical facts automatically.

---

# 可读的 3A 架构映射设计

## 状态

方向已确认，等待书面 Spec 复核。本文定义后续实施增量，不表示相关行为已经实现。

## 范围

- 应用服务：`com.huawei.celon.desiner`
- Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计会话：`design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`
- 相关决策：`adr-3a-architecture-navigation-workspace`、`adr-scalable-3a-exploration`、`adr-webgl-3a-graph-exploration`
- 主要页面：`/architecture/3a?tab=architecture&mode=graph`

## 问题

当前 Overview 是一个有界关系网络，但不是易读的架构映射。Designer Scope 实际加载 151 个节点和 234 条边，并将它们绘制在约 454 x 576 像素的画布内。为了控制密度，大多数标签被隐藏，而大量关系线具有接近的视觉权重，最终形成典型的“关系毛球”。数据虽然存在，但用户无法直接回答：某个业务能力由哪些系统服务实现，又由哪些技术平台承载。

当前页面还混合了两个不同目标：一是理解 BIZ、SYS、TECH 的架构结构和主映射；二是探索具体设计事实、任意类型关系、邻域与影响路径。一个力导向视图无法同时做好这两件事。默认视图必须优先服务架构理解，现有 GitNexus 风格 Network 则继续承担高级探索。

## 已确认的产品决策

1. 默认视图优先呈现 BIZ、SYS、TECH 三层架构及跨层映射。
2. 主节点代表有治理语义的架构单元，而不是设计资产类型，也不是图算法社区。
3. 选择架构单元后，画布切换为有界局部图，同时打开解释面板，并通过面包屑返回总览。
4. 总览只显示跨层映射；层内依赖在钻取后显示。

## 设计结论

Architecture 标签提供两个职责清晰的图形视图：

- Map：默认的可读 3A 架构映射；
- Network：现有 GitNexus 风格的有界关系网络探索。

Force、Tree、Circles 只属于 Network。Map 使用确定性的结构化布局，不运行持续力导向动画。

## 架构语义单元

架构单元是从显式维护的语义事实中派生出的、带版本且精确归属 Scope 的投影记录。它至少包含稳定身份、BIZ/SYS/TECH 层、受 Profile 治理的单元类型、英文规范名称和描述、完整中文覆盖、可选父单元、成员数量、资产类型统计、关键度、证据覆盖、映射完整度以及 Baseline、Projection、generation、Scope 和摘要。

通用 Profile 初始支持：

- BIZ：业务能力、业务流程、业务对象；
- SYS：应用、服务、组件、数据域；
- TECH：平台、运行时、基础设施、技术服务。

Profile 可以扩展类型，但必须声明所属层和双语名称。没有显式架构单元引用的设计事实保持“未分类”，并进入可见的完整度指标；系统不能根据图拓扑自行发明业务能力或系统组件。

成员关系把一个投影断言连接到同一 Scope、同一 generation 的架构单元，并保留来源断言、证据、置信度和摘要。成员关系属于可重建投影，不是新增的权威事实。

## 跨层映射

总览只包含端点位于不同架构层的映射。每条映射聚合成员事实之间已有的类型化关系，并保留源/目标单元、层、规范映射族、贡献关系类型和数量、置信度、证据覆盖、未解决关系数量和稳定摘要。

BIZ 到 SYS 表达实现或支撑关系；SYS 到 TECH 表达部署、运行、持久化或技术支撑关系。不受支持的关系仍可在 Network 中探索，但不进入默认 Map。渲染器不能因为两个单元在图上靠近就生成映射。

## 投影与存储

PostgreSQL 继续对已编写事实和关系事件保持权威。架构单元、成员和单元映射属于发布 Baseline 与 Projection generation 下的不可变、可重建派生记录。

Projector 物化三个派生读模型：架构单元、架构单元成员和架构单元映射。实际表名在实施时遵循仓库命名规范。所有唯一键和索引必须以前缀 `applicationServiceId`、`scopePath` 和 generation 身份开始。默认 Map 不依赖图数据库即可渲染。

架构单元或映射一旦跨 Scope、引用不存在端点、缺少英文规范身份，或单元类型与层不匹配，Projection 发布必须被阻止。面向人的中文覆盖缺失继续按现有双语治理规则处理。

## 查询契约

在现有版本化 3A 查询边界中新增两个 operation，不改变当前 `overview` 的语义：

- `architectureMap`：按精确 Scope、Baseline、Projection 查询架构单元、跨层聚合映射、每层总数和返回数、未分类数量、映射完整度、证据覆盖、continuation、partial reason 和确定性摘要。默认每层最多 12 个单元、最多 60 条跨层映射。
- `architectureUnitNeighborhood`：查询选中单元、相邻跨层单元、成员设计事实、相关层内依赖、贡献关系和证据，并保持有限深度和有限预算。

现有 `overview`、`impact`、`search`、`detail` 和 `trace` 保持兼容。MCP 提供对应的精确 Scope 读取工具；架构单元语义和成员事实仍只能通过 MCP 写入。

## 总览交互

桌面端从左到右呈现 BIZ、SYS、TECH 三列；移动端按同一阅读顺序从上到下呈现。每层显示稳定标题、返回数/总数和完整度状态。

架构单元节点始终显示名称、单元类型、成员数量和必要的完整度警告。初始画面不显示原始设计资产节点。排序由显式父层级、关键度、名称和稳定身份确定，布局稳定后不再移动。

总览只绘制 BIZ 到 SYS、SYS 到 TECH 的跨层映射。多条贡献关系聚合成一条映射边，聚焦或选中时显示映射族和关系数量。悬停或键盘聚焦一个单元时，高亮其跨层链路，其他内容降噪但不消失。选择状态写入 URL，但不重新请求整个总览。

## 钻取交互

选择一个架构单元后，画布切换到有界局部图。面包屑显示“3A Map > 当前单元”，返回时恢复之前的过滤条件和视图位置。

局部图包含当前架构单元、相邻层直接映射单元、当前单元成员设计事实、相关层内依赖，以及解释这些节点所需的关系。桌面端右侧打开 Inspector，移动端使用底部面板。Inspector 显示中英文内容、单元类型、父单元、资产类型成员统计、跨层映射、证据覆盖、未解决缺口、Baseline、Projection 和摘要。选择成员事实时复用现有事实详情体验。

## 密度、搜索和移动端

搜索匹配单元名称、别名、类型和成员语义身份，但结果以架构单元为主。过滤条件包括层、单元类型、映射族、关键度、完整度和未分类状态，并同步到 URL。

某层超出预算时明确显示“已返回/总数”，提供有界 continuation 或目录导航。系统不能创建一个“其他”单元，因为这会暗示并不存在的语义分组。

窄屏一次阅读一个层间过渡：BIZ 到 SYS 或 SYS 到 TECH。使用分段控制切换过渡，不产生整页横向滚动。

## 视觉与动效

Map 是企业架构工作面，而不是装饰性网络。BIZ 使用琥珀强调色、SYS 使用蓝色、TECH 使用青绿色，并同时通过位置和文字表达层级，不能只依赖颜色。

唯一重点动效是“实现链”：聚焦业务单元后，用克制的连续路径展示它经过系统单元到达技术单元。首次渲染可以执行一次有限的列与路径入场；钻取使用有限过渡；Map 不运行环境力导向动画。开启减少动效后，移除路径绘制和相机缓动，但保留焦点与层次语义。

所有标签必须在支持的移动端和桌面端宽度下完整适配。焦点、选择和映射解释必须支持键盘，不能依赖悬停。

## URL 状态

新增且保持向后兼容的状态：

- `graphRepresentation=map|network`，默认 `map`；
- `unit=<unitIdentity>` 表示钻取单元；
- `transition=BIZ_SYS|SYS_TECH` 表示窄屏层间阅读范围。

布局或选择变化不能丢失已加载结果。Scope、Baseline、Projection 或服务端过滤条件变化时，清理不兼容的单元选择并发起新的精确身份查询。

## 错误与空状态

- 没有已发布 Projection：沿用现有引导。
- 有事实但没有语义单元：明确提示缺少受治理架构映射，不能静默退回算法聚类。
- 存在未分类事实：显示数量，并允许通过目录进行有界查看。
- 缺少映射：保留孤立单元并显示完整度警告。
- 结果部分返回：显示返回数/总数和 partial reason。
- Projection 暂时不可用：身份仍匹配时保留上一次有效 Map，标记为过期并允许重试。
- WebGL 不可用：Map 结果规模小，可使用语义 DOM、SVG 或 Canvas；Network 保持现有 WebGL 回退策略。

## 验收标准

1. 用户无需缩放或悬停即可识别至少一条完整的 BIZ 到 SYS 到 TECH 实现链。
2. 总览每个节点都是有治理语义且始终显示名称的架构单元。
3. 默认总览没有层内边，也没有原始设计资产节点。
4. 选择单元后打开有界局部图和 Inspector，返回后恢复之前状态。
5. 缺失分类或映射必须明确呈现，系统不能发明语义分组。
6. 默认 Map 在支持的移动端和桌面端均保持可读。
7. Network 继续提供现有 GitNexus 风格探索能力。
8. 所有读写保持精确 Scope，PostgreSQL 继续对已编写事实和关系事件保持权威。

## 延期待办

- Web 端编辑架构单元语义：负责人 SpecForge Product；触发条件为独立批准的编写工作流；原因是当前 MCP 是唯一写边界。
- 跨应用服务组合架构图：负责人 SpecForge Architecture；触发条件为明确的多 Scope 授权和聚合设计；原因是当前保证应用服务级严格隔离。
- AI/算法提出缺失成员建议：负责人 SpecForge AI and Governance；触发条件为有证据的候选与评审流程；原因是建议不能自动成为规范事实。
