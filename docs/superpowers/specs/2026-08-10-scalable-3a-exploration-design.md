# SpecForge Scalable 3A Exploration

## English Canonical Design

### 1. Status And Traceability

This design is approved for written specification and is not yet implemented.

- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:bf43d490-47f0-4b3b-8fee-932d4b5ccf66`
- ADR ID: `adr-scalable-3a-exploration`
- Proposal ID: `proposal-scalable-3a-exploration`
- Context Pack ID: `ctx-scalable-3a-exploration`
- Parent decision: `adr-3a-architecture-navigation-workspace`
- Affected contract: `api-specforge-3a-architecture-query`

The design refines the implemented PostgreSQL-first 3A workspace. It does not change authored Knowledge Assertions, Baseline publication, projection authority, or application-service isolation.

### 2. Problem

The current architecture page requests up to 200 projection nodes, chooses the first node as an implicit focus, executes a trace, and also loads Alignment and Drift data before their tabs are opened. The client then filters and renders every returned node. In lane mode, the tallest BIZ, SYS, or TECH lane determines the height of the entire grid. A large TECH catalog therefore creates a very long page and an inefficient first request.

This behavior contradicts the original 3A navigation decision, which requires bounded, resumable queries and forbids whole-Scope rendering. A catalog and a relationship analysis tool also serve different user intentions and should not share one overloaded visualization.

### 3. Product Decision

Provide two complementary primary views inside the Architecture tab:

1. **Lane Catalog** for scanning and finding architecture facts by BIZ, SYS, and TECH layer.
2. **Relationship Graph** for exploring a selected fact, its upstream and downstream neighborhood, typed paths, and impact radius.

The Lane Catalog uses three independent server-paginated streams. The Relationship Graph starts from an explicit focus and loads only a bounded neighborhood. Neither view fetches all nodes or all edges during page initialization.

The graph interaction takes inspiration from GitNexus graph exploration, especially focused navigation, relation filtering, context inspection, impact analysis, and path tracing. SpecForge does not copy GitNexus storage or force-directed layout. The initial renderer reuses the existing `@xyflow/react` dependency and uses a deterministic architecture layout because one bounded graph page does not need an additional WebGL stack. A renderer change requires telemetry and a separate compatibility decision.

References reviewed on 2026-08-10:

- <https://github.com/nxpatterns/gitnexus>
- <https://github.com/abhigyanpatwari/GitNexus/blob/main/ARCHITECTURE.md>

### 4. Goals

- Keep the 3A page height stable regardless of catalog size.
- Make BIZ, SYS, and TECH pagination independent so one dense layer cannot block the others.
- Make search server-side, scoped, Baseline-bound, and cursor-safe.
- Load relationship data only after an explicit focus exists.
- Support repeated upstream and downstream expansion without a product-wide hop ceiling.
- Preserve typed relationship direction, partial-result reasons, and exact-Scope authorization.
- Keep the same focused fact when switching between catalog and graph views.
- Provide keyboard, screen-reader, mobile, reduced-motion, and list fallback behavior.

### 5. Non-goals

- Rendering an entire application-service graph in the browser.
- Replacing PostgreSQL authority or introducing a mandatory graph database.
- Changing Knowledge Assertion, Baseline, Profile, or Projection Manifest semantics.
- Authoring or editing architecture facts from the Web UI.
- Cross-application-service exploration.
- Adding AI-generated relationships or similarity edges.
- Certifying billion-scale graph performance in this increment.

### 6. View And URL Model

The Architecture tab exposes a segmented view control with `Lanes` and `Graph`. `List` remains an accessibility and compatibility fallback in the overflow menu.

The URL continues to preserve `scope`, `baseline`, `projection`, `focus`, `tab`, `mode`, and `direction`.

- `mode=lanes` opens the Lane Catalog.
- `mode=graph` opens the Relationship Graph.
- Existing `mode=list` URLs remain valid and open the list fallback.
- Changing mode preserves Scope, Baseline, Projection, focus, and direction.
- Search text, lane cursors, graph continuation tokens, zoom, and panel state are session state and are not serialized.
- A refresh reconstructs the first bounded page or first focused neighborhood. Continuation tokens are never copied into a shareable URL.

Changing Scope, Baseline, or Projection invalidates all lane pages, graph nodes, edges, continuations, selected details, and filter-derived result state before new data is shown.

### 7. Lane Catalog Experience

Desktop renders three equal-width lanes inside one stable viewport. The viewport height is constrained between 32rem and 48rem and may use the available dynamic viewport height. Each lane owns its own scroll container; scrolling TECH does not move BIZ, SYS, the toolbar, or the page.

Each lane has a sticky header containing the layer name, loaded count, loading state, and an explicit `Load more` command when a cursor exists. Exact totals are not computed by an extra count query. The interface says `20 loaded` and `More available` when appropriate. A future precomputed per-layer count may enhance this label without changing pagination.

Initial load requests at most 20 facts per layer. The three requests are independent and may run concurrently. `Load more` appends the next signed cursor page only to the selected lane. A retry affects only the failed lane.

Search is debounced and executed by the server. Changing the query resets all three layer cursors and returns the first bounded page for each layer. Stale responses are ignored by a request key containing Scope, Baseline, Projection, layer, and normalized query.

Node cards have stable minimum dimensions, a two-line canonical title limit, a localized display overlay, asset type, identity suffix, and focus state. Selecting a card sets the explicit focus and opens the detail drawer. Opening Graph preserves that focus.

On small screens, the catalog displays a BIZ/SYS/TECH segmented layer control and one scrollable lane at a time. It never stacks all three complete lanes vertically.

### 8. Relationship Graph Experience

Graph mode requires an explicit focus. If none exists, it shows a compact search-and-select empty state rather than choosing the first catalog node implicitly.

The graph uses a fixed-height canvas with three subtle horizontal architecture bands: BIZ, SYS, and TECH. The focused node is anchored centrally. Upstream nodes occupy the left side and downstream nodes the right side. Nodes keep stable positions for the same result digest, which prevents force-layout movement from disrupting comparison and keyboard focus.

The graph toolbar provides:

- search and focus selection;
- BIZ, SYS, and TECH layer filters;
- typed relationship filters;
- upstream, downstream, or both direction control;
- expand upstream, expand downstream, and continue commands;
- zoom in, zoom out, fit, and reset controls using icons and tooltips;
- a list fallback for the currently loaded subgraph.

The first graph request uses one bounded neighborhood expansion. Repeated expansion uses continuation state and has no product-wide hop limit. Every individual request remains subject to server depth, node, edge, timeout, and payload budgets. When a frontier remains, the graph displays an explicit continuation marker and reason instead of silently hiding nodes.

Selecting a node highlights its incoming and outgoing edges and opens the shared detail drawer. Selecting an edge opens a compact relationship inspector with source, relation code, target, direction, confidence, Evidence reference, and relationship version. Impact highlighting distinguishes the focus, directly affected nodes, and farther loaded nodes without changing canonical layer colors.

Graph entry and expansion may animate opacity and position for at most 180ms. Focus may use one non-repeating pulse. `prefers-reduced-motion` disables movement and pulse while preserving selection contrast.

### 9. Query Contracts

#### Lane search

`searchArchitectureFacts` remains the canonical catalog operation. Web calls it once per layer with:

- exact `architectureScope`;
- official `baselineId`;
- pinned `projectionManifestId`;
- required layer;
- normalized optional query;
- `limit = 20` by default;
- the opaque cursor for that layer only.

The response returns ordered nodes, a result digest, and an optional next cursor. A cursor remains bound to principal, exact Scope, Baseline, Projection, layer, normalized query, and expiry.

#### Graph expansion

`traceArchitecturePath` remains the canonical relationship operation but its repository contract must query adjacency for the current frontier instead of loading every projection edge into memory. The input is extended additively with optional relation-type and layer filters. These filters are part of the query fingerprint and continuation binding.

The PostgreSQL repository exposes a bounded adjacency operation over indexed source and target assertion IDs. Each expansion reads only edges adjacent to the current frontier, resolves only returned endpoint nodes, and records the next frontier in the existing continuation store.

The first graph expansion defaults to:

- `maxDepth = 1`;
- `maxNodes = 100`;
- `maxEdges = 200`;
- `maxPaths = 100`;
- `timeoutMs = 2000`;
- `maxPayloadBytes = 524288`.

These are request defaults, not a total exploration limit. Existing hard caps remain authoritative unless a later ADR changes them.

#### Tab isolation

The route loads only data required by the active tab:

- Architecture + Lanes: Baseline, Manifest, and three first catalog pages.
- Architecture + Graph without focus: Baseline and Manifest only.
- Architecture + Graph with focus: fact detail and first bounded graph expansion.
- Alignment: Alignment data only.
- Drift: Drift inputs and comparison only.

No initial request may eagerly load Alignment, Drift, or graph edges for an inactive view.

### 10. Component Boundaries

- `ThreeAWorkspace`: coordinates immutable route identity and view selection; it does not own query algorithms.
- `ArchitectureCatalog`: owns the three lane query states and server-search orchestration.
- `ArchitectureLane`: owns one layer page list, cursor, scroll position, loading, retry, and empty state.
- `ArchitectureGraphExplorer`: owns graph filters, bounded loaded subgraph, expansion commands, and selection.
- `ArchitectureGraphCanvas`: maps bounded graph DTOs to deterministic layer-and-direction positions and delegates rendering to `@xyflow/react`.
- `ArchitectureGraphToolbar`: provides filters and graph commands without persistence access.
- `ArchitectureRelationshipInspector`: renders selected edge facts.
- `ArchitectureDetailDrawer`: remains the shared read-only node inspector.
- `ThreeAQueryClient`: calls server-owned exact-Scope query handlers; client components never import Prisma.

The lane and graph components consume typed DTOs and can be tested without a database. Query handlers depend on the shared `@specforge/knowledge-query` service, which depends on an injected repository and continuation store.

### 11. Loading, Empty, Partial, And Error States

- Global authorization, Baseline, and Manifest failures replace the workspace with the existing typed banner.
- A lane displays its own skeleton, empty result, cursor-expired reset, or retry action without clearing successful sibling lanes.
- A search with no matches keeps all lane headers visible and states that the scoped Baseline has no match.
- Graph without focus shows a selection prompt.
- `FOCUS_NOT_IN_BASELINE` clears graph state and asks the user to select another fact.
- `CURSOR_INVALID` resets only the affected lane or graph continuation and announces the reset.
- `RESULT_PARTIAL` preserves returned nodes and edges, shows the explicit budget reason, and offers continuation when available.
- Scope, Baseline, or Projection changes cancel or ignore stale client responses before rendering.
- Unknown server failures expose a safe error code and retry path without raw database or token details.

### 12. Accessibility And Responsive Behavior

- Lanes, view modes, layer selection, graph commands, and detail panels have explicit accessible names.
- Keyboard users can move through lane cards in document order, select a focus, open Graph, use graph controls, and inspect the loaded graph through the list fallback.
- Graph nodes and edges never become the only representation of relationship information.
- Focus is restored to the invoking card or graph node when a drawer closes.
- Color is not the sole layer, direction, confidence, impact, loading, or selection signal.
- The mobile graph uses a collapsible filter sheet and bottom detail sheet while preserving a stable canvas height.
- Text does not scale with viewport width. Labels truncate or wrap within stable node and card dimensions.

### 13. Performance And Scale Boundaries

- Page initialization performs no unfiltered 200-node request.
- The Web route performs no unconditional trace, Alignment, or Drift query.
- Each lane page is capped and cursor-based.
- Each graph expansion is bounded and continuation-based.
- PostgreSQL adjacency queries use exact Scope, Manifest, source/target assertion indexes, direction, and relation filters.
- The browser retains only the current lane pages and the bounded graph session. It does not accumulate an entire Scope graph.
- Graph rendering above the configured client node or edge budget is rejected as partial rather than degraded into an unresponsive canvas.
- Renderer replacement with Sigma.js, Graphology, or another WebGL engine is deferred until measured concurrent-canvas size exceeds the bounded React Flow envelope. PostgreSQL authority and query contracts remain unchanged by a renderer replacement.

### 14. Compatibility And Governance

This is an additive query and Web behavior change within `3a.v2`. Existing MCP consumers of search and trace remain compatible. Optional filters and adjacency optimization do not change canonical result identity. Existing `mode=list` URLs remain valid.

All reads remain tenant- and exact-application-service authorized before existence, count, node, or edge disclosure. PostgreSQL remains authoritative for authored facts, relationship events, Baselines, and published projection rows. A graph renderer is presentation only, and a graph database remains a derived optional runtime.

English canonical content and complete Chinese overlays remain mandatory for human-facing architecture facts. The Web remains read-only; formal mutations continue through MCP.

### 15. Verification And Acceptance

The implementation increment must provide focused evidence for:

- layer-bound cursor isolation and independent lane pagination;
- server search resetting stale cursors and ignoring stale responses;
- adjacency traversal that does not call an unfiltered full-edge repository method;
- relation and layer filters bound into continuation fingerprints;
- active-tab-only data loading;
- mode and focus URL preservation, including legacy list URLs;
- fixed-height desktop lanes and single-layer mobile catalog;
- fixed-height graph canvas, deterministic positions, filters, expansion, detail, and list fallback;
- keyboard navigation, focus restoration, reduced motion, and non-color status cues;
- exact-Scope denial without cross-Scope counts or identities;
- partial, invalid cursor, empty, unavailable, and retry states;
- desktop and mobile browser checks confirming that additional catalog pages do not increase document height.

### 16. Delivery Boundary

This written design does not claim implementation. After user review, a separate implementation plan must sequence query-contract tests, repository adjacency reads, tab-isolated route loading, lane pagination, graph exploration, localization, browser verification, ADR evidence, MCP synchronization, and exact-Scope session closure.

## 中文本地化设计

### 1. 状态与追溯

本设计已获准进入书面规格阶段，尚未实施。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:bf43d490-47f0-4b3b-8fee-932d4b5ccf66`
- ADR ID：`adr-scalable-3a-exploration`
- Proposal ID：`proposal-scalable-3a-exploration`
- Context Pack ID：`ctx-scalable-3a-exploration`
- 父决策：`adr-3a-architecture-navigation-workspace`
- 受影响契约：`api-specforge-3a-architecture-query`

本设计优化已实现的 PostgreSQL-first 3A 工作台，不改变已编写 Knowledge Assertion、Baseline 发布、投影权威性或应用服务隔离。

### 2. 问题

当前架构页面一次请求最多 200 个投影节点，把第一个节点隐式作为焦点，执行一次追踪，并且在用户打开 Alignment 和 Drift 标签前就加载对应数据。客户端随后过滤并渲染所有返回节点。在泳道模式下，BIZ、SYS 或 TECH 中最高的一列决定整个网格高度，因此较大的 TECH 目录会产生很长的页面和低效的首个请求。

该行为违背了原始 3A 导航决策中的有界、可恢复查询和禁止全 Scope 渲染原则。目录浏览与关系分析也服务于不同用户意图，不应继续共用一个负担过重的可视化模型。

### 3. 产品决策

在 Architecture 标签内提供两种互补的主要视图：

1. **泳道目录**：按 BIZ、SYS、TECH 扫描和查找架构事实。
2. **关系图谱**：围绕选中事实探索上下游邻域、有类型路径和影响范围。

泳道目录使用三个独立的服务端分页数据流。关系图谱从显式焦点开始，只加载有界邻域。两种视图都禁止在页面初始化时获取全部节点或全部关系。

图谱交互参考 GitNexus 的聚焦导航、关系筛选、上下文检查、影响分析和路径追踪，但 SpecForge 不复制 GitNexus 的存储或力导向布局。第一版复用已有 `@xyflow/react` 依赖并采用确定性架构布局，因为有界图谱页面不需要新增 WebGL 技术栈。只有查询遥测证明需要时，才能通过独立兼容性决策更换渲染器。

2026-08-10 审视的参考资料：

- <https://github.com/nxpatterns/gitnexus>
- <https://github.com/abhigyanpatwari/GitNexus/blob/main/ARCHITECTURE.md>

### 4. 目标

- 无论目录规模如何，3A 页面高度都保持稳定。
- BIZ、SYS、TECH 独立分页，避免高密度层阻塞其他层。
- 搜索必须在服务端执行，并绑定 Scope、Baseline 和安全游标。
- 只有存在显式焦点后才加载关系数据。
- 支持重复展开上下游，不设置产品级总跳数上限。
- 保留有类型关系方向、部分结果原因和精确 Scope 授权。
- 在目录和图谱之间切换时保持同一个焦点事实。
- 提供键盘、屏幕阅读器、移动端、减少动效和列表回退能力。

### 5. 非目标

- 在浏览器中渲染完整应用服务图谱。
- 替换 PostgreSQL 权威库或强制引入图数据库。
- 修改 Knowledge Assertion、Baseline、Profile 或 Projection Manifest 语义。
- 从 Web UI 编写或编辑架构事实。
- 跨应用服务探索。
- 新增 AI 生成关系或相似度边。
- 在本增量中宣称通过亿级图谱性能认证。

### 6. 视图与 URL 模型

Architecture 标签提供 `泳道` 和 `图谱` 分段视图控件。`列表` 继续作为无障碍和兼容性回退，放在更多菜单中。

URL 继续保存 `scope`、`baseline`、`projection`、`focus`、`tab`、`mode` 和 `direction`。

- `mode=lanes` 打开泳道目录。
- `mode=graph` 打开关系图谱。
- 现有 `mode=list` URL 保持有效并打开列表回退。
- 切换模式时保留 Scope、Baseline、Projection、焦点和方向。
- 搜索词、泳道游标、图谱继续令牌、缩放和面板状态属于会话状态，不写入 URL。
- 刷新后重建第一页或第一个有界焦点邻域，禁止把继续令牌复制到可分享 URL。

Scope、Baseline 或 Projection 变化时，必须先让全部泳道页、图谱节点和边、继续状态、选中详情以及筛选结果失效，再展示新数据。

### 7. 泳道目录体验

桌面端在一个稳定视口内呈现三条等宽泳道。视口高度约束在 32rem 到 48rem 之间，并可使用可用动态视口高度。每条泳道拥有独立滚动容器；滚动 TECH 不会移动 BIZ、SYS、工具栏或整个页面。

每条泳道包含粘性标题，显示层名称、已加载数量、加载状态，以及存在游标时明确的“加载更多”命令。系统不为精确总数额外执行计数查询；适当显示“已加载 20 条”和“还有更多”。未来可以用预计算分层数量增强标签，但不得改变分页行为。

首次加载每层最多请求 20 条事实。三个请求互相独立并可并行执行。“加载更多”只把下一页签名游标结果追加到当前泳道。重试只影响失败泳道。

搜索采用防抖并由服务端执行。查询词变化后重置三层游标，并分别返回第一批有界结果。客户端使用包含 Scope、Baseline、Projection、层和规范查询词的请求键忽略过期响应。

节点卡具有稳定最小尺寸、最多两行规范标题、本地化显示覆盖、资产类型、身份后缀和焦点状态。选择卡片后设置显式焦点并打开详情抽屉；打开图谱时保留该焦点。

小屏幕使用 BIZ/SYS/TECH 分段层控件，一次只显示一条可滚动泳道，禁止把三条完整泳道纵向堆叠。

### 8. 关系图谱体验

图谱模式要求显式焦点。如果没有焦点，显示紧凑的搜索选择空状态，禁止隐式选择目录第一条记录。

图谱使用固定高度画布，包含 BIZ、SYS、TECH 三条低干扰水平架构带。焦点节点固定在中央，上游节点位于左侧，下游节点位于右侧。相同结果摘要下节点位置保持稳定，避免力导向移动干扰比较和键盘焦点。

图谱工具栏提供：

- 搜索和焦点选择；
- BIZ、SYS、TECH 层筛选；
- 有类型关系筛选；
- 上游、下游或双向控制；
- 展开上游、展开下游和继续命令；
- 使用图标和 Tooltip 的放大、缩小、适配和重置控件；
- 当前已加载子图的列表回退。

首个图谱请求只执行一次有界邻域展开。重复展开使用继续状态，不设置产品级总跳数限制。每个独立请求仍受服务端深度、节点、关系、超时和载荷预算限制。当仍有未展开前沿时，图谱必须显示明确的继续标记和原因，禁止静默隐藏节点。

选择节点后高亮其入边和出边，并打开共用详情抽屉。选择关系后打开紧凑关系检查器，显示来源、关系代码、目标、方向、置信度、Evidence 引用和关系版本。影响高亮区分焦点、直接影响节点和更远的已加载节点，同时保持规范层颜色。

图谱进入和展开时允许最多 180ms 的透明度和位置动画。焦点允许一次不重复脉冲。`prefers-reduced-motion` 禁用移动和脉冲，但保留选中对比度。

### 9. 查询契约

#### 泳道搜索

`searchArchitectureFacts` 继续作为规范目录操作。Web 针对每层分别调用，并传递：

- 精确 `architectureScope`；
- 正式 `baselineId`；
- 固定 `projectionManifestId`；
- 必填层；
- 规范化可选查询词；
- 默认 `limit = 20`；
- 仅属于该层的不透明游标。

响应返回有序节点、结果摘要和可选下一页游标。游标继续绑定 principal、精确 Scope、Baseline、Projection、层、规范查询词和有效期。

#### 图谱展开

`traceArchitecturePath` 继续作为规范关系操作，但仓库契约必须查询当前前沿的邻接关系，禁止把全部投影关系加载到内存。输入以兼容方式增加可选关系类型和层筛选；这些筛选进入查询指纹和继续状态绑定。

PostgreSQL 仓库通过来源与目标 Assertion ID 索引提供有界邻接操作。每次展开只读取当前前沿的邻接关系，只解析返回关系端点节点，并把下一前沿保存到已有继续状态存储。

首个图谱展开默认使用：

- `maxDepth = 1`；
- `maxNodes = 100`；
- `maxEdges = 200`；
- `maxPaths = 100`；
- `timeoutMs = 2000`；
- `maxPayloadBytes = 524288`。

这些是单次请求默认值，不是总探索上限。除非后续 ADR 修改，否则现有硬上限继续保持权威。

#### 标签隔离

路由只加载活动标签和视图所需数据：

- Architecture + 泳道：Baseline、Manifest 和三层第一页。
- Architecture + 无焦点图谱：只加载 Baseline 和 Manifest。
- Architecture + 有焦点图谱：加载事实详情和首个有界图谱展开。
- Alignment：只加载 Alignment 数据。
- Drift：只加载 Drift 输入和比较结果。

初始请求禁止为非活动视图提前加载 Alignment、Drift 或图谱关系。

### 10. 组件边界

- `ThreeAWorkspace`：协调不可变路由身份和视图选择，不拥有查询算法。
- `ArchitectureCatalog`：拥有三条泳道查询状态和服务端搜索编排。
- `ArchitectureLane`：拥有一层的分页列表、游标、滚动位置、加载、重试和空状态。
- `ArchitectureGraphExplorer`：拥有图谱筛选、有界已加载子图、展开命令和选择状态。
- `ArchitectureGraphCanvas`：把有界图谱 DTO 映射为确定性的层级与方向位置，并委托 `@xyflow/react` 渲染。
- `ArchitectureGraphToolbar`：提供筛选和图谱命令，不访问持久化。
- `ArchitectureRelationshipInspector`：呈现选中关系事实。
- `ArchitectureDetailDrawer`：继续作为共用只读节点检查器。
- `ThreeAQueryClient`：调用服务端拥有的精确 Scope 查询处理器；客户端组件禁止导入 Prisma。

泳道和图谱组件消费有类型 DTO，可以脱离数据库测试。查询处理器依赖共用 `@specforge/knowledge-query` 服务，该服务依赖注入的仓库和继续状态存储。

### 11. 加载、空、部分与错误状态

- 全局授权、Baseline 和 Manifest 失败使用现有有类型 Banner 替换工作区。
- 每条泳道独立显示骨架屏、空结果、游标过期重置或重试，不清除成功的其他泳道。
- 搜索无匹配时保留所有泳道标题，并说明当前 Scope 的 Baseline 没有匹配结果。
- 图谱无焦点时显示选择提示。
- `FOCUS_NOT_IN_BASELINE` 清除图谱状态并要求选择其他事实。
- `CURSOR_INVALID` 只重置受影响的泳道或图谱继续状态，并播报重置结果。
- `RESULT_PARTIAL` 保留已返回节点和关系，显示明确预算原因，并在可用时提供继续命令。
- Scope、Baseline 或 Projection 变化后，渲染前取消或忽略过期客户端响应。
- 未知服务端失败只显示安全错误码和重试路径，禁止泄露数据库或 Token 详情。

### 12. 无障碍与响应式行为

- 泳道、视图模式、层选择、图谱命令和详情面板具有明确无障碍名称。
- 键盘用户可以按文档顺序遍历泳道卡片、选择焦点、打开图谱、使用图谱控件，并通过列表回退检查已加载图谱。
- 图谱节点和关系不能成为关系信息的唯一表达。
- 详情抽屉关闭后，焦点返回触发它的卡片或图谱节点。
- 颜色不能成为层、方向、置信度、影响、加载或选择状态的唯一信号。
- 移动端图谱使用可折叠筛选面板和底部详情面板，同时保持稳定画布高度。
- 文本字号不随视口宽度缩放；标签在稳定节点和卡片尺寸内截断或换行。

### 13. 性能与规模边界

- 页面初始化禁止执行未筛选的 200 节点请求。
- Web 路由禁止无条件执行 Trace、Alignment 或 Drift 查询。
- 每条泳道页面有上限并使用游标。
- 每次图谱展开有上限并使用继续状态。
- PostgreSQL 邻接查询必须使用精确 Scope、Manifest、来源与目标 Assertion 索引、方向和关系筛选。
- 浏览器只保留当前泳道页和有界图谱会话，禁止积累完整 Scope 图谱。
- 超过客户端节点或关系预算时必须返回部分结果，禁止退化成无响应画布。
- 只有实测并发画布规模超过有界 React Flow 范围时，才考虑 Sigma.js、Graphology 或其他 WebGL 渲染器。更换渲染器不得改变 PostgreSQL 权威性和查询契约。

### 14. 兼容性与治理

该变更属于 `3a.v2` 内的兼容性查询和 Web 行为扩展。现有 MCP 搜索和追踪消费者保持兼容。可选筛选和邻接优化不改变规范结果身份。现有 `mode=list` URL 保持有效。

任何存在性、数量、节点或关系披露前，都必须先完成租户与精确应用服务授权。PostgreSQL 继续对已编写事实、关系事件、Baseline 和已发布投影行保持权威。图谱渲染器只属于展示层，图数据库仍是可选派生运行时。

面向人的架构事实继续要求英文规范内容和完整中文覆盖。Web 保持只读，正式变更继续通过 MCP。

### 15. 验证与验收

实施增量必须提供以下聚焦证据：

- 按层游标隔离和独立泳道分页；
- 服务端搜索重置过期游标并忽略过期响应；
- 邻接遍历不会调用未筛选的全关系仓库方法；
- 关系和层筛选绑定继续查询指纹；
- 只加载活动标签数据；
- 模式和焦点 URL 保持，包括旧列表 URL；
- 固定高度桌面泳道和单层移动目录；
- 固定高度图谱画布、确定性位置、筛选、展开、详情和列表回退；
- 键盘导航、焦点恢复、减少动效和非颜色状态信号；
- 精确 Scope 拒绝且不泄露跨 Scope 数量或身份；
- 部分结果、无效游标、空、不可用和重试状态；
- 桌面与移动浏览器检查确认加载更多目录页不会增加文档高度。

### 16. 交付边界

本书面设计不声明已经实施。用户审阅后，独立实施计划必须依次覆盖查询契约测试、仓库邻接读取、标签隔离路由加载、泳道分页、图谱探索、本地化、浏览器验证、ADR Evidence、MCP 同步和精确 Scope 会话关闭。
