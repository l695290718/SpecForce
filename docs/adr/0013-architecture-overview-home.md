# ADR-0013: Architecture Overview Home

## Status

**Accepted; introduction verification evidence repaired; MCP synchronization was not rerun in this restoration turn.**

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

- **Verified:** `.\\node_modules\\.bin\\vitest.cmd run apps/web/lib/__tests__/overview.test.ts scripts/design-fact-manifest.test.ts` exited 0: 2 test files and 14 tests passed.
- **Verified:** `pnpm --filter @specforge/web lint` exited 0 with no ESLint warnings or errors. Next.js emitted its deprecation and workspace-root/extra-lockfile warnings.
- **Verified:** Bundled Playwright browser inspection on the system Chrome channel checked `http://localhost:3002/?scope=com.huawei.celon.desiner` at 1440x960 and 390x844 in English and Chinese. Desktop English and Chinese kept all eight stages on one logical row with only 2px and 3px vertical variance respectively, so stage 6 remained directly before stages 7 and 8 instead of pointing into empty space. Desktop connectors stayed visible, mobile connectors stayed hidden, action links did not overlap, mobile had no horizontal overflow, `/` showed no dashboard signals, and all three action links preserved the exact scoped destinations.
- **Verified:** Bundled Playwright reduced-motion inspection on the system Chrome channel checked `http://localhost:3002/?scope=com.huawei.celon.desiner` at 1440x960 in English with `reducedMotion: 'reduce'`. `window.matchMedia('(prefers-reduced-motion: reduce)').matches` was true, overview motion targets resolved to `animationName: none`, `animationDuration: 0s`, `transitionDuration: 0s`, `transform: none`, and `opacity: 1`, the connector animation resolved to `none`, and sampled stage positions stayed unchanged over 250ms.
- **Not rerun in this restoration turn:** `pnpm design-facts:sync` and serial `pnpm design-facts:check`. Per the user’s instruction, no additional MCP operations were executed beyond previously completed evidence.

## 中文本地化 / Chinese Localization

### 标题

架构概览首页

### 状态

**已接受；引导页验证证据已修复；本次恢复回合未重新运行 MCP 同步。**

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

- **已验证：** `.\\node_modules\\.bin\\vitest.cmd run apps/web/lib/__tests__/overview.test.ts scripts/design-fact-manifest.test.ts` 以退出码 0 完成：2 个测试文件、14 个测试通过。
- **已验证：** `pnpm --filter @specforge/web lint` 以退出码 0 完成，未发现 ESLint 警告或错误。Next.js 输出了弃用和工作区根目录/额外锁文件警告。
- **已验证：** 通过系统 Chrome 通道上的 bundled Playwright，在 1440x960 与 390x844 下分别以英文和中文检查 `http://localhost:3002/?scope=com.huawei.celon.desiner`。英文与中文桌面视图都让 8 个阶段保持在同一逻辑行内，顶部偏差分别仅为 2px 和 3px，因此第 6 阶段直接位于第 7、8 阶段之前，不会指向空白区域。桌面连接箭头保持可见，移动端连接箭头保持隐藏，操作链接无重叠，移动端无水平溢出，`/` 未显示仪表盘信号，且 3 个操作链接都保留了精确的 Scope 目的地。
- **已验证：** 通过系统 Chrome 通道上的 bundled Playwright，在英文 1440x960 视口下以 `reducedMotion: 'reduce'` 检查 `http://localhost:3002/?scope=com.huawei.celon.desiner`。`window.matchMedia('(prefers-reduced-motion: reduce)').matches` 为 true，概览动效目标解析为 `animationName: none`、`animationDuration: 0s`、`transitionDuration: 0s`、`transform: none` 与 `opacity: 1`，连接箭头动画也解析为 `none`，并且连续 250ms 采样的阶段位置保持不变。
- **本次恢复回合未重跑：** `pnpm design-facts:sync` 与串行 `pnpm design-facts:check`。按照用户指示，除既有已完成证据外，本回合未再执行额外 MCP 操作。
