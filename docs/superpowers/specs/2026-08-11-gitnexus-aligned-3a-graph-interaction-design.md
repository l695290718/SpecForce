# GitNexus-Aligned 3A Graph Interaction Design

## Status

Approved for implementation design. This document defines the next graph interaction increment; it does not claim the implementation is complete.

## Scope

- Application service: com.huawei.celon.desiner
- Scope path: pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
- Design session: design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752
- Existing decision: adr-webgl-3a-graph-exploration
- Primary UI surface: /architecture/3a?mode=graph

## Problem

The current SpecForge renderer uses deterministic positions, bounded requestAnimationFrame transitions, and a small pulse effect. It is stable and Scope-safe, but it does not yet provide GitNexus-level graph exploration. In particular, the graph lacks a persistent force-directed workspace, neighborhood-aware hover emphasis, a clear selected state, a usable layout lifecycle, and the visual hierarchy created by labels, edge curves, and movement controls.

The public GitNexus implementation uses Sigma.js and Graphology with a ForceAtlas2 worker, Noverlap cleanup, force/tree/circles views, custom hover rendering, and reducers that emphasize selected nodes and their neighbors:

- https://raw.githubusercontent.com/abhigyanpatwari/GitNexus/main/gitnexus-web/src/components/GraphCanvas.tsx
- https://raw.githubusercontent.com/abhigyanpatwari/GitNexus/main/gitnexus-web/src/hooks/useSigma.ts

## Goals

1. Align the graph interaction model with GitNexus, not merely its colors or animation timing.
2. Preserve SpecForge's exact Scope, bounded server query, PostgreSQL authority, and URL-backed focus state.
3. Make graph motion useful: it must reveal topology, settle, and remain controllable.
4. Make hover and selection explain relationships without turning the graph into a wall of labels.
5. Keep the current semantic DOM fallback and error recovery usable when WebGL is unavailable.

## Non-goals

- Do not copy GitNexus source code or its code-intelligence data model.
- Do not load an entire Scope into the browser.
- Do not move authored design facts or relationship authority into the browser or graph database.
- Do not introduce a new graph database for this UI increment.
- Do not change the 3A query contract, authorization, or cross-Scope policy.

## Design

### 1. Force-first layout lifecycle

Graph mode will use a Sigma-compatible ForceAtlas2 worker for Overview and Explore. The existing deterministic positions remain the initial seed so the first frame is meaningful. The worker then performs a bounded refinement pass and stops at a deterministic lifecycle boundary. A Noverlap pass follows the force pass to remove residual collisions.

The layout lifecycle is explicit:

1. seeded: initial bounded graph is visible.
2. running: nodes move and edges are temporarily reduced for readability.
3. settled: positions are stable and readable.
4. stopped: user or timeout stops additional motion.
5. failed: deterministic seed remains visible and a non-blocking fallback status is shown.

The user can start, stop, and restart the layout. Restarting reuses the same Scope-bound seed and does not refetch design facts.

### 2. GitNexus-style node and edge interaction

The renderer will keep separate refs for selected, hovered, highlighted, and layout state so Sigma event handlers always read current state.

Node states:

- Default: semantic layer color, degree-scaled size, labels shown only above the current readability threshold.
- Hovered: modest size increase, custom dark tooltip, color-matched halo, forced label.
- Selected: larger size, forced label, camera focus, stable URL focus.
- Neighbor: brighter size and color while the selected node is active.
- Unrelated: dimmed color and smaller size while the selected node is active.

Edge states:

- Default: low-opacity curved edge with weight-derived width.
- Connected to hovered or selected node: higher opacity and width.
- Unrelated during selection: low opacity, never removed from the Graphology model.
- During movement: edges may be hidden or reduced only while the camera/layout is moving, then restored after settling.

Clicking the stage clears selection. Clicking a node selects it without rebuilding the graph. Clicking an edge opens the existing relationship inspector.

### 3. View modes and controls

Graph mode exposes three layout modes:

- force: ForceAtlas2 plus Noverlap, the default GitNexus-style exploration view.
- tree: bounded hierarchy view for reading layer or containment structure.
- circles: bounded radial view for comparing layer or cluster groups.

Controls:

- Zoom in and out.
- Reset camera.
- Focus selected node.
- Start, stop, and restart layout.
- Clear selection.

Controls are icon-first with tooltips and accessible labels. The current view and focus remain URL-addressable.

### 4. Data and Scope boundary

The server continues to return bounded Overview, Explore, and Impact results. The client converts only the returned bounded result into Graphology. ForceAtlas2 changes positions, not facts. Layout state is ephemeral and never persisted as a design fact. Every request remains bound to the exact application service, full Scope path, Baseline, Projection, filters, and budget.

Overview and Explore focus changes reuse the loaded graph. Impact focus changes still reload the focus-defined impact query.

### 5. Motion and accessibility

Motion is meaningful rather than decorative:

- Initial force refinement animates from the deterministic seed.
- Camera focus uses finite easing.
- Hover uses a short halo and size transition.
- Selection remains stable after pointer release.
- prefers-reduced-motion disables worker animation and camera easing while preserving layout, focus, labels, and selection semantics.

The semantic fallback must expose the same node list, current selection, relationship details, and controls when WebGL cannot initialize.

## Component boundaries

- sigma-architecture-graph.tsx: Sigma lifecycle, reducers, events, camera, render failure recovery.
- architecture-graph-layout-worker.ts: bounded ForceAtlas2/Noverlap orchestration and deterministic fallback.
- architecture-graph-store.ts: Graphology data and derived selection/neighborhood state.
- architecture-graph-workspace.tsx: query loading, URL focus, view mode, filters, and panels.
- architecture-graph-controls.tsx: layout and camera actions, separated from rendering.
- Existing query client and server contracts remain unchanged.

## Error handling

- WebGL unavailable: preserve the semantic DOM graph and report WEBGL_UNAVAILABLE.
- WebGL context lost: tear down Sigma, preserve the Graphology snapshot, and expose retry.
- Layout worker failure or timeout: apply deterministic positions, restore edges, and report WORKER_ERROR without blanking the graph.
- Empty or invalid bounded result: use the existing exact-Scope PostgreSQL fallback.
- Click or focus change: never clear Overview or Explore data solely because URL focus changed.

## Verification

Focused tests must cover:

1. Force layout request settings, bounded runtime, deterministic seed, and Noverlap fallback.
2. Reducer output for default, hovered, selected, neighbor, and unrelated nodes.
3. Edge opacity and width for connected and unrelated edges.
4. Click, hover, stage click, edge click, and reduced-motion event behavior.
5. View mode and control state transitions.
6. Focus persistence without graph reload.
7. WebGL fallback, worker failure, and browser acceptance with node/edge counts.

Browser acceptance must verify that a graph with the exact Designer Scope keeps its bounded counts, shows visible edges after settling, supports hover and selection without disappearance, and reports no new console errors.

## Acceptance criteria

- The default graph feels force-directed and settles without persistent node collisions.
- Hovering a node makes its label and one-hop neighborhood legible.
- Clicking a node leaves the graph loaded, focuses the node, and keeps the URL focus.
- Clicking the stage clears selection without refetching facts.
- Edges remain readable after layout and camera transitions.
- Force, Tree, and Circles modes are independently usable.
- WebGL fallback remains functional.
- Exact Scope and bounded data guarantees remain unchanged.

## 中文本地化覆盖

### 状态

已批准进入实施设计。本文件定义下一阶段图谱交互增量，不代表代码已经完成。

### 问题

当前 SpecForge 使用确定性坐标、有限的 requestAnimationFrame 过渡和简单脉冲效果。它稳定且满足 Scope 隔离，但还没有达到 GitNexus 的探索体验，缺少持续的力导向工作区、邻域悬停高亮、明确的选中态、可控的布局生命周期，以及由标签、曲线边和运动控制形成的视觉层次。

### 目标

1. 对齐 GitNexus 的图谱交互模型，而不是只模仿颜色或动画时长。
2. 保留 SpecForge 精确 Scope、服务端数据预算、PostgreSQL 权威存储和 URL 焦点状态。
3. 让图谱运动服务于拓扑发现，并且可以稳定结束和手动控制。
4. 通过悬停和选中解释关系，避免整张图充满标签。
5. WebGL 不可用时继续保留语义 DOM 回退和错误恢复。

### 设计

Graph 模式默认使用 ForceAtlas2 Worker，并在之后执行 Noverlap 消除节点碰撞。确定性坐标作为初始种子，保证首帧可读；力导向只改变临时坐标，不改变设计事实。布局生命周期为 seeded、running、settled、stopped、failed，并提供启动、停止和重新布局。

节点分为默认、悬停、选中、邻居和无关状态。悬停时放大节点、显示深色自定义标签和颜色匹配的光环；选中时聚焦相机、保持 URL focus，并高亮一跳邻居；无关节点降噪但不会从 Graphology 中删除。边默认低透明度曲线显示，关联边提升透明度和宽度，布局或相机移动时可以暂时降低边显示，稳定后恢复。

Graph 模式提供 force、tree、circles 三种布局；提供缩放、重置相机、聚焦选中节点、启动/停止/重新布局和清除选中控制。现有搜索、层级和关系过滤保持不变。

### 数据边界

服务端仍然返回有界的 Overview、Explore 和 Impact 结果，客户端只将结果转换为 Graphology。每次请求继续绑定应用服务、完整 Scope、Baseline、Projection、过滤条件和预算。概览和探索的焦点变化复用已加载图谱；影响分析的焦点变化继续重新请求。

### 错误与无障碍

WebGL 不可用时保留语义 DOM 图谱、选中状态、关系详情和控制项。WebGL 上下文丢失、布局 Worker 失败或超时，都不能把图谱变成空白；应退回确定性坐标并恢复边显示。用户启用减少动画时，关闭 Worker 动画和相机缓动，但保留布局、焦点、标签和选中语义。

### 验收

必须验证 ForceAtlas2 请求和 Noverlap 回退、各类节点与边状态、悬停/点击/舞台点击/边点击、三种视图、减少动画、焦点持久化、WebGL 回退以及精确 Designer Scope 的浏览器验收。点击节点后图谱必须保持节点和边数据，不得再次出现“变成圆球后消失”。
