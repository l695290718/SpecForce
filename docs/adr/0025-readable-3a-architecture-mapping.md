# ADR-0025: Readable 3A Architecture Mapping

## Status

**Implementation in progress; Tasks 1-2 contract, projection, and MCP read increments implemented, Tasks 3-6 pending.**

- Stable ID: `adr-readable-3a-architecture-mapping`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`
- Written Spec: `docs/superpowers/specs/2026-08-11-readable-3a-architecture-mapping-design.md`
- Parent decisions: `adr-3a-architecture-navigation-workspace`, `adr-scalable-3a-exploration`, `adr-webgl-3a-graph-exploration`

## Context

The existing 3A Overview is a bounded relationship network rather than a readable architecture map. In the observed Designer Scope, 151 nodes and 234 edges occupy a 454-by-576-pixel canvas. Suppressing labels protects rendering density but prevents a reader from identifying the business capability, system realization, and supporting technology chain.

Architecture comprehension and detailed network exploration are different jobs. The former needs a stable semantic structure and a small number of explained mappings; the latter benefits from the existing GitNexus-aligned WebGL network, arbitrary typed links, and bounded impact exploration. Treating one force-directed graph as both surfaces makes the default 3A experience difficult to read.

## Decision

Make a semantic Architecture Map the default 3A graph representation and retain the existing WebGL Network as an advanced representation.

The Map uses explicit authored architecture units as primary nodes. Generic kinds are business capability, process, and business object for BIZ; application, service, component, and data domain for SYS; and platform, runtime, infrastructure, and technology service for TECH. APIs, events, rules, data models, and other design facts are members of units rather than top-level Map nodes.

The overview shows only cross-layer mappings and must expose a readable BIZ-to-SYS-to-TECH chain without hover or zoom. Selecting a unit replaces the overview with a bounded local neighborhood, explanatory inspector, and breadcrumb back. Same-layer dependencies appear only in this drill-down. The Network representation continues to support detailed topology, impact, and arbitrary fact relationships.

Architecture-unit membership and mappings must come from explicit authored facts. The UI and projection pipeline may not invent canonical units through naming heuristics, community detection, or layout. Unclassified facts and incomplete mappings remain visible as quality signals.

PostgreSQL remains authoritative for authored facts and relationship events. The implementation will add immutable derived `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, and `ArchitectureUnitMappingProjection` records behind the existing provider boundary. Additive `architectureMap` and `architectureUnitNeighborhood` query operations preserve the existing bounded network contracts.

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
- No current behavior is changed until a separately approved implementation plan is executed and verified.

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

## Evidence

- Exact-Scope preflight opened `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3`, read 254 scoped assets, and returned design-context digest `d8bb3389e8eb85559f46c8a111b7c3abcda61725aec3b39690be43c02fe139d1` with relationship digest `dbb387eee30c0f19ba7dd8015d3e06dd971eab35464a4784ddfaef63b2d95055`.
- In-app browser inspection observed 151 nodes, 234 edges, and 7 canvases in a 454-by-576-pixel graph surface; the default network did not expose a readable BIZ-to-SYS-to-TECH chain.
- User design review selected semantic architecture units, bounded local drill-down with inspector and breadcrumb, and cross-layer-only overview mappings.
- Written-Spec self-review found no placeholders, preserved exact-Scope and PostgreSQL authority, separated Map from Network responsibilities, and distinguished proposed design from implemented behavior.
- `node .\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts` passed 2 test files and 33 tests.
- Selected exact-Scope `pnpm design-facts:sync` returned `complete`; `pnpm design-facts:check` returned empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists and verified `adr-readable-3a-architecture-mapping`.
- `pnpm design-context:close -- --session design-change-session:34a1a99a-6026-4060-a858-46654b1630f3 --status CONVERGED` closed the exact-Scope written-design session with bilingual Spec, manifest, test, diff, MCP synchronization, and read-back evidence.
- Exact-Scope implementation session `design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe` covered the Task 1 contract and migration increment.
- `node .\\node_modules\\vitest\\vitest.mjs run packages/core/src/architecture-map/types.test.ts prisma/three-a-schema.test.ts` passed 2 files and 5 tests; `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit` and `node node_modules/prisma/build/index.js validate` exited 0; `git diff --check` exited 0.
- Task 1 created the exact-Scope architecture-unit projection models, bounded validators, and migration with PostgreSQL-safe constraint names; Task 2 now adds deterministic materialization, PostgreSQL persistence, and read-only MCP adapters. Tasks 3-6 remain unimplemented.
- `pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe --status CONVERGED` closed the Task 1 implementation session with the recorded focused evidence.
- Exact-Scope implementation session `design-change-session:470a576b-0660-4bd7-bf5a-dd92a6f3ee94` covered deterministic architecture-unit materialization, PostgreSQL projection persistence, and read-only MCP adapters.
- `node .\\node_modules\\vitest\\vitest.mjs run --exclude ".worktrees/**" --exclude ".pnpm-store/**" apps/knowledge-projector/src/materializer.test.ts apps/knowledge-projector/src/architecture-unit-materializer.test.ts apps/knowledge-projector/src/architecture-unit-repository.test.ts apps/knowledge-projector/src/repository.test.ts apps/mcp-server/src/tools.test.ts` passed 5 test files and 54 tests; the knowledge-projector and MCP Server TypeScript checks, Prisma validation, and `git diff --check` exited 0.
- Task 2 materializes only explicit, exact-Scope architecture-unit facts; PostgreSQL remains authoritative and MCP adapters are read-only. Tasks 3-6 remain pending.

## MCP Record

- Matching MCP ADR ID: `adr-readable-3a-architecture-mapping`
- Matching Proposal ID: `proposal-readable-3a-architecture-mapping`
- Matching Context Pack ID: `ctx-readable-3a-architecture-mapping`
- Related assets: `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`, and `adr-webgl-3a-graph-exploration`
- Required links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` the query API, projection read model, and relationship to the advanced WebGL decision; Proposal `IMPACTS` the query API and projection read model; Evidence `VALIDATES` ADR.
- Synchronization state: the reviewing ADR, Proposal, Context Pack, Evidence, and typed links were synchronized and read back in the exact owning Scope. Tasks 1-2 are implemented and locally verified; the remaining query, Web, and final acceptance increments are still pending.
- Session state: `design-change-session:34a1a99a-6026-4060-a858-46654b1630f3` is `CONVERGED` for the written-design increment.

## 中文本地化覆盖

### 标题

可读的 3A 架构映射

### 状态

**实施进行中；Task 1-2 契约、投影与 MCP 读取增量已实施，Task 3-6 待完成。**

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
- Task 1 已创建精确 Scope 架构单元投影模型、有界校验器和 PostgreSQL 安全约束名的迁移；Task 2 已实现确定性架构单元物化、PostgreSQL 投影持久化和只读 MCP 适配器；Task 3 至 Task 6 尚未实施。
- `pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:41606f36-bbb9-4ae0-ba6c-7a651cbd5fbe --status CONVERGED` 已使用上述针对性证据关闭 Task 1 实现会话。
- 精确 Scope 的实现会话 `design-change-session:470a576b-0660-4bd7-bf5a-dd92a6f3ee94` 覆盖了确定性架构单元物化、PostgreSQL 投影持久化和只读 MCP 适配器。
- 上述 5 个聚焦测试文件和 54 项测试通过；knowledge-projector 与 MCP Server TypeScript 检查、Prisma 校验和 `git diff --check` 均通过。

### MCP 记录

- 对应 MCP ADR ID：`adr-readable-3a-architecture-mapping`
- 对应 Proposal ID：`proposal-readable-3a-architecture-mapping`
- 对应 Context Pack ID：`ctx-readable-3a-architecture-mapping`
- 相关资产：`api-specforge-3a-architecture-query`、`data-specforge-3a-projection-read-model`、`adr-webgl-3a-graph-exploration`
- 必需关系：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 查询 API、投影读取模型以及与高级 WebGL 决策的关系；Proposal `IMPACTS` 查询 API 和投影读取模型；Evidence `VALIDATES` ADR。
- 同步状态：评审中的 ADR、Proposal、Context Pack、Evidence 和有类型关系已在精确所属 Scope 中同步并回读。Task 1-2 已实施并完成本地验证；其余查询、Web 和最终验收增量仍待完成。
- 会话状态：`design-change-session:34a1a99a-6026-4060-a858-46654b1630f3` 已针对书面设计增量收敛为 `CONVERGED`。
