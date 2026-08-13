# 3A Graph Motion Design

## Status

Approved for implementation on 2026-08-11.

> Superseded note (2026-08-13): the non-goal "Do not run an unbounded force simulation in the browser" is reversed for the `force` layout only by `docs/superpowers/specs/2026-08-13-continuous-forceatlas2-supervisor-design.md` (continuous `FA2LayoutSupervisor` motion). `tree`, `circles`, reduced-motion, camera, pulse, and hover/selection behaviors described here remain in effect.

Owning Scope: `com.huawei.celon.desiner`

Implementation preflight: `design-change-session:dd17470e-6417-40e1-93fe-e3c41f841a0d`

## Problem

The 3A graph is now spatially separated, but layout results still arrive as a position jump. GitNexus-style graph exploration feels responsive because layout convergence, camera movement, and node/edge highlighting are animated rather than applied as a single static update.

## Goals

- Animate bounded layout changes instead of teleporting nodes.
- Smoothly fit the camera after a graph view or layout change.
- Make hover and selection legible with a node halo, label, connected-edge emphasis, and unrelated-node dimming.
- Keep animation deterministic, Scope-safe, and compatible with the current Sigma/Graphology renderer.
- Respect `prefers-reduced-motion` and avoid an always-running full-graph animation loop.

## Non-goals

- Do not copy GitNexus source code or introduce its ForceAtlas2 dependency.
- Do not run an unbounded force simulation in the browser.
- Do not change graph loading, relationships, persistence, authorization, or Scope isolation.
- Do not animate every node indefinitely; motion is limited to layout transitions and active interaction state.

## Design

The layout worker continues to compute bounded target positions. Sigma receives those targets through a client-side `requestAnimationFrame` transition. Each node starts at its current Graphology position and eases to the target using an ease-out curve over 900ms. New layout requests cancel the previous transition and start from the current position, preventing a snap-back when data or view state changes.

During a transition, Sigma refreshes the WebGL scene and temporarily hides edges while nodes are moving; edges return when the transition settles. This keeps motion readable and avoids a dense moving wire bundle. The camera then uses a 600ms animated reset to fit the settled graph. Focused node navigation continues to use the existing finite camera animation.

The node reducer uses the existing semantic state and selected/hovered refs. Selected nodes receive a larger size and highest z-index, hovered nodes receive a visible label and halo, connected edges become brighter and thicker, and unrelated nodes/edges are dimmed only when a selection exists. No selection keeps the full graph visible without labels covering the topology. All animation loops are cancelled on unmount, layout replacement, and reduced-motion mode.

## Data flow

1. The exact Scope graph store receives bounded nodes and typed edges.
2. The layout worker returns deterministic BIZ/SYS/TECH target positions.
3. Sigma snapshots current positions and schedules one bounded `requestAnimationFrame` transition.
4. Graphology receives interpolated coordinates and Sigma refreshes the canvas.
5. After settling, the camera performs a finite animated reset and edges are restored.
6. Hover/selection reducers update visual emphasis without changing stored graph facts.

## Error handling and performance

- A missing or non-finite position falls back to the existing deterministic target.
- A new layout cancels the previous frame and never leaves a partial animation loop running.
- Reduced-motion mode applies final coordinates immediately and skips camera animation.
- The transition is capped at 900ms and uses the existing bounded graph budgets.
- WebGL fallback remains the existing accessible semantic list; it does not require animation support.

## Verification

- Unit tests prove interpolation starts at the current position, ends at the target, clamps progress, and respects reduced motion.
- Sigma tests prove layout transitions request animation frames, cancel stale frames, and camera reset is finite.
- Existing graph layout, workspace, store, and query tests continue to pass.
- Browser acceptance confirms visible node movement after reload, the final three-band graph remains readable, selection changes visual emphasis, reduced-motion does not schedule animation, and no console errors occur.
- The exact Scope design session is closed only after MCP synchronization and reconciliation.

## Chinese localization

### 问题

3A 图谱虽然已经分层，但布局结果仍然是一次性跳到最终位置。GitNexus 的体验更顺滑，是因为布局收敛、镜头移动和节点/边高亮都使用了动画过渡。

### 目标

- 布局变化不再瞬移，而是平滑移动。
- 图谱切换或布局完成后，镜头平滑适配。
- 悬停和选中时显示节点光环、标签、关联边增强和非关联元素淡出。
- 保持确定性、Scope 隔离和当前 Sigma/Graphology 技术边界。
- 遵守 reduced-motion，不运行无限的全图动画。

### 设计

布局 Worker 继续计算有界目标坐标，Sigma 在客户端通过 `requestAnimationFrame` 做 900ms 的缓动插值。节点从当前 Graphology 坐标移动到目标坐标；新的布局请求会取消旧动画并从当前坐标继续，避免回弹。动画期间暂时隐藏边，布局稳定后恢复边并使用 600ms 镜头适配，避免移动中的线束遮挡图谱。

节点 reducer 复用已有语义状态、选中和悬停状态：选中节点放大并置顶，悬停节点显示标签和光环，关联边变亮变粗，有选中状态时其他节点和边淡出；没有选中时保持完整拓扑但不铺满长标签。组件卸载、布局替换和 reduced-motion 都会取消动画帧。

### 约束与验证

本变更不复制 GitNexus 源码，不引入 ForceAtlas2，不改变数据加载、关系持久化、授权或 Scope 隔离。测试必须验证插值起点、终点、进度边界、动画取消和 reduced-motion；浏览器必须确认节点有可见移动、三层图谱仍可读、选中有视觉增强且控制台无错误。
