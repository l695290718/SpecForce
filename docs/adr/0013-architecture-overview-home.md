# ADR-0013: Architecture Overview Home

## Status

**Accepted; introduction verification complete; MCP synchronization and serial read-back verified.**

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
- **MCP synchronized and read back:** With `DATABASE_URL=postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public`, `pnpm design-facts:sync` returned all 12 baseline decisions as complete, including `adr-architecture-overview-home`; the following serial `pnpm design-facts:check` returned no missing, mismatched, out-of-scope, or blocked records.

## 中文本地化 / Chinese Localization

### 标题

架构概览首页

### 状态

**已接受；引导页验证完成；MCP 同步与串行回读已验证。**

- 稳定 ADR/MCP ID：`adr-architecture-overview-home`
- 对应 Proposal ID：`proposal-architecture-overview-home`
- 对应 Context Pack ID：`ctx-architecture-overview-home`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

### 背景

SpecForge 需要一个系统导向入口，用于解释其以 MCP 为先的设计事实生命周期，同时不能把应用根路由变成运维仪表盘。应用服务 Scope 是隔离边界：已编写的设计事实、派生计数和仪表盘指标都属于某一个被选定的应用服务，不能仅因为访问者打开根路由就被读取或聚合。

### 决策

将 `/` 作为静态双语架构定位页。改进后的引导页使用深墨色蓝图画布、分阶段生命周期流和有类型资产星图，说明从变更到 Proposal、ADR、设计资产、规则与契约、治理、Context Pack 和证据的过程。页面提供进入所选应用服务工作区、关系分析和治理检查的保留 Scope 导航。将 `/workspace` 作为带范围的操作仪表盘。根路由不得加载、关联、计数或聚合跨应用服务的已编写设计事实。

### 备选方案

1. 保留范围化仪表盘在 `/`。拒绝，因为这会混淆系统定位与已选应用服务的工作区域。
2. 在 `/` 聚合所有应用服务指标。拒绝，因为它跨越 Scope 隔离边界，并可能暴露未授权的设计事实。
3. 将定位页做成静态营销页。拒绝，因为该页面必须引导用户理解实际的 SpecForge 治理概念和可达目的地。

### 后果

- 积极影响：新用户可以在进入工作台前理解系统模型。
- 积极影响：根路由独立于已编写的设计事实数据，并且按构造保证 Scope 安全。
- 积极影响：画布在完整动效和减少动效环境中都提供说明性的最终状态，且不引入加载器或数据查询。
- 积极影响：现有仪表盘在 `/workspace?scope=<applicationServiceId>` 下保持其操作工作区定位。
- 权衡：导航仅在进入带范围的目标页面时保留所选应用服务 Scope。
- 权衡：跨服务比较仍然是需要单独授权的延期能力。

### 约束

- 英文是规范内容，所有面向人的导向概念都必须提供中文覆盖。
- `/` 不得导入带范围的资产加载器、仪表盘加载器，也不得聚合已编写事实。
- 带范围的目标页面必须使用所选应用服务 ID，并保留其精确 Scope 边界。
- 减少动效时必须以静态最终状态呈现概览画布，并禁用动画和过渡。
- Proposal、Context Pack、ADR、有类型链接和证据只能通过 MCP 写入精确所属的 Designer Scope。
- 只有在 MCP 持久化并回读精确 ID、Scope、本地化、有类型链接和证据后，才可视为完成。

### 证据

- **已验证：** `.\\node_modules\\.bin\\vitest.cmd run apps/web/lib/__tests__/overview.test.ts scripts/design-fact-manifest.test.ts` 以退出码 0 完成：2 个测试文件、14 个测试通过。
- **已验证：** `pnpm --filter @specforge/web lint` 以退出码 0 完成，未发现 ESLint 警告或错误。Next.js 输出了弃用和工作区根目录/额外锁文件警告。
- **已验证：** 通过系统 Chrome 通道上的 bundled Playwright，在 1440x960 与 390x844 下分别以英文和中文检查 `http://localhost:3002/?scope=com.huawei.celon.desiner`。英文与中文桌面视图都让 8 个阶段保持在同一逻辑行内，顶部偏差分别仅为 2px 和 3px，因此第 6 阶段直接位于第 7、8 阶段之前，而不是指向空白区域。桌面连接箭头保持可见，移动端连接箭头保持隐藏，操作链接无重叠，移动端无水平溢出，`/` 未显示仪表盘信号，且 3 个操作链接都保留了精确的 Scope 目标地址。
- **已验证：** 通过系统 Chrome 通道上的 bundled Playwright，在英文 1440x960 视口下以 `reducedMotion: 'reduce'` 检查 `http://localhost:3002/?scope=com.huawei.celon.desiner`。`window.matchMedia('(prefers-reduced-motion: reduce)').matches` 为 true，概览动效目标解析为 `animationName: none`、`animationDuration: 0s`、`transitionDuration: 0s`、`transform: none` 与 `opacity: 1`，连接箭头动画也解析为 `none`，并且连续 250ms 采样的阶段位置保持不变。
- **MCP 已同步并回读：** 使用 `DATABASE_URL=postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public` 时，`pnpm design-facts:sync` 将全部 12 项基线决策（包括 `adr-architecture-overview-home`）返回为 complete；随后串行执行的 `pnpm design-facts:check` 未发现缺失、不匹配、越界或受阻记录。
