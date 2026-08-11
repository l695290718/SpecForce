# 3A Graph Edge Loading and PostgreSQL Fallback Design

## Status

Approved for implementation on 2026-08-11.

Owning Scope: `com.huawei.celon.desiner`

Implementation preflight: `design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3`

## Problem

The 3A Graph Overview currently loads the first 20 facts from each architecture layer but does not load their relationships. When the derived graph-analysis projection is unavailable, the client falls back to that node catalog with an empty edge list. The result is a graph that reports `60 loaded nodes` and `0 loaded edges`, while the page still presents the projection as ready.

## Goals

- Load a bounded initial fact catalog for the three architecture layers.
- Load a bounded, exact-Scope relationship page for the same published projection.
- Use that PostgreSQL relationship page as the graph Overview fallback when derived graph analysis is unavailable or empty.
- Keep node and edge budgets bounded at 250 nodes and 500 edges for the initial graph.
- Preserve the existing focused Explore and Impact request paths.
- Tell the user whether the rendered Overview is using the derived projection or the PostgreSQL fallback.

## Non-goals

- Do not load the complete enterprise graph into the browser.
- Do not make PostgreSQL and a graph database co-authoritative.
- Do not change cross-application-service authorization or expose cross-Scope edges.
- Do not change the dedicated Alignment page's existing full relationship contract.

## Design

The server-side workspace loader fetches up to 84 nodes per layer in parallel, yielding a maximum of 252 candidates before the final 250-node graph budget is applied. It also requests up to 500 typed relationships through the existing alignment query service. The query service and Prisma repository accept an optional bounded edge limit; calls without a limit retain the dedicated Alignment page behavior.

The loader returns the bounded relationship page separately as `initialGraphEdges`. `ThreeAWorkspace` passes those edges to the graph workspace. The graph workspace seeds the fallback graph with the bounded catalog and relationships before attempting the derived graph query. If the derived query fails or returns an empty result, the fallback remains active. If a non-empty derived result is returned, it replaces the fallback. If the derived response contains nodes but no edges while the PostgreSQL fallback has relationships, the fallback is selected so the Overview cannot silently become a disconnected graph.

The graph toolbar reports the active source: `Projection` for the derived graph-analysis result or `PostgreSQL fallback` for the bounded authoritative read. The fallback label is bilingual and does not imply that PostgreSQL has become a graph projection or a second authoring store.

## Data flow

1. Resolve the exact application-service Scope, Baseline, and Projection.
2. Fetch bounded BIZ/SYS/TECH nodes and up to 500 relationships from PostgreSQL.
3. Seed the graph store with the bounded PostgreSQL view.
4. Attempt the derived Overview query with the existing graph-analysis provider.
5. Keep the derived result only when it contains a usable node-and-edge view; otherwise keep the PostgreSQL view and mark the source as fallback.
6. Continue using bounded focused traversal for Explore and Impact.

## Error handling

- A missing or unavailable graph-analysis row is a degraded data-source state, not a page error.
- Scope, Baseline, Projection, authorization, and query-budget errors remain hard failures.
- The fallback never queries another application service and filters edges to the loaded node set.
- The UI must not claim `Projection ready` as the graph data source when the fallback is active.

## Verification

- Unit tests prove graph-mode initial loading requests three bounded node pages and one bounded relationship page.
- Service/repository tests prove the optional edge limit is forwarded to Prisma and does not alter unlimited Alignment calls.
- Web typecheck and focused 3A tests pass.
- Browser acceptance proves the Overview renders non-zero edges when the authoritative projection has relationships and visibly identifies fallback mode when graph analysis is unavailable.
- The same design-change session is closed with exact command/result evidence and synchronized through MCP.

## Chinese localization

本设计以英文为规范字段；所有新增用户可见的数据源状态、说明和降级提示必须提供完整中文覆盖。PostgreSQL 仍然是已编写事实和关系事件的权威存储，图分析仍然是可重建的派生投影。
