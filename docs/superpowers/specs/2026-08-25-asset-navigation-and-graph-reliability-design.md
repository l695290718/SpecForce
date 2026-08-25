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
