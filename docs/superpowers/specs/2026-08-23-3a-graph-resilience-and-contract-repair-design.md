# 3A Graph Resilience and Contract Repair

**Status:** Approved for implementation

**Owning Scope:** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

**Governing records:** `adr-readable-3a-architecture-mapping`, `proposal-readable-3a-architecture-mapping`, `ctx-readable-3a-architecture-mapping`, `api-specforge-3a-architecture-query`, and `data-specforge-3a-projection-read-model`.

## Problem

The 3A map is currently available from the PostgreSQL architecture-unit projection: the Designer v6 baseline has eight units, forty-two members, and six mappings. The Network Graph view instead calls the assertion-level graph-analysis API. Its v6 `ProjectionBuildJob` is marked `READY` while its `KnowledgeProjectionNode` and `KnowledgeProjectionEdge` counts are both zero. Its derived analysis has zero clusters and metrics.

There is also a contract split: the projector publishes analysis version `3a.graph-analysis.v1` with persistence status `PUBLISHED`; the query repository requests `graph-analysis-v1` with persistence status `READY`. The query cannot discover any published analysis record and returns `GRAPH_ANALYSIS_UNAVAILABLE` as HTTP 503. A unit-level map being READY must not be interpreted as assertion-level graph analysis being READY.

## Decision

### Separate graph products

The user-facing 3A Graph is a network rendering of the published architecture-unit projection. It uses the same baseline-qualified units and mappings as the Architecture Map view:

- Nodes are BIZ, SYS, and TECH architecture units.
- Edges are published architecture-unit mappings.
- Unit members remain inspectable design-asset evidence.
- It is available whenever the exact Scope, Baseline, Manifest, Generation, architecture units, and mappings are published.

Assertion-level graph analysis is a separate enhancement product. It is used for impact ranking, bridge detection, clustering, and assertion-level traversal. Its absence must never make the base unit graph unavailable.

### Explicit source and fidelity

The graph query response carries explicit provenance:

- `source`: `ARCHITECTURE_UNIT_PROJECTION` or `GRAPH_ANALYSIS_PROJECTION`.
- `fidelity`: `UNIT` or `ASSERTION`.
- `analysisAvailability`: `READY`, `UNAVAILABLE`, `STALE`, or `EMPTY`.

The base graph query returns HTTP 200 with `ARCHITECTURE_UNIT_PROJECTION` / `UNIT` when graph analysis is not usable. Assertion-level impact requests retain a typed unavailable response and do not invent scores or paths.

### Shared graph-analysis contract

The analysis version and persistence lifecycle are shared from `@specforge/core` so the knowledge projector and query service cannot drift. The canonical version is `3a.graph-analysis.v1`; the persisted published state is `PUBLISHED`. `READY` is a query-time availability result, not a stored analysis status.

### Projection readiness

The runtime exposes distinct readiness for architecture-unit, assertion, and graph-analysis projections. A successful unit projection does not imply that the other two products are populated. A zero-node assertion projection is reported as `EMPTY`, not as a complete graph.

## Data Flow

```text
Published Baseline + exact Scope
  -> Architecture Unit Projection (units, members, mappings)
  -> base 3A graph query / graph UI

Published Assertion Projection (nodes, edges)
  -> Graph Analysis Projection (clusters, metrics, scores)
  -> optional impact and assertion-analysis UI
```

All reads are constrained by the identity tuple `{ applicationServiceId, scopePath, baselineId, projectionManifestId, generationId }`. PostgreSQL remains authoritative for both authored facts and derived read models. No fallback crosses Scope, Baseline, or Manifest boundaries.

## Error Handling

- Missing or mismatched unit projection: return the existing typed projection error; do not render a graph.
- Available unit projection with unavailable, stale, or empty graph analysis: return base graph HTTP 200 and show its source and fidelity.
- Assertion-level impact request without ready graph analysis: return `GRAPH_ANALYSIS_UNAVAILABLE` with a user-facing availability state.
- Contract version or status mismatch: fail focused validation and block a release rather than silently treating the analysis as empty.

## Migration and Rollout

1. Add the shared core contract and align projector/query read-write logic.
2. Add a bounded unit-graph response path and make the graph workspace use it for the normal Graph entry point.
3. Keep assertion-level analysis requests isolated behind their own availability state.
4. Re-materialize the exact Designer v6 derived projections and verify identities, counts, graph source, and HTTP behavior.
5. Update the governing ADR, Proposal, Context Pack, API record, evidence, and typed links through MCP after focused verification.

No cross-scope fallback, graph database authority change, browser-side authoring, or synthetic impact scoring is part of this increment.

## Acceptance Criteria

- Clicking the normal 3A Graph returns HTTP 200 and renders eight units with six mappings for the current Designer v6 projection.
- The graph response identifies the source as `ARCHITECTURE_UNIT_PROJECTION` and fidelity as `UNIT`.
- Exact Scope/Baseline/Manifest/Generation identity is preserved end to end.
- The impact view remains explicitly unavailable when assertion-level analysis is not ready; it never claims fallback scores.
- Projector and query code consume the same canonical analysis version and persisted status contract.
- Tests cover contract alignment, zero assertion readiness, base-graph fallback, unavailable impact, and scope isolation.

## 中文说明

### 问题

当前 Designer v6 的架构地图能够从 PostgreSQL 架构单元投影中读取 8 个单元、42 个成员和 6 条映射；但网络图读取断言级图分析投影。该投影的构建任务被标记为 `READY`，实际节点和边都为 0，同时构建端写入 `3a.graph-analysis.v1 / PUBLISHED`，查询端却读取 `graph-analysis-v1 / READY`，因此必然返回 503。

### 决策

面向用户的 3A 图谱以架构单元投影为基础：节点是 BIZ、SYS、TECH 单元，边是架构映射，成员是设计资产证据。断言级图分析独立用于影响评分、桥接点、聚类和断言级追踪；其不可用不能阻止基础图谱。

图查询必须显式返回来源和保真度：`ARCHITECTURE_UNIT_PROJECTION / UNIT` 或 `GRAPH_ANALYSIS_PROJECTION / ASSERTION`。基础图在分析投影不可用时返回 200；影响分析保持明确不可用，不伪造评分或路径。

### 约束与验收

版本和持久化状态从 `@specforge/core` 共享，规范版本为 `3a.graph-analysis.v1`，持久化发布状态为 `PUBLISHED`，`READY` 仅代表查询时可用性。所有读取必须绑定精确 Scope、Baseline、Manifest 和 Generation。点击正常 3A 图谱必须渲染 8 个单元和 6 条映射；影响分析无可用断言图时必须明确显示不可用。
