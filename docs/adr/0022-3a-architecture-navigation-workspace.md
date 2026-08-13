# ADR-0022: 3A Architecture Navigation Workspace

## Status

**Implemented and locally accepted; the PostgreSQL-first 3A navigation increment is verified against canonical Docker PostgreSQL.**

- Stable ID: `adr-3a-architecture-navigation-workspace`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:fc5625ce-6495-46c7-8bf7-972c62f2a21a`
- Approved Spec: `docs/superpowers/specs/2026-08-10-3a-architecture-navigation-design.md`

## Context

SpecForge can derive deterministic Business, System, and Technical Architecture projections from governed Knowledge Baselines, but the Web console does not expose a Baseline-bound 3A browser. The generic asset graph uses design-asset identities and current relationships, so it cannot safely represent historical Knowledge Assertions, Profile-bound projections, or official Baseline-to-Baseline drift.

The current Baseline lifecycle also marks the active stream head `PUBLISHED` and earlier immutable publications `SUPERSEDED`. A useful history browser must admit both statuses when `publishedAt` is present while rejecting working, blocked, candidate, cross-stream, cross-tenant, and cross-Scope data.

## Decision

Deliver `/architecture/3a` as a read-only, business-first, exact-application-service workspace. The first increment uses PostgreSQL only and exposes a bounded focused path across stable BIZ, SYS, and TECH lanes, search from any layer, bidirectional tracing, explicit alignment, node-and-edge Baseline drift, Evidence, localization, and accepted identity mappings.

Add an immutable `ProjectionManifestV2`, Baseline-bound projection nodes and edges, and a mutable leased `ProjectionBuildJob`. An idempotent MCP `knowledge:write` command creates or returns a build job. A separate Knowledge Projector Worker resolves historical relationship events and assertion endpoints, writes bounded resumable batches, and publishes a Manifest in a short transaction only after closure, count, and digest validation. Readers can reach a generation only through a published Manifest and never observe partial rows.

Web and MCP reads share a new query package. Every request resolves a normalized `ScopedPrincipal`, authorizes tenant and exact application-service Scope before existence or count queries, uses signed keyset search cursors or subject-bound traversal continuations, and enforces finite server budgets. Production Web identity is represented by a provider boundary; seed identity is allowed only in explicit development mode.

The existing NebulaGraph design-asset projection is not reused for 3A traversal. A Knowledge-Assertion-aware Nebula projection remains an independently governed increment after PostgreSQL acceptance and query telemetry.

## Alternatives

1. **Use the existing generic graph directly.** Rejected because its node identity and temporal semantics do not match Baseline-bound Knowledge Assertions.
2. **Build the projection synchronously inside one MCP request.** Rejected because runtime and transaction duration would grow with Baseline size and make retries unsafe.
3. **Reconstruct all historical relationships on every browser request.** Rejected because it produces expensive, failure-prone reads and weakens deterministic pagination.
4. **Show only the active `PUBLISHED` Baseline.** Rejected because immutable `SUPERSEDED` publications are required for governed historical drift.
5. **Infer missing alignment from names or model similarity.** Rejected because generated similarity is not an authored relationship or Evidence.
6. **Require NebulaGraph in the first increment.** Rejected because the current graph projection is semantically incompatible and PostgreSQL provides a deployable fallback.

## Consequences

- Users obtain one official architecture path from business intent to technical realization without loading an entire Scope graph.
- PostgreSQL remains authoritative for Baselines, assertions, relationship events, Evidence, identity decisions, authored assets, and derived 3A materializations.
- Build jobs are operational and mutable; published Manifests and their reachable generations are immutable and rebuildable.
- Historical Baselines remain queryable after supersession, while active defaults remain deterministic.
- The Worker adds one deployable runtime component and requires lease, checkpoint, retention, and health operations.
- Search and traversal are resumable and bounded, but the first increment does not certify billion-scale capacity.
- Production OAuth/OIDC, cross-application-service comparison, and a dedicated Nebula 3A projection remain visible deferred capabilities.

For local and single-host deployment, Web may use `SPECFORGE_WEB_AUTH_MODE=static` with server-side `SPECFORGE_WEB_PRINCIPAL_CLAIMS`. The claims are normalized into the same `ScopedPrincipal` used by MCP and must grant the exact selected application-service Scope. Production identity remains provider-injected; no default Principal is inferred when production mode has no resolver.

## Constraints

- Exact tenant, `applicationServiceId`, and full `scopePath` are mandatory for every build, read, cursor, continuation, node, and edge.
- Only immutable official Baselines with `publishedAt` and status `PUBLISHED` or `SUPERSEDED` are readable.
- Projection Profile ID/version and projection schema version are explicit; legacy manifests are never guessed or silently backfilled.
- Relationship endpoints must resolve to exactly one same-Baseline assertion. Missing or ambiguous endpoints fail closed.
- Every request has finite depth, node, edge, path, timeout, and payload budgets; whole-Scope graph rendering is forbidden.
- MCP remains the formal write boundary. Web may persist only expiring traversal continuation cache state.
- English is canonical and complete Chinese overlays are required for human-facing content.
- PostgreSQL is authoritative; graph databases remain derived and replaceable.
- Implementation must open a new exact-Scope Design Change Session and close it only after focused verification, MCP synchronization, read-back, and reconciliation.

## Evidence

- Web 3A now resolves `SPECFORGE_WEB_AUTH_MODE=static` through the same `ScopedPrincipal` authorization boundary as MCP, with server-side `SPECFORGE_WEB_PRINCIPAL_CLAIMS` carrying exact application-service grants. No implicit production identity is inferred.
- `pnpm --filter @specforge/web typecheck` passed; `apps/web/lib/3a/principal.test.ts` and `apps/web/lib/3a/query-handler.test.ts` passed 11/11; Compose and graph projection configuration checks passed.

- `pnpm design-context:preflight -- --intent <approved 3A navigation design> --affected <four existing facts> --evidence <design review references>` opened `design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc` in the exact Designer Scope.
- Commit `f24c25f` rewrote the bilingual 3A navigation Spec after architecture review.
- User design review on 2026-08-10 approved the rewritten Spec.
- `git diff --check` passed for the rewritten Spec; its structural check found 16 English sections, 16 Chinese sections, zero placeholders, explicit principal resolution, finite hard caps, node-and-edge drift, and no first-increment Nebula claim.
- `node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts/sync-design-facts.test.ts scripts/design-fact-manifest.test.ts` passed 2 files and 30 tests, including explicit approved Proposal lifecycle and the four bilingual managed 3A assets with directional typed relationships.
- `SPECFORGE_DESIGN_FACT_IDS=adr-3a-architecture-navigation-workspace pnpm design-facts:sync` persisted the ADR, approved Proposal, Context Pack, three Evidence records, four managed assets, and directional typed links through MCP.
- Selected `pnpm design-facts:check` returned one verified decision with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.
- Exact-Scope `pnpm design-facts:federation:check` returned root `f04e3ad0981d2ce6a2e40032e359ab06b07dc4ed2255774b6515ba8cd87987dd`, empty issue counts, and `blocking:false`.
- `pnpm design-context:close -- --session design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc --status CONVERGED --evidence "manifest-tests=2-files-30-tests,selected-design-facts-sync=complete,design-facts-check=1-verified,federation-check=blocking-false,plan-self-review=10-tasks-65-steps,diff-check=PASS"` closed the same exact-Scope design session as `CONVERGED`.

## Implementation Evidence

- The exact Designer Scope preflight opened `design-change-session:b7540766-caf2-48f8-9a42-55922b3e815c` with digest `e35fab2b0876261970e5cabe2420d0b3fcde250629d5067c19fdefafa28b5709` and relationship digest `8fc0eb687230e1fb5fa4a8fb90293215f09baed11210a968ba0b3abc0644b49e`.
- `pnpm exec prisma generate --no-engine` passed. The normal `pnpm db:generate` attempt was blocked by a Windows/OneDrive `EPERM` while replacing the locked native Prisma query engine; this is an environment limitation, not a schema failure.
- `$env:CI='true'; pnpm typecheck` passed all five package typechecks.
- Focused tests passed: Core 2 files/6 tests; Knowledge Query 2 files/4 tests; Knowledge Projector 3 materializer tests; MCP tools/auth 2 files/29 tests; Web 3A 3 files/8 tests. Projector integration/e2e remained skipped because the external integration environment was not configured.
- `$env:CI='true'; $env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` passed and generated `/architecture/3a`. The normal Windows standalone copy compiled successfully but could not create OneDrive symlinks (`EPERM`); Docker/Linux remains the production packaging path.
- `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed `Compose configuration verified.`
- Canonical integration command `$env:SPECFORGE_3A_INTEGRATION='1'; $env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; vitest run src/projection.e2e.test.ts` passed one test: two Baselines, leased batch restart recovery, search pagination and cursor replay denial, two-hop trace, detail, alignment, node/edge drift, sibling-Scope denial, and fixture cleanup.
- `corepack pnpm --filter @specforge/knowledge-query build; corepack pnpm --filter @specforge/knowledge-projector typecheck` passed; standard Prisma Client generation passed for the canonical PostgreSQL runtime.
- In-app browser Playwright acceptance passed at `/architecture/3a?scope=com.huawei.celon.desiner`: desktop `1280x720` and mobile `509x642` rendered the bilingual read-only workspace and safe empty Projection state. The sibling `policyhub` Scope returned `Scope access denied`; no cross-Scope architecture facts were disclosed.
- The design-fact manifest, MCP synchronization/read-back, and exact-Scope federation reconciliation were completed after this record update with empty issue lists and `blocking:false`; production identity, cross-application-service comparison, and Nebula 3A projection remain explicitly deferred with owners and triggers in `docs/TODO.md`.
- `pnpm design-context:close -- --session design-change-session:fc5625ce-6495-46c7-8bf7-972c62f2a21a --status CONVERGED --evidence "canonical-3a-e2e=PASS,projector-restart-recovery=PASS,query-isolation=PASS,drift=PASS,web-visual-desktop-1280x720=PASS,web-visual-mobile-509x642=PASS,design-facts-readback=PASS,federation-check=blocking-false"` closes the same exact-Scope session as `CONVERGED` for this acceptance increment while preserving deferred production evidence.

## MCP Record

- Matching MCP ADR ID: `adr-3a-architecture-navigation-workspace`
- Matching Proposal ID: `proposal-3a-architecture-navigation-workspace`
- Matching Context Pack ID: `ctx-3a-architecture-navigation-workspace`
- Required managed assets: `api-specforge-3a-projection-build`, `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`, and `rule-specforge-3a-projection-publication`
- Required related decisions: `adr-deterministic-3a-knowledge-projections`, `adr-unified-3a-knowledge-initialization`, `adr-application-service-scope-isolation`, and `adr-postgresql-authoritative-design-store`
- Required links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; Evidence `VALIDATES` ADR; ADR `DECIDES` managed assets; query API `READS` projection model; publication rule `GOVERNS` projection model; Proposal `IMPACTS` managed assets.
- Synchronization state: the implemented Proposal, ADR, Context Pack, managed assets, Evidence, and typed links are MCP synchronized and read back in the exact owning Scope. External integration, production identity, and Nebula 3A remain deferred capabilities.

## Addendum: Legacy Authored Catalog Bootstrap (2026-08-10)

The empty 3A view was caused by a missing governed Knowledge Baseline, not by missing authored design assets. The exact Designer Scope already contained 194 bilingual authored records and 277 usable typed links, while Knowledge Assertions, Baselines, and published projection rows were empty.

Add the MCP-only `bootstrap_3a_from_design_assets` command as an idempotent migration boundary. It reads the existing exact-Scope PostgreSQL catalog, preserves the English canonical payload and Chinese overlay, maps records to BIZ/SYS/TECH assertions, carries only typed links whose endpoints are inside the Scope, commits one Changeset, writes a converged reconciliation event, and publishes an immutable Baseline. It does not infer undocumented semantics and it does not write directly to projection tables.

Acceptance evidence for `com.huawei.celon.desiner`:

- `node node_modules\\.pnpm\\tsx@4.23.0\\node_modules\\tsx\\dist\\cli.mjs apps\\mcp-server\\src\\bootstrap-3a.ts` returned `assertionCount=194`, `relationshipCount=277`, `layerCounts={BIZ:28,SYS:39,TECH:127}`, `baseline=PUBLISHED`, and a queued `3a.v2` build.
- `node node_modules\\.pnpm\\tsx@4.23.0\\node_modules\\tsx\\dist\\cli.mjs apps\\knowledge-projector\\src\\main.ts` processed the queued job; canonical PostgreSQL read-back reported `ProjectionBuildJob=READY`, `nodeCount=471`, `edgeCount=277`, and a published manifest.
- `Invoke-WebRequest http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner` returned HTTP 200 with BIZ, SYS, TECH, Projection content, and no empty-projection state.
- The sibling `com.huawei.celon.policyhub` response contained no Designer Baseline identifier, confirming Scope isolation.
- MCP session `design-change-session:9d2b9760-f252-40a7-b882-a8dc503b6ab5` closed `CONVERGED` with the above evidence. Two failed, rolled-back retries were closed `BLOCKED` with explicit retry reasons; no partial authored data remained.

### 三层架构存量资产回填补充（2026-08-10）

三层架构页面为空的原因不是设计资产缺失，而是精确 Designer Scope 缺少受治理的 Knowledge Baseline。当前 Scope 原本已有 194 条双语设计事实和 277 条可用类型关系，但 Knowledge Assertion、Baseline 和已发布投影均为空。

新增 MCP-only `bootstrap_3a_from_design_assets` 幂等迁移边界：读取当前精确 Scope 的 PostgreSQL 设计资产，保留英文规范字段和中文覆盖，将记录映射到 BIZ/SYS/TECH 断言，只保留端点同属当前 Scope 的类型关系，提交一个 Changeset，写入收敛对账事件并发布不可变 Baseline。该命令不推断代码中未维护的语义，也不直接写投影表。

验收结果：BIZ 28、SYS 39、TECH 127，共 194 条断言；277 条关系；3a.v2 投影已发布，471 个节点、277 条边；Designer 页面 HTTP 200 且不再显示空投影；PolicyHub sibling Scope 不包含 Designer Baseline。成功会话已通过 MCP 关闭为 `CONVERGED`，两次事务回滚的失败尝试已按规则标记为 `BLOCKED` 并记录重试原因。

## Chinese Localization

### 状态

**已实现并完成本地验收；PostgreSQL-first 3A 导航增量已针对权威 Docker PostgreSQL 验证。**

### 背景

SpecForge 已经可以从受治理的 Knowledge Baseline 确定性派生业务、系统和技术架构投影，但 Web 控制台没有绑定 Baseline 的 3A 浏览器。通用资产图使用设计资产身份和当前关系，无法安全表达历史 Knowledge Assertion、绑定 Profile 的投影以及正式 Baseline 之间的漂移。

当前 Baseline 生命周期把活动 Stream 头标记为 `PUBLISHED`，把更早的不可变正式发布标记为 `SUPERSEDED`。历史浏览必须允许这两种具有 `publishedAt` 的状态，同时拒绝工作中、阻塞、候选、跨 Stream、跨租户和跨 Scope 数据。

### 决策

在 `/architecture/3a` 提供只读、业务优先且精确到应用服务的工作台。第一增量只使用 PostgreSQL，提供 BIZ、SYS、TECH 三条稳定泳道中的有界焦点路径、任意层搜索、双向追溯、显式对齐、节点与关系漂移、Evidence、本地化和已接受身份映射。

新增不可变 `ProjectionManifestV2`、绑定 Baseline 的投影节点和关系，以及可变且带租约的 `ProjectionBuildJob`。幂等 MCP `knowledge:write` 命令只创建或返回构建任务；独立 Knowledge Projector Worker 解析历史关系事件和断言端点，使用有限批次和可恢复检查点写入数据，并且只有在端点闭合、数量和摘要校验通过后，才通过短事务发布 Manifest。Reader 只能通过已发布 Manifest 到达生成代次，不能看到部分数据。

Web 和 MCP 复用新的查询包。每个请求必须先解析标准化 `ScopedPrincipal`，在存在性和数量查询前校验租户与精确应用服务 Scope，并使用签名键集搜索游标或绑定 subject 的遍历继续状态，同时执行有限服务端预算。生产 Web 身份通过 Provider 边界接入；seed 身份只允许显式开发模式。

现有 NebulaGraph 设计资产投影不用于 3A 遍历。面向 Knowledge Assertion 的 Nebula 投影必须在 PostgreSQL 增量验收并获得查询遥测后独立治理。

### 备选方案

1. **直接使用现有通用图。** 拒绝，因为节点身份和时间语义与绑定 Baseline 的 Knowledge Assertion 不一致。
2. **在一次 MCP 请求中同步构建完整投影。** 拒绝，因为运行时间和事务时间会随 Baseline 增长，并导致重试不安全。
3. **每次浏览请求都重建全部历史关系。** 拒绝，因为读取昂贵、故障面大，并削弱确定性分页。
4. **只显示活动 `PUBLISHED` Baseline。** 拒绝，因为正式历史漂移需要不可变的 `SUPERSEDED` 发布。
5. **根据名称或模型相似度推断缺失对齐。** 拒绝，因为生成相似度不是已编写关系或 Evidence。
6. **第一增量强制使用 NebulaGraph。** 拒绝，因为当前图投影语义不兼容，而 PostgreSQL 可以提供可部署回退。

### 后果

- 用户可以从业务意图沿正式架构路径追溯到技术实现，而无需加载整个 Scope 图。
- PostgreSQL 继续作为 Baseline、断言、关系事件、Evidence、身份决策、正式资产和派生 3A 物化结果的权威存储。
- 构建任务是可变运维记录；已发布 Manifest 及其可达生成代次不可变且可重建。
- Baseline 被取代后仍可查询历史，活动默认选择保持确定性。
- Worker 增加一个部署组件，并需要租约、检查点、保留和健康运维。
- 搜索和遍历可恢复且有界，但第一增量不宣称已经完成十亿级认证。
- 生产 OAuth/OIDC、跨应用服务比较和专用 Nebula 3A 投影继续作为明确待办。

### 约束

- 每个构建、读取、游标、继续状态、节点和关系都必须包含精确租户、`applicationServiceId` 和完整 `scopePath`。
- 只允许读取具有 `publishedAt` 且状态为 `PUBLISHED` 或 `SUPERSEDED` 的不可变正式 Baseline。
- Projection Profile ID/版本和投影 Schema 版本必须显式保存；禁止猜测或静默回填旧 Manifest。
- 每个关系端点必须唯一解析到同一 Baseline 断言；缺失或歧义必须失败关闭。
- 每个请求必须具备有限深度、节点、关系、路径、超时和载荷预算；禁止渲染完整 Scope 图。
- MCP 继续是正式写入边界；Web 只能持久化带过期时间的遍历继续缓存。
- 英文是规范字段，面向人的内容必须提供完整中文覆盖。
- PostgreSQL 保持权威；图数据库只能作为可替换派生投影。
- 实现必须打开新的精确 Scope 设计变更会话，并且只在聚焦验证、MCP 同步、回读和对账完成后关闭。

### 证据

- 设计预检在精确 Designer Scope 中打开了 `design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc`。
- 提交 `f24c25f` 根据架构审查结果重写了双语 3A 导航 Spec。
- 用户在 2026-08-10 确认了重写后的设计。
- Spec 差异检查通过；结构检查确认英文和中文各 16 个章节、零占位符、显式 Principal 解析、有限硬上限、节点与关系漂移，并且第一增量没有 Nebula 交付声明。
- 设计事实同步与 Manifest 聚焦测试通过 2 个文件和 30 项测试，覆盖已批准 Proposal 生命周期、四个双语 3A 管理资产及其有向类型关系。
- 选定 3A 决策已经通过 MCP 写入 ADR、approved Proposal、Context Pack、三条 Evidence、四个管理资产和方向关系；回读不存在缺失、不匹配、越界或阻塞项，精确 Scope 联邦检查返回 `blocking:false`。
- 原设计会话 `design-change-session:882fb4fb-cd55-4bba-a75c-d05c1d01b7bc` 已使用 Manifest、MCP 回读、联邦对账、实施计划和差异检查证据在同一精确 Scope 中关闭为 `CONVERGED`。
- 新实现会话 `design-change-session:b7540766-caf2-48f8-9a42-55922b3e815c` 的 Core、Query、Projector、MCP、Web、构建和 Compose 聚焦证据已完成；本轮验收会话为 `design-change-session:fc5625ce-6495-46c7-8bf7-972c62f2a21a`。
- `pnpm exec prisma generate --no-engine`、五个包的类型检查、聚焦测试和 `SPECFORGE_NEXT_STANDALONE=0 pnpm build` 均通过；普通 Windows OneDrive standalone 复制因锁定查询引擎/符号链接返回 `EPERM`，已记录为环境限制。
- 权威 Docker PostgreSQL 集成测试通过 1 个测试，覆盖两版正式 Baseline、租约批次恢复、查询分页与游标重放拒绝、双跳追踪、详情、对齐、节点/关系漂移、同级 Scope 拒绝和清理。
- 浏览器验收通过：桌面 `1280x720`、移动 `509x642` 的 `/architecture/3a?scope=com.huawei.celon.desiner` 均正常渲染；`policyhub` 返回 Scope 拒绝且不泄露跨 Scope 架构事实。

### MCP 记录

- 匹配 MCP ADR：`adr-3a-architecture-navigation-workspace`
- 匹配 Proposal：`proposal-3a-architecture-navigation-workspace`
- 匹配 Context Pack：`ctx-3a-architecture-navigation-workspace`
- 必需管理资产：`api-specforge-3a-architecture-query`、`data-specforge-3a-projection-read-model`、`rule-specforge-3a-projection-publication`
- 当前同步状态：实现后的 Proposal、ADR、Context Pack、管理资产、Evidence 和有向类型关系已在精确所属 Scope 完成 MCP 同步与回读；PostgreSQL 集成与浏览器验收已完成，生产身份和 Nebula 3A 仍是延期能力。
