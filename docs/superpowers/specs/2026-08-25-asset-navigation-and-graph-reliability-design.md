# Asset Navigation and Relationship Graph Reliability

**Status:** Approved for implementation planning
**Scope:** `com.huawei.celon.desiner`
**Owner:** SpecForge Web

## Problem

The scoped Web console exposes links for the Workbench, Event Contracts, Business Rules, Quality Requirements, ADRs, Proposals, Context Packs, and Relationship Graph. Several reported clicks appear to do nothing, and opening the Relationship Graph currently returns HTTP 500.

The graph failure is reproducible in the live Docker Web service. A historical ADR payload in the owning Scope does not contain `relatedAssets`; the core graph builder calls `forEach` on that field without normalizing legacy payloads. The same compatibility risk exists for other optional reference arrays.

## Goals

1. Every primary navigation and asset detail entry preserves the selected application-service `scope` and resolves to a concrete route.
2. Legacy authored assets with omitted optional relationship arrays remain readable and produce a valid bounded graph.
3. Relationship graph nodes continue to open the correct scoped detail route for supported asset types.
4. Add focused tests that cover route construction, legacy graph payloads, graph API availability, and the affected navigation surface.

## Non-goals

- No direct database repair or data migration. The authored asset payload remains unchanged and PostgreSQL remains authoritative.
- No cross-Scope aggregation or permission broadening.
- No graph-store replacement or new graph rendering capability in this increment.

## Design

### Scoped route contract

Use one shared helper for all internal links that carry the current application-service Scope. It must append or replace only the `scope` query parameter without dropping existing view/filter parameters. Navigation, list rows, dashboard quick links, proposals, Context Packs, and graph node detail links use the helper.

The active navigation item may prevent a same-URL click only to restore scroll position; it must not suppress navigation when the URL differs by Scope or other query state.

### Legacy asset normalization

Normalize optional reference collections at the graph boundary. Missing, null, or invalid legacy arrays are treated as empty arrays for graph derivation. Valid references remain typed and scope-safe; unresolved references are skipped by the existing target resolver. This is a read compatibility layer, not an authored-data rewrite.

### Graph failure behavior

The graph page and `/api/graph` must return a usable empty/partial graph or a localized error state for malformed individual assets, while unexpected database or authorization failures remain visible and logged. A single malformed legacy asset must not take down the whole scoped graph.

## Verification

- Unit test graph building with an ADR missing `relatedAssets`, a rule missing `relatedAssets`, and a Proposal missing `impactedAssets`.
- Unit test the shared scoped route helper with existing query parameters and encoded Scope values.
- Run the affected Web/core tests and type checks.
- Start the supported Docker topology and verify HTTP 200 for the affected list pages, detail routes, `/graph`, and `/api/graph?scope=com.huawei.celon.desiner`.
- Verify the graph response contains nodes/edges or a bounded empty result and that no new Web container errors are emitted.

## Design facts

- PostgreSQL is the authoritative store for authored assets and relationship events.
- Graph views are derived read projections and must be rebuildable.
- Scope isolation is fail-closed; this repair does not expose data from any other application service.
- The canonical design records for this increment are `adr-webgl-3a-graph-exploration`, `adr-3a-architecture-navigation-workspace`, `api-specforge-graph-query`, and `data-specforge-asset-graph`, with the matching Proposal and Context Pack relationships updated through MCP.

## 中文摘要

本增量修复设计资产入口的 Scope 路由一致性，并在图谱读取边界兼容历史资产缺失关系数组的情况。不会直接修改数据库，不扩大权限，不引入新的图数据库能力。PostgreSQL 继续作为权威存储，图谱仍是可重建的派生视图。所有入口必须保留当前应用服务 Scope；单个历史资产格式不完整时，图谱应继续返回有界结果，而不是让整个页面 500。

## Implementation Evidence (2026-08-25)

- Exact preflight completed in owning Scope `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`; session `design-change-session:124680b6-c9b7-4a8a-ac13-ce305d806e3a` returned design digest `2591e2b91fd1e308d65e9ed4c409fcb11410285b0ae6b67807ac9a378d14d874` and relationship digest `53645bb4575eba8819b24dacdb3d04da5d66ce3fffbacf5d16e39486f338e957`.
- Implementation commits: `ca8de12` normalizes missing or malformed legacy graph reference arrays; `5857f37` preserves and replaces the selected Scope in internal asset links; `1ee999f` removes the duplicate graph type import.
- `pnpm exec vitest run packages/core/src/__tests__/core.test.ts apps/web/lib/__tests__/scope-links.test.ts apps/web/lib/__tests__/derived-routes.test.ts` passed: 35 files and 198 tests.
- `pnpm --filter @specforge/core typecheck` and `pnpm --filter @specforge/web typecheck` both exited 0; `git diff --check` exited 0.
- Docker verification passed with Web at `http://localhost:3010`; Web, Knowledge Projector, Connector Worker, and deployment PostgreSQL were healthy. The scoped Workbench, Event Contracts, Business Rules, Quality Requirements, ADRs, Proposals, Context Packs, Relationship Graph, and sampled detail routes returned HTTP 200.
- `GET /api/graph?scope=com.huawei.celon.desiner` returned HTTP 200 with 331 nodes and 742 edges. Web logs contained no new graph `TypeError` or HTTP 500 after rebuild.
- The same session was closed through `pnpm design-context:close` with status `CONVERGED`; MCP readback verified exact Scope ownership, affected facts, and evidence references. A temporary PostgreSQL tunnel used for the close was removed afterward.

### 实施证据（2026-08-25）

- 已在精确 Designer Scope 完成预检并关闭同一会话 `design-change-session:124680b6-c9b7-4a8a-ac13-ce305d806e3a`，设计摘要和关系摘要已记录。
- 图谱兼容性、Scope 链接和重复类型导入修复分别提交为 `ca8de12`、`5857f37`、`1ee999f`。
- 定向回归通过 35 个测试文件、198 项测试； Core/Web 类型检查和差异检查均返回 0。
- 3010 Docker 服务验证通过，受影响页面和抽样详情入口均返回 200；图谱 API 返回 331 个节点、742 条边，未再出现图谱 500。
- MCP 会话以 `CONVERGED` 关闭，临时数据库转发容器已清理。PostgreSQL 仍是权威存储，图谱仍是派生读取投影。

### Navigation loading feedback increment (2026-08-25)

- Direct HTTP checks showed the affected pages were healthy and fast (`200`, approximately 64–261ms), while the first browser-side navigation took approximately 3311ms and exposed no pending UI. The issue was missing route-transition feedback, not a failed asset endpoint.
- Added the App Router global `apps/web/app/loading.tsx` fallback with an accessible status region, spinner, skeleton content, and bilingual `nav.loading` copy. This covers Workbench, asset lists, ADRs, Proposals, Context Packs, Graph, and their detail routes without changing API or authorization behavior.
- `pnpm --filter @specforge/web typecheck`, `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build`, and `pnpm exec vitest run apps/web/lib/__tests__/scope-links.test.ts` passed. Docker was rebuilt with `powershell -ExecutionPolicy Bypass -File .\deploy\scripts\start.ps1`; `/healthz` and all affected routes returned HTTP 200.
- Browser verification after rebuild clicked `Event Contracts`, reached `/assets/events?scope=com.huawei.celon.desiner` in 472ms, and found no new browser or Web-container errors.
- Exact-scope session `design-change-session:0731c44d-0e48-4769-8815-67161acab752` was closed as `CONVERGED` after the checks above and MCP readback.

### 导航加载反馈增量（2026-08-25）

- 接口本身没有异常：受影响页面直接请求均为 `200`，约 64–261ms；首轮浏览器端导航约 3311ms，期间没有 pending 反馈，因此用户会感觉点击无响应。
- 新增 App Router 全局 `apps/web/app/loading.tsx`，提供可访问状态区、旋转加载图标、骨架屏和双语文案 `nav.loading`，覆盖工作台、设计资产、ADR、提案、上下文包、关系图谱及详情路由。
- Web 类型检查、生产构建、Scope 链接回归测试和 3010 Docker 重建均通过；重建后点击事件契约可到达目标 URL，约 472ms，未发现新的浏览器或 Web 容器错误。
- 精确 Scope 会话 `design-change-session:0731c44d-0e48-4769-8815-67161acab752` 已通过 MCP 回读并以 `CONVERGED` 关闭。
