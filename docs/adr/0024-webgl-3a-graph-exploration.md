# ADR-0024: WebGL 3A Graph Exploration And Impact Analysis

## Status

**Implemented in source and build; fresh browser visual acceptance is blocked by the existing in-app tab snapshot.**

- Stable ID: `adr-webgl-3a-graph-exploration`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0`
- Follow-up Renderer Fix Session: `design-change-session:e2f19fdf-a96e-4ee5-98cd-56accd965680`
- Follow-up Edge Fallback Session: `design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3`
- Follow-up Layered Layout Session: `design-change-session:162ef116-c479-4658-ab42-d77ad92594ab`
- Follow-up Motion Session: `design-change-session:dd17470e-6417-40e1-93fe-e3c41f841a0d`
- Follow-up Focus Persistence Session: `design-change-session:fcdf244a-6515-4332-b06c-6b2e4dfc96e4`
- GitNexus-Aligned Implementation Session: `design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752` (blocked only on fresh browser visual acceptance)
- Follow-up Focus Persistence Spec: `docs/superpowers/specs/2026-08-11-3a-focus-persistence-fix.md`
- Approved Spec: `docs/superpowers/specs/2026-08-11-webgl-3a-graph-exploration-design.md`
- Follow-up Layout Spec: `docs/superpowers/specs/2026-08-11-3a-layered-graph-layout-design.md`
- Follow-up Motion Spec: `docs/superpowers/specs/2026-08-11-3a-graph-motion-design.md`
- Parent ADR: `adr-scalable-3a-exploration`

## Context

ADR-0023 deliberately selected React Flow for the first bounded relationship-graph increment and deferred WebGL until measured product need justified a renderer change. The increment proved exact-Scope bounded adjacency, continuation, and stable URL focus, but its card-heavy static layout behaves as a relationship preview rather than a modern graph explorer. The user requires both architecture-topology exploration and integrated impact analysis at a quality closer to GitNexus.

The renderer change cannot justify a whole-Scope browser load. Enterprise graph volume may be extremely large, so query summaries, bounded neighborhoods, and impact indexes remain server responsibilities.

## Decision

Replace the Graph-mode React Flow canvas with Sigma.js WebGL rendering backed by an in-memory bounded Graphology graph. Keep React for workspace controls, filters, inspectors, status, and accessible list equivalents.

Provide Overview, Explore, and Impact views. Overview reads precomputed cluster summaries. Explore reuses bounded trace queries. Impact adds a deterministic, policy-versioned, explainable ranking query. Use a short ForceAtlas2 worker refinement for Overview and Explore, then freeze positions; use a deterministic directed layout for Impact.

PostgreSQL remains authoritative for authored facts and relationship events. Graph summaries, cluster metrics, and impact indexes are derived projections behind an `ArchitectureGraphQueryProvider`. PostgreSQL is the mandatory provider and fallback; an optional graph database provider must implement the same exact-Scope contract.

## Alternatives

1. **Continue polishing React Flow.** Rejected because DOM/SVG cards and labels remain the dominant rendering cost and do not provide the expected fluid topology experience.
2. **Load the entire Scope into Sigma.js.** Rejected because WebGL improves rendering but does not make unbounded transfer, browser memory, authorization, or billion-scale querying acceptable.
3. **Use one force-directed layout for every task.** Rejected because Impact analysis requires stable upstream/focus/downstream direction and repeatable path comparison.
4. **Make a graph database mandatory.** Rejected because deployment environments may only provide PostgreSQL and graph storage must remain a replaceable derived accelerator.
5. **Use AI to infer impact severity.** Rejected for canonical results. Impact ranking must be deterministic, policy-versioned, and explainable; AI may summarize only after a later decision.

## Consequences

- Dense bounded graphs gain smoother pan, zoom, hover, semantic labels, and neighborhood highlighting.
- Overview can communicate topology through cluster summaries without rendering every fact.
- Impact analysis becomes a first-class explainable workflow rather than a visual edge filter.
- The client adds Sigma.js, Graphology, a layout worker, WebGL recovery, and a semantic DOM fallback.
- The server adds overview and impact contracts plus derived summary/index publication.
- Renderer benchmarks validate only the bounded browser envelope; production billion-scale capacity remains a separate deployment concern.

## Constraints

- Every query and continuation is bound to subject, tenant, exact application service, full scope path, Baseline, Projection, operation, filters, policy, and expiry.
- Initial Overview is capped at 250 nodes and 500 edges; the browser retains at most 2,000 nodes and 5,000 edges.
- WebGL unavailability or context loss must preserve an accessible list and impact summary.
- No browser component imports Prisma, calls MCP, or mutates design facts.
- English canonical and complete Chinese human-facing content remain mandatory.
- This ADR cannot be marked implemented without query, Scope isolation, fallback, accessibility, browser, performance, MCP read-back, and session-closure evidence.

## Evidence

- User review on 2026-08-11 approved improving both topology exploration and impact analysis and confirmed Sigma.js + Graphology + WebGL as the target direction.
- GitNexus official repository review confirmed its Web UI uses Sigma.js and Graphology for WebGL graph visualization and graph-native client behavior.
- Repository inspection confirmed the current `ArchitectureGraphCanvas` renders React Flow nodes as fixed-width cards with SVG edges and a deterministic three-band layout.
- Exact-Scope implementation preflight opened `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0`, read 219 scoped assets, and returned design-context digest `418131a017036b38df5e54c6eed71310910defea4ab6812e0aab6c3d2d01998f`; relationship digest: `a5d6c22452cf10ed46dce650a162388472aa2b961c0fd4712f59e5d8e4ade34b`.
- Written-Spec self-review confirmed 17 English and 17 Chinese sections, no placeholders, implemented status, bounded browser budgets, PostgreSQL fallback, and no whole-Scope fetch. Manifest JSON parsing and `git diff --check` passed.
- `node apps\\web\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts` passed 2 files and 32 tests.
- Selected exact-Scope `scripts/sync-design-facts.ts` returned `complete`; `scripts/reconcile-design-facts.ts` verified `adr-webgl-3a-graph-exploration` with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.
- UI focused suite passed 7 files and 27 tests; backend/projector focused suite passed 7 files and 37 tests.
- `pnpm --filter @specforge/web typecheck`, `pnpm --filter @specforge/knowledge-query typecheck`, `pnpm --filter @specforge/knowledge-projector typecheck`, `pnpm exec prisma validate`, and `git diff --check` exited 0.
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` exited 0, compiled the application, checked types, generated 20 static pages, and emitted `/architecture/3a` plus `/api/architecture/3a/query`. The default standalone packaging additionally hit the known Windows/OneDrive pnpm symlink `EPERM`; this is an environment packaging limitation, not an application compilation failure.
- In-app browser acceptance loaded 60 bounded catalog nodes for the exact Designer Scope. WebGL is unavailable in the embedded browser, so Sigma reports the semantic DOM fallback with the graph contents preserved instead of a blank canvas.
- The graph API returns `503 GRAPH_ANALYSIS_UNAVAILABLE` when derived analysis is unavailable; the workspace immediately falls back to the exact-Scope PostgreSQL catalog and remains bounded.
- Browser reproduction found Sigma reducers were dropping Graphology coordinates and caused `could not find a valid position (x, y)`. The node and edge reducers now preserve source attributes; the follow-up exact-Scope session `design-change-session:e2f19fdf-a96e-4ee5-98cd-56accd965680` closed as `CONVERGED` after 4 Sigma tests, 2 renderer tests, 4 workspace tests, Web typecheck, and a browser recheck with no new position error.
- The bounded edge fallback follow-up opened `design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3` in the exact Designer Scope and read 222 scoped assets. Graph mode now loads up to 84 facts per layer and 500 typed relationships through the PostgreSQL query service; browser acceptance rendered 151 nodes and 234 edges with the explicit `PostgreSQL bounded fallback` source label.
- The focused follow-up suite passed 5 files and 28 tests, including bounded relationship forwarding, graph workspace fallback selection, loader edge loading, Graphology store behavior, and Sigma reducer behavior. Knowledge-query and Web typechecks both exited 0; the browser had 7 Canvas elements and no console errors.
- `pnpm design-context:close -- --session design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3 --status CONVERGED --evidence "node vitest focused 5 files 28 tests=PASS,pnpm knowledge-query typecheck=PASS,pnpm web typecheck=PASS,browser graph overview=151 nodes 234 edges,browser canvas count=7,browser console errors=0"` returned `CONVERGED` in the exact Designer Scope.
- `pnpm design-facts:sync` returned `complete` for the matching ADR, Proposal, Context Pack, Evidence, and typed links; `SPECFORGE_DESIGN_FACT_IDS=adr-webgl-3a-graph-exploration pnpm design-facts:check` returned `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`.
- The layered layout follow-up opened `design-change-session:162ef116-c479-4658-ab42-d77ad92594ab` in the exact Designer Scope and read 228 scoped assets. The worker now ignores unit-scale Overview seeds, lays out BIZ/SYS/TECH in deterministic bands, applies bounded repulsion during refinement, and hides unselected labels so edges remain readable.
- The layout regression suite passed 4 files and 20 tests, including unit-scale expansion, distinct layer bands, connected-cluster separation, Sigma label behavior, Graphology store behavior, and workspace fallback behavior. Web typecheck and `git diff --check` exited 0.
- In-app browser acceptance after reload rendered 151 nodes and 234 edges with 7 Canvas elements, showed PostgreSQL bounded fallback, visibly separated the three layer bands with readable edges, and reported no new console errors.
- `pnpm design-context:close -- --session design-change-session:162ef116-c479-4658-ab42-d77ad92594ab --status CONVERGED --evidence "focused-layout-vitest-4-files-20-tests-PASS,pnpm-web-typecheck-PASS,git-diff-check-PASS,browser-graph-overview-151-nodes-234-edges-3-layer-bands,browser-canvas-count-7,browser-new-console-errors-0"` returned `CONVERGED` in the exact Designer Scope.
- The motion follow-up preflight opened `design-change-session:dd17470e-6417-40e1-93fe-e3c41f841a0d` in the exact Designer Scope, read 234 scoped assets, and returned design-context digest `92042bd9e208dc59fa42dd9b900e96ec9750ae2365a960b52f39cd1a70097f8b`; relationship digest: `50a7417ddab7cdb06307d06e1ddbd4f19f36232fa29dca04dfe1fb9cca6762e1`.
- The motion implementation adds bounded `requestAnimationFrame` interpolation, finite camera easing, node pulse emphasis, connected-edge emphasis, reduced-motion handling, and a guarded Sigma resize callback without changing graph facts or Scope boundaries.
- The motion-focused suite passed 7 files and 37 tests. Web and knowledge-query typechecks exited 0; `git diff --check` exited 0.
- In-app browser acceptance after reload rendered 151 nodes and 234 edges with 7 Canvas elements. Screenshots captured the initial circular seed, the settled BIZ/SYS/TECH layout, and restored readable edges; the latest reload produced no new console errors and no error-state text.
- `pnpm design-context:close -- --session design-change-session:dd17470e-6417-40e1-93fe-e3c41f841a0d --status CONVERGED --evidence "motion-vitest-7-files-37-tests-PASS,pnpm-web-typecheck-PASS,pnpm-knowledge-query-typecheck-PASS,git-diff-check-PASS,browser-motion-151-nodes-234-edges,browser-canvas-count-7,browser-new-console-errors-0,browser-resize-race-fixed"` returned `CONVERGED` in the exact Designer Scope.
- `pnpm design-facts:sync` returned `complete`; `SPECFORGE_DESIGN_FACT_IDS=adr-webgl-3a-graph-exploration pnpm design-facts:check` returned `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`.
- The focus persistence follow-up preflight opened `design-change-session:fcdf244a-6515-4332-b06c-6b2e4dfc96e4` in the exact Designer Scope, read 240 scoped assets, and returned design-context digest `adc0e895a4f31bdfd29afb9ba3b5192939f5194448f800039b67af25ff9558a6`; relationship digest: `0eb741cb13694533e2fc0b67b9d4614028f48dab2a785c09ccd28a4755fe737c`.
- Overview and Explore focus changes now select an existing bounded graph without clearing or reloading it; Impact focus changes remain reload-sensitive because the impact query is focus-defined.
- The focus persistence regression suite passed 7 files and 39 tests. Web and knowledge-query typechecks passed; `git diff --check` passed.
- In-app browser click persistence retained 151 loaded nodes and 234 loaded edges, kept the graph container present, and showed no error-state text after click attempts.

## MCP Record

- Matching MCP ADR ID: `adr-webgl-3a-graph-exploration`
- Matching Proposal ID: `proposal-webgl-3a-graph-exploration`
- Matching Context Pack ID: `ctx-webgl-3a-graph-exploration`
- Related assets: `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`, and `adr-scalable-3a-exploration`
- Required links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` query API and projection model; Proposal `IMPACTS` query API and projection model; Evidence `VALIDATES` ADR.
- Synchronization state: the matching ADR, Proposal, Context Pack, Evidence, and typed impact links were synchronized and read back in the exact owning Scope. The implementation session `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0` and follow-up renderer fix session `design-change-session:e2f19fdf-a96e-4ee5-98cd-56accd965680` both closed as `CONVERGED`.
- The edge fallback session `design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3` is closed as `CONVERGED` after focused verification and exact-Scope synchronization read-back.
- The layered layout session `design-change-session:162ef116-c479-4658-ab42-d77ad92594ab` and motion session `design-change-session:dd17470e-6417-40e1-93fe-e3c41f841a0d` are closed as `CONVERGED` after focused verification and exact-Scope synchronization read-back.
- The focus persistence session `design-change-session:fcdf244a-6515-4332-b06c-6b2e4dfc96e4` is closed as `CONVERGED` after focused verification and exact-Scope synchronization read-back.
- The GitNexus-aligned implementation session `design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752` is closed as `BLOCKED` only because the existing in-app browser tab could not perform a real hard reload; the retry trigger is a fresh exact-Scope browser visual check of the new controls and interactions.
- `pnpm design-facts:sync` returned `complete`; `SPECFORGE_DESIGN_FACT_IDS=adr-webgl-3a-graph-exploration pnpm design-facts:check` returned `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]` for repository/MCP design-fact reconciliation.

## GitNexus-Aligned Implementation Increment (2026-08-11)

- Exact-Scope implementation preflight opened `design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752` for `com.huawei.celon.desiner`, read 246 scoped assets, and returned design-context digest `b66a5e280aea7b5d4f426fedda383ad5e45851cba8b0fa628f3e2fd9f38ae1fe` with relationship digest `ee520dc46aaad979521123b757b89e0747cc4c02360d8ef66bc6c766fb278f4f`.
- The client now uses Sigma.js/Graphology with `@sigma/edge-curve`, ForceAtlas2, and Noverlap. A bounded Worker owns deterministic `force`, `tree`, and `circles` layouts with `seeded`, `running`, `settled`, `stopped`, and `failed` lifecycle states; reduced motion and WebGL/Worker failure retain the semantic fallback.
- Graph interaction now has persistent selection, one-hop neighborhood emphasis, hover labels and halos, curved directed edges, zoom/camera/focus actions, start/stop/restart layout actions, clear selection, and localized Force/Tree/Circles view controls. Overview and Explore reuse the loaded bounded graph; Impact remains focus-query driven.
- URL state persists `graphLayout` as `force`, `tree`, or `circles`; the implementation does not refetch the bounded graph when only layout mode changes. English remains canonical and the new human-facing graph controls and query tabs have complete Chinese overlays.
- The focused regression suite passed 9 files and 57 tests, including ForceAtlas2/Noverlap output, distinct Tree/Circles layouts, Worker lifecycle, Sigma reducers and interaction, controls, workspace behavior, motion, store neighborhood behavior, and URL state. `pnpm --filter @specforge/web typecheck`, `pnpm --filter @specforge/knowledge-query typecheck`, and `git diff --check` passed.
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` exited 0 after compiling the application, checking types, generating 20 static pages, and emitting `/architecture/3a` and `/api/architecture/3a/query`. The route was served with HTTP 200 on the restarted local service; the generated browser chunks contain the `graphLayout` and `graphControls` integration markers.
- The existing in-app browser tab remained on its pre-change client snapshot after route-history and keyboard refresh attempts; therefore this increment records source/build verification and the already-proven semantic fallback, but does not claim a fresh visual acceptance of the new controls in that tab. A fresh browser hard reload is the retry trigger for the remaining visual acceptance check.

## Continuous ForceAtlas2 Supervisor Increment (2026-08-13)

- Exact-Scope implementation preflight opened `design-change-session:42c82e52-5b6f-460a-9675-b95c8cde75cc` for `com.huawei.celon.desiner`, read 280 scoped assets, and returned design-context digest `a8a7aa57e3cfbf9efc34c4403aab665553b02cbfa2587d37c4347d753754ce33` with relationship digest `ddb816e608c662842db21fedc5db5ab37cec0069e51cf022c8bccc54b9448bc1`; reconciliation was `UNVERIFIED`, not blocked.
- This increment reverses the settle-only motion non-goal of `docs/superpowers/specs/2026-08-11-3a-graph-motion-design.md` for the `force` layout only: `force` mode now runs a continuous ForceAtlas2 supervisor (`FA2LayoutSupervisor` from `graphology-layout-forceatlas2/worker`) that keeps nodes moving until the user stops it, matching GitNexus-style exploration. `tree` and `circles` remain deterministic static layouts, and `prefers-reduced-motion` still applies the deterministic BIZ/SYS/TECH seed without scheduling any animation.
- The client starts the supervisor on the bounded Graphology graph with the existing scope-bound settings, streams worker positions into the graph at ~16 fps, and keeps edges visible during motion: unrelated edges are reduced in opacity and size, never removed. Stopping the layout runs a Noverlap pass and a finite camera reset; restart reuses the current positions and does not refetch design facts. Lifecycle remains `seeded | running | settled | stopped | failed`.
- Supervisor construction failure falls back to the previous bounded one-shot ForceAtlas2/Noverlap refinement with deterministic positions and reports `WORKER_ERROR` without blanking the graph. Design record: `docs/superpowers/specs/2026-08-13-continuous-forceatlas2-supervisor-design.md`.
- Verification: repository-wide `pnpm typecheck` exited 0 for core, knowledge-query, knowledge-projector, mcp-server, and web. The focused 3A graph suite passed 4 files and 28 tests (including the updated motion-visibility reducer assertions). `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` exited 0 and emitted `/architecture/3a`. The full web suite passed 173 files with 777 tests passing and 4 pre-existing failures in `apps/web/lib/__tests__/derived-routes.test.ts` caused by the HEAD `WebPrincipal` wiring; those failures are unrelated to this increment.
- The session closed as `CONVERGED` on 2026-08-13 with evidence refs `pnpm-typecheck=exit-0`, `three-a-focused-tests=4-files-28-tests-pass`, `web-build=exit-0-emits-3a-route`, `web-full-suite=173-files-777-pass-4-preexisting-unrelated-failures`, `design-facts-sync=complete`, and `design-facts-check=missing-0-mismatched-0`. Final `pnpm design-facts:sync` returned `complete`; `SPECFORGE_DESIGN_FACT_IDS=adr-webgl-3a-graph-exploration pnpm design-facts:check` returned `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`.
- Record completion: the matching Proposal (`proposal-webgl-3a-graph-exploration`) and Context Pack (`ctx-webgl-3a-graph-exploration`) were updated through MCP (`upsert_proposal` / `upsert_context_pack`) in the exact Designer Scope to replace the stale "refine then freeze" wording with the continuous-supervisor behavior; both records now match the implemented state in English and Chinese.

## Flagship Graph Usability Increment (2026-08-22)

- Exact-Scope implementation preflight opened `design-change-session:50e3e30b-267e-4073-b172-b662bb9b56d0` for `com.huawei.celon.desiner` (affected: `adr-webgl-3a-graph-exploration`, `proposal-webgl-3a-graph-exploration`, `ctx-webgl-3a-graph-exploration`) after the canonical PostgreSQL authority at `localhost:15433/specforge_canonical` was recovered by restarting the Docker engine and the `specforge-mcp-pg-tunnel` forwarder container in front of `deploy-postgres-1`; no data was recreated and all 289 scoped assets plus 112 change sessions were read back intact.
- This increment adds flagship usability polish on top of the continuous layout supervisor without changing any query contract, scope rule, or budget: (1) edges render in a deterministic relation-code color from a ten-hue FNV-1a-hashed palette shared by edge rendering, the legend, and future overlays; bridge edges keep the same relation hue. (2) A collapsible bottom-left legend lists the most frequent relation types with counts; clicking a row toggles that relation's edges, and hidden relations are dropped inside the Sigma edge reducer so selection emphasis can never resurface them. (3) A bottom-right canvas minimap mirrors live node positions as layer-colored dots (BIZ amber, SYS blue, TECH emerald) with the camera viewport rectangle, refreshed at ~6.7 Hz, and click/drag navigates the main camera. (4) View actions share the current URL through the clipboard with copied feedback, save at most 12 locally stored views (localStorage key `specforge.threeA.savedViews.v1`, deduplicated by URL query, corrupt payloads tolerated) with apply/delete controls, and reset to default overview/force state while preserving scope and baseline parameters. All new controls carry bilingual i18n labels (`threeA.legendTitle`, `threeA.relationFilterAria`, `threeA.shareView`, `threeA.linkCopied`, `threeA.saveView`, `threeA.savedViews`, `threeA.resetView`, `threeA.noSavedViews`).
- Design record: `docs/superpowers/specs/2026-08-22-3a-graph-flagship-ux-design.md`.
- Verification: `pnpm exec tsc --noEmit -p apps/web` exited 0. The focused 3A graph suite (`sigma-architecture-graph`, `architecture-graph-relations`, `architecture-graph-minimap`, `architecture-graph-legend`, `architecture-view-actions`, `architecture-graph-renderer`, `architecture-graph-workspace` under `apps/web`) passed 7 files and 37 tests, including new assertions for relation-color determinism, reducer-level relation filtering, minimap extent/viewport math, legend rendering and pressed states, saved-view dedupe/cap/corruption handling, and reset-href passthrough. The full web suite passed 45 files and 198 tests. `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` in `apps/web` exited 0 and emitted `/architecture/3a`; the default standalone packaging step remains blocked by the documented Windows/OneDrive symlink `EPERM` and is not re-attempted locally.
- Record completion: the Proposal gained a third `specChanges` entry and the Context Pack gained a flagship-UX instruction plus a correction of the stale "refine then freeze" sentence, all through MCP `upsert_proposal` / `upsert_context_pack` in the exact Designer Scope; a Prisma read-back confirmed 3 spec changes (EN and ZH) and 2 instructions (EN and ZH) persisted.

## 中文本地化覆盖

### 标题

WebGL 3A 图谱探索与影响分析

### 状态

**源码与构建已完成；最新浏览器视觉验收因现有 In-app Browser 标签页快照而阻塞。**

- 稳定 ID：`adr-webgl-3a-graph-exploration`
- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:c024c443-93b5-4462-852f-c12c82c726d0`
- GitNexus 风格实现会话：`design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752`（仅因最新浏览器视觉验收阻塞）
- 已批准 Spec：`docs/superpowers/specs/2026-08-11-webgl-3a-graph-exploration-design.md`
- 父 ADR：`adr-scalable-3a-exploration`

### 背景

ADR-0023 在第一阶段有界关系图谱中选择 React Flow，并把 WebGL 延后到有明确产品需求时。第一阶段已经验证精确 Scope、有界邻接、继续状态和稳定 URL 焦点，但大型卡片与静态布局仍然只适合作为关系预览。用户要求整体架构探索和影响分析都达到更接近 GitNexus 的交互质量。

渲染器升级不能成为完整 Scope 加载的理由。企业关系规模可能极大，因此摘要、邻域和影响索引仍由服务端负责。

### 决策

Graph 模式改用 Sigma.js WebGL，客户端使用有界 Graphology 图；React 保留工作台控件、筛选、检查器、状态和无障碍列表。工作台提供总览、探索和影响分析：总览读取预计算聚类摘要，探索复用有界追踪，影响分析使用确定性、有版本且可解释的排序查询。总览与探索短时运行 ForceAtlas2 Worker 后冻结位置，影响分析使用确定性有向布局。

PostgreSQL 继续作为已编写事实和关系事件的权威存储。图谱摘要、聚类指标和影响索引是 `ArchitectureGraphQueryProvider` 后面的派生投影。PostgreSQL Provider 必须存在且可回退，图数据库只能作为实现相同精确 Scope 契约的可选加速器。

### 备选方案

1. **继续美化 React Flow。** 拒绝，因为 DOM/SVG 卡片与标签仍是主要渲染成本，无法提供预期的流畅拓扑体验。
2. **把完整 Scope 加载到 Sigma.js。** 拒绝，因为 WebGL 不能解决无界传输、浏览器内存、授权和十亿规模查询问题。
3. **所有任务使用同一力导向布局。** 拒绝，因为影响分析需要稳定的上游、焦点、下游方向与可重复路径比较。
4. **强制部署图数据库。** 拒绝，因为部分环境只有 PostgreSQL，图存储必须是可替换派生加速器。
5. **由 AI 推断影响严重度。** 规范结果中拒绝。影响排序必须可确定、有策略版本且可解释。

### 后果

- 有界密集图谱获得更流畅的平移、缩放、悬停、语义标签和邻域高亮；
- 总览通过聚类摘要表达拓扑，无需渲染全部事实；
- 影响分析成为可解释的一等工作流；
- 客户端增加 Sigma.js、Graphology、布局 Worker、WebGL 恢复和语义 DOM 回退；
- 服务端增加总览与影响契约及派生摘要/索引发布；
- 渲染基准只验证有界浏览器容量，生产十亿规模容量仍是独立部署问题。

### 约束

- 每个查询和继续状态必须绑定 subject、租户、精确应用服务、完整 Scope 路径、Baseline、Projection、操作、筛选、策略和过期时间；
- 总览初始最多 250 个节点和 500 条关系，浏览器最多保留 2,000 个节点和 5,000 条关系；
- WebGL 不可用或上下文丢失时必须保留无障碍列表和影响摘要；
- 浏览器组件禁止导入 Prisma、调用 MCP 或修改设计事实；
- 人类可读内容继续要求英文规范字段和完整中文覆盖；
- 缺少查询、Scope 隔离、回退、无障碍、浏览器、性能、MCP 回读和会话关闭证据时，禁止把本 ADR 标记为已实施。

### 证据

- 2026-08-11 用户批准同时优化拓扑探索和影响分析，并确认 Sigma.js + Graphology + WebGL 技术方向；
- GitNexus 官方仓库审视确认其 Web UI 使用 Sigma.js 与 Graphology 实现 WebGL 图谱可视化和图原生客户端行为；
- 仓库检查确认当前 `ArchitectureGraphCanvas` 使用 React Flow 固定宽度卡片、SVG 关系和确定性三层布局；
- 精确 Scope 实施预检打开 `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0`，读取 219 条 Scope 内资产并返回设计上下文摘要 `418131a017036b38df5e54c6eed71310910defea4ab6812e0aab6c3d2d01998f`；关系摘要为 `a5d6c22452cf10ed46dce650a162388472aa2b961c0fd4712f59e5d8e4ade34b`。
- 渲染器修复预检打开 `design-change-session:e2f19fdf-a96e-4ee5-98cd-56accd965680`，读取 221 条 Scope 内资产并返回设计上下文摘要 `9dca381bb43d9d22c6e1c7d3afa8b8c8d9a845e4a503ad7b4e61e9b06d10ea0f`；关系摘要为 `e4adcfbc40ce9f0906ca12f63762373c540abd010db5823f3496445102013bda`。
- 书面 Spec 自审确认英文和中文各 17 个章节、无占位符、已实施状态、浏览器预算有界、PostgreSQL 可回退且禁止完整 Scope 获取；Manifest JSON 解析与 `git diff --check` 通过；
- `node apps\\web\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts` 通过 2 个文件和 32 项测试。
- 针对精确 Scope 执行选定的 `scripts/sync-design-facts.ts` 返回 `complete`；`scripts/reconcile-design-facts.ts` 验证 `adr-webgl-3a-graph-exploration`，`missing`、`mismatched`、`outOfScope` 和 `blocked` 列表均为空。
- UI 定向测试通过 7 个文件、27 项测试；后端/投影定向测试通过 7 个文件、37 项测试。
- Web、knowledge-query、knowledge-projector 类型检查，`pnpm exec prisma validate` 和 `git diff --check` 均返回 0。
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` 返回 0，完成编译、类型检查、20 个静态页面生成，并输出 `/architecture/3a` 与 `/api/architecture/3a/query`。默认 standalone 打包额外受到 Windows/OneDrive 下 pnpm 符号链接 `EPERM` 影响，这是环境打包限制，不是应用编译失败。
- In-app Browser 在精确 Designer Scope 下加载了 60 个有界目录节点。嵌入式浏览器不可用 WebGL，因此展示 Sigma 的语义 DOM 回退，图谱内容没有变为空白。
- 派生分析不可用时图谱 API 返回 `503 GRAPH_ANALYSIS_UNAVAILABLE`，工作台立即回退到精确 Scope 的 PostgreSQL 目录，并继续受有界预算保护。
- 浏览器复现确认 Sigma reducer 丢失 Graphology 坐标并触发 `could not find a valid position (x, y)`；节点和边 reducer 现已保留原始属性。后续精确 Scope 会话 `design-change-session:e2f19fdf-a96e-4ee5-98cd-56accd965680` 已在 4 项 Sigma 测试、2 项渲染器测试、4 项工作台测试、Web 类型检查和浏览器复核通过后以 `CONVERGED` 关闭。

### 追加证据（2026-08-11）

- 边关系回退增量在精确 Designer Scope 打开 `design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3`，读取 222 条 Scope 内资产；图谱模式现在每层最多加载 84 个事实和 500 条类型化关系。
- 浏览器验收显示 151 个有界节点、234 条有界关系，显示 `PostgreSQL 有界回退` 数据源标签，存在 7 个 Canvas，且控制台无错误。
- 边关系回退定向测试通过 5 个文件、28 项测试；knowledge-query 与 Web 类型检查均返回 0。

### GitNexus 风格实现增量（2026-08-11）

- 精确 Scope 实施预检打开 `design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752`，所属应用服务为 `com.huawei.celon.desiner`，读取 246 条 Scope 内资产，并返回设计上下文摘要 `b66a5e280aea7b5d4f426fedda383ad5e45851cba8b0fa628f3e2fd9f38ae1fe` 与关系摘要 `ee520dc46aaad979521123b757b89e0747cc4c02360d8ef66bc6c766fb278f4f`。
- 客户端现在使用 Sigma.js/Graphology、`@sigma/edge-curve`、ForceAtlas2 和 Noverlap；有界 Worker 提供确定性的 `force`、`tree`、`circles` 三种布局及 `seeded`、`running`、`settled`、`stopped`、`failed` 生命周期。减少动效、WebGL 不可用或 Worker 失败时保留语义回退。
- 图谱交互现在支持持久选中、单跳邻域强调、悬停标签与光晕、弧形有向边、缩放/相机/聚焦操作、启动/停止/重启布局、清除选中，以及双语 Force/Tree/Circles 视图控件。Overview 与 Explore 复用已加载的有界图；Impact 仍由焦点查询驱动。
- URL 状态持久化 `graphLayout=force|tree|circles`；只切换布局模式时不会重新请求有界图数据。英文仍为规范字段，新增图谱控件与查询页签已补齐中文覆盖。
- 定向回归测试通过 9 个文件、57 项测试，覆盖 ForceAtlas2/Noverlap 输出、Tree/Circles 布局差异、Worker 生命周期、Sigma reducer 与交互、控件、工作台、动效、邻域状态和 URL 状态。`pnpm --filter @specforge/web typecheck`、`pnpm --filter @specforge/knowledge-query typecheck` 与 `git diff --check` 均通过。
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` 返回 0，完成应用编译、类型检查、20 个静态页面生成，并输出 `/architecture/3a` 与 `/api/architecture/3a/query`。重启后的本地服务路由返回 HTTP 200，生成的浏览器 chunk 含有 `graphLayout` 与 `graphControls` 集成标记。
- 当前 In-app Browser 标签页在路由历史和键盘刷新尝试后仍保留变更前的客户端快照，因此本增量记录源码/构建验证与此前已验证的语义回退，不宣称该标签页已经完成新控件的最新视觉验收。新浏览器强制刷新是剩余视觉验收的重试触发条件。

### MCP 记录

- 匹配 MCP ADR ID：`adr-webgl-3a-graph-exploration`
- 匹配 Proposal ID：`proposal-webgl-3a-graph-exploration`
- 匹配 Context Pack ID：`ctx-webgl-3a-graph-exploration`
- 相关资产：`api-specforge-3a-architecture-query`、`data-specforge-3a-projection-read-model` 和 `adr-scalable-3a-exploration`
- 必需关系：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 查询 API 和投影模型；Proposal `IMPACTS` 查询 API 和投影模型；Evidence `VALIDATES` ADR。
- 同步状态：对应 ADR、Proposal、Context Pack、Evidence 和有类型影响关系已在精确所属 Scope 中同步并回读；原始实施会话 `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0` 与渲染器修复会话 `design-change-session:e2f19fdf-a96e-4ee5-98cd-56accd965680` 均已使用验证证据以 `CONVERGED` 关闭。
- 本次边关系回退会话：`design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3`；完成针对性验证和同步回读后关闭为 `CONVERGED`。
- 本次分层布局会话：`design-change-session:162ef116-c479-4658-ab42-d77ad92594ab`；Worker 现将单位尺度 Overview 坐标视为种子，按 BIZ/SYS/TECH 分带布局并在迭代中加入有界排斥力；未选中节点默认隐藏长标签，以保留关系可读性。
- 分层布局定向测试通过 4 个文件、20 项测试，Web 类型检查和 `git diff --check` 均通过；浏览器验收显示 151 个节点、234 条关系、7 个 Canvas 和三层清晰分布，刷新后无新增控制台错误。
- 本次会话关闭命令以 `CONVERGED` 返回，证据包含精确 Scope、布局测试、类型检查、浏览器节点/边数量、分层视觉验收和控制台检查。
- GitNexus 风格实现会话 `design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752` 已关闭为 `BLOCKED`，唯一原因是现有 In-app Browser 标签页无法执行真正的强制刷新；重试触发条件是对精确 Scope 的新标签页执行视觉验收，检查新控件和交互。
- `pnpm design-facts:sync` 返回 `complete`；`SPECFORGE_DESIGN_FACT_IDS=adr-webgl-3a-graph-exploration pnpm design-facts:check` 返回 `missing=[]`、`mismatched=[]`、`outOfScope=[]`、`blocked=[]`。

### 持续 ForceAtlas2 Supervisor 增量（2026-08-13）

- 精确 Scope 实施预检在 `com.huawei.celon.desiner` 打开 `design-change-session:42c82e52-5b6f-460a-9675-b95c8cde75cc`，读取 280 个 Scope 内资产，返回设计上下文摘要 `a8a7aa57e3cfbf9efc34c4403aab665553b02cbfa2587d37c4347d753754ce33` 与关系摘要 `ddb816e608c662842db21fedc5db5ab37cec0069e51cf022c8bccc54b9448bc1`；对账状态为 `UNVERIFIED`，未阻塞。
- 本增量仅针对 `force` 布局反转 `docs/superpowers/specs/2026-08-11-3a-graph-motion-design.md` 中"不运行无限力模拟"的非目标：`force` 模式现通过 `graphology-layout-forceatlas2/worker` 的 `FA2LayoutSupervisor` 持续运行力导向算法，节点持续运动直到用户停止，对齐 GitNexus 式探索体验。`tree` 与 `circles` 仍为确定性静态布局；`prefers-reduced-motion` 仍直接应用确定性 BIZ/SYS/TECH 种子，不调度任何动画。
- 客户端在有界 Graphology 图上启动 Supervisor（沿用现有 Scope 绑定参数），以约 16 fps 将 Worker 坐标流入图；运动期间边始终可见，仅降低无关边的透明度与粗细，绝不删除。停止布局时执行 Noverlap 清理和有限镜头适配；重新布局复用当前坐标且不重新拉取设计事实。生命周期保持 `seeded | running | settled | stopped | failed`。
- Supervisor 构造失败时回退到原有的一次性有界 ForceAtlas2/Noverlap 精化，应用确定性坐标并上报 `WORKER_ERROR`，图谱不会变空。设计记录：`docs/superpowers/specs/2026-08-13-continuous-forceatlas2-supervisor-design.md`。
- 验证：仓库级 `pnpm typecheck` 对 core、knowledge-query、knowledge-projector、mcp-server、web 全部退出 0；3A 图聚焦测试套件 4 个文件 28 项全部通过（含更新后的运动可见性 reducer 断言）；`$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` 退出 0 并生成 `/architecture/3a`。完整 Web 测试套件 173 个文件、777 项通过，另有 4 项 `apps/web/lib/__tests__/derived-routes.test.ts` 的既有失败，由 HEAD 的 `WebPrincipal` 接线引起，与本增量无关。
- 会话已于 2026-08-13 以 `CONVERGED` 关闭，证据引用为 `pnpm-typecheck=exit-0`、`three-a-focused-tests=4-files-28-tests-pass`、`web-build=exit-0-emits-3a-route`、`web-full-suite=173-files-777-pass-4-preexisting-unrelated-failures`、`design-facts-sync=complete`、`design-facts-check=missing-0-mismatched-0`。最终 `pnpm design-facts:sync` 返回 `complete`；`SPECFORGE_DESIGN_FACT_IDS=adr-webgl-3a-graph-exploration pnpm design-facts:check` 返回 `missing=[]`、`mismatched=[]`、`outOfScope=[]`、`blocked=[]`。
- 记录补全：匹配的 Proposal（`proposal-webgl-3a-graph-exploration`）与 Context Pack（`ctx-webgl-3a-graph-exploration`）已通过 MCP（`upsert_proposal` / `upsert_context_pack`）在精确 Designer Scope 下更新，将过时的"精化后冻结"表述替换为持续 Supervisor 行为；两条记录现以中英双语与已实现状态一致。

### 旗舰图谱可用性增量（2026-08-22）

- 精确 Scope 实施预检在 `com.huawei.celon.desiner` 打开 `design-change-session:50e3e30b-267e-4073-b172-b662bb9b56d0`（受影响事实：`adr-webgl-3a-graph-exploration`、`proposal-webgl-3a-graph-exploration`、`ctx-webgl-3a-graph-exploration`）。预检前，权威 PostgreSQL `localhost:15433/specforge_canonical` 因 Docker 引擎停止而不可达；重启 Docker Desktop 并拉起 `deploy-postgres-1` 前面的 `specforge-mcp-pg-tunnel` 转发容器后恢复，未重建任何数据，289 个 Scope 内资产与 112 个变更会话完整回读。
- 本增量在持续布局 Supervisor 之上叠加旗舰级可用性打磨，不改变任何查询契约、Scope 规则或预算：(1) 边按关系编码以确定性十色调色板着色（FNV-1a 散列），边渲染、图例与后续覆盖层共享同一实现，桥接边保持同色系。(2) 左下角新增可折叠图例，列出最高频关系类型及计数；点击行切换该关系的边显示，被隐藏的关系在 Sigma edge reducer 内剔除，选择强调也不会使其复现。(3) 右下角新增画布小地图，以约 6.7 Hz 刷新，按层着色的节点点阵（BIZ 琥珀、SYS 蓝、TECH 翠绿）镜像实时布局并叠加相机视口矩形，支持点击/拖拽导航主相机。(4) 新增视图操作：经剪贴板分享当前链接并反馈已复制、本地保存至多 12 个视图（localStorage 键 `specforge.threeA.savedViews.v1`，按 URL 查询去重、容忍损坏载荷）及应用/删除控件，以及保留 Scope 与 Baseline 参数重置为默认 overview/force 状态。所有新控件均带双语 i18n 标签（`threeA.legendTitle`、`threeA.relationFilterAria`、`threeA.shareView`、`threeA.linkCopied`、`threeA.saveView`、`threeA.savedViews`、`threeA.resetView`、`threeA.noSavedViews`）。
- 设计记录：`docs/superpowers/specs/2026-08-22-3a-graph-flagship-ux-design.md`。
- 验证：`pnpm exec tsc --noEmit -p apps/web` 退出 0；3A 图聚焦测试套件（`apps/web` 下 sigma-architecture-graph、architecture-graph-relations、architecture-graph-minimap、architecture-graph-legend、architecture-view-actions、architecture-graph-renderer、architecture-graph-workspace）7 个文件 37 项全部通过，覆盖关系配色确定性、reducer 层关系过滤、小地图包围盒/视口计算、图例渲染与按压态、已存视图去重/上限/损坏处理及重置链接透传等新断言。完整 Web 测试套件 45 个文件 198 项全部通过。`apps/web` 下 `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` 退出 0 并生成 `/architecture/3a`；默认 standalone 打包仍受既有 Windows/OneDrive 符号链接 `EPERM` 限制，本地不再尝试。
- 记录补全：Proposal 新增第三条 `specChanges`，Context Pack 新增旗舰 UX 指令并修正过时的"精化后冻结"表述，均通过 MCP `upsert_proposal` / `upsert_context_pack` 在精确 Designer Scope 下写入；Prisma 回读确认中英双语各 3 条规格变更与 2 条指令已持久化。
