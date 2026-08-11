# 3A Layered Graph Layout Fix

## Status

Approved for implementation on 2026-08-11.

Owning Scope: `com.huawei.celon.desiner`

Implementation preflight: `design-change-session:162ef116-c479-4658-ab42-d77ad92594ab`

## Problem

The 3A graph overview has valid bounded graph data, including 151 nodes and 234 edges, but the PostgreSQL fallback seeds every summary node with coordinates near the unit circle. The Sigma layout currently treats those values as final coordinates. Camera fitting therefore places the nodes on top of one another near the center, making relationships visually unreadable even though the edges are loaded.

## Goals

- Make the overview readable when graph-analysis projection data is unavailable.
- Treat tiny or normalized coordinates as seeds, not as final canvas coordinates.
- Produce a deterministic, repeatable layout grouped into BIZ, SYS, and TECH bands.
- Keep graph data, Scope filtering, relationship edges, selection, zoom, and drag behavior unchanged.
- Preserve meaningful coordinates for focused Explore and Impact views.

## Non-goals

- Do not change graph data loading, relationship persistence, or PostgreSQL authority.
- Do not fetch a larger graph or introduce a graph database dependency.
- Do not add a server-side layout contract.
- Do not replace Sigma.js or Graphology.

## Design

The layout worker receives the node layer as part of each layout request. For the Overview view it always creates a client-side deterministic layered layout, because Overview is a bounded visual summary and should not depend on provider-specific coordinate scale. BIZ, SYS, and TECH receive stable vertical bands. Nodes within each band are distributed around a deterministic ellipse, with a radius derived from the number of nodes in that band and a stable identifier-based jitter. This keeps large bands spread out without random movement between renders.

For Explore and Impact, the existing meaningful coordinates remain the initial anchor. If a future provider returns normalized coordinates there, the worker detects that the coordinates are too small and falls back to the same deterministic distribution rather than allowing a collapse. The existing bounded attraction pass still uses the deterministic positions as anchors, so edges can influence placement without pulling all nodes into one point.

The fallback catalog continues to provide the authoritative bounded nodes and relationships. This change only changes their display positions after they enter Graphology.

## Data flow

1. The exact Scope loader returns the bounded overview nodes and relationships.
2. The graph store retains the source data and layer metadata.
3. Sigma creates a layout request containing node IDs, layers, degrees, coordinates, and edges.
4. The worker computes deterministic layered positions for Overview, or preserves meaningful focused-view coordinates.
5. The worker refinement pass applies bounded edge attraction and returns positions.
6. Graphology receives only `x` and `y` updates; node and edge identity and attributes remain unchanged.

## Error handling and performance

- Missing layers use the SYS band so an incomplete record still receives a visible position.
- A node with a non-finite coordinate never reaches Sigma; deterministic fallback coordinates are always finite.
- Layout remains bounded by the existing browser node and edge budgets and worker runtime budget.
- Reduced-motion mode uses the same deterministic positions without the iterative refinement pass.

## Verification

- Layout tests prove unit-circle seeds become separated positions and that layers occupy distinct bands.
- Existing worker, Graphology, workspace, and Sigma tests continue to pass.
- Web typecheck passes.
- Browser acceptance at the exact Designer Scope confirms 151 nodes and 234 edges remain loaded, the graph source remains PostgreSQL fallback when analysis is unavailable, and node coordinates have a meaningful spread with no console errors.
- The exact design-change session is closed only after design-fact synchronization and reconciliation succeed.

## Chinese localization

### 问题

3A 图谱当前已经加载了 151 个节点和 234 条关系，但 PostgreSQL 回退数据中的节点坐标都集中在单位圆附近。Sigma 将这些坐标当作最终坐标后，镜头适配会把节点压到中心，导致关系虽然存在，却无法阅读。

### 目标

- 在图分析投影不可用时仍提供可读的总览图。
- 将过小或归一化坐标视为种子，而不是最终画布坐标。
- 按 BIZ、SYS、TECH 三层生成稳定、可重复的分层布局。
- 保持图数据、Scope 隔离、关系边、选择、缩放和拖拽行为不变。
- 保留 Explore 和 Impact 视图中有意义的已有坐标。

### 设计

布局 Worker 接收节点所属层级。Overview 是有界的视觉摘要，因此统一在客户端生成确定性分层布局，不依赖不同数据提供方的坐标尺度。BIZ、SYS、TECH 分别占据稳定的垂直区域，每层节点按照节点数量计算椭圆半径，并根据稳定 ID 加入确定性扰动，确保刷新后位置稳定。Explore 和 Impact 继续使用有意义的坐标；如果未来数据源返回归一化坐标，则检测其尺度并回退到稳定布局，避免再次堆叠。

### 约束

本变更只调整节点进入 Graphology 后的显示坐标，不修改关系持久化、Scope 权限、PostgreSQL 权威存储、数据加载预算或 Sigma/Graphology 技术选型。

### 验证

布局测试验证单位圆种子会被展开且三层位于不同区域；现有 Worker、Graphology、工作台和 Sigma 测试以及 Web 类型检查必须继续通过。精确 Designer Scope 的浏览器验收必须确认节点和边数量不变、回退数据源标签正确、节点坐标有明显分布且控制台无错误。
