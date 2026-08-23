# ADR-0025: Readable 3A Architecture Mapping

## Status

**Implemented for the governed first slice and controlled Designer membership-coverage expansions. Read-only Map/Network, MCP-only architecture-fact authoring, review/promotion/reconciliation/Baseline governance, Designer onboarding, and deterministic projection read-back are implemented and verified. Enterprise-wide classification and continuous source synchronization remain deferred.**

- Stable ID: `adr-readable-3a-architecture-mapping`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`
- Written Spec: `docs/superpowers/specs/2026-08-11-readable-3a-architecture-mapping-design.md`
- Authoring Design Session: `design-change-session:efd5df8b-492f-4e8c-949f-94f66b541cc7`
- Authoring Spec: `docs/superpowers/specs/2026-08-15-governed-3a-architecture-fact-authoring-design.md`
- Authoring Plans: `docs/superpowers/plans/2026-08-15-governed-3a-architecture-fact-authoring.md` and `docs/superpowers/plans/2026-08-15-designer-3a-fact-onboarding.md`
- Implementation Session: `design-change-session:fa68fdd5-8d04-4e64-a111-8e4c71f69a54`
- Onboarding Evidence: `docs/evidence/designer-3a-onboarding-evidence.md` and `docs/evidence/designer-3a-candidate-review.md`
- Coverage Evidence: `docs/evidence/designer-3a-coverage-expansion-evidence.md`
- Planned v5 Membership Spec: `docs/superpowers/specs/2026-08-15-designer-3a-v5-membership-expansion-design.md`
- Parent decisions: `adr-3a-architecture-navigation-workspace`, `adr-scalable-3a-exploration`, `adr-webgl-3a-graph-exploration`
- Graph Resilience Session: `design-change-session:0ca85bc2-9683-40a2-918c-ab88130e72b0`

## Context

The existing 3A Overview is a bounded relationship network rather than a readable architecture map. In the observed Designer Scope, 151 nodes and 234 edges occupy a 454-by-576-pixel canvas. Suppressing labels protects rendering density but prevents a reader from identifying the business capability, system realization, and supporting technology chain.

Architecture comprehension and detailed network exploration are different jobs. The former needs a stable semantic structure and a small number of explained mappings; the latter benefits from the existing GitNexus-aligned WebGL network, arbitrary typed links, and bounded impact exploration. Treating one force-directed graph as both surfaces makes the default 3A experience difficult to read.

## Decision

Make a semantic Architecture Map the default 3A graph representation and retain the existing WebGL Network as an advanced representation.

The Map uses explicit authored architecture units as primary nodes. Generic kinds are business capability, process, and business object for BIZ; application, service, component, and data domain for SYS; and platform, runtime, infrastructure, and technology service for TECH. APIs, events, rules, data models, and other design facts are members of units rather than top-level Map nodes.

The overview shows only cross-layer mappings and must expose a readable BIZ-to-SYS-to-TECH chain without hover or zoom. Selecting a unit replaces the overview with a bounded local neighborhood, explanatory inspector, and breadcrumb back. Same-layer dependencies appear only in this drill-down. The Network representation continues to support detailed topology, impact, and arbitrary fact relationships.

Architecture-unit membership and mappings must come from explicit authored facts. The UI and projection pipeline may not invent canonical units through naming heuristics, community detection, or layout. Unclassified facts and incomplete mappings remain visible as quality signals.

PostgreSQL remains authoritative for authored facts and relationship events. Immutable derived `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, and `ArchitectureUnitMappingProjection` records sit behind the existing provider boundary. Additive `architectureMap` and `architectureUnitNeighborhood` query operations preserve the existing bounded network contracts.

## Governed Authoring Addendum

Architecture units, memberships, and cross-layer mappings will be represented as first-class immutable canonical revisions rather than generic scan-derived `KnowledgeAssertion` rows or direct projection writes. A bounded `ArchitectureFactBatch` is submitted only through MCP with exact Scope, an open design-change session, provider-neutral provenance, evidence, bilingual content, and a server-calculated idempotency digest.

The shared governance envelope is extended additively: Review Bundles, promotion decisions, promotion receipts, ChangeSets, reconciliation, and Baseline manifests reference exact architecture revision IDs. Authored architecture facts use a dedicated promotion service because their provenance is not a scan session, but they still require the same authorized review, active Working Stream, immutable ChangeSet, converged reconciliation, and published Baseline. Existing scan-based promotion remains compatible.

The projector reads accepted architecture revision IDs from the published Baseline and creates generation-bound `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, and `ArchitectureUnitMappingProjection` rows. A legacy Baseline with no architecture revisions retains the explicit empty state. A Baseline that declares missing, non-accepted, cross-Scope, or unresolved architecture revisions fails projection publication rather than silently producing an empty Map.

The first Designer Scope data increment is a separate governed operation after the generic capability is implemented. It reads live scoped assets and typed relationships, builds an evidence matrix, submits only evidence-backed candidates through MCP, and publishes at least one real BIZ-to-SYS-to-TECH chain. Ambiguous classifications remain blocked or rejected and become explicit coverage backlog facts; implementation may not predefine or infer business names from repository labels or graph topology.

## Alternatives

1. **Keep the existing Network as the default and improve styling.** Rejected because renderer polish does not create semantic architecture units or make 151 fact nodes readable as an enterprise architecture chain.
2. **Group by design-asset type.** Rejected because API, event, rule, and data-model categories describe artifact form, not business, system, or technology architecture.
3. **Use algorithmic communities as architecture units.** Rejected because the result is unstable, difficult to govern, and can assert architecture semantics that were never authored.
4. **Remove the Network representation.** Rejected because detailed relationship exploration and impact analysis remain valid advanced workflows.
5. **Show same-layer and cross-layer links together.** Rejected for the overview because dense internal dependencies obscure the primary 3A realization chain.

## Consequences

- The default 3A experience becomes task-specific and readable, while advanced graph exploration remains available.
- Existing assets require explicit architecture-unit membership to appear as classified Map content.
- Projection publication and query contracts gain additive semantic-unit records and bounded operations.
- The UI needs representation switching, transition filtering, unit drill-down, breadcrumbs, inspectors, and explicit partial-result states.
- Architecture quality becomes measurable through unclassified facts, missing mappings, evidence, and mapping-completeness indicators.
- The first governed Designer slice is published as `knowledge-baseline:designer:3a:v1`; projections remain rebuildable and later revisions must repeat the MCP review, promotion, reconciliation, and Baseline gates.

## Constraints

- Every Map and neighborhood request is bound to subject, tenant, exact `applicationServiceId`, full `scopePath`, Baseline, Projection, authorization policy, and expiry.
- The default overview returns at most 12 units per layer and 60 cross-layer mappings; totals, continuation, and partial-result status must be explicit.
- Desktop uses stable BIZ, SYS, and TECH columns. Mobile uses a top-down flow and presents one transition at a time.
- Map mode has no ambient force animation. Motion is limited, purposeful, and respects reduced-motion preferences.
- At least one BIZ-to-SYS-to-TECH chain must be readable without hover or zoom when classified data exists.
- PostgreSQL remains authoritative. Graph stores and browser graphs remain replaceable derived consumers.
- English canonical fields are mandatory; complete Chinese overlays are mandatory for human-facing content.
- The Web remains read-only. Architecture semantics are authored through MCP.
- This ADR cannot be marked implemented without exact-Scope query, projection, isolation, accessibility, browser, MCP read-back, and session-closure evidence.

## Graph Resilience Increment (2026-08-23)

The normal WebGL Network view is an architecture-unit visualization, not an assertion-analysis visualization. It now reads the same exact-Scope, Baseline-bound, generation-qualified `ArchitectureUnitProjection` and `ArchitectureUnitMappingProjection` data as the Map and exposes it through the `unitGraph` query operation. The response declares `source=ARCHITECTURE_UNIT_PROJECTION` and `fidelity=UNIT`.

Assertion-level graph analysis remains a separate optional capability for impact ranking and advanced topology. Its canonical shared version is `3a.graph-analysis.v1`; the persisted publication status is `PUBLISHED`, while `READY` is a query-time availability state. For the current Designer v6 Baseline, the assertion projection has no nodes, so the unit graph reports `analysisAvailability=EMPTY` without failing the normal graph request. Impact continues to fail closed until an assertion-level analysis is genuinely available.

This separation keeps PostgreSQL architecture-unit projections authoritative for the readable graph, preserves exact Scope and generation identity on every response, and avoids inventing assertion relationships from architecture-unit mappings.

### 3A 图谱韧性增量（2026-08-23）

常规 WebGL Network 视图是架构单元可视化，而不是断言分析可视化。它现在读取与 Map 相同的、精确 Scope、绑定 Baseline 且带 Generation 身份的 `ArchitectureUnitProjection` 与 `ArchitectureUnitMappingProjection`，并通过 `unitGraph` 查询操作返回。响应明确声明 `source=ARCHITECTURE_UNIT_PROJECTION` 和 `fidelity=UNIT`。

断言级图分析仍是影响排序和高级拓扑探索的独立可选能力。其共享规范版本为 `3a.graph-analysis.v1`，持久化发布状态为 `PUBLISHED`，而 `READY` 仅表示查询时的可用状态。当前 Designer v6 Baseline 没有断言投影节点，因此单元图返回 `analysisAvailability=EMPTY`，但不会使常规图请求失败。影响分析在真实断言级分析可用前仍保持失败关闭。

该拆分使 PostgreSQL 架构单元投影继续作为可读图的权威来源，保留每个响应上的精确 Scope 与 Generation 身份，并避免从架构单元映射虚构断言关系。

### Graph Resilience Evidence

- Preflight: `design-change-session:0ca85bc2-9683-40a2-918c-ab88130e72b0` opened in the exact Designer Scope with the current design catalog and reconciliation digest.
- `pnpm exec tsx scripts/verify-designer-3a-unit-graph.ts` returned `ARCHITECTURE_UNIT_PROJECTION`, `UNIT`, 8 nodes, 6 edges, and `EMPTY` analysis availability for Designer v6.
- `pnpm typecheck` exited 0 across core, knowledge-query, knowledge-projector, MCP server, and Web.
- HTTP read-back: `POST /api/architecture/3a/query` with the v6 identity returned HTTP 200, 8 nodes, 6 edges, and `analysisAvailability=EMPTY`.

## Implemented v5 Membership Expansion

The approved v5 design is implemented as a conservative membership-only increment. It preserves the 4 v4 units and 3 mappings, adds exactly 10 directly evidenced facts to the existing MCP governance gateway, and publishes 38 memberships in a complete immutable snapshot. v4 remains immutable and published as the prior Baseline.

The AI generation API, asset graph query API, Web Console API, and MCP audit observability design remain unclassified because each requires a separate architecture-unit decision. Nine `specforge-graph-verification-*` API rows are verification fixtures and are excluded from architecture coverage; their cleanup is tracked independently. No naming inference, new unit, new mapping, or cross-Scope write was introduced.

### v5 Implementation Evidence

- Exact-Scope implementation session: `design-change-session:87996974-cab9-496d-84cd-9492518f0466`.
- MCP publisher: `scripts/publish-designer-3a-v5.ts` read all ten candidate assets in English and Chinese, checked typed links, read the accepted v4 snapshot, and submitted the complete v5 snapshot through MCP.
- MCP receipts: batch `architecture-fact-batch:designer:3a:coverage:v5`, ReviewBundle `knowledge-review-bundle:designer:3a:coverage:v5` (`READY`), decision `knowledge-promotion-decision:designer:3a:coverage:v5` (`APPROVE`), reconciliation `knowledge-reconciliation:...:406cc98059ad031ce9d0b02784aca6a45ac8517de86dfbed2f282941a928fc23` (`CONVERGED`), and Baseline `knowledge-baseline:designer:3a:v5` (`PUBLISHED`).
- v5 counts: 4 units, 38 memberships, 3 mappings; relationship version `7036`; exact Scope readback matched.
- `pnpm exec tsx scripts/process-designer-3a-v5-projection.ts` requested the v5 build through MCP and produced `READY` with derived graph analysis `PUBLISHED`.
- `pnpm exec tsx scripts/verify-designer-3a-v5.ts` returned 4 units, 38 members, 3 mappings, `totalByLayer={BIZ:1,SYS:2,TECH:1}`, `unclassifiedCount=0`, `fixtureHits=[]`, `deferredHits=[]`, and `scopeMatches=true`.
- `pnpm typecheck` passed all five workspace packages. `git diff --check` exited 0. The existing neighborhood adapter's Prisma field mismatch was not changed in this data-only increment; exact member verification used MCP map readback plus read-only PostgreSQL projection inspection.

### v5 实施证据

- 精确 Scope 实施会话：`design-change-session:87996974-cab9-496d-84cd-9492518f0466`。
- MCP 发布器通过 MCP 重新读取 10 个候选资产的中英文内容和类型化关系，并只读读取已发布 v4 快照；所有权威事实写入均通过 MCP 完成。
- v5 已发布为 4 个架构单元、38 个成员归属和 3 条映射；ReviewBundle 为 `READY`，对账为 `CONVERGED`，Baseline 为 `PUBLISHED`。
- 投影回读为 `READY`，派生图分析为 `PUBLISHED`；精确 Scope 匹配，未分类数为 0，9 条图验证夹具和延期资产均未纳入 v5。

### v5 成员扩充计划

已批准的 v5 设计是保守的仅成员增量，目前尚未实施。它保留 v4 的 4 个单元和 3 条映射，只把 10 个具有直接证据的事实加入现有 MCP 治理网关，目标是在完整不可变快照中达到 38 个成员归属。

AI 生成 API、资产图查询 API、Web Console API 和 MCP 审计可观测性设计继续保持未分类，因为它们分别需要独立的架构单元决策。9 条 `specforge-graph-verification-*` API 是验证数据，不纳入架构覆盖，并单独登记清理待办。实施必须新建精确 Scope 会话，不能复用本次书面设计会话。

## Evidence

- Exact-Scope written-design session `design-change-session:4a19af23-3adc-430e-b252-3fead241bb05` read 298 scoped assets and relationship digest `86f22fca81d050efd28827d54545df5cff3ce91fab549aa25445963fbefc6a37` before the v5 Spec was written.
- The v4 inventory review found 23 unclassified records in the selected categories: 10 directly evidenced memberships, 4 legitimate facts requiring new architecture units, and 9 persisted graph-verification fixtures excluded from production coverage.
- Spec self-review found no placeholders or conflicting counts, preserved the 4/38/3 complete-snapshot boundary, and kept implementation explicitly blocked pending user approval.
- `pnpm exec vitest run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts` passed 2 files and 33 tests; `pnpm design-facts:check` verified 23 ADR records with empty missing, mismatched, out-of-Scope, and blocked lists; `git diff --check` exited 0.
- `pnpm design-context:close -- --session design-change-session:4a19af23-3adc-430e-b252-3fead241bb05 --status CONVERGED` closed the written-design session. No v5 batch, Baseline, projection, or implementation code was created.
- Exact-Scope preflight opened `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`, read 254 scoped assets, and returned design-context digest `d8bb3389e8eb85559f46c8a111b7c3abcda61725aec3b39690be43c02fe139d1` with relationship digest `dbb387eee30c0f19ba7dd8015d3e06dd971eab35464a4784ddfaef63b2d95055`.
- In-app browser inspection observed 151 nodes, 234 edges, and 7 canvases in a 454-by-576-pixel graph surface; the default network did not expose a readable BIZ-to-SYS-to-TECH chain.
- User design review selected semantic architecture units, bounded local drill-down with inspector and breadcrumb, and cross-layer-only overview mappings.
- Written-Spec self-review found no placeholders, preserved exact-Scope and PostgreSQL authority, separated Map from Network responsibilities, and distinguished proposed design from implemented behavior.
- `node .\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts` passed 2 test files and 33 tests.
- Selected exact-Scope `pnpm design-facts:sync` returned `complete`; `pnpm design-facts:check` returned empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists and verified `adr-readable-3a-architecture-mapping`.
- `pnpm design-context:close -- --session design-change-session:34a1a99a-6026-4060-a858-46654b1630f3 --status CONVERGED` closed the exact-Scope written-design session with bilingual Spec, manifest, test, diff, MCP synchronization, and read-back evidence.
- Exact-Scope implementation session `design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe` covered the Task 1 contract and migration increment.
- `node .\\node_modules\\vitest\\vitest.mjs run packages/core/src/architecture-map/types.test.ts prisma/three-a-schema.test.ts` passed 2 files and 5 tests; `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit` and `node node_modules/prisma/build/index.js validate` exited 0; `git diff --check` exited 0.
- Task 1 created the exact-Scope architecture-unit projection models, bounded validators, and migration with PostgreSQL-safe constraint names; Task 2 added deterministic materialization, PostgreSQL persistence, and read-only MCP adapters; Task 3 adds bounded versioned Map and unit-neighborhood query contracts across knowledge-query, Web, and MCP.
- Task 4 is implemented: graphRepresentation=map|network, bounded URL filters, deterministic desktop/mobile layout, explicit empty state, keyboard-focusable unit nodes, and bilingual Map/Network controls are integrated into the 3A workspace.
- Task 5 is implemented: selecting a unit calls the generation-bound neighborhood query and renders a bounded bilingual inspector with members, neighbors, mappings, completeness, criticality, evidence, and breadcrumb back navigation.
- Task 6 read-only UI evidence is complete for this increment: the live Designer Scope rendered Map with no console errors and showed NO_GOVERNED_ARCHITECTURE_UNITS; the Network link preserved exact Scope, Baseline, and Projection parameters. A classified BIZ-to-SYS-to-TECH chain could not be demonstrated because the current published generation contains zero governed architecture-unit projections.
- `pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe --status CONVERGED` closed the Task 1 implementation session with the recorded focused evidence.
- Exact-Scope implementation session `design-change-session:470a576b-0660-4bd7-bf5a-dd92a6f3ee94` covered deterministic architecture-unit materialization, PostgreSQL projection persistence, and read-only MCP adapters.
- `node .\\node_modules\\vitest\\vitest.mjs run --exclude ".worktrees/**" --exclude ".pnpm-store/**" apps/knowledge-projector/src/materializer.test.ts apps/knowledge-projector/src/architecture-unit-materializer.test.ts apps/knowledge-projector/src/architecture-unit-repository.test.ts apps/knowledge-projector/src/repository.test.ts apps/mcp-server/src/tools.test.ts` passed 5 test files and 54 tests; the knowledge-projector and MCP Server TypeScript checks, Prisma validation, and `git diff --check` exited 0.
- Task 2 materializes only explicit, exact-Scope architecture-unit facts; PostgreSQL remains authoritative and MCP adapters are read-only.
- Exact-Scope implementation session `design-change-session:c3471bcf-b2ee-485f-b9ec-c418f24b677b` covered bounded versioned Map and unit-neighborhood query contracts, Web routing/client contracts, and read-only MCP query tools.
- `node .\\node_modules\\vitest\\vitest.mjs run --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/lib/3a/url-state.test.ts apps/mcp-server/src/tools.test.ts` passed 5 test files and 54 tests; knowledge-query, Web, and MCP Server TypeScript checks exited 0.
- `node node_modules/prisma/build/index.js validate; git diff --check` exited 0 for the Task 3 implementation increment.

## Implementation Increment Evidence

- Exact-Scope implementation session design-change-session:8efcc723-4dcd-4c0d-a286-14750864d1dd covered the read-only Map/Network Web increment.
- pnpm exec vitest run apps/web/lib/3a/url-state.test.ts apps/web/lib/3a/workspace-loader.test.ts apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/architecture-map-layout.test.ts apps/web/components/three-a/architecture-map-renderer.test.tsx passed 5 files and 18 tests.
- pnpm exec vitest run apps/web/lib/3a/query-handler.test.ts packages/knowledge-query/src/architecture-map.test.ts passed 2 files and 13 tests.
- pnpm --filter @specforge/web typecheck exited 0.
- Browser acceptance on http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner&mode=graph&graphRepresentation=map rendered the Map filter bar and the explicit governed-unit empty state with no console errors. The live published projection exposes no governed architecture-unit rows, so no semantic chain was invented.
- pnpm design-context:close -- --session design-change-session:8efcc723-4dcd-4c0d-a286-14750864d1dd --status CONVERGED returned status CONVERGED with the evidence above.
- Authoring-design preflight opened `design-change-session:efd5df8b-492f-4e8c-949f-94f66b541cc7` in the exact Designer Scope, read 289 scoped assets, and returned design-context digest `690eb08158bedeec92c47d72f8ce5c63337c1a1b7bf2a2fb6d5a373f0ff0aea8` with relationship digest `438d6b0aeb41bb9a193cfe8b06f605f88dad75f6d81b78de0ba80353635f723b`.
- The governed authoring Spec and two implementation plans define first-class revisions, additive shared governance references, MCP-only submission, dedicated authored-fact promotion, deterministic Baseline projection loading, and live Designer onboarding. They do not claim code or data implementation.
- `node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts scripts\sync-design-facts.test.ts` passed 2 files and 33 tests for the authoring-design documentation increment.
- With `SPECFORGE_DESIGN_FACT_IDS=adr-readable-3a-architecture-mapping`, `pnpm design-facts:sync` returned `complete`; `pnpm design-facts:check` verified the ADR with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.
- `pnpm design-context:close -- --session design-change-session:efd5df8b-492f-4e8c-949f-94f66b541cc7 --status CONVERGED` closed the exact-Scope written-authoring-design session with the Spec, both plans, manifest tests, JSON validation, MCP synchronization, reconciliation, and diff evidence.

## P1 Implementation Closure: 3A Semantic Unit Expansion v6

The selected v6 semantic-unit slice is implemented and published in the exact Designer Scope. Enterprise-wide semantic coverage remains deferred.

- Design Change Session: `design-change-session:8d24d98b-c3de-490c-9b58-96e85c6abf02`
- Published Baseline: `knowledge-baseline:designer:3a:v6`
- Relationship version: `7648`
- Projection manifest: `projection-manifest:projection-generation:a5f2d9f6895b032648c4cab7dff81462aa36e2e9a406fffdec94562f7bd092ac:1`
- Published counts: `8 units / 42 memberships / 6 mappings`; layer totals `BIZ=1, SYS=6, TECH=1`; `unclassifiedCount=0`.
- New units: Web Console, AI Generation Service, Asset Graph Query Service, and MCP Audit Observability Service. Only three evidenced SYS-to-TECH PostgreSQL mappings were created; same-layer Web Console calls remain typed asset relationships.
- Verification: `pnpm exec tsx scripts/verify-designer-3a-v6.ts` -> `READY`; v5 regression -> `4 units / 38 memberships / 3 mappings`, `scopeMatches=true`, no fixture hits.
- Projection: `pnpm exec tsx scripts/process-designer-3a-v6-projection.ts` -> `READY`, derived analysis `PUBLISHED`.
- Contract test: `pnpm exec vitest run scripts/designer-3a-v6-contract.test.ts` -> 4 passed; Core typecheck -> exit 0.

### P1 实施收敛：3A 语义单元扩充 v6

v6 选定语义单元切片已经在精确 Designer Scope 中实现并发布；企业级全量语义覆盖仍然延期。发布结果为 8 个单元、42 个成员和 6 个映射，层级计数为 BIZ=1、SYS=6、TECH=1。验证、投影和回归命令结果与上面的英文规范字段一致。

## MCP Record

## Member Relationship Readability Increment (2026-08-23)

### Decision

The bounded 3A Network Overview now has a third fidelity: `UNIT_WITH_MEMBERS_AND_RELATIONS`. It returns direct member-to-member relationships only when both endpoints are already inside the exact-Scope direct-member result. The PostgreSQL read is deterministic, exact to Scope, Baseline, and generation, and bounded to 120 relationship rows plus a continuation signal.

The browser retains the full bounded graph in memory but renders an initially readable subset: all eight architecture units plus up to 36 direct members. The subset is selected deterministically by architecture layer, relationship presence, member count, degree, and stable identifier. Hidden members and edges are omitted both from Sigma rendering and its layout input, so invisible facts cannot distort the visible layout. Selecting a collapsed unit expands it; selecting an expanded unit focuses it; a separate control collapses the selected unit.

This increment does not infer relationships, add TRACE coverage edges, or change the authority boundary. PostgreSQL remains authoritative for authored facts and graph rendering remains a read-only projection.

### Evidence

- Exact-Scope preflight: `design-change-session:4db9560e-0497-4f8d-9968-3c9705dca77c`; design-context digest `aaf17384538e7dafc3d259418a8baaaebac8af5f6ed267f9954c008e1ec34f97`; relationship digest `a68e80b76bd4399259f5d42d824508f1645554d36f8aa36ada8cb638b9b101e4`.
- Focused suite: `pnpm exec vitest run packages/core/src/architecture-map/types.test.ts packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/architecture-map.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/components/three-a/architecture-graph-visibility.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.ts` passed.
- Type checks: `pnpm --filter @specforge/core typecheck`, `pnpm --filter @specforge/knowledge-query typecheck`, and `pnpm --filter @specforge/web typecheck` passed; `git diff --check` passed.
- Runtime: `docker compose -f deploy/compose.yaml build web; docker compose -f deploy/compose.yaml up -d --no-deps web; Invoke-WebRequest http://localhost:3010/healthz` built the web image and returned HTTP 200.
- Browser: exact Designer Scope, Baseline v6, and its Projection loaded the Relationship Network with 50 loaded nodes, 48 loaded edges, the `8 / 42 / 307 / 6` governed measures, and no browser console errors.
- MCP synchronization completed for `adr-readable-3a-architecture-mapping`; reconciliation reported `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`. The authoritative session `design-change-session:4db9560e-0497-4f8d-9968-3c9705dca77c` and delegated session `design-change-session:3cf4a7fd-afdb-424b-ba22-28d3a19b2fd7` both closed as `CONVERGED`.

### 中文说明

受限的 3A 关系网络总览新增 `UNIT_WITH_MEMBERS_AND_RELATIONS` 完整度。只有当关系两端都位于同一精确 Scope 的直接成员结果中时，才返回成员到成员的关系。PostgreSQL 查询绑定 Scope、Baseline 和 generation，排序确定，并将关系行限制为 120 条，同时提供继续读取信号。

浏览器保留完整的受限图，但默认只渲染可读子集：全部八个架构单元和最多 36 个直接成员。子集按架构层、是否具有关系、成员数、度数和稳定标识确定。隐藏成员和边同时从 Sigma 渲染与布局输入中排除，避免不可见事实影响可见布局。选择折叠单元会展开，选择已展开单元只聚焦，折叠必须使用独立控件。

本增量不推断关系、不加入 TRACE 覆盖边，也不改变权威边界。PostgreSQL 继续是已编写事实的权威来源，图形界面仍是只读投影。

MCP 已完成 `adr-readable-3a-architecture-mapping` 同步；对账结果为 `missing=[]`、`mismatched=[]`、`outOfScope=[]` 和 `blocked=[]`。权威会话 `design-change-session:4db9560e-0497-4f8d-9968-3c9705dca77c` 与委派会话 `design-change-session:3cf4a7fd-afdb-424b-ba22-28d3a19b2fd7` 均已以 `CONVERGED` 关闭。

- Matching MCP ADR ID: `adr-readable-3a-architecture-mapping`
- Matching Proposal ID: `proposal-readable-3a-architecture-mapping`
- Matching Context Pack ID: `ctx-readable-3a-architecture-mapping`
- Related assets: `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`, and `adr-webgl-3a-graph-exploration`
- Required links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` the query API, projection read model, and relationship to the advanced WebGL decision; Proposal `IMPACTS` the query API and projection read model; Evidence `VALIDATES` ADR.
- Synchronization state: the implemented ADR, Proposal, Context Pack, Evidence, and typed links are synchronized and read back in the exact owning Scope. The first governed Designer slice is implemented and locally verified; broader enterprise classification and live connectors remain deferred backlog work.
- Session state: `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3` is `CONVERGED` for the written-design increment.

## Governed Authoring Implementation Evidence

- `pnpm db:push` -> Docker PostgreSQL at `localhost:15433/specforge_canonical` synchronized with the additive architecture-fact schema and Prisma Client regenerated.
- `pnpm --filter @specforge/core typecheck`, `pnpm --filter @specforge/mcp-server typecheck`, `pnpm --filter @specforge/knowledge-projector typecheck`, `pnpm --filter @specforge/web typecheck`, and `pnpm exec prisma validate` -> exited 0.
- `pnpm exec tsx scripts/bootstrap-designer-3a.ts` -> exact-Scope MCP batch submission, Review Bundle, approval, dedicated promotion, converged reconciliation, Baseline publication, and idempotent retry read-back completed.
- `pnpm exec tsx scripts/process-designer-3a-projection.ts` -> `READY`, published Manifest, and derived analysis `PUBLISHED`.
- PostgreSQL read-back -> the published generation contains 4 architecture units, 7 members, and 3 mappings with no unresolved endpoint or Scope error.
- Exact-Scope session `design-change-session:fa68fdd5-8d04-4e64-a111-8e4c71f69a54` is the generic authoring and initial onboarding session and is closed after final focused verification.
- Exact-Scope preflight opened `design-change-session:8caa26ac-7f8b-477a-bce8-a44ea0e3990c` for the next controlled Designer coverage expansion and read the current scoped catalog and relationship digest before any write.
- `pnpm exec tsx scripts/expand-designer-3a-coverage.ts` -> MCP-only complete-snapshot submission of 4 unit revisions, 28 membership revisions, and 3 mapping revisions, with bilingual review metadata, approval, promotion, converged reconciliation, and publication of `knowledge-baseline:designer:3a:v4`.
- `pnpm exec tsx scripts/process-designer-3a-projection.ts` -> v4 projection `READY`, published Manifest, and derived analysis `PUBLISHED`.
- `pnpm exec tsx scripts/verify-designer-3a-coverage.ts` -> MCP read-back `status=READY`, 4 units, 28 members, 3 mappings, `unclassifiedCount=0`, and exact Scope match.
- The v4 projection is still a membership-coverage increment only. No new architecture unit or cross-layer mapping is inferred; enterprise-wide classification, source-owner review, and continuous synchronization remain deferred.

## 中文写入设计增量

只读 Map/Network 体验已经实现。受治理架构事实写入设计已经形成文档，但代码和 Designer 首批数据尚未实施。

架构单元、成员归属和跨层映射将作为一等、不可变、精确 Scope 的规范修订保存。它们不会伪装成扫描生成的普通断言，也不会直接写入投影表。MCP 批次必须携带开放的设计变更会话、英文规范内容、完整中文覆盖、证据、来源和幂等键。

现有 Review Bundle、审批决策、晋升回执、ChangeSet、对账和 Baseline 将增加架构事实修订引用。架构事实使用专用晋升服务处理显式编写来源，但仍遵循同一套授权审核和发布治理。投影器只从已发布 Baseline 中读取已接受修订；声明了修订却无法精确读取时必须阻止发布，不能静默生成空 Map。

通用能力完成后，Designer 数据上线将读取实时精确 Scope 的设计资产与关系，建立证据矩阵，只通过 MCP 提交有证据的候选，并发布至少一条真实的 BIZ 到 SYS 到 TECH 链路。证据不足的内容保持阻塞或拒绝，并登记覆盖待办，不从名称或图拓扑猜测业务语义。

本次书面设计验证中，设计事实清单与同步脚本测试通过 2 个文件、33 项测试；限定 ADR 的 MCP 同步返回 `complete`，回读检查的缺失、不匹配、越界和阻塞列表均为空。书面设计会话 `design-change-session:efd5df8b-492f-4e8c-949f-94f66b541cc7` 已使用上述证据关闭为 `CONVERGED`。

## 实施增量证据

- 精确 Scope 的实现会话 design-change-session:8efcc723-4dcd-4c0d-a286-14750864d1dd 覆盖了只读 Map/Network Web 增量。
- pnpm exec vitest run apps/web/lib/3a/url-state.test.ts apps/web/lib/3a/workspace-loader.test.ts apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/architecture-map-layout.test.ts apps/web/components/three-a/architecture-map-renderer.test.tsx 通过 5 个文件和 18 项测试。
- pnpm exec vitest run apps/web/lib/3a/query-handler.test.ts packages/knowledge-query/src/architecture-map.test.ts 通过 2 个文件和 13 项测试。
- pnpm --filter @specforge/web typecheck 返回 0。
- 浏览器验收访问 http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner&mode=graph&graphRepresentation=map，渲染了 Map 筛选条和明确的治理单元空状态，没有控制台错误。当前发布投影没有治理架构单元行，因此没有伪造语义链路。
- pnpm design-context:close -- --session design-change-session:8efcc723-4dcd-4c0d-a286-14750864d1dd --status CONVERGED 返回 CONVERGED，证据与上述验证一致。

## 中文本地化覆盖

### 标题

可读的 3A 架构映射

### 状态

**只读 Map/Network Web 体验增量已完成；治理架构单元数据编写仍待完成。**

- 稳定 ID：`adr-readable-3a-architecture-mapping`
- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`
- 书面 Spec：`docs/superpowers/specs/2026-08-11-readable-3a-architecture-mapping-design.md`

### 背景

现有 3A 总览是有界关系网络，而不是易读的架构地图。在观测到的 Designer Scope 中，151 个节点和 234 条边被放入 454×576 像素的画布。隐藏标签虽然保护了渲染密度，却使读者无法识别业务能力、系统实现和支撑技术之间的链路。

架构理解与详细网络探索是两种不同任务。前者需要稳定的语义结构和少量可解释映射；后者适合继续使用现有的 GitNexus 风格 WebGL 网络、有类型关系和有界影响分析。让一个力导向图同时承担两种职责，导致默认 3A 体验难以阅读。

### 决策

把语义化“架构地图”作为 3A 图形界面的默认表现形式，并保留现有 WebGL“关系网络”作为高级表现形式。

地图以明确编写的架构单元作为主节点。BIZ 的通用类型为业务能力、流程和业务对象；SYS 为应用、服务、组件和数据域；TECH 为平台、运行时、基础设施和技术服务。API、事件、规则、数据模型及其他设计事实作为架构单元成员，不作为地图顶层节点。

总览只显示跨层映射，并且在无需悬停或缩放时即可读出 BIZ 到 SYS 再到 TECH 的链路。选中架构单元后，界面切换为有界局部邻域，同时打开解释面板并保留返回面包屑；同层依赖仅在下钻后显示。关系网络继续承担详细拓扑、影响分析和任意设计事实关系探索。

架构单元归属和映射必须来自明确编写的事实。UI 和投影流水线不得通过名称启发式、社区检测或布局算法创造规范架构语义。未分类事实和不完整映射必须作为质量信号显示。

PostgreSQL 继续作为已编写事实和关系事件的权威来源。后续实现将在现有 Provider 边界后增加不可变的 `ArchitectureUnitProjection`、`ArchitectureUnitMemberProjection` 和 `ArchitectureUnitMappingProjection` 派生记录，并通过新增的 `architectureMap` 与 `architectureUnitNeighborhood` 操作保持现有有界关系网络契约兼容。

### 备选方案

1. **继续以现有关系网络作为默认视图并优化样式。** 拒绝，因为渲染器美化不能产生语义架构单元，也无法把 151 个事实节点变成可读的企业架构链路。
2. **按设计资产类型分组。** 拒绝，因为 API、事件、规则和数据模型描述的是制品形式，而不是业务、系统或技术架构。
3. **用算法社区作为架构单元。** 拒绝，因为结果不稳定、难治理，并可能断言从未被编写的架构语义。
4. **移除关系网络表现形式。** 拒绝，因为详细关系探索和影响分析仍是有效的高级工作流。
5. **在总览中同时显示同层和跨层关系。** 拒绝，因为密集的内部依赖会遮蔽主要 3A 实现链路。

### 后果

- 默认 3A 体验将更聚焦于架构阅读，同时保留高级关系图探索能力。
- 现有资产需要明确的架构单元归属，才能作为已分类内容进入地图。
- 投影发布与查询契约需要新增语义单元记录和有界操作。
- UI 需要表现形式切换、层间过滤、架构单元下钻、面包屑、检查器和明确的部分结果状态。
- 可以通过未分类事实、缺失映射、证据和映射完整度来衡量架构质量。
- 在独立实施计划获批、执行并验证前，不改变任何当前行为。

### 约束

- 每个地图和邻域请求必须绑定主体、租户、精确 `applicationServiceId`、完整 `scopePath`、Baseline、Projection、授权策略和有效期。
- 默认总览每层最多返回 12 个单元、最多 60 条跨层映射；总数、继续状态和部分结果状态必须明确展示。
- 桌面端使用稳定的 BIZ、SYS、TECH 三列；移动端采用自上而下流程，并一次只呈现一个层间过渡。
- 地图模式不使用持续力导向动画；动效必须有限、有明确目的并尊重减少动态效果偏好。
- 存在已分类数据时，至少一条 BIZ 到 SYS 再到 TECH 的链路必须在无需悬停或缩放时可读。
- PostgreSQL 保持权威；图数据库和浏览器图形都是可替换的派生消费者。
- 英文规范字段必填；所有面向人的内容必须提供完整中文覆盖。
- Web 保持只读，架构语义通过 MCP 编写。
- 在缺少精确 Scope 查询、投影、隔离、无障碍、浏览器、MCP 回读和会话关闭证据时，本 ADR 不得标记为已实施。

### 证据

- 精确 Scope 预检打开 `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`，读取 254 项设计资产，返回设计上下文摘要 `d8bb3389e8eb85559f46c8a111b7c3abcda61725aec3b39690be43c02fe139d1` 和关系摘要 `dbb387eee30c0f19ba7dd8015d3e06dd971eab35464a4784ddfaef63b2d95055`。
- In-app Browser 检查在 454×576 像素图形区域内观察到 151 个节点、234 条边和 7 个画布；默认关系网络无法直接呈现可读的 BIZ 到 SYS 到 TECH 链路。
- 用户设计评审选择了语义架构单元、带检查器与返回面包屑的有界局部下钻，以及总览只显示跨层映射。
- 书面 Spec 自审确认没有占位符，保持精确 Scope 与 PostgreSQL 权威，分离地图和关系网络职责，并明确区分拟议设计与已实施行为。
- `node .\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts` 通过 2 个测试文件和 33 项测试。
- 精确 Scope 的 `pnpm design-facts:sync` 返回 `complete`；`pnpm design-facts:check` 的 `missing`、`mismatched`、`outOfScope` 与 `blocked` 均为空，并验证了 `adr-readable-3a-architecture-mapping`。
- `pnpm design-context:close -- --session design-change-session:34a1a99a-6026-4060-a858-46654b1630f3 --status CONVERGED` 使用双语 Spec、清单、测试、差异检查、MCP 同步和回读证据关闭了精确 Scope 的书面设计会话。
- 精确 Scope 的实现会话 `design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe` 覆盖了 Task 1 契约与迁移增量。
- `node .\\node_modules\\vitest\\vitest.mjs run packages/core/src/architecture-map/types.test.ts prisma/three-a-schema.test.ts` 通过 2 个文件和 5 项测试；`node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit`、`node node_modules/prisma/build/index.js validate` 和 `git diff --check` 均通过。
- Task 1 已创建精确 Scope 架构单元投影模型、有界校验器和 PostgreSQL 安全约束名的迁移；Task 2 已实现确定性架构单元物化、PostgreSQL 投影持久化和只读 MCP 适配器；Task 3 已在 knowledge-query、Web 和 MCP 中增加有界版本化地图与单元邻域查询契约。
- Task 4 已实施：graphRepresentation=map|network、受界 URL 筛选、确定性的桌面/移动端布局、明确空状态、支持键盘聚焦的单元节点，以及双语 Map/Network 控件已接入 3A 工作区。
- Task 5 已实施：选择单元会调用绑定代际的邻域查询，并显示包含成员、邻居、映射、完整度、关键性、证据和返回导航的双语检查器。
- Task 6 的只读 UI 证据已完成：Designer Scope 实际渲染了 Map，没有控制台错误，并显示 NO_GOVERNED_ARCHITECTURE_UNITS；Network 链接保留了精确 Scope、Baseline 和 Projection。由于当前发布代际没有治理架构单元投影，无法展示已分类的 BIZ 到 SYS 到 TECH 链路。
- `pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe --status CONVERGED` 已使用上述针对性证据关闭 Task 1 实现会话。
- 精确 Scope 的实现会话 `design-change-session:470a576b-0660-4bd7-bf5a-dd92a6f3ee94` 覆盖了确定性架构单元物化、PostgreSQL 投影持久化和只读 MCP 适配器。
- 上述 5 个聚焦测试文件和 54 项测试通过；knowledge-projector 与 MCP Server TypeScript 检查、Prisma 校验和 `git diff --check` 均通过。
- 精确 Scope 的实现会话 `design-change-session:c3471bcf-b2ee-485f-b9ec-c418f24b677b` 覆盖了有界版本化地图与单元邻域查询契约、Web 路由与客户端契约以及只读 MCP 查询工具。
- `node .\\node_modules\\vitest\\vitest.mjs run --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/lib/3a/url-state.test.ts apps/mcp-server/src/tools.test.ts` 通过 5 个测试文件和 54 项测试；knowledge-query、Web 与 MCP Server TypeScript 检查均通过。
- `node node_modules/prisma/build/index.js validate; git diff --check` 的 Task 3 实现检查均通过。

### MCP 记录

- 对应 MCP ADR ID：`adr-readable-3a-architecture-mapping`
- 对应 Proposal ID：`proposal-readable-3a-architecture-mapping`
- 对应 Context Pack ID：`ctx-readable-3a-architecture-mapping`
- 相关资产：`api-specforge-3a-architecture-query`、`data-specforge-3a-projection-read-model`、`adr-webgl-3a-graph-exploration`
- 必需关系：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 查询 API、投影读取模型以及与高级 WebGL 决策的关系；Proposal `IMPACTS` 查询 API 和投影读取模型；Evidence `VALIDATES` ADR。
- 同步状态：评审中的 ADR、Proposal、Context Pack、Evidence 和有类型关系已在精确所属 Scope 中同步并回读。Task 1-5 及 Task 6 的只读部分已实施并完成本地验证。由于当前发布代际没有语义单元投影，治理架构单元编写和已分类链路验收仍待完成。
- 会话状态：`design-change-session:34a1a99a-6026-4060-a858-46654b1630f3` 已针对书面设计增量收敛为 `CONVERGED`。


## Default Member-Rich Unit Graph Increment (2026-08-23)

The default Network view now requests `unitGraph(includeMembers=true)` and receives the governed architecture units, their authoritative direct members, cross-layer unit mappings, and directional `ARCHITECTURE_MEMBERSHIP` edges in one bounded exact-Scope response. The query remains additive: callers that omit the flag continue to receive `fidelity=UNIT`, while member mode reports `fidelity=UNIT_WITH_MEMBERS`.

Member retrieval uses one PostgreSQL batch filtered by exact Scope, Baseline, Manifest, generation, and the returned unit identities. The hard response budget is 12 units per layer, 500 members, 60 unit mappings, 500 membership edges, 2 seconds, and 524,288 bytes. A truncated member prefix remains explicit through `MEMBER_BUDGET_EXCEEDED` and `CONTINUATION_REQUIRED`; TRACE coverage remains outside the default topology.

The WebGL renderer loads the resulting member graph immediately. Selecting a unit now locally collapses or expands its direct fact nodes and membership edges without another network request. Selecting a fact reopens its owning unit before focusing it. Scope, Baseline, Manifest, generation, and graph-view changes reset collapse state. PostgreSQL remains authoritative; no direct mutation, schema migration, or graph-store write is introduced.

### 默认成员图增量（2026-08-23）

默认 Network 视图现在请求 `unitGraph(includeMembers=true)`，并在一次有界、精确 Scope 的响应中获得治理架构单元、其权威直接成员、跨层单元映射和有向 `ARCHITECTURE_MEMBERSHIP` 关系。该契约为增量兼容：未传入该开关的调用方继续获得 `fidelity=UNIT`，成员模式返回 `fidelity=UNIT_WITH_MEMBERS`。

成员通过一次 PostgreSQL 批量查询读取，过滤条件包含精确 Scope、Baseline、Manifest、generation 和已返回的单元标识。响应上限为每层 12 个单元、500 个成员、60 条单元映射、500 条成员关系、2 秒和 524,288 字节。成员截断会明确返回 `MEMBER_BUDGET_EXCEEDED` 与 `CONTINUATION_REQUIRED`；TRACE 覆盖仍不进入默认拓扑。

WebGL 渲染器会立即加载该成员图。选择单元时只在本地折叠或展开其直接事实节点和成员关系，不再发起额外网络请求；选择事实前会展开其所属单元。Scope、Baseline、Manifest、generation 或图视图变化会重置折叠状态。PostgreSQL 仍是权威数据源；本增量不引入直接写库、Schema 迁移或图数据库写入。

### Increment Evidence

- Exact-Scope preflight opened `design-change-session:e426e607-c660-4f43-8178-208fa70b1f7f`, read 357 assets, and returned an OPEN session with design-context digest `a02bac2c6a4e89072517bc2616b6708f6c7d63634e5cc10af4d655082bf06a9f`.
- `pnpm --filter @specforge/knowledge-query typecheck` and `pnpm --filter @specforge/web typecheck` both exited 0.
- `pnpm exec vitest run packages/core/src/architecture-map/types.test.ts packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/architecture-map.test.ts packages/knowledge-query/src/service.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx` passed 7 files and 53 tests.
- `pnpm exec vitest run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts` passed 2 files and 36 tests; `git diff --check` passed.
- Browser verification on ports 3000 and 3010 returned 8 governed units, 42 direct members, 307 covered assets, 6 unit mappings, 50 loaded nodes, 48 loaded edges, 42 membership edges, and no console errors.
- `docker compose -f deploy/compose.yaml build web` built `deploy-web`; `docker compose -f deploy/compose.yaml up -d --no-deps web` replaced only `deploy-web-1`; `http://localhost:3010/healthz` returned 200.

### 增量证据

- 精确 Scope 预检已创建会话 `design-change-session:e426e607-c660-4f43-8178-208fa70b1f7f`，并读取 357 项设计资产。
- Knowledge Query 与 Web 类型检查均通过；聚焦测试通过 7 个文件和 53 项测试；设计事实测试通过 2 个文件和 36 项测试。
- 3000 与 3010 页面均验证到 8 个治理单元、42 个直接成员、307 个覆盖资产、6 条单元映射、50 个节点、48 条边和 42 条成员关系，且无控制台错误。
- 仅 `deploy-web-1` 已被替换，3010 健康检查返回 200。
- `pnpm design-context:close -- --session design-change-session:e426e607-c660-4f43-8178-208fa70b1f7f --status CONVERGED` 已以类型检查、53 项聚焦测试、36 项设计事实测试、3000/3010 页面验证、容器构建和 MCP 回读证据收敛实现会话。

## Graph-First Coverage and Member Expansion Increment (2026-08-23)

The 3A page now treats the governed architecture graph as the primary workspace. The compact coverage waterline remains visible, but coverage rows render only in a dedicated shareable Coverage tab with 25-row client pagination. This reduces the observed graph offset from approximately 6,862 pixels to 832 pixels and prevents the 307-row coverage report from creating a large architecture-page DOM.

The normal Network still begins with the authoritative Designer v6 unit projection: 8 governed units and 6 unit mappings. Its header reports four distinct measures: 8 governed units, 42 direct members, 307 covered assets, and 6 unit mappings. Direct membership and TRACE-derived coverage are intentionally not combined.

Selecting a governed unit reuses the exact-Scope `architectureUnitNeighborhood` query at depth 1. Returned direct members are merged as stable fact nodes connected by directional `ARCHITECTURE_MEMBERSHIP` edges. The default graph remains readable, while authoritative members become visible on demand without inventing relationships or introducing a new backend operation.

### 图谱优先、覆盖分页与成员展开增量（2026-08-23）

3A 页面现在将治理架构图作为主要工作区。页面保留紧凑的覆盖水位，但覆盖明细仅在独立、可分享的“覆盖”标签页中按每页 25 条呈现。实测图谱起始位置由约 6,862 像素缩短到 832 像素，307 条覆盖记录不再造成超长架构页面和大型 DOM。

常规关系网络仍从 Designer v6 的权威单元投影开始：8 个治理单元和 6 条单元映射。图谱标题区分别展示 8 个治理单元、42 个直接成员、307 个覆盖资产和 6 条单元映射；直接归属与 TRACE 派生覆盖不合并计数。

选择治理单元时，系统复用精确 Scope、深度为 1 的 `architectureUnitNeighborhood` 查询。返回的直接成员以稳定事实节点合并到当前图中，并通过有方向的 `ARCHITECTURE_MEMBERSHIP` 关系连接。默认图保持可读，权威成员可按需查看，不虚构关系，也不新增后端操作。

### Increment Evidence

- Exact-Scope preflight opened `design-change-session:ca477e2d-9fa3-469c-b5af-e5957b357466`, read 352 assets, and returned design-context digest `6e3281554193f1a50d6b4354f20d72b4a647ce6a9c310417f6a997895c209431` with status `OPEN`.
- `pnpm --filter @specforge/web test -- apps/web/lib/3a/url-state.test.ts apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/coverage-detail.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts` exited 0.
- `pnpm --filter @specforge/web typecheck` exited 0.
- Browser validation on port 3000 observed graph top 831.75 pixels, no Architecture-tab coverage detail, measures 8/42/307/6, and a selected unit expanding the graph from 8 nodes/6 edges to 9 nodes/7 edges with `ARCHITECTURE_MEMBERSHIP` and no error.
- `docker compose -f deploy/compose.yaml build web` completed the production Next.js build; `docker compose -f deploy/compose.yaml up -d --no-deps web` replaced only the Web container; `http://localhost:3010/healthz` returned 200.
- Browser validation on port 3010 repeated the 8/42/307/6 measures, 9/7 member expansion, 25-row Coverage page, and exact Scope/Baseline/Projection URL preservation without an error.
- Selected MCP synchronization returned `complete`; read-back verified `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`; `design-change-session:ca477e2d-9fa3-469c-b5af-e5957b357466` closed as `CONVERGED` with all focused evidence.

## 3A Neighborhood Query Identity Repair

Implementation preflight opened `design-change-session:0b9f92e9-2a22-48e3-a058-104a67017590` in the exact Designer Scope before code changes. It read 298 scoped assets and returned design-context digest `b3022bb4167b88291985082aacef9aa7ebbb7127992b05f852ea2431b46c5bf7`, relationship digest `86f22fca81d050efd28827d54545df5cff3ce91fab549aa25445963fbefc6a37`, and reconciliation status `UNVERIFIED` without a blocking status. Receipt: `.specforge/design-context/design-change-session_0b9f92e9-2a22-48e3-a058-104a67017590.json`.

The approved implementation repairs table-specific identity filters for both public neighborhood MCP paths. Architecture unit, member, and mapping projection queries retain `projectionManifestId`; manifest queries use `id`; generation-bound edge queries use Scope, generation, and Baseline without `projectionManifestId`. No schema migration or data rewrite is authorized.

### 3A 邻域查询身份过滤修复

在修改代码前，已在精确 Designer Scope 中打开实现前置会话 `design-change-session:0b9f92e9-2a22-48e3-a058-104a67017590`。会话读取 298 条 Scope 内资产，设计上下文摘要为 `b3022bb4167b88291985082aacef9aa7ebbb7127992b05f852ea2431b46c5bf7`，关系摘要为 `86f22fca81d050efd28827d54545df5cff3ce91fab549aa25445963fbefc6a37`，对账状态为 `UNVERIFIED` 且未阻塞。回执路径为 `.specforge/design-context/design-change-session_0b9f92e9-2a22-48e3-a058-104a67017590.json`。

已批准的实现将修复两个公开邻域 MCP 路径的表级身份过滤。架构单元、成员和映射投影查询继续保留 `projectionManifestId`；Manifest 查询使用 `id`；按 generation 绑定的边查询只使用 Scope、generation 和 Baseline，不发送 `projectionManifestId`。本次不允许 Schema 迁移或数据重写。


## 3A Neighborhood Query Identity Repair Verification

The implementation repaired the two public neighborhood MCP paths without a schema migration:

- `packages/knowledge-query/src/prisma-repository.ts` now strips `projectionManifestId` from generation-bound edge filters while retaining Scope, generation, and Baseline.
- `apps/mcp-server/src/knowledge/architecture-map-adapter.ts` now queries `ProjectionManifest.id` and uses a generation-bound edge identity; architecture unit, member, mapping, and traversal projection reads remain manifest-bound.
- `scripts/verify-designer-3a-v5.ts` now verifies both public MCP paths and no longer reads the member projection directly.

Focused evidence:

- `pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts apps/mcp-server/src/tools.test.ts` -> 2 files passed, including the new table-specific identity assertions.
- `pnpm --filter @specforge/knowledge-query typecheck` -> exit 0.
- `pnpm --filter @specforge/mcp-server typecheck` -> exit 0.
- `pnpm exec tsx scripts/verify-designer-3a-v5.ts` -> `READY`, 4 units, 38 members, 3 mappings, direct neighborhood `READY` with 23 members, shared neighborhood 23 members, member equality `true`, `unclassifiedCount=0`, `fixtureHits=[]`, `deferredHits=[]`, `missingExpected=[]`, and `scopeMatches=true`.
- No Prisma migration or data rewrite was performed.

### 3A 邻域查询身份过滤修复验证

本次在不执行 Schema 迁移的前提下修复了两个公开邻域 MCP 路径：

- `packages/knowledge-query/src/prisma-repository.ts` 现在会从按 generation 绑定的边过滤条件中移除 `projectionManifestId`，同时保留 Scope、generation 和 Baseline。
- `apps/mcp-server/src/knowledge/architecture-map-adapter.ts` 现在查询 `ProjectionManifest.id`，并使用按 generation 绑定的边身份；架构单元、成员、映射和遍历投影查询仍绑定完整 Manifest。
- `scripts/verify-designer-3a-v5.ts` 现在验证两个公开 MCP 路径，不再直接读取成员投影表。

针对性证据：

- `pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts apps/mcp-server/src/tools.test.ts` -> 2 个文件通过，包含新增的表级身份断言。
- `pnpm --filter @specforge/knowledge-query typecheck` -> 返回 0。
- `pnpm --filter @specforge/mcp-server typecheck` -> 返回 0。
- `pnpm exec tsx scripts/verify-designer-3a-v5.ts` -> `READY`，4 个单元、38 个成员、3 个映射；直接邻域 `READY` 且返回 23 个成员，共享邻域返回 23 个成员，成员一致性为 `true`，`unclassifiedCount=0`，夹具、延期和缺失预期均为空，Scope 匹配为 `true`。
- 未执行 Prisma 迁移或数据重写。


Session closure:

- \`pnpm design-context:close -- --session design-change-session:0b9f92e9-2a22-48e3-a058-104a67017590 --status CONVERGED\` returned \`CONVERGED\` with the focused test, typecheck, live v5 dual-path, synchronization, reconciliation, and diff evidence above.
- The implementation session is closed in the exact Designer Scope. The only remaining untracked paths are pre-existing user files \`outputs/\` and \`scripts/build-design-code-challenge-workbook.mjs\`.

会话关闭：

- \`pnpm design-context:close -- --session design-change-session:0b9f92e9-2a22-48e3-a058-104a67017590 --status CONVERGED\` 返回 \`CONVERGED\`，并记录了上述聚焦测试、类型检查、v5 双路径、同步、对账和差异证据。
- 实现会话已在精确 Designer Scope 中关闭。当前仅剩用户原有未跟踪路径 \`outputs/\` 和 \`scripts/build-design-code-challenge-workbook.mjs\`。
