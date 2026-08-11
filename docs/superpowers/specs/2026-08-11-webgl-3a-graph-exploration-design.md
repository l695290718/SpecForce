# SpecForge WebGL 3A Graph Exploration And Impact Analysis

## English Canonical Design

### 1. Status And Traceability

This design is approved for written specification and is not implemented.

- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:d3421b59-6797-44e9-bbd2-e393c7707a42`
- ADR ID: `adr-webgl-3a-graph-exploration`
- Proposal ID: `proposal-webgl-3a-graph-exploration`
- Context Pack ID: `ctx-webgl-3a-graph-exploration`
- Parent decision: `adr-scalable-3a-exploration`
- Affected contract: `api-specforge-3a-architecture-query`
- Affected read model: `data-specforge-3a-projection-read-model`

The design replaces only the Graph renderer and graph-analysis experience. The implemented Lane Catalog, exact-Scope authorization, Baseline and Projection identity, PostgreSQL authority, MCP-only mutation boundary, and read-only Web behavior remain unchanged.

### 2. Problem

The implemented relationship graph validates bounded adjacency loading, but it is still a static React Flow diagram. Large cards occupy most of the canvas, labels compete with edges, deterministic columns leave unused space, and the surrounding controls are visually detached from selection. It works as a relationship preview, not as a fluid graph exploration tool.

Users need two related jobs in one workspace:

1. understand the architecture topology across BIZ, SYS, and TECH without reading a long catalog;
2. select a fact and explain its upstream, downstream, cross-layer, and risk-bearing impact paths.

GitNexus demonstrates the interaction quality expected from a modern graph explorer: WebGL rendering, graph-native client state, focus-first navigation, semantic zoom, neighborhood highlighting, search, and side-panel inspection. SpecForge must adapt those principles to governed enterprise design facts rather than copy a code-symbol graph or load a complete Scope into the browser.

### 3. Product Decision

Replace the React Flow canvas used by `mode=graph` with a Sigma.js WebGL renderer backed by a bounded in-memory Graphology graph. Keep React for commands, filters, status, inspectors, and accessible list equivalents.

The graph workspace provides three views over the same exact Scope, Baseline, and Projection:

- **Overview** shows clusters, bridge relationships, and selected key facts.
- **Explore** shows a selected fact and a progressively expandable typed neighborhood.
- **Impact** shows ranked upstream and downstream consequences, paths, cut points, and evidence.

The browser never requests or accumulates a complete application-service graph. Overview uses precomputed summaries. Explore and Impact use bounded, continuation-based requests. WebGL improves rendering capacity and interaction quality; it does not weaken server-side budgets.

### 4. Experience Model

`mode=graph` opens a viewport-filling exploration surface beneath the existing Baseline and Projection identity toolbar. A compact segmented control selects `Overview`, `Explore`, or `Impact`.

- Overview is the default when no focus exists.
- Selecting a fact from Overview, search, or the Lane Catalog sets `focus` and opens Explore.
- Choosing `Analyze impact` for the selected fact opens Impact without changing the focus identity.
- Returning to Overview preserves the current focus and highlights its cluster.
- Changing Scope, Baseline, or Projection clears all client graph state before any new result renders.

The URL preserves `scope`, `baseline`, `projection`, `focus`, `tab`, `mode`, `graphView`, `direction`, and stable filter values. Camera coordinates, temporary expansion continuations, panel width, and hover state remain session-local.

### 5. Workspace Layout

Desktop uses one unframed canvas with three coordinated regions:

- a collapsible left rail for search, layer filters, asset-type filters, relation filters, direction, and result budgets;
- the WebGL canvas as the primary surface;
- a right inspector for selected fact, relationship, cluster, or impact path.

The rails overlay or resize the canvas without creating nested cards. A compact status strip shows loaded nodes, loaded edges, partial-result reasons, active filters, and projection freshness. The legend remains visible but unobtrusive.

Mobile keeps the canvas full width. Search and filters open in a bottom sheet; selection and impact details open in a separate bottom sheet. The document must not gain horizontal overflow, and opening a sheet must not recreate the graph.

### 6. Visual Language And Semantic Zoom

Visual encoding is stable and non-decorative:

- BIZ, SYS, and TECH use distinct layer colors plus text abbreviations in inspectors and lists.
- Node size represents the selected metric: connectivity in Overview, neighborhood relevance in Explore, and impact score in Impact.
- A selected node has a high-contrast halo. Search matches use a second, distinguishable ring.
- Edge color represents relation family; edge width represents confidence or impact contribution.
- Direction is shown by arrowheads and source/target wording, not color alone.
- Cluster nodes display aggregate counts and dominant layer. They are visually distinct from authored facts.

Labels follow semantic zoom:

- far zoom shows cluster labels and only critical bridge facts;
- medium zoom shows selected, hovered, and high-importance fact labels;
- near zoom shows bounded nearby labels while preserving collision limits;
- edge labels appear only for selected, hovered, or isolated paths.

The canvas uses a neutral background, restrained grid or spatial guide, and no continuous decorative animation.

### 7. Layout Behavior

Each graph view uses the layout that best supports its task:

- **Overview:** server-provided stable cluster seeds followed by a bounded ForceAtlas2 worker refinement. The worker stops after convergence or 1.5 seconds, then positions freeze.
- **Explore:** the focus remains centered; existing positions are retained while new neighbors receive deterministic seeded positions and a short worker refinement.
- **Impact:** a deterministic directed layout places upstream on the left, focus in the center, and downstream on the right. BIZ, SYS, and TECH remain visible as secondary bands.

Changing filters removes hidden elements without restarting layout for unaffected nodes. Reduced-motion mode skips animated convergence and applies the deterministic seed positions directly.

### 8. Interaction Model

- Single click selects a node or edge and opens its inspector.
- Double click on a fact expands one bounded neighborhood page.
- Double click on a cluster enters that cluster through a bounded summary query.
- Search returns ranked facts and clusters; selecting a result focuses and centers it.
- Hover highlights the immediate neighborhood and dims unrelated elements without issuing a request.
- `Expand upstream`, `Expand downstream`, and `Continue` remain explicit commands for predictable loading.
- `Fit selection`, `Fit loaded graph`, `Back to root`, and `Reset filters` use icon buttons with tooltips.
- Browser Back and Forward restore graph view, focus, direction, and stable filters.

Lasso selection, free-form graph editing, arbitrary Cypher input, and AI-generated edges are excluded from this increment.

### 9. Impact Analysis Semantics

Impact analysis is evidence-based and deterministic. It must not present model-generated guesses as design facts.

The server calculates an explainable score per impacted fact:

`score = clamp(0, 100, relationWeight * confidence * criticalityWeight * depthDecay)`

`depthDecay` defaults to `0.72 ^ (depth - 1)`. Relation and criticality weights come from a versioned impact policy. Every score response includes its policy version and contributing factors.

Results are grouped as:

- **Direct:** depth 1 and immediately affected;
- **Likely:** depth 2 or a high-scoring governed path;
- **Extended:** depth 3 or deeper and returned through continuation;
- **Unresolved:** partial paths stopped by budget, missing projection data, or stale evidence.

The Impact inspector shows upstream and downstream counts, layer distribution, relation distribution, highest-risk paths, bridge or cut-point facts, confidence, evidence references, and partial-result reasons. It distinguishes topology risk from confirmed business consequences.

### 10. Query Contracts

The existing exact-Scope `POST /api/architecture/3a/query` union remains the only Web query boundary. Existing `search`, `trace`, and `detail` operations remain compatible.

Add `overview`:

```ts
type OverviewRequest = {
  operation: "overview";
  scope: ArchitectureScope;
  baselineId: string;
  projectionManifestId: string;
  layers?: ArchitectureLayer[];
  assetTypes?: string[];
  relationTypes?: string[];
  continuation?: string;
  budget?: GraphQueryBudget;
};
```

It returns bounded cluster summary nodes, selected bridge facts, summary edges, aggregate counts, a result digest, partial reasons, and an optional continuation. It never returns every member of every cluster.

Reuse `trace` for Explore and add optional ranking and layout-seed metadata without changing canonical node or edge identity.

Add `impact`:

```ts
type ImpactRequest = {
  operation: "impact";
  scope: ArchitectureScope;
  baselineId: string;
  projectionManifestId: string;
  focusAssertionId: string;
  direction: "upstream" | "downstream" | "both";
  layers?: ArchitectureLayer[];
  relationTypes?: string[];
  policyVersion?: string;
  continuation?: string;
  budget?: GraphQueryBudget;
};
```

It returns ranked impacted facts, bounded paths, cut points, score factors, aggregate distributions, partial reasons, result digest, policy version, and an optional continuation.

Every cursor and continuation is subject-, Scope-, Baseline-, Projection-, operation-, filter-, policy-, and expiry-bound. Unknown or mismatched tokens fail safely and reveal no cross-Scope counts or identities.

### 11. Data And Projection Architecture

PostgreSQL remains authoritative for authored design facts, relationship events, Baselines, and Projection publication. Graph summaries, cluster membership, centrality, bridge metrics, and impact indexes are derived projection data.

Projection publication produces a versioned graph-analysis summary keyed by tenant, exact application service, full scope path, Baseline, Projection Manifest, and analysis version. The query service reads through a provider interface:

```ts
interface ArchitectureGraphQueryProvider {
  overview(input: OverviewQuery): Promise<OverviewResult>;
  neighborhood(input: TraceQuery): Promise<TraceResult>;
  impact(input: ImpactQuery): Promise<ImpactResult>;
}
```

The PostgreSQL provider is mandatory and remains the fallback. A graph database provider may accelerate derived queries later, but it must implement the same contract, pass Scope-isolation tests, and never become the authored system of record.

### 12. Client Architecture

- `ArchitectureGraphWorkspace` coordinates view, identity, filters, and inspector state.
- `ArchitectureGraphStore` owns the bounded Graphology `MultiDirectedGraph`, deduplication, continuations, selection, and retained-position cache.
- `SigmaArchitectureGraphRenderer` owns Sigma lifecycle, reducers, camera, pointer events, WebGL context recovery, and resize observation.
- `ArchitectureGraphLayoutWorker` runs bounded ForceAtlas2 refinement outside the main thread.
- `ArchitectureGraphSearch` owns debounced scoped search and focus navigation.
- `ArchitectureImpactPanel` renders ranked impact summaries and paths.
- `ArchitectureGraphListFallback` exposes the exact loaded nodes and relationships for keyboard and assistive technology.

The renderer depends only on graph DTOs and callbacks. It cannot import Prisma or call MCP. Scope, Baseline, or Projection identity changes destroy the Graphology instance, cancel requests, terminate the worker, and release Sigma resources before new state is created.

### 13. Performance And Capacity Boundaries

Initial budgets:

- Overview: at most 250 summary nodes and 500 summary edges.
- Explore or Impact request: at most 150 nodes, 300 edges, 100 paths, and depth 1 by default.
- One request: at most 500 nodes, 1,000 edges, 3 seconds, and 1 MiB.
- One browser session: at most 2,000 retained nodes and 5,000 retained edges.

Reaching a budget returns partial data and continuation rather than silently truncating or freezing the canvas. Client expansion pauses before exceeding the retained budget and asks the user to narrow filters or replace the loaded neighborhood.

Acceptance targets on the agreed reference workstation are at least 30 frames per second while panning a 2,000-node and 5,000-edge loaded graph, selection feedback within 100 ms, no main-thread task above 200 ms during steady interaction, and no full-Scope query. These targets validate the bounded browser experience, not billion-scale storage capacity.

### 14. Loading, Failure, And Recovery

- Initial Overview uses a stable canvas skeleton and progressive summary batches.
- Explore and Impact preserve the previous graph while a bounded expansion is loading.
- Partial results remain usable and show the exact budget or data reason.
- WebGL unavailability or context loss switches to the equivalent list and impact summary, preserving loaded data and offering renderer recovery.
- Worker failure falls back to deterministic seed positions.
- Stale Projection, missing focus, expired continuation, denied Scope, and unavailable provider use typed localized states.
- Raw database, token, stack, or provider details never reach the browser.

### 15. Accessibility And Responsive Requirements

The WebGL canvas is not the sole representation of information. Search results, selected-node details, loaded relationships, impact paths, partial reasons, and commands have semantic DOM equivalents.

Keyboard users can search, choose a focus, move through the loaded-neighbor list, expand a node, inspect an edge or path, change view, and return to the root. Focus returns to the invoking control when a sheet or inspector closes.

Layer, relation, direction, confidence, impact, and selection remain understandable without color. Reduced-motion mode disables camera animation and animated layout refinement. The mobile layout has no horizontal document overflow and maintains controls above the safe-area inset.

### 16. Verification And Acceptance

Implementation cannot be considered complete without evidence for:

- Sigma and Graphology lifecycle cleanup across Scope, Baseline, and Projection changes;
- exact-Scope overview, trace, detail, and impact queries with token replay denial;
- deterministic cluster seed and Impact layout behavior;
- bounded Graphology merge, deduplication, retention, and continuation state;
- semantic zoom, neighborhood highlight, search focus, cluster drill-down, and browser history;
- explainable impact score factors and versioned policies;
- WebGL context-loss, worker-failure, partial-result, and list-fallback recovery;
- keyboard, screen-reader equivalent, mobile, reduced-motion, and non-color cues;
- performance at the stated 2,000-node and 5,000-edge browser budget;
- no whole-Scope fetch and no cross-Scope count, label, or relationship disclosure;
- MCP synchronization, typed links, read-back reconciliation, and exact-session closure.

### 17. Delivery Boundary

This Spec and ADR are approved design records only. They do not claim that Sigma.js, Graphology, overview summaries, impact scoring, provider abstraction, or production capacity tests are implemented. After written-Spec review, a separate implementation plan must sequence contracts, derived summaries, provider interfaces, client graph state, WebGL rendering, impact UX, fallback behavior, performance evidence, design-fact synchronization, and session closure.

## 中文本地化设计

### 1. 状态与追溯

本设计已获准编写正式规格，尚未实施。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:d3421b59-6797-44e9-bbd2-e393c7707a42`
- ADR ID：`adr-webgl-3a-graph-exploration`
- Proposal ID：`proposal-webgl-3a-graph-exploration`
- Context Pack ID：`ctx-webgl-3a-graph-exploration`
- 父决策：`adr-scalable-3a-exploration`
- 受影响契约：`api-specforge-3a-architecture-query`
- 受影响读模型：`data-specforge-3a-projection-read-model`

本设计只替换 Graph 渲染器和图分析体验。已实现的泳道目录、精确 Scope 授权、Baseline 与 Projection 身份、PostgreSQL 权威性、仅 MCP 变更边界和 Web 只读行为保持不变。

### 2. 问题

已实现的关系图谱验证了有界邻接加载，但仍然是静态 React Flow 图。大型卡片占据大部分画布，标签与关系线互相争夺空间，确定性列布局留下大量空白，外围控件与当前选择缺少联动。它适合作为关系预览，不足以成为流畅的图谱探索工具。

用户需要在同一工作台完成两类相关任务：理解 BIZ、SYS、TECH 的整体拓扑，以及选择一个事实后解释其上下游、跨层和带风险的影响路径。

GitNexus 展示了现代图谱探索器应有的交互质量：WebGL 渲染、图原生客户端状态、焦点式导航、语义缩放、邻域高亮、搜索和侧边检查。SpecForge 应把这些原则用于受治理的企业设计事实，而不是复制代码符号图谱或把完整 Scope 加载进浏览器。

### 3. 产品决策

把 `mode=graph` 使用的 React Flow 画布替换为 Sigma.js WebGL 渲染器，客户端使用有界 Graphology 图。React 继续负责命令、筛选、状态、详情检查和无障碍列表等价视图。

图谱工作台对同一精确 Scope、Baseline 和 Projection 提供三种视图：

- **总览**：展示聚类、桥接关系和选定关键事实；
- **探索**：展示选中事实及可渐进展开的有类型邻域；
- **影响分析**：展示排序后的上下游影响、路径、关键切点和证据。

浏览器禁止请求或积累完整应用服务图谱。总览读取预计算摘要，探索和影响分析使用有界且可继续的请求。WebGL 提升渲染容量和交互质量，但不放宽服务端预算。

### 4. 体验模型

`mode=graph` 在现有 Baseline 与 Projection 身份工具栏下方打开占满可用视口的探索区域，并通过紧凑分段控件切换 `总览`、`探索` 和 `影响分析`。

- 没有焦点时默认进入总览；
- 从总览、搜索或泳道目录选择事实后设置 `focus` 并进入探索；
- 对当前事实执行“分析影响”后进入影响分析，焦点身份不变；
- 返回总览时保留焦点并高亮其所属聚类；
- Scope、Baseline 或 Projection 变化后，必须先清空全部客户端图状态。

URL 保留 `scope`、`baseline`、`projection`、`focus`、`tab`、`mode`、`graphView`、`direction` 和稳定筛选值。相机坐标、临时继续状态、面板宽度和悬停状态只保留在会话中。

### 5. 工作台布局

桌面端使用一个无外框主画布：左侧可折叠栏负责搜索与筛选，中间是 WebGL 主画布，右侧检查器展示选中的事实、关系、聚类或影响路径。侧栏覆盖或压缩画布，不创建嵌套卡片。紧凑状态条显示已加载节点与关系数、部分结果原因、活动筛选和投影新鲜度。

移动端保持画布全宽。搜索与筛选放入底部抽屉，选择和影响详情放入独立底部抽屉。页面不得产生横向滚动，打开抽屉不得重建图谱。

### 6. 视觉语言与语义缩放

- BIZ、SYS、TECH 使用不同层颜色，并在检查器和列表中显示文字缩写；
- 总览按连接度、探索按邻域相关性、影响分析按影响分数决定节点大小；
- 选中节点使用高对比光环，搜索匹配使用可区分的第二种描边；
- 关系颜色代表关系族，宽度代表置信度或影响贡献；
- 方向同时使用箭头与来源/目标文字表达；
- 聚类节点显示聚合数量和主导层，与已编写事实保持明显差异。

远距离只显示聚类和关键桥接事实；中距离显示选中、悬停和高重要度事实；近距离在碰撞预算内显示邻近标签。关系标签只在选中、悬停或隔离路径时显示。画布使用中性背景，不运行持续装饰动画。

### 7. 布局行为

- **总览**：先使用服务端提供的稳定聚类种子位置，再由受限 ForceAtlas2 Worker 优化；收敛或 1.5 秒后停止并冻结位置；
- **探索**：焦点保持居中，已有位置不变，新邻居使用确定性种子位置并进行短时 Worker 优化；
- **影响分析**：使用确定性有向布局，上游在左、焦点居中、下游在右，BIZ、SYS、TECH 作为次级分带保留。

筛选只移除隐藏元素，不重新布局未受影响节点。减少动态效果模式直接采用确定性种子位置，不播放收敛动画。

### 8. 交互模型

- 单击选择节点或关系并打开检查器；
- 双击事实展开一页有界邻域；
- 双击聚类通过有界摘要查询进入聚类；
- 搜索返回排序后的事实和聚类，选择后聚焦并居中；
- 悬停只高亮一跳邻域并弱化无关元素，不发起请求；
- 保留显式的“展开上游”“展开下游”和“继续”命令；
- 使用带 Tooltip 的图标按钮执行适应选择、适应已加载图谱、返回根节点和重置筛选；
- 浏览器前进与后退恢复图谱视图、焦点、方向和稳定筛选。

本增量不包含套索选择、自由编辑图谱、任意 Cypher 输入和 AI 生成关系。

### 9. 影响分析语义

影响分析必须基于证据且可确定计算，禁止把模型猜测表现为设计事实。

服务端按以下公式计算每个受影响事实的可解释分数：

`score = clamp(0, 100, relationWeight * confidence * criticalityWeight * depthDecay)`

`depthDecay` 默认是 `0.72 ^ (depth - 1)`。关系和关键度权重来自有版本的影响策略；每个响应必须返回策略版本和贡献因子。

结果分为直接影响、可能影响、扩展影响和未解析影响。影响检查器展示上下游数量、层分布、关系分布、高风险路径、桥接或切点事实、置信度、证据引用和部分结果原因，并明确区分拓扑风险与已确认业务后果。

### 10. 查询契约

现有精确 Scope 的 `POST /api/architecture/3a/query` 联合请求仍是唯一 Web 查询边界，已有 `search`、`trace` 和 `detail` 保持兼容。

新增 `overview`，返回有界聚类摘要节点、选定桥接事实、摘要关系、聚合数量、结果摘要、部分原因和可选继续状态；禁止返回每个聚类的全部成员。

探索继续复用 `trace`，只增补可选排序和布局种子元数据，不改变规范节点和关系身份。

新增 `impact`，输入焦点、方向、层、关系类型、策略版本、预算和可选继续状态；返回排序后的影响事实、有界路径、切点、分数因子、聚合分布、部分原因、结果摘要、策略版本和可选继续状态。

所有游标和继续状态必须绑定 subject、Scope、Baseline、Projection、操作、筛选、策略和过期时间。未知或不匹配令牌安全失败，禁止泄露跨 Scope 数量或身份。

### 11. 数据与投影架构

PostgreSQL 继续作为已编写设计事实、关系事件、Baseline 和 Projection 发布的权威存储。图谱摘要、聚类成员、中心度、桥接指标和影响索引都是派生投影数据。

Projection 发布时生成带版本的图分析摘要，并绑定租户、精确应用服务、完整 Scope 路径、Baseline、Projection Manifest 和分析版本。查询服务通过统一 `ArchitectureGraphQueryProvider` 读取总览、邻域和影响结果。

PostgreSQL Provider 必须存在并作为回退。后续图数据库 Provider 可以加速派生查询，但必须实现同一契约、通过 Scope 隔离测试，并且不能成为已编写事实的权威来源。

### 12. 客户端架构

- `ArchitectureGraphWorkspace` 协调视图、身份、筛选和检查器状态；
- `ArchitectureGraphStore` 管理有界 Graphology `MultiDirectedGraph`、去重、继续状态、选择和位置缓存；
- `SigmaArchitectureGraphRenderer` 管理 Sigma 生命周期、Reducer、相机、指针事件、WebGL 上下文恢复和尺寸观察；
- `ArchitectureGraphLayoutWorker` 在主线程之外运行受限 ForceAtlas2；
- `ArchitectureGraphSearch` 管理防抖 Scope 搜索和焦点导航；
- `ArchitectureImpactPanel` 展示排序后的影响摘要与路径；
- `ArchitectureGraphListFallback` 为已加载节点和关系提供键盘与辅助技术等价视图。

渲染器只依赖图 DTO 和回调，禁止导入 Prisma 或调用 MCP。身份变化时必须销毁 Graphology、取消请求、终止 Worker 并释放 Sigma 资源。

### 13. 性能与容量边界

- 总览初始最多 250 个摘要节点和 500 条摘要关系；
- 探索或影响请求默认最多 150 个节点、300 条关系、100 条路径和 1 跳；
- 单次请求最多 500 个节点、1,000 条关系、3 秒和 1 MiB；
- 单个浏览器会话最多保留 2,000 个节点和 5,000 条关系。

达到预算时返回部分数据和继续状态，禁止静默截断或冻结画布。客户端即将超过保留预算时暂停展开，并要求缩小筛选或替换当前邻域。

在约定参考工作站上，2,000 节点和 5,000 关系平移时至少达到 30 FPS，选择反馈在 100ms 内，稳定交互期间主线程不得出现超过 200ms 的任务，并且不存在完整 Scope 查询。这些目标只验证有界浏览器体验，不等于十亿规模存储认证。

### 14. 加载、失败与恢复

- 总览使用稳定画布骨架并渐进接收摘要批次；
- 探索和影响分析加载有界扩展时保留旧图；
- 部分结果保持可用并显示精确预算或数据原因；
- WebGL 不可用或上下文丢失时切换到等价列表和影响摘要，保留已加载数据并提供恢复；
- Worker 失败时回退到确定性种子位置；
- 投影过期、焦点缺失、继续状态过期、Scope 拒绝和 Provider 不可用使用有类型本地化状态；
- 禁止向浏览器暴露数据库、令牌、调用栈或 Provider 原始细节。

### 15. 无障碍与响应式要求

WebGL 画布不能成为信息唯一表达。搜索结果、选中节点详情、已加载关系、影响路径、部分原因和命令都必须有语义 DOM 等价内容。

键盘用户可以搜索、选择焦点、遍历已加载邻居列表、展开节点、检查关系或路径、切换视图并返回根节点。抽屉或检查器关闭后，焦点返回触发控件。

层、关系、方向、置信度、影响和选择不能只依赖颜色。减少动态效果模式关闭相机动画和布局优化动画。移动端不得产生横向页面滚动，并需要为安全区域预留控件空间。

### 16. 验证与验收

实施完成必须提供以下证据：Sigma 与 Graphology 在身份变化时正确清理；精确 Scope 的总览、追踪、详情和影响查询及令牌重放拒绝；确定性聚类种子与影响布局；有界图合并、去重、保留预算与继续状态；语义缩放、邻域高亮、搜索聚焦、聚类下钻和浏览器历史；可解释影响分数和有版本策略；WebGL 上下文丢失、Worker 失败、部分结果与列表回退；键盘、屏幕阅读器等价视图、移动端、减少动态效果和非颜色提示；2,000 节点与 5,000 关系性能预算；无完整 Scope 获取和跨 Scope 泄露；MCP 同步、关系回读和同一设计会话关闭。

### 17. 交付边界

本 Spec 与 ADR 只是已批准设计记录，不声明 Sigma.js、Graphology、总览摘要、影响评分、Provider 抽象或生产容量测试已经实施。书面 Spec 审阅通过后，必须另行编写实施计划，依次覆盖契约、派生摘要、Provider、客户端图状态、WebGL 渲染、影响体验、回退行为、性能证据、设计事实同步和会话关闭。
