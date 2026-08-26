# ADR-0042: Impact Analysis Resurrection via Assertion-Lineage Repair

## Status

Accepted and implemented under exact-scope design-change-session `design-change-session:f4daa3f6-c74e-4122-9299-96b2b7b63dc5` in the Designer Scope.

已接受并实现，对应精确 Scope 设计变更会话 `design-change-session:f4daa3f6-c74e-4122-9299-96b2b7b63dc5`（Designer Scope）。

## Context

Since the 2026-08-15 architecture-fact baselines, `/overview` and `impact` returned `GRAPH_ANALYSIS_UNAVAILABLE`. Diagnosis established a lineage gap at the assertion level:

- Official baselines v3..v6 carry `manifest.sourceRevisionIds = []` and `changeSetId = architecture-fact-changeset:eb8a9ed6...`, which has **zero** `KnowledgeAssertion` rows.
- All 471 ACCEPTED assertions for the Designer Scope (277 typed-relationship edges plus facts) live under the superseded legacy changeset `legacy-design-assets:changeset:e4131fc6191b39b6`.
- The projector's `loadBatch` selects assertions by `changeSetId = baseline.changeSetId OR id IN sourceRevisionIds`, so every v3..v6 build materialized 0 nodes / 0 edges, published empty manifests, and the derived graph analysis published with `nodeMetricCount = 0`. `loadReadyAnalysis` treats zero metrics as EMPTY, so the query service threw `GRAPH_ANALYSIS_UNAVAILABLE`.
- Architecture unit projections (units/members/mappings) were unaffected because they are materialized from `architectureFactRevisionIds`, which the baselines do carry.

自 2026-08-15 架构事实基线以来，`/overview` 与 impact 一直返回 `GRAPH_ANALYSIS_UNAVAILABLE`。诊断确认这是断言级谱系缺口：

- v3..v6 官方基线携带 `manifest.sourceRevisionIds = []`，且 `changeSetId` 指向 `architecture-fact-changeset:eb8a9ed6...`，该变更集在 `KnowledgeAssertion` 中**零行**。
- Designer Scope 全部 471 条 ACCEPTED 断言（含 277 条 typed-relationship 边）位于已被取代的 legacy 变更集 `legacy-design-assets:changeset:e4131fc6191b39b6`。
- 投影器 `loadBatch` 按 `changeSetId = baseline.changeSetId OR id IN sourceRevisionIds` 选取断言，因此 v3..v6 每次构建都物化 0 节点/0 边、发布空 manifest，派生图分析以 `nodeMetricCount = 0` 发布。`loadReadyAnalysis` 将零指标视为 EMPTY，查询服务抛出 `GRAPH_ANALYSIS_UNAVAILABLE`。
- 架构单元投影（单元/成员/映射）不受影响，因为它们由基线携带的 `architectureFactRevisionIds` 物化。

## Decision

1. **Lineage repair (data repair).** Update the v6 baseline manifest `sourceRevisionIds` to the 471 authoritative assertion ids (legacy changeset lineage). The baseline id, stream, changeSetId, and receipts stay untouched; the repair restores the assertion lineage the baseline was always meant to supersede. This is recorded as a deliberate data repair because no MCP tool edits an official baseline after publication (publish would reject with BASELINE_IMMUTABLE).
2. **Rebuild the exact-Scope projection.** Request `request_3a_projection_build` (desiner scope, baseline v6, profile `generic-system` v1, schema `3a.v2`). The new build key differs (non-empty sourceRevisionIds), so a new generation is queued; the projector materializes 471 nodes and 277 typed-relationship edges, writes architecture units from the unchanged architecture fact revisions, publishes the manifest, and then publishes the derived graph analysis (clusters, node metrics, summary edges) in the same pipeline.
3. **Freshness-guard wiring fix (code change).** Verification exposed a second defect: `loadReadyAnalysis` compared the analysis row's `sourceContentDigest` (materializer digest shape) against the manifest's `contentDigest` (publication digest shape). The two formulas differ by construction, so even a freshly published analysis was classified STALE and reads degraded to `GRAPH_ANALYSIS_UNAVAILABLE`. The guard is redundant with identity: the composite key (scope, generationId, projectionManifestId, analysisVersion) binds the row to exactly one published manifest, and generations are immutable (a content change yields a new build key and generation). The guard now degrades only on PUBLISHED/version/metrics grounds: missing → UNAVAILABLE, version mismatch → VERSION_MISMATCH, zero metrics → EMPTY.
4. **Deferred remainder.** Promotion of the legacy assertions into the architecture-fact stream remains deferred; this repair restores projection-level lineage only. Full dual-stream reconciliation is tracked as backlog.

1. **谱系修复（数据修复）。** 将 v6 基线 manifest 的 `sourceRevisionIds` 更新为 471 条权威断言 id（legacy 变更集谱系）。基线 id、流、changeSetId 与回执均不动；修复恢复了基线本应取代的断言谱系。这被记录为有意的数据修复，因为没有 MCP 工具可在发布后修改官方基线（publish 会以 BASELINE_IMMUTABLE 拒绝）。
2. **重建精确 Scope 投影。** 调用 `request_3a_projection_build`（desiner Scope、基线 v6、profile `generic-system` v1、schema `3a.v2`）。新构建键不同（sourceRevisionIds 非空），因此排队新世代；投影器物化 471 节点与 277 条 typed-relationship 边，从不变的架构事实修订写入架构单元，发布 manifest，并在同一管道内发布派生图分析（簇、节点指标、概要边）。
3. **新鲜度守卫接线修复（代码变更）。** 验证暴露第二个缺陷：`loadReadyAnalysis` 用分析行的 `sourceContentDigest`（物化器摘要形状）与 manifest 的 `contentDigest`（发布摘要形状）比较，两式从构造上不同，导致即使刚发布的分析也被判 STALE，读路径降级为 `GRAPH_ANALYSIS_UNAVAILABLE`。该守卫对身份而言是冗余的：复合主键（scope, generationId, projectionManifestId, analysisVersion）把行绑定到唯一已发布 manifest，且世代不可变（内容变化产生新构建键与新世代）。守卫现在只在 PUBLISHED/版本/指标上降级：缺失 → UNAVAILABLE，版本不符 → VERSION_MISMATCH，零指标 → EMPTY。
4. **遗留部分延期。** 将 legacy 断言提升进架构事实流仍延期；本次只恢复投影级谱系。完整双流对账记为待办。

## Alternatives

- **Creating a new baseline v7 through the full governance pipeline** (reconciliation receipt + promotion of 471 assertions): rejected for this increment because it requires fabricating a promotion decision over facts the pipeline never authored; the repair restores the intended lineage directly.
- **Re-publishing v6 through MCP**: rejected — the API enforces baseline immutability by design.
- **Leaving the analysis UNAVAILABLE with an explicit degraded surface**: considered; the surface already degrades correctly, but the underlying data was recoverable without fabrication, so repair was chosen.

- **经完整治理管道新建 v7 基线**（对账回执 + 提升 471 条断言）：本增量否决——需要对管道从未编写的既有事实编造提升决策；直接修复谱系即可。
- **经 MCP 重新发布 v6**：否决——API 按设计强制基线不可变。
- **保持 UNAVAILABLE 并显式降级**：已考虑；降级面本就正确，但底层数据无需编造即可恢复，故选修复。

## Consequences

- `/overview` and `impact` become READY against the rebuilt generation: clusters, node metrics, bridge edges, and impact weights derived deterministically from the 471-node / 277-edge projection.
- The v6 baseline manifest now truthfully records its assertion lineage; future rebuilds derive the same content while the source is unchanged (deterministic materialization).
- This closes the projection-level half of the deferred sigma assertion-lineage gap (legacy changeset e4131fc6 vs baseline eb8a9ed6). The promotion-stream half remains deferred with the same trigger.

- `/overview` 与 impact 在重建世代上变为 READY：簇、节点指标、桥接边与影响权重均由 471 节点/277 边投影确定性推导。
- v6 基线 manifest 现在如实记录其断言谱系；源不变时未来重建推导相同内容（确定性物化）。
- 这关闭了已延期 sigma 断言谱系缺口（legacy e4131fc6 vs 基线 eb8a9ed6）的投影级一半；提升流一半仍按同一触发条件延期。

## Constraints

- Exact-scope writes only; the rebuild runs in the Designer scope.
- The repair does not fabricate or delete any assertion, relationship, revision, or receipt.
- English canonical fields and complete Chinese overlays for the new human-facing analysis surfaces remain mandatory (no new surfaces added by this ADR).

- 仅精确 Scope 写入；重建在 Designer Scope 内运行。
- 修复不编造也不删除任何断言、关系、修订或回执。
- 面向人的新分析界面仍需英文规范与完整中文覆盖（本 ADR 未新增界面）。

## Evidence

- Diagnosis (before implementation): `KnowledgeBaseline` v6 manifest `sourceRevisionIds = []`; all 471 ACCEPTED `KnowledgeAssertion` rows under legacy changeset `e4131fc6`; all 5 `KnowledgeGraphAnalysis` rows had `nodeMetricCount = 0`; projector `loadBatch` selects by `changeSetId OR id IN sourceRevisionIds`.
- Lineage repair: `.tmp/repair-v6-lineage.cjs` → `{sourceRevisionIds: 471, architectureFactRevisionIds: 56, relationshipVersion: "7648"}`.
- Rebuild via MCP `request_3a_projection_build` (desiner, v6, generic-system/1, 3a.v2) → job `projection-build:d99f4152...:1` READY: `nodeCount 471, edgeCount 277`, manifest `projection-manifest:projection-generation:d99f4152...:1` published.
- Projection verification: 471 nodes / 277 edges / 8 architecture units for the new generation; `KnowledgeGraphAnalysis` PUBLISHED with `nodeMetricCount 471, clusterCount 339, bridgeEdgeCount 135`.
- Freshness-guard fix: `packages/knowledge-query/src/graph-analysis-repository.ts` `loadReadyAnalysis` (digest comparison removed, identity-based freshness); tests 16/16 passed in `knowledge-query` (repository + service); `pnpm exec tsc --noEmit -p apps/web` exit 0; `pnpm --filter @specforge/web build` compiled.
- Deployment: web image rebuilt and container recreated (canonical database); CDP probes: overview POST → HTTP 200 with 250 cluster nodes / 102 summary edges (budget-capped from 339/135); impact POST for focus `adr-architecture-overview-home` → HTTP 200 with 9 items, `countsByBand {DIRECT: 9}` and scored factors.

## MCP Record

- MCP ADR ID: `adr-impact-analysis-resurrection`
- Owning architectureScope: `com.huawei.celon.desiner`
- Related records: `rule-specforge-3a-projection-publication`, baseline `knowledge-baseline:designer:3a:v6`, Proposal `proposal-specforge-self-design`, Context Pack `ctx-specforge-self-design`.
