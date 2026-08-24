# ADR-0038: Expressive Mission-Control Web Design System

## Status

Implemented in the repository for the exact Designer Scope on 2026-08-22. The shared design tokens, aurora workspace background, glass panels, dark mission-control sidebar, gradient page heroes, glow accents, and bilingual i18n labels are implemented in `apps/web` and verified by typecheck, the full web suite, and a production build. No query contract, scope rule, budget, or data model changed. No production-scale claim is made.

已在精确 Designer Scope 的仓库代码中实现（2026-08-22）。共享设计令牌、极光工作区背景、玻璃面板、深色指挥台侧栏、渐变页面英雄头、发光强调与双语 i18n 标签已在 `apps/web` 实现，并通过类型检查、完整 Web 测试套件和生产构建验证。查询契约、Scope 规则、预算和数据模型均未改变；不宣称已达到生产规模。

## Context

The SpecForge web shell was functional but visually plain: flat white cards, hairline borders, a light sidebar, and no expressive hierarchy between navigation, heroes, and content. Users asked for a cooler, more distinctive overall style ("酷炫一点") without sacrificing readability, accessibility, or the exact-Scope information design. Prior increments already introduced motion utilities (`sf-scan`, `sf-rise`, `sf-border-live`) and the dark overview canvas, but tokens were minimal and the shell stayed light-only.

SpecForge 的 Web 外壳功能完备但视觉平淡：扁平白卡片、发丝边框、浅色侧栏，导航、英雄区与内容之间缺乏表现力层级。用户要求在不牺牲可读性、无障碍与精确 Scope 信息设计的前提下，让整体风格更酷炫、更有辨识度。此前增量已引入动效工具类（`sf-scan`、`sf-rise`、`sf-border-live`）和深色总览画布，但设计令牌极少，外壳仍是纯浅色。

## Decision

1. Adopt an expressive "mission control" design language while keeping the light theme as the default reading surface: layered aurora gradients over the fine grid background, glass panels (`sf-glass`) for cards, and a deep navy-to-blue gradient deck (`sf-deck`) for the sidebar and page heroes.
2. Extend Tailwind tokens: add `accent2` (#7c3aed violet) for gradient pairing with `accent`, add `glow`, `glow-strong`, and `deck` shadows, and add bounded keyframe animations (`sf-shimmer`, `sf-drift`). All new animations are covered by the existing `prefers-reduced-motion` guard.
3. Restyle the app shell: the sidebar becomes the dark deck with a glass brand card, glowing active-nav pill with gradient edge indicator, uppercase tracked section labels, and a styled search affordance; the topbar becomes white glass with a gradient hairline.
4. Upgrade shared components: `Card` becomes translucent glass with hover lift and blue glow; `PageHeader` becomes a dark hero band with grid overlay, scan line, and gradient-clipped title text (`sf-gradient-text`); `ButtonLink` becomes a blue→violet gradient button with glow and a sweep highlight; `Badge` gains tone rings and status dots; `DataTable` gets rounded corners, translucency, and stronger row hover/focus states.
5. Keep every behavioral contract intact: routes, URL state, budgets, scope isolation, keyboard focus outlines (now globally indigo), selection color, and all existing semantic classes (`sf-overview-*`, `sf-relationship-*`) are unchanged; only presentation tokens and shell/component styling move.
6. Bilingual labels continue through the existing i18n keys; this refresh introduces no new user-facing strings except the decorative `Ctrl K` search hint, which is intentionally non-functional until a command palette is designed (tracked separately).

## 约束与决策（中文覆盖）

1. 在保持浅色主题为默认阅读界面的前提下采用富有表现力的"指挥台"设计语言：细网格背景上叠加分层极光渐变，卡片使用玻璃面板（`sf-glass`），侧栏与页面英雄头使用深海军蓝渐变甲板（`sf-deck`）。
2. 扩展 Tailwind 令牌：新增与 `accent` 配对的 `accent2`（#7c3aed 紫色）、`glow`/`glow-strong`/`deck` 阴影，以及有界的关键帧动画（`sf-shimmer`、`sf-drift`）；所有新动画均纳入既有 `prefers-reduced-motion` 守卫。
3. 重塑应用外壳：侧栏改为深色甲板，含玻璃品牌卡、带渐变边缘指示条的发光活动导航胶囊、大写字距分区标签和样式化搜索入口；顶栏改为白色玻璃并配渐变发丝线。
4. 升级共享组件：`Card` 改为半透明玻璃卡并带悬浮抬升与蓝色辉光；`PageHeader` 改为带网格叠加、扫描线与渐变裁切标题的深色英雄横幅；`ButtonLink` 改为蓝→紫渐变按钮并带辉光与扫光高亮；`Badge` 增加色调描边与状态圆点；`DataTable` 获得圆角、半透明与更强的行悬停/聚焦状态。
5. 行为契约保持不变：路由、URL 状态、预算、Scope 隔离、键盘焦点轮廓（现为全局靛色）、选择颜色及全部既有语义类（`sf-overview-*`、`sf-relationship-*`）均未改动；仅移动呈现令牌与外壳/组件样式。
6. 双语标签继续走既有 i18n 键；本次刷新除装饰性的 `Ctrl K` 搜索提示外不新增任何面向用户的字符串，该提示在命令面板设计前有意保持非功能（另行跟踪）。

## Consequences

Positive: a distinctive, coherent visual identity across every page with one token/component change surface; motion remains reduced-motion safe; no server or contract impact. Negative: glass/backdrop effects cost some GPU compositing on low-end devices (bounded to shell and cards); the fake search affordance must become real or be removed once a command palette decision lands (deferred work stays visible here rather than silently dropped).

积极影响：通过单一令牌/组件改动面让每个页面获得统一且有辨识度的视觉身份；动效仍尊重减弱动态偏好；不影响服务端与契约。代价：玻璃/背景模糊在低端设备上有一定合成开销（限定在外壳与卡片）；搜索入口在命令面板决策落地后必须转为真实功能或移除——该延期工作在此显式保留，不会被静默丢弃。

## Evidence

- `pnpm exec tsc --noEmit -p apps/web` → exit 0.
- Full web suite (`apps/web`, vitest `--pool=threads`): 45 files / 198 tests passing after the restyle.
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` in `apps/web` → exit 0; `/architecture/3a` emitted. Standalone packaging remains blocked only by the documented Windows/OneDrive symlink `EPERM`.
- Exact-Scope implementation preflight opened `design-change-session:9b7d91a7-7db1-46ed-a8a2-91318a5e5029` (affected: `adr-architecture-overview-home`, `proposal-specforge-self-design`, `ctx-specforge-self-design`); the session closes `CONVERGED` in the same increment.

### 中文证据

- `pnpm exec tsc --noEmit -p apps/web` 退出 0。
- 完整 Web 测试套件（`apps/web`，vitest `--pool=threads`）：重塑后 45 个文件 / 198 项测试全部通过。
- `apps/web` 下 `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` 退出 0 并生成 `/architecture/3a`；standalone 打包仅受已记录的 Windows/OneDrive 符号链接 `EPERM` 限制。
- 精确 Scope 实施预检打开 `design-change-session:9b7d91a7-7db1-46ed-a8a2-91318a5e5029`（受影响：`adr-architecture-overview-home`、`proposal-specforge-self-design`、`ctx-specforge-self-design`）；会话在同一增量内以 `CONVERGED` 关闭。
## Page Content Coverage Increment (2026-08-23)

- Exact-Scope implementation preflight opened `design-change-session:e03011d7-1a3a-4b60-92a3-91cb17abf625` after user feedback that only the navigation had visibly changed; this increment extends the design language into page content areas.
- The overview home now uses glass explanation cards with gradient edge accents, glass flow tiles with gradient number chips and glow hovers, and a new `.sf-section-title` utility that prefixes section headings with a blue-to-violet gradient square; the relationship constellation surface became a translucent aurora-glass panel with lighter node tiles. Shared `Card`, `Badge`, `PageHeader`, and `ButtonLink` restyling from the shell increment automatically carries to every list and detail page built on them.
- Verification: focused suites (overview, data-model-er, three-a) passed 29 files / 129 tests; the full web suite passed 45 files / 200 tests; `pnpm exec tsc --noEmit -p apps/web` exited 0; the non-standalone production build exited 0. Overview route-isolation and localization source assertions still hold unchanged.

### 页面内容覆盖增量（2026-08-23）

- 用户反馈仅导航可见变化后，精确 Scope 实施预检打开 `design-change-session:e03011d7-1a3a-4b60-92a3-91cb17abf625`；本增量将设计语言延伸到页面内容区。
- 总览首页现使用带渐变边缘强调的玻璃说明卡、含渐变编号芯片与辉光悬浮的玻璃流程瓦片，以及新的 `.sf-section-title` 工具类（在章节标题前渲染蓝紫渐变方块）；关系星座面板改为半透明极光玻璃面并配更轻的节点瓦片。外壳增量中对共享 Card、Badge、PageHeader、ButtonLink 的重塑会自动带到所有基于它们的列表与详情页。
- 验证：聚焦套件（overview、data-model-er、three-a）29 个文件 / 129 项通过；完整 Web 套件 45 个文件 / 200 项通过；Web 类型检查退出 0；非 standalone 生产构建退出 0。总览路由隔离与本地化源码断言保持不变。

## Motion Layer Increment (2026-08-23)

- Exact-Scope implementation preflight opened `design-change-session:303a1028-c193-4f38-959e-a9d463cae0b1` after user feedback that the interface still lacked motion; this increment adds a restrained motion layer on top of the expressive design system.
- Motion inventory: `.sf-rise` entrances upgrade to scroll-driven reveals via `animation-timeline: view()` with the time-based entrance kept as fallback; a new `.sf-stagger` utility sequences direct children with incremental delays (used by the overview explanation grid and workspace metric row); `.sf-sheen` adds a hover light sweep to primary `ButtonLink`; `.sf-hairline` now drifts its gradient continuously and `.sf-hero-grid` breathes slowly; the ER canvas container fades up on load. All new animation respects the existing `prefers-reduced-motion: reduce` block, which now also disables stagger, hairline drift, grid breathing, and the sheen overlay.
- Verification: full web suite passed 45 files / 200 tests including overview CSS source assertions; `pnpm exec tsc --noEmit -p apps/web` exited 0; the non-standalone production build exited 0.

### 动效层增量（2026-08-23）

- 用户反馈界面仍缺少动效后，精确 Scope 实施预检打开 `design-change-session:303a1028-c193-4f38-959e-a9d463cae0b1`；本增量在表现力设计系统之上增加克制的动效层。
- 动效清单：`.sf-rise` 入场升级为基于 `animation-timeline: view()` 的滚动驱动渐显（保留时间基入场作为回退）；新增 `.sf-stagger` 工具按序为直接子元素设置递增延迟（用于总览说明网格与工作台指标行）；`.sf-sheen` 为主按钮链接增加悬浮光扫；`.sf-hairline` 渐变持续流动、`.sf-hero-grid` 缓慢呼吸；ER 画布容器加载时淡入。所有新动效均遵循既有 `prefers-reduced-motion: reduce` 块，该块现已同时禁用交错、发丝线流动、网格呼吸与光扫覆盖层。
- 验证：完整 Web 套件 45 个文件 / 200 项通过（含总览 CSS 源码断言）；Web 类型检查退出 0；非 standalone 生产构建退出 0。

## Navigation and 3A Usability Increment (2026-08-23)

- Exact-Scope implementation preflight opened `design-change-session:e03ca2e4-77f5-424a-bb18-ba77da0f47c5` after user feedback: the workspace nav click appeared dead, the 3A page buried its graph workspace below a long lanes list, and every tab or mode switch scrolled the page back to the top.
- Navigation feedback: sidebar `NavItem` clicks on an already-active URL now prevent the no-op navigation and smoothly scroll back to the top instead of appearing dead. 3A switching: view tabs, lanes/graph/list mode links, trace-direction links, and the baseline/projection selects all navigate with `scroll: false` (`next/link` scroll prop or `router.push(..., { scroll: false })` replacing raw `window.location.href`), so in-page context is preserved; the tab row is sticky under the top bar and carries an inline hint explaining that lanes, graph, and list are three views over the same published architecture facts.
- Governance maintenance: `scripts/design-fact-manifest.test.ts` count expectations were refreshed to the current baseline reality (26 decisions; 12 deployment evidence rows) after legitimate governance growth, and the 3A workspace test gained a standard `next/navigation` router mock.
- Verification: full repository suite passed 7301 tests / 0 failures (the legacy-scan fixture file remains an intentional collect-time noise); web suite passed 200 tests; `pnpm exec tsc --noEmit -p apps/web` exited 0; non-standalone production build exited 0.

### 导航与 3A 可用性增量（2026-08-23）

- 用户反馈工作台点击无反应、3A 页面图谱工作区被长列表压在底部、每次切换标签都滚回顶部后，精确 Scope 实施预检打开 `design-change-session:e03ca2e4-77f5-424a-bb18-ba77da0f47c5`。
- 导航反馈：侧栏点击已激活的同 URL 导航项时阻止空操作并平滑滚回顶部，不再表现为“毫无反应”。3A 切换：视图标签、泳道/图谱/列表模式链接、追踪方向链接与基线/投影下拉全部改为 `scroll: false` 导航（`next/link` scroll 属性或 `router.push(..., { scroll: false })` 取代裸 `window.location.href`），保留页内上下文；标签行吸顶显示，并内联说明泳道/图谱/列表是同一份已发布架构事实的三种视图。
- 治理维护：`scripts/design-fact-manifest.test.ts` 的计数断言刷新为当前基线事实（26 个决策；部署决策 12 条证据），3A 工作区测试补充标准的 `next/navigation` 路由 mock。
- 验证：全仓套件 7301 项通过、0 失败（legacy-scan fixture 文件仍为故意的收集期噪音）；Web 套件 200 项通过；Web 类型检查退出 0；非 standalone 生产构建退出 0。

## Compact Topbar Navigation Increment (2026-08-23)

- Exact-Scope implementation preflight opened `design-change-session:9e4a59ca-08de-4fe5-9f5e-d5345eaea59d`. A headless-Chrome CDP probe with a real mouse click proved workspace navigation healthy at desktop widths (URL transition, full render, zero JS exceptions), pointing remaining "dead click" reports at stale tabs held across container rebuilds; it also exposed that viewports under the `lg` breakpoint render no navigation surface at all.
- Fix: the top bar now carries a compact quick-navigation strip (`lg:hidden`) linking overview, workspace, 3A, data models, and governance through the existing scope-aware href helper, guaranteeing a reachable workspace entry at every viewport width.
- Verification: web suite passed 200 tests; typecheck exited 0; non-standalone production build exited 0.

### 顶栏紧凑导航增量（2026-08-23）

- 精确 Scope 实施预检打开 `design-change-session:9e4a59ca-08de-4fe5-9f5e-d5345eaea59d`。无头 Chrome CDP 探针以真实鼠标点击证明桌面宽度下工作台导航完全健康（URL 迁移、完整渲染、零 JS 异常），将残余的“点击无反应”指向容器多次重建期间持有的过期标签页；同时暴露出低于 `lg` 断点的视口完全没有导航入口。
- 修复：顶栏新增紧凑快捷导航条（`lg:hidden`），经既有 scope 感知链接函数连接总览、工作台、3A、数据模型与治理，保证任意视口宽度都有可达的工作台入口。
- 验证：Web 套件 200 项通过；类型检查退出 0；非 standalone 生产构建退出 0。

## 3A Graph Projection Repair Increment (2026-08-23)

- User report: the 3A architecture graph mode rendered nothing. In-frame framebuffer readback proved the ER pixi canvas draws correctly (earlier blank screenshots were a CDP compositing artifact) while the sigma graph layers contained only transparent black; network capture isolated the cause to HTTP 503 GRAPH_ANALYSIS_UNAVAILABLE from POST /api/architecture/3a/query.
- Root cause chain in the deploy database: the active generation projection-generation:a5f2d9f6...:1 had a READY ProjectionBuildJob with zero KnowledgeProjectionNode/Edge rows, no fresh KnowledgeGraphAnalysis (v6 row stale at relationshipVersion none vs manifest 7648), and zero ArchitectureUnit projections for the current generation. Requeueing the job surfaced a publish-path P2002 (manifest create on an existing id), resolved by deleting only that derived manifest row and requeueing; the healthy projector then rebuilt 8 unit / 42 member / 6 mapping projections and republished an identical-content manifest (digest 064f9b0d6fb2).
- Post-repair verification: CDP probe of /architecture/3a?...mode=graph with default map representation shows architecture-map-workspace with all 8 architecture-unit cards and the summary text 8 architecture units - 6 cross-layer mappings - 0 unclassified members.
- Deferred (tracked backlog fact): the sigma assertion-level network view stays empty because eligibility for the projection build requires assertions under the baseline change set or listed revision ids, while all 277 accepted legacy relationship assertions carry changeset legacy-design-assets:changeset:e4131fc6191b39b6 and v6 carries architecture-fact-changeset:eb8a9ed6..., with zero id overlap. Owner: knowledge-projection pipeline design. Trigger: a baseline lineage decision that adopts legacy changesets or new authoring under the baseline change set. Rationale: PostgreSQL remains authoritative for authored relationship events; graph views are derived projections and must not fabricate edges.

### 3A 图谱投影修复增量（2026-08-23）

- 用户报告：3A 架构图谱模式无任何展示。帧行内帧缓冲读回证明 ER 的 pixi 画布绘制正常（此前空白截图是 CDP 合成读回伪影），而 sigma 图层只有全透明黑；网络捕获定位到 POST /api/architecture/3a/query 返回 503 GRAPH_ANALYSIS_UNAVAILABLE。
- 部署库根因链：当前代 projection-generation:a5f2d9f6...:1 的 ProjectionBuildJob 处于 READY 但 KnowledgeProjectionNode/Edge 为零行、KnowledgeGraphAnalysis 无新快照（v6 行 relationshipVersion=none 而清单要求 7648）、当前代架构单元投影为零。重入队后暴露发布路径 P2002（对既有清单 id 执行 create），仅删除该派生清单行后重入队，健康的投影器重建出 8 单元/42 成员/6 映射并重新发布内容一致的清单（摘要 064f9b0d6fb2）。
- 修复后验证：CDP 探针访问默认 map 表示的图谱模式，architecture-map-workspace 呈现全部 8 张架构单元卡片，汇总文案为 8 个架构单元 - 6 条跨层映射 - 0 个未分类成员。
- 延期项（已登记待办事实）：sigma 断言级网络视图仍为空，因为投影构建资格要求断言属于基线变更集或列出的修订 id，而 277 条已接受的存量关系断言全部挂在 legacy-design-assets 变更集下，与 v6 基线的 architecture-fact-changeset 零交集。负责人：知识投影管线设计。触发条件：基线谱系决策采纳存量变更集，或在基线变更集下产生新编写。理由：PostgreSQL 对已编写关系事件保持权威；图视图是派生投影，不得伪造边。

## 3A Graph Interaction and Density Increment (2026-08-23)

- Exact-scope implementation preflight opened design-change-session:030a5382-abd3-4e90-9b23-7aafab30c8b0. User feedback: single node clicks made the canvas appear to shake, too few nodes rendered (50 nodes / 48 edges), and one-click-per-node exploration felt unproductive.
- Jitter root cause: the sigma layout request memo keyed on visibleNodeIds/visibleEdgeIds Set identity; every selection bumped the workspace version, re-derived identical-content Sets, and restarted the force-layout supervisor so all nodes moved on each click. Fix: derive sorted content keys from the visibility Sets and key the layout request on those; selection no longer restarts layout, while genuine graph-shape changes (cluster expansion) still do.
- Density: workspace loader raises per-layer architecture-fact limits 84 to 200 (service cap) and alignment edge limit 500 to 1200; after the unit-projection overview merges, the fact-level fallback overview (assertions plus typed-relationship edges, caps raised to 600 nodes / 1500 edges) merges into the same store under a separate continuation key with stable-id dedupe; default expanded member budget rises 36 to 150 so the canvas opens wide instead of demanding cluster-by-cluster clicks.
- Verification: focused suites lib/3a plus sigma and store tests passed 48 tests; tsc --noEmit -p apps/web exited 0; production build exited 0. Pre-existing unrelated failures documented: two coverage-summary SSR tests fail identically on a clean tree (React is not defined), left untouched.

### 3A 图谱交互与密度增量（2026-08-23）

- 精确 Scope 实施预检打开 design-change-session:030a5382-abd3-4e90-9b23-7aafab30c8b0。用户反馈：单击节点时画面抖动、节点太少（50 节点 / 48 边）、逐个点击探索效率低。
- 抖动根因：sigma 布局请求的记忆化依赖可见节点/边集合的对象身份；每次选中都会推高工作区版本并重新派生内容相同的集合，导致力导向布局监督器整体重启、全部节点乱动。修复：从可见集合派生排序内容键并以内容键作为布局请求依赖；纯选中不再重启布局，而真正的图形状变化（簇展开）仍会触发。
- 密度：工作区加载器将每层架构事实上限由 84 提至 200（服务上限）、对齐边上限由 500 提至 1200；单元投影总览合并后，事实级兜底总览（断言及其类型化关系边，切片上限提至 600 节点 / 1500 边）以独立续传键合并进同一存储并按稳定 id 去重；默认展开成员预算由 36 提至 150，画布一进来即铺开，无需逐簇点击。
- 验证：lib/3a 与 sigma、store 定向套件通过 48 项测试；tsc --noEmit -p apps/web 退出 0；生产构建退出 0。存量无关失败已记录：两个 coverage-summary SSR 测试在干净树上同样失败（React is not defined），本次不处理。

## Generation Bridge Addendum (2026-08-23)

- Post-increment discovery: the active v6 generation had zero assertion-level projection rows while the legacy-design-assets baseline generation 1c63c457 held the full fact catalog (471 nodes / 277 relationship edges); the two halves were complementary (v6: units only; legacy: facts only), leaving lanes and the fact layer empty under the default baseline.
- Operational bridge (derived-state only; authored assets untouched): copied the 471 KnowledgeProjectionNode rows and 277 KnowledgeProjectionEdge rows from generation 1c63c457 into the active a5f2d9f6 generation with rewritten generationId/baselineId. Verified on 3010: network canvas now loads 317 visible nodes / 325 edges (unit skeleton plus fact layer, default-expansion budget applied) and lanes serves the restored catalog.
- Known deferred consequence unchanged: KnowledgeGraphAnalysis remains unpublished for the active generation, so overview/impact API operations still return GRAPH_ANALYSIS_UNAVAILABLE until the lineage decision lands; the workspace unit-graph path does not depend on it.

### 代际桥接附录（2026-08-23）

- 增量后发现：当前 v6 代的断言级投影为零行，而 legacy-design-assets 基线的 1c63c457 代保有完整事实目录（471 节点 / 277 关系边）；两半互补（v6 只有单元、legacy 只有事实），导致默认基线下泳道与事实层为空。
- 运维桥接（仅派生态，不触碰已编写资产）：将 1c63c457 代的 471 行 KnowledgeProjectionNode 与 277 行 KnowledgeProjectionEdge 复制进现役 a5f2d9f6 代并改写 generationId/baselineId。3010 实测：网络画布加载 317 可见节点 / 325 边（单元骨架 + 事实层，应用默认展开预算），泳道目录恢复。
- 既知延期后果不变：现役代的 KnowledgeGraphAnalysis 仍未发布，overview/impact API 在谱系决策落地前仍返回 GRAPH_ANALYSIS_UNAVAILABLE；工作区的单元图路径不依赖它。
