# Continuous ForceAtlas2 Supervisor Layout Design

## Status

Approved for implementation on 2026-08-13 as a design increment of ADR-0024 (`adr-webgl-3a-graph-exploration`).

Owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

Implementation preflight: `design-change-session:42c82e52-5b6f-460a-9675-b95c8cde75cc`

## Problem

The current `force` layout computes a bounded one-shot ForceAtlas2 pass in a worker, animates the result for 900 ms, and then freezes. GitNexus-style exploration keeps the force-directed workspace alive: nodes continue to respond to attraction and repulsion until the user stops the layout. The one-shot model also hides all edges during the short transition, so topology disappears exactly when the user wants to read it.

## Goals

- Run the `force` layout as a continuous ForceAtlas2 supervisor so the graph feels alive until the user stops it.
- Keep edges visible during motion: reduce unrelated-edge emphasis, never remove edges.
- Preserve the deterministic BIZ/SYS/TECH seed as the first frame and the starting positions for every supervisor run.
- Keep `tree` and `circles` as deterministic static layouts; keep `prefers-reduced-motion` fully static.
- Keep the lifecycle `seeded | running | settled | stopped | failed` and the existing start/stop/restart controls.
- Keep the bounded graph budget, exact Scope, PostgreSQL authority, and the semantic DOM fallback unchanged.

## Non-goals

- Do not load an entire Scope into the browser.
- Do not change graph loading, relationships, persistence, authorization, or Scope isolation.
- Do not make `tree` or `circles` animate; they remain deterministic hierarchy/radial views.
- Do not run the supervisor for reduced-motion users or when WebGL is unavailable.

## Design

### 1. Supervisor lifecycle

`force` mode creates a `FA2LayoutSupervisor` from `graphology-layout-forceatlas2/worker` over the existing bounded Graphology graph, with the scope-bound `forceSettings` (gravity, scaling, Barnes-Hut, and edge-weight influence derived from node count and the stable seed). The supervisor spawns its own web worker and streams iteration results back to the graph through `updateEachNodeAttributes`.

The client refreshes the Sigma scene at ~16 fps while the supervisor is running. Starting the layout applies the deterministic seed, starts the supervisor, and performs one finite camera reset when no node is selected. Stopping the layout stops the supervisor, clears the refresh loop, runs a Noverlap pass to remove residual collisions, restores full edge emphasis, and performs a finite camera reset. Restarting cancels the previous run and starts a fresh supervisor from the current positions without refetching design facts.

### 2. Edge visibility during motion

While the supervisor runs, unrelated edges (no active selection) render at reduced opacity and size (`opacity * 0.6` with a floor, `size * 0.8`). Edges are never `hidden`. With an active selection, the existing emphasis/dim semantics remain unchanged, because unrelated edges are already strongly dimmed by the selection.

### 3. Failure and fallback

If supervisor construction throws (for example an unavailable `window.URL`), the client falls back to the previous bounded one-shot `runForceArchitectureLayout` (ForceAtlas2 plus Noverlap) with deterministic positions, reports `WORKER_ERROR` through the existing non-blocking renderer failure path, and keeps the semantic fallback available when WebGL itself is unavailable.

### 4. Lifecycle mapping

- `seeded`: graph loaded, deterministic seed visible.
- `running`: supervisor streaming positions; unrelated edges reduced.
- `settled`: user stopped the layout; Noverlap applied; camera reset; edges restored.
- `stopped`: reduced-motion or static `tree`/`circles` seed applied without animation.
- `failed`: supervisor or worker failure; deterministic fallback positions in use.

## Data flow

1. The exact Scope graph store receives bounded nodes and typed edges.
2. `force` mode applies the deterministic BIZ/SYS/TECH seed.
3. `FA2LayoutSupervisor` iterates in its worker and writes x/y back to Graphology.
4. The client refresh loop calls `sigma.refresh()` ~16 times per second.
5. Stopping clears the loop, applies Noverlap, resets the camera, and restores edge emphasis.
6. Restart starts a new supervisor from the current positions.

## Error handling and performance

- A supervisor failure falls back to the bounded one-shot refinement and keeps deterministic positions.
- The refresh loop is cleared on stop, restart, unmount, and reduced-motion mode; it never runs when the supervisor is not active.
- The supervisor is killed on unmount and on every new layout request, so stale workers cannot keep moving a replaced graph.
- The bounded graph budget (bounded server summaries and neighborhoods) is unchanged; the supervisor only moves nodes that are already loaded.
- `prefers-reduced-motion` applies the deterministic seed immediately and never creates a supervisor.

## Verification

- Repository-wide `pnpm typecheck` exits 0 for core, knowledge-query, knowledge-projector, mcp-server, and web.
- The focused 3A graph suite passes 4 files and 28 tests, including the updated motion-visibility reducer assertions (edges stay visible and unrelated edges lose emphasis while layout runs).
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` exits 0 and emits `/architecture/3a`.
- The full web suite passes 173 files and 777 tests; the 4 `derived-routes.test.ts` failures are pre-existing on HEAD (WebPrincipal wiring) and unrelated.
- Browser acceptance remains the documented retry trigger for a fresh exact-Scope hard reload.

## Supersedes

- For the `force` layout only, this design reverses the non-goal "Do not run an unbounded force simulation in the browser" of `docs/superpowers/specs/2026-08-11-3a-graph-motion-design.md` and the one-shot refinement described in `docs/superpowers/specs/2026-08-11-gitnexus-aligned-3a-graph-interaction-design.md`. `tree`, `circles`, reduced-motion, and the semantic fallback behaviors remain unchanged.

## Chinese localization

### 问题

当前 `force` 布局在 Worker 中执行一次性有界 ForceAtlas2 计算，用 900 ms 动画过渡后即冻结。GitNexus 式探索保持力导向工作区持续存活：节点在用户停止布局前持续响应引力与斥力。一次性模型还会在短暂过渡期间隐藏所有边，恰好在用户想读取拓扑时让拓扑消失。

### 目标

- `force` 布局以持续 ForceAtlas2 Supervisor 运行，在用户停止前图谱保持活跃。
- 运动期间边始终可见：仅降低无关边的强调，绝不删除。
- 保留确定性 BIZ/SYS/TECH 种子作为首帧和每次 Supervisor 运行的起始坐标。
- `tree` 与 `circles` 保持确定性静态布局；`prefers-reduced-motion` 完全静态。
- 保持 `seeded | running | settled | stopped | failed` 生命周期和现有启动/停止/重新布局控件。
- 有界图预算、精确 Scope、PostgreSQL 权威性和语义 DOM 回退保持不变。

### 非目标

- 不在浏览器中加载整个 Scope。
- 不改变图加载、关系、持久化、授权或 Scope 隔离。
- 不使 `tree` 或 `circles` 动画化；它们仍是确定性层级/径向视图。
- 不为减少动画用户或在 WebGL 不可用时运行 Supervisor。

### 设计

`force` 模式在现有有界 Graphology 图上创建 `graphology-layout-forceatlas2/worker` 的 `FA2LayoutSupervisor`，使用 Scope 绑定的 `forceSettings`（按节点数和稳定种子推导的重力、缩放、Barnes-Hut 和边权重影响）。Supervisor 自带 Web Worker，通过 `updateEachNodeAttributes` 将迭代结果流式写回图。客户端在 Supervisor 运行期间以约 16 fps 刷新 Sigma 场景；启动时应用确定性种子并执行一次有限镜头重置（无选中节点时）；停止时停止 Supervisor、清理刷新循环、执行 Noverlap 清理、恢复边强调并执行有限镜头重置；重新布局取消上一轮并从当前坐标启动新 Supervisor，不重新拉取设计事实。

运动期间无关边（无活跃选中）以降低的透明度和尺寸渲染（`opacity * 0.6` 并设下限、`size * 0.8`），边永不隐藏。存在选中时保持现有强调/降级语义。Supervisor 构造失败时回退到原有一次性的有界 `runForceArchitectureLayout`（ForceAtlas2 加 Noverlap）确定性坐标，上报 `WORKER_ERROR`，并保留 WebGL 不可用时的语义回退。

### 数据流

1. 精确 Scope 图存储接收有界节点与类型化边。
2. `force` 模式应用确定性 BIZ/SYS/TECH 种子。
3. `FA2LayoutSupervisor` 在其 Worker 中迭代并把 x/y 写回 Graphology。
4. 客户端刷新循环每秒约 16 次调用 `sigma.refresh()`。
5. 停止时清理循环、应用 Noverlap、重置镜头并恢复边强调。
6. 重新布局从当前坐标启动新 Supervisor。

### 错误处理与性能

Supervisor 失败回退到有界一次性精化并保持确定性坐标；刷新循环在停止、重新布局、卸载和减少动画模式下均被清理，绝不在 Supervisor 未激活时运行；卸载和每次新布局请求时都会终止 Supervisor，防止陈旧 Worker 移动被替换的图；有界图预算不变，Supervisor 只移动已加载的节点；`prefers-reduced-motion` 立即应用确定性种子且绝不创建 Supervisor。

### 验证

仓库级 `pnpm typecheck` 对五个包全部退出 0；3A 图聚焦测试 4 个文件 28 项通过（含更新后的运动可见性 reducer 断言）；`$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` 退出 0 并生成 `/architecture/3a`；完整 Web 测试套件 173 个文件 777 项通过，`derived-routes.test.ts` 的 4 项失败为 HEAD 上既有问题（WebPrincipal 接线）且与本设计无关；浏览器验收仍以精确 Scope 新标签页强制刷新为重试触发条件。

### 取代范围

仅对 `force` 布局，本设计反转 `docs/superpowers/specs/2026-08-11-3a-graph-motion-design.md` 的"不在浏览器中运行无限力模拟"非目标，以及 `docs/superpowers/specs/2026-08-11-gitnexus-aligned-3a-graph-interaction-design.md` 中的一次性精化描述。`tree`、`circles`、减少动画与语义回退行为保持不变。
