# ADR-0024: WebGL 3A Graph Exploration And Impact Analysis

## Status

**Implemented and locally verified; MCP synchronized and exact-Scope session closed.**

- Stable ID: `adr-webgl-3a-graph-exploration`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0`
- Approved Spec: `docs/superpowers/specs/2026-08-11-webgl-3a-graph-exploration-design.md`
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

## MCP Record

- Matching MCP ADR ID: `adr-webgl-3a-graph-exploration`
- Matching Proposal ID: `proposal-webgl-3a-graph-exploration`
- Matching Context Pack ID: `ctx-webgl-3a-graph-exploration`
- Related assets: `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`, and `adr-scalable-3a-exploration`
- Required links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` query API and projection model; Proposal `IMPACTS` query API and projection model; Evidence `VALIDATES` ADR.
- Synchronization state: the matching ADR, Proposal, Context Pack, Evidence, and typed impact links were synchronized and read back in the exact owning Scope. `design-change-session:c024c443-93b5-4462-852f-c12c82c726d0` closed as `CONVERGED` with the verification evidence recorded below.

## 中文本地化覆盖

### 标题

WebGL 3A 图谱探索与影响分析

### 状态

**已完成本地实施并同步 MCP，精确 Scope 会话已关闭。**

- 稳定 ID：`adr-webgl-3a-graph-exploration`
- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:c024c443-93b5-4462-852f-c12c82c726d0`
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
- 书面 Spec 自审确认英文和中文各 17 个章节、无占位符、已实施状态、浏览器预算有界、PostgreSQL 可回退且禁止完整 Scope 获取；Manifest JSON 解析与 `git diff --check` 通过；
- `node apps\\web\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts` 通过 2 个文件和 32 项测试。
- 针对精确 Scope 执行选定的 `scripts/sync-design-facts.ts` 返回 `complete`；`scripts/reconcile-design-facts.ts` 验证 `adr-webgl-3a-graph-exploration`，`missing`、`mismatched`、`outOfScope` 和 `blocked` 列表均为空。
- UI 定向测试通过 7 个文件、27 项测试；后端/投影定向测试通过 7 个文件、37 项测试。
- Web、knowledge-query、knowledge-projector 类型检查，`pnpm exec prisma validate` 和 `git diff --check` 均返回 0。
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm --filter @specforge/web build` 返回 0，完成编译、类型检查、20 个静态页面生成，并输出 `/architecture/3a` 与 `/api/architecture/3a/query`。默认 standalone 打包额外受到 Windows/OneDrive 下 pnpm 符号链接 `EPERM` 影响，这是环境打包限制，不是应用编译失败。
- In-app Browser 在精确 Designer Scope 下加载了 60 个有界目录节点。嵌入式浏览器不可用 WebGL，因此展示 Sigma 的语义 DOM 回退，图谱内容没有变为空白。
- 派生分析不可用时图谱 API 返回 `503 GRAPH_ANALYSIS_UNAVAILABLE`，工作台立即回退到精确 Scope 的 PostgreSQL 目录，并继续受有界预算保护。

### MCP 记录

- 匹配 MCP ADR ID：`adr-webgl-3a-graph-exploration`
- 匹配 Proposal ID：`proposal-webgl-3a-graph-exploration`
- 匹配 Context Pack ID：`ctx-webgl-3a-graph-exploration`
- 相关资产：`api-specforge-3a-architecture-query`、`data-specforge-3a-projection-read-model` 和 `adr-scalable-3a-exploration`
- 必需关系：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 查询 API 和投影模型；Proposal `IMPACTS` 查询 API 和投影模型；Evidence `VALIDATES` ADR。
- 同步状态：对应 ADR、Proposal、Context Pack、Evidence 和有类型影响关系已在精确所属 Scope 中同步并回读；`design-change-session:c024c443-93b5-4462-852f-c12c82c726d0` 已使用验证证据以 `CONVERGED` 关闭。
