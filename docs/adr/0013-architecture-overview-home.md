# ADR-0013: Architecture Overview Home

## Status

**Accepted; introduction verification complete; MCP synchronized and read back.**

- Stable ADR/MCP ID: `adr-architecture-overview-home`
- Matching Proposal ID: `proposal-architecture-overview-home`
- Matching Context Pack ID: `ctx-architecture-overview-home`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge needs a system-orientation entry point that explains its MCP-first design-fact lifecycle without turning the application root into an operational dashboard. Application-service scopes are an isolation boundary: authored design facts, derived counts, and dashboard metrics belong to one selected application service and must not be read or aggregated merely because a visitor opens the root route.

## Decision

Use `/` as a static bilingual architecture orientation. The refined introduction uses a deep-ink blueprint canvas, staged lifecycle flow, and typed-asset constellation to explain change through Proposal, ADR, assets, rules and contracts, governance, Context Pack, and evidence. It provides scope-preserving navigation into the selected application-service workspace, relationship analysis, and governance checks. Use `/workspace` as the scoped operational dashboard. The root route must not load, join, count, or aggregate authored design facts across application services.

## Alternatives

1. Keep the scoped dashboard at `/`. Rejected because it conflates product orientation with a selected application-service work area.
2. Aggregate all application-service metrics on `/`. Rejected because it crosses the scope-isolation boundary and can expose unauthorized design facts.
3. Make the orientation page a static marketing page. Rejected because the page must navigate users through the actual SpecForge governance concepts and destinations.

## Consequences

- Positive: New users can understand the system model before entering a workspace.
- Positive: The root route remains independent of authored design-fact data and scope-safe by construction.
- Positive: The canvas supplies an explanatory final state in both full-motion and reduced-motion contexts without introducing loaders or data queries.
- Positive: The existing dashboard keeps its operational focus under `/workspace?scope=<applicationServiceId>`.
- Tradeoff: Navigation must preserve the selected application-service scope only when entering scoped destinations.
- Tradeoff: Cross-service comparison remains a separately authorized, deferred capability.

## Constraints

- English is canonical and every human-facing orientation concept has a Chinese overlay.
- `/` must not import scoped asset loaders, dashboard loaders, or aggregate authored facts.
- Scoped destinations must use the selected application-service ID and retain its exact scope boundary.
- Reduced motion must render the overview canvas in a static final state with animation and transitions disabled.
- Proposal, Context Pack, ADR, typed links, and evidence are written only through MCP in the exact owning Designer Scope.
- Completion requires MCP persistence and read-back of the exact IDs, scope, localization, typed links, and evidence.

## Evidence

- **Verified:** `.\\node_modules\\.bin\\vitest.cmd run apps/web/lib/__tests__/overview.test.ts` exited 0: 1 test file and 8 tests passed.
- **Verified:** `pnpm --filter @specforge/web lint` exited 0 with no ESLint warnings or errors. Next.js emitted its deprecation and workspace-root/extra-lockfile warnings.
- **Verified:** Browser inspection of `http://localhost:3002/?scope=com.huawei.celon.desiner` at 1440x960 in English and Chinese plus 390x844 in English and Chinese found a readable canvas and action controls, no action overlap, no horizontal overflow at mobile, no loader state on `/`, no scoped counts or authored asset data on `/`, and exact scoped action destinations for workspace, graph, and governance.
- **Verified:** Targeted reduced-motion inspection of `apps/web/app/styles/globals.css` found `@media (prefers-reduced-motion: reduce)` plus `.sf-overview-canvas [data-motion]` applying `animation: none`, `transition: none`, `transform: none`, and `opacity: 1` to the overview motion elements and final state.
- **Verified:** `pnpm db:generate` regenerated `@prisma/client` in this worktree so the MCP server could start with the canonical database URL.
- **Verified:** `$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; pnpm design-facts:sync` exited 0 and read back all 12 baseline decisions as complete, including `adr-architecture-overview-home`.
- **Verified:** `$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; pnpm design-facts:check` exited 0 with no missing, mismatched, out-of-scope, or blocked records after the serial rerun against `specforge_canonical`.

## 中文本地化 / Chinese Localization

### 标题

架构概览首页

### 状态

**已接受；引导页验证完成；MCP 已同步并回读。**

- 稳定 ADR/MCP ID：`adr-architecture-overview-home`
- 对应 Proposal ID：`proposal-architecture-overview-home`
- 对应 Context Pack ID：`ctx-architecture-overview-home`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

### 背景

SpecForge 需要一个系统定位入口，用于说明 MCP-first 设计事实生命周期，而不能把应用根路由变成操作仪表盘。应用服务 Scope 是隔离边界：已编写的设计事实、派生计数和仪表盘指标都属于一个已选应用服务，访问根路由本身不得读取或聚合这些数据。

### 决策

将 `/` 作为静态双语架构定位页。改进后的引导页使用深墨色蓝图画布、分阶段生命周期流和有类型资产星图，说明从变更到 Proposal、ADR、资产、规则与契约、治理、Context Pack 和证据的过程。页面提供进入已选应用服务工作台、关系分析和治理检查的 Scope 保留导航。将 `/workspace` 作为范围化的操作仪表盘。根路由不得加载、关联、计数或聚合跨应用服务的已编写设计事实。

### 备选方案

1. 保留范围化仪表盘在 `/`。拒绝，因为这会混淆系统定位与已选应用服务的工作区域。
2. 在 `/` 聚合所有应用服务指标。拒绝，因为它跨越 Scope 隔离边界，并可能暴露未授权的设计事实。
3. 将定位页做成静态营销页。拒绝，因为该页面必须引导用户理解实际的 SpecForge 治理概念和可达目的地。

### 后果

- 积极影响：新用户可以在进入工作台前理解系统模型。
- 积极影响：根路由不依赖已编写设计事实数据，因此按构造满足 Scope 安全。
- 积极影响：画布在完整动效和减少动效环境中都提供说明性的最终状态，且不引入加载器或数据查询。
- 积极影响：现有仪表盘在 `/workspace?scope=<applicationServiceId>` 下保持操作工作台定位。
- 权衡：导航仅在进入范围化目的地时保留已选应用服务 Scope。
- 权衡：跨应用服务比较仍是需要单独授权的延期能力。

### 约束

- 英文为规范内容，所有面向人的定位概念均提供中文覆盖。
- `/` 不得导入范围化资产加载器、仪表盘加载器，也不得聚合已编写事实。
- 范围化目的地必须使用已选应用服务 ID，并保留其精确 Scope 边界。
- 减少动效时必须以静态最终状态呈现概览画布，并禁用动画和过渡。
- Proposal、Context Pack、ADR、类型化链接和证据只能通过 MCP 写入精确所属的 Designer Scope。
- 只有 MCP 持久化并回读精确 ID、Scope、本地化、类型化链接和证据后才能完成。

### 证据

- **已验证：** `.\\node_modules\\.bin\\vitest.cmd run apps/web/lib/__tests__/overview.test.ts` 以退出码 0 完成：1 个测试文件、8 个测试通过。
- **已验证：** `pnpm --filter @specforge/web lint` 以退出码 0 完成，未发现 ESLint 警告或错误。Next.js 输出了弃用和工作区根目录/额外锁文件警告。
- **已验证：** 在 1440x960 下以英文和中文、在 390x844 下以英文和中文检查 `http://localhost:3002/?scope=com.huawei.celon.desiner`。画布和操作控件可读，操作控件无重叠，移动端无水平溢出，`/` 无加载态、无范围化计数、无已编写资产数据，工作台、关系图谱和治理操作均保留精确 Scope 目的地。
- **已验证：** 针对 `apps/web/app/styles/globals.css` 的减少动效检查确认存在 `@media (prefers-reduced-motion: reduce)`，且 `.sf-overview-canvas [data-motion]` 对概览动效元素和最终状态应用 `animation: none`、`transition: none`、`transform: none` 与 `opacity: 1`。
- **已验证：** `pnpm db:generate` 在该工作树中重新生成了 `@prisma/client`，使 MCP 服务能够携带规范数据库 URL 启动。
- **已验证：** `$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; pnpm design-facts:sync` 以退出码 0 完成，并将全部 12 项基线决策（含 `adr-architecture-overview-home`）回读为 complete。
- **已验证：** `$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'; pnpm design-facts:check` 在针对 `specforge_canonical` 的串行重跑后以退出码 0 完成，无缺失、不匹配、越界或受阻记录。
