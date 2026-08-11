# ADR-0023: Scalable 3A Catalog And Relationship Exploration

## Status

**Implemented and locally accepted; production billion-scale capacity remains deferred.**

- Stable ID: `adr-scalable-3a-exploration`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:d31c59f5-2630-4d4c-b351-83e0bcfc2c57`
- Approved Spec: `docs/superpowers/specs/2026-08-10-scalable-3a-exploration-design.md`
- Implementation Plan: `docs/superpowers/plans/2026-08-10-scalable-3a-exploration.md`
- Parent ADR: `adr-3a-architecture-navigation-workspace`
- Successor for Graph rendering and impact analysis: `adr-webgl-3a-graph-exploration`

## Context

The implemented 3A page requests up to 200 projection nodes, renders all returned catalog nodes, chooses an implicit focus, and eagerly loads trace, Alignment, and Drift data. A dense layer stretches the whole lane grid and creates a long page. The trace repository also loads all projection edges before applying an in-memory walk. These behaviors are acceptable only for a small local catalog and contradict the bounded navigation contract of ADR-0022.

Catalog browsing and relationship analysis are separate user jobs. GitNexus demonstrates effective focus-first graph exploration with context, impact, trace, filtering, and bounded result controls, but its WebGL renderer and code-graph storage are not requirements for SpecForge's bounded Baseline projection browser.

## Decision

Split the Architecture tab into two primary views. The Lane Catalog uses three independent, fixed-height, server-paginated BIZ, SYS, and TECH streams with a default page size of 20 and server-side search. The Relationship Graph requires an explicit focus and loads only a bounded upstream or downstream neighborhood. Repeated continuation-based expansion provides open-ended exploration while every request remains finite.

The page loads only the active tab and view. It must not eagerly fetch trace, Alignment, Drift, all catalog nodes, or all projection edges. PostgreSQL traversal must query indexed adjacency for the current frontier rather than filtering a full edge list in memory.

The graph reuses `@xyflow/react` and applies deterministic positions across three horizontal architecture bands with upstream on the left, the focus in the center, and downstream on the right. This bounded architecture-specific layout is preferred over a moving force layout. The graph provides typed relation and layer filters, impact highlighting, node and edge inspection, continuation markers, icon controls, and an accessible list fallback.

This renderer decision describes the implemented first increment. ADR-0024 supersedes it for the next Graph increment by selecting a bounded Sigma.js, Graphology, and WebGL workspace with Overview, Explore, and Impact views. ADR-0023 remains authoritative for Lane Catalog behavior, exact-Scope bounded queries, continuation, and PostgreSQL authority.

The existing URL model adds `mode=graph`, preserves `mode=lanes` and `mode=list`, and keeps Scope, Baseline, Projection, focus, and direction across mode changes. Scope, Baseline, or Projection changes invalidate all client query state before rendering new results.

## Alternatives

1. **Keep fetching 200 nodes and only add CSS scrolling.** Rejected because it shortens the page but preserves unnecessary data transfer, eager inactive-tab work, client filtering, and a non-scalable trace implementation.
2. **Replace lanes with a full graph.** Rejected because graph exploration is poor for scanning a large catalog and whole-Scope rendering is explicitly forbidden.
3. **Adopt GitNexus's Sigma.js and Graphology stack immediately.** Rejected for the first increment because SpecForge already has React Flow, the graph response is strictly bounded, and an additional renderer would add operational and accessibility cost without measured need.
4. **Use a force-directed layout.** Rejected because movement and nondeterministic positions make 3A comparison, keyboard focus, and repeated impact analysis harder.
5. **Cap the whole exploration at three hops.** Rejected because the product needs deeper analysis. The design instead bounds each request and supports repeated continuation-based expansion.
6. **Query exact totals for every lane interaction.** Rejected because exact counts add avoidable work. The UI reports loaded count and whether more pages exist.

## Consequences

- The page height remains stable while each layer can grow independently.
- First render transfers fewer nodes and avoids inactive Alignment, Drift, and graph queries.
- Users gain a dedicated relationship analysis surface without losing catalog scanning.
- URL compatibility and the existing query service are preserved through additive contracts.
- PostgreSQL traversal becomes more scalable because it reads frontier adjacency instead of all edges.
- Client state and tests become more complex because each lane and graph expansion has an independent cursor or continuation lifecycle.
- React Flow remains sufficient for the bounded first increment, while telemetry may justify a later WebGL renderer.
- This decision improves request shape and browser behavior but does not certify production billion-scale capacity.

## Constraints

- Every query, cursor, continuation, node, edge, error, and count signal is bound to tenant, exact `applicationServiceId`, full `scopePath`, Baseline, and Projection Manifest.
- PostgreSQL remains authoritative. Renderers and graph databases remain replaceable derived consumers.
- The browser must never accumulate or render an entire application-service graph.
- Lane pages default to 20 nodes. Graph expansions use finite node, edge, depth, timeout, and payload budgets.
- The product has no total hop ceiling; continuation state must remain subject-, Scope-, Baseline-, Projection-, filter-, and expiry-bound.
- `mode=list` compatibility is retained.
- The Web remains read-only and client components cannot import Prisma.
- English canonical content and complete Chinese overlays remain required.
- Implementation cannot be marked complete without focused browser, query, accessibility, Scope-isolation, MCP synchronization, and session-closure evidence.

## Evidence

- `node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\design-context.ts preflight --intent "Design scalable 3A lane browsing and focused relationship graph exploration" --affected "adr-3a-architecture-navigation-workspace,proposal-3a-architecture-navigation-workspace,ctx-3a-architecture-navigation-workspace,api-specforge-3a-architecture-query" --evidence "user-approved-lanes-option-a,gitnexus-graph-reference,current-3a-page-audit"` opened `design-change-session:bf43d490-47f0-4b3b-8fee-932d4b5ccf66` in the exact Designer Scope and read 194 scoped design assets.
- Repository inspection found `limit: 200`, client-side filtering and rendering, implicit first-node focus, and unconditional trace, Alignment, and Drift queries in the current 3A route.
- Repository inspection confirmed signed layer-bound search cursors, traversal continuations, and an existing `@xyflow/react` dependency.
- GitNexus official repository and architecture documentation were reviewed on 2026-08-10 for graph interaction and rendering references.
- Written-Spec self-review found 16 English and 16 Chinese sections, all required ADR sections, zero placeholders, no scope expansion, and no implementation claim; `git diff --check` passed.
- `node node_modules\.pnpm\vitest@2.1.9_@types+node@22.20.1_supports-color@7.2.0\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts scripts\sync-design-facts.test.ts` passed 2 files and 31 tests.
- Selected exact-Scope `scripts/sync-design-facts.ts` returned `complete` for `adr-scalable-3a-exploration`.
- Selected exact-Scope `scripts/reconcile-design-facts.ts` verified `adr-scalable-3a-exploration` with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.
- User written-Spec review on 2026-08-10 approved the bilingual Spec and authorized implementation-plan authoring.
- The implementation plan self-review mapped all 16 Spec sections to 8 independently testable tasks, removed unfinished markers, and reconciled query, state, layout, and renderer type signatures.
- `scripts/design-context.ts close --session design-change-session:bf43d490-47f0-4b3b-8fee-932d4b5ccf66 --status CONVERGED` closed the exact-Scope design session with written-Spec approval, plan self-review, 31 passing design-fact tests, MCP synchronization, and read-back evidence.
- `node apps\\web\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages\\knowledge-query\\src\\service.test.ts packages\\knowledge-query\\src\\prisma-repository.test.ts apps\\web\\lib\\3a\\workspace-loader.test.ts apps\\web\\lib\\3a\\query-handler.test.ts apps\\web\\lib\\3a\\url-state.test.ts apps\\web\\components\\three-a\\catalog-state.test.ts apps\\web\\components\\three-a\\architecture-graph-state.test.ts apps\\web\\components\\three-a\\architecture-graph-layout.test.ts apps\\web\\components\\three-a\\three-a-workspace.test.tsx` passed 9 test files and 29 tests.
- `node apps\\web\\node_modules\\typescript\\bin\\tsc -p apps\\web\\tsconfig.json --noEmit` exited 0 after regenerating Prisma Client v6.19.3 with `--no-engine`.
- `$env:SPECFORGE_NEXT_STANDALONE='0'; node apps\\web\\node_modules\\next\\dist\\bin\\next build --no-lint --experimental-app-only` exited 0; the optimized build compiled, checked types, generated 20 static pages, and emitted `/architecture/3a` plus `/api/architecture/3a/query`. The default standalone copy path still hits the known Windows/OneDrive pnpm symlink `EPERM`.
- In-app browser acceptance rendered the desktop bilingual read-only workspace and explicit-focus Graph prompt. At 390x844, body width was 375px, document scroll width was 375px, and three BIZ/SYS/TECH tabs were present with no horizontal overflow. The configured Projection had no selectable Baseline, so acceptance remained in the safe unavailable/empty state without fabricated facts.
- `git diff --check` exited 0 for the implementation and governance changes.

## MCP Record

- Matching MCP ADR ID: `adr-scalable-3a-exploration`
- Matching Proposal ID: `proposal-scalable-3a-exploration`
- Matching Context Pack ID: `ctx-scalable-3a-exploration`
- Exact Scope: `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related assets: `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`, and `adr-3a-architecture-navigation-workspace`
- Required links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` query API and projection model; Proposal `IMPACTS` query API; Evidence `VALIDATES` ADR.
- Synchronization state: ADR, implemented Proposal, Context Pack, Evidence, typed links, and the additive query contract are synchronized and read back in the exact owning Scope. PostgreSQL remains authoritative for authored facts and relationship events; graph storage remains a derived projection. Local behavior is verified, while production billion-scale capacity remains deferred.

## 中文本地化覆盖

### 标题

可扩展 3A 目录与关系探索

### 状态

**已实施并完成本地验收；生产级十亿规模容量仍延期。**

- 稳定 ID：`adr-scalable-3a-exploration`
- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:d31c59f5-2630-4d4c-b351-83e0bcfc2c57`
- 已批准 Spec：`docs/superpowers/specs/2026-08-10-scalable-3a-exploration-design.md`
- 实施计划：`docs/superpowers/plans/2026-08-10-scalable-3a-exploration.md`
- 父 ADR：`adr-3a-architecture-navigation-workspace`
- Graph 渲染与影响分析的后续 ADR：`adr-webgl-3a-graph-exploration`

### 背景

已实现的 3A 页面一次请求最多 200 个投影节点，渲染全部返回目录节点，隐式选择焦点，并提前加载 Trace、Alignment 和 Drift 数据。高密度层会拉伸整个泳道网格并形成很长的页面。追踪仓库还会先加载所有投影关系，再在内存中遍历。这些行为只适合小型本地目录，并且违背 ADR-0022 的有界导航契约。

目录浏览与关系分析是不同的用户任务。GitNexus 展示了有效的焦点式图谱探索，包括上下文、影响、路径、筛选和有界结果控制，但它的 WebGL 渲染器和代码图谱存储不是 SpecForge 有界 Baseline 投影浏览器的必要条件。

### 决策

把 Architecture 标签拆分为两种主要视图。泳道目录使用三个独立、固定高度、服务端分页的 BIZ、SYS、TECH 数据流，默认每页 20 条并执行服务端搜索。关系图谱要求显式焦点，只加载有界上下游邻域。重复使用继续状态展开可以支持开放式探索，同时保证每个请求有限。

页面只加载活动标签和视图。禁止提前获取 Trace、Alignment、Drift、全部目录节点或全部投影关系。PostgreSQL 遍历必须根据当前前沿查询索引邻接关系，禁止在内存中过滤完整关系列表。

图谱复用 `@xyflow/react`，在三条水平架构带上使用确定性位置：上游位于左侧，焦点位于中央，下游位于右侧。该有界且架构专属的布局优先于持续移动的力导向布局。图谱提供有类型关系和层筛选、影响高亮、节点与关系检查、继续标记、图标控件和无障碍列表回退。

该渲染器决策描述已实施的第一增量。ADR-0024 在下一 Graph 增量中用有界的 Sigma.js、Graphology 与 WebGL 工作台取代该渲染选择，并提供总览、探索和影响分析视图。ADR-0023 继续作为泳道目录、精确 Scope 有界查询、继续状态和 PostgreSQL 权威性的有效决策。

现有 URL 模型增加 `mode=graph`，保留 `mode=lanes` 和 `mode=list`，并在模式切换时保持 Scope、Baseline、Projection、焦点和方向。Scope、Baseline 或 Projection 变化后，必须先让全部客户端查询状态失效，再渲染新结果。

### 备选方案

1. **继续获取 200 个节点，只增加 CSS 滚动。** 拒绝，因为它虽然缩短页面，但保留了无效数据传输、非活动标签提前工作、客户端过滤和不可扩展追踪实现。
2. **用完整图谱替换泳道。** 拒绝，因为图谱不适合扫描大型目录，而且明确禁止全 Scope 渲染。
3. **立即采用 GitNexus 的 Sigma.js 和 Graphology。** 第一增量拒绝，因为 SpecForge 已有 React Flow，图谱响应严格有界，新增渲染器会在没有实测需求时增加运维和无障碍成本。
4. **使用力导向布局。** 拒绝，因为移动和不确定位置会增加 3A 对比、键盘焦点和重复影响分析难度。
5. **把总探索限制为三跳。** 拒绝，因为产品需要更深分析。本设计限制单次请求，并支持基于继续状态的重复展开。
6. **每次泳道交互都查询精确总数。** 拒绝，因为精确计数会增加不必要工作。UI 只报告已加载数量和是否仍有更多页面。

### 后果

- 页面高度保持稳定，同时各层可以独立增长。
- 首屏传输更少节点，并避免非活动 Alignment、Drift 和图谱查询。
- 用户获得专用关系分析界面，同时保留目录扫描能力。
- 通过兼容性契约保留 URL 和现有查询服务。
- PostgreSQL 遍历只读取前沿邻接关系，因此扩展性更好。
- 客户端状态和测试更复杂，因为每条泳道和每次图谱展开都有独立游标或继续生命周期。
- React Flow 足以支撑有界第一增量，后续遥测可能证明需要 WebGL 渲染器。
- 本决策改善请求形态和浏览器行为，但不宣称已通过生产亿级容量认证。

### 约束

- 每个查询、游标、继续状态、节点、关系、错误和数量信号都必须绑定租户、精确 `applicationServiceId`、完整 `scopePath`、Baseline 和 Projection Manifest。
- PostgreSQL 保持权威；渲染器和图数据库都是可替换派生消费者。
- 浏览器禁止积累或渲染完整应用服务图谱。
- 泳道默认每页 20 个节点；图谱展开执行有限节点、关系、深度、超时和载荷预算。
- 产品不设置总跳数上限；继续状态必须绑定 subject、Scope、Baseline、Projection、筛选和有效期。
- 保留 `mode=list` 兼容性。
- Web 保持只读，客户端组件禁止导入 Prisma。
- 英文规范内容和完整中文覆盖继续为必填项。
- 缺少浏览器、查询、无障碍、Scope 隔离、MCP 同步和会话关闭的聚焦证据时，禁止声明实施完成。

### 证据

- `node node_modules\.pnpm\tsx@4.23.0\node_modules\tsx\dist\cli.mjs scripts\design-context.ts preflight --intent "Design scalable 3A lane browsing and focused relationship graph exploration" --affected "adr-3a-architecture-navigation-workspace,proposal-3a-architecture-navigation-workspace,ctx-3a-architecture-navigation-workspace,api-specforge-3a-architecture-query" --evidence "user-approved-lanes-option-a,gitnexus-graph-reference,current-3a-page-audit"` 在精确 Designer Scope 中打开 `design-change-session:bf43d490-47f0-4b3b-8fee-932d4b5ccf66`，并读取 194 条 Scope 内设计资产。
- 仓库检查确认当前 3A 路由存在 `limit: 200`、客户端过滤与渲染、隐式首节点焦点，以及无条件 Trace、Alignment 和 Drift 查询。
- 仓库检查确认已有绑定层的签名搜索游标、遍历继续状态和 `@xyflow/react` 依赖。
- 2026-08-10 审视了 GitNexus 官方仓库和架构文档中的图谱交互与渲染参考。
- 书面 Spec 自审确认英文与中文各 16 个章节、ADR 必需章节完整、无占位符、无 Scope 扩张且未声明已实施；`git diff --check` 通过。
- `node node_modules\.pnpm\vitest@2.1.9_@types+node@22.20.1_supports-color@7.2.0\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts scripts\sync-design-facts.test.ts` 通过 2 个文件和 31 项测试。
- 针对精确 Scope 执行选定的 `scripts/sync-design-facts.ts`，为 `adr-scalable-3a-exploration` 返回 `complete`。
- 针对精确 Scope 执行选定的 `scripts/reconcile-design-facts.ts`，`adr-scalable-3a-exploration` 验证通过，`missing`、`mismatched`、`outOfScope` 和 `blocked` 列表为空。
- 2026-08-10 用户完成书面 Spec 审阅，批准双语 Spec 并授权编写实施计划。
- 实施计划自审把全部 16 个 Spec 章节映射到 8 个可独立测试任务，移除未完成标记，并统一查询、状态、布局和渲染器类型签名。
- `scripts/design-context.ts close --session design-change-session:bf43d490-47f0-4b3b-8fee-932d4b5ccf66 --status CONVERGED` 使用书面 Spec 批准、计划自审、31 项设计事实测试通过、MCP 同步和回读证据，关闭了精确 Scope 的设计会话。
- `node apps\\web\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" ...` 通过 9 个测试文件和 29 项测试，覆盖有界分页、精确 Scope 查询、邻接遍历、目录状态、图谱状态、确定性布局和工作台渲染。
- `node apps\\web\\node_modules\\typescript\\bin\\tsc -p apps\\web\\tsconfig.json --noEmit` 返回 0；`SPECFORGE_NEXT_STANDALONE=0` 的 Next 生产构建返回 0，生成 20 个静态页面以及 `/architecture/3a` 和 `/api/architecture/3a/query`。
- In-app Browser 桌面与 390x844 移动验收通过：页面保持双语只读工作台，Graph 无焦点时显示受控引导；移动端页面宽度与文档滚动宽度均为 375px，并显示 BIZ/SYS/TECH 三个页签。当前 Projection 没有可选 Baseline，因此页面保持安全空态，没有伪造事实。

### MCP 记录

- 匹配 MCP ADR ID：`adr-scalable-3a-exploration`
- 匹配 Proposal ID：`proposal-scalable-3a-exploration`
- 匹配 Context Pack ID：`ctx-scalable-3a-exploration`
- 精确 Scope：`com.huawei.celon.desiner`，路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 相关资产：`api-specforge-3a-architecture-query`、`data-specforge-3a-projection-read-model` 和 `adr-3a-architecture-navigation-workspace`
- 必需关系：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 查询 API 和投影模型；Proposal `IMPACTS` 查询 API；Evidence `VALIDATES` ADR。
- 同步状态：ADR、已实施 Proposal、Context Pack、Evidence、有类型关系和增量查询契约已在精确所属 Scope 中同步并回读。PostgreSQL 继续作为已编写事实和关系事件的权威存储，图数据库仅作为派生投影。本地行为已验证，生产十亿规模容量仍延期。
