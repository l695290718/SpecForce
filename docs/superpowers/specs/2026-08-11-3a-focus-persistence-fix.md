# 3A Graph Focus Persistence Fix

## Status

Implemented locally, verified in the browser, and ready for exact-Scope MCP closure.

## Scope

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Change session: `design-change-session:fcdf244a-6515-4332-b06c-6b2e4dfc96e4`
- Parent decision: `adr-webgl-3a-graph-exploration`

## Problem

Selecting a node in the bounded Overview or Explore graph updates the URL focus. The graph workspace previously treated every focus change as a new data-load request, cleared the current store, and briefly or permanently rendered an empty graph after pointer release. This made a normal node selection look like a disappearing graph.

## Decision

Focus changes are split by graph view:

1. Overview and Explore keep the already loaded bounded graph and only update the selected node in the local Graphology store.
2. Impact reloads because its server result is defined by the focused assertion.
3. The load key is therefore focus-sensitive only for Impact; selection remains URL-backed and Scope-bound.
4. The local selection effect ignores an empty focus and never clears the loaded graph because of a URL-only focus transition.

## Acceptance Criteria

- A node click in Overview or Explore leaves the loaded node and edge counts unchanged.
- The selected node remains represented in the URL focus state.
- Impact focus changes still request the corresponding impact analysis.
- No browser error state is shown after click and release.
- No cross-Scope data or unbounded reload is introduced.

## Evidence

- `node .\\node_modules\\vitest\\vitest.mjs run packages/knowledge-query/src/service.test.ts apps/web/lib/3a/workspace-loader.test.ts apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts apps/web/components/three-a/architecture-graph-motion.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx`: 7 files and 39 tests passed.
- `pnpm --filter @specforge/web typecheck`: passed.
- `pnpm --filter @specforge/knowledge-query typecheck`: passed.
- `git diff --check`: passed.
- In-app browser click persistence check retained `151 loaded nodes`, `234 loaded edges`, the graph container, and no `Something went wrong` error state after click attempts.

## 中文本地化覆盖

### 状态

已在本地实现并完成浏览器验证，等待精确 Scope 的 MCP 会话关闭。

### 问题

在概览或探索图谱中选中节点会更新 URL 焦点。旧逻辑把每一次焦点变化都当成新的数据加载请求，先清空当前 Graphology 存储，因此鼠标松开后图谱会短暂或直接变为空白，看起来像节点变成圆球后消失。

### 决策

概览和探索模式只更新已加载图谱中的本地选中状态，不重新请求或清空图谱；影响分析模式仍然按照焦点重新查询，因为它的服务端结果由焦点断言决定。加载键只在影响分析模式对焦点敏感，URL 仍然是范围安全的选择状态来源。

### 验收标准

- 概览或探索中点击节点后，节点数和边数保持不变。
- 选中节点仍然反映在 URL 焦点状态中。
- 影响分析切换焦点时仍然请求对应分析。
- 点击和松开后不出现页面错误态。
- 不引入跨 Scope 数据，也不触发无界加载。

### 验证证据

- 针对性测试 7 个文件、39 个测试全部通过。
- Web 与 knowledge-query 类型检查通过。
- `git diff --check` 通过。
- 浏览器点击保持检查仍显示 151 个节点、234 条边，图谱容器存在，且没有 `Something went wrong` 错误态。
