# ADR-0013: Architecture Overview Home

## Status

**Accepted; implementation locally verified; MCP synchronized and read back.**

- Stable ADR/MCP ID: `adr-architecture-overview-home`
- Matching Proposal ID: `proposal-architecture-overview-home`
- Matching Context Pack ID: `ctx-architecture-overview-home`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge needs a system-orientation entry point that explains its MCP-first design-fact lifecycle without turning the application root into an operational dashboard. Application-service scopes are an isolation boundary: authored design facts, derived counts, and dashboard metrics belong to one selected application service and must not be read or aggregated merely because a visitor opens the root route.

## Decision

Use `/` as a static bilingual architecture orientation. It presents the design-fact flow from Proposal through ADR, assets, rules and contracts, Context Pack, and evidence, plus navigation into a selected application-service workspace. Use `/workspace` as the scoped operational dashboard. The root route must not load, join, count, or aggregate authored design facts across application services.

## Alternatives

1. Keep the scoped dashboard at `/`. Rejected because it conflates product orientation with a selected application-service work area.
2. Aggregate all application-service metrics on `/`. Rejected because it crosses the scope-isolation boundary and can expose unauthorized design facts.
3. Make the orientation page a static marketing page. Rejected because the page must navigate users through the actual SpecForge governance concepts and destinations.

## Consequences

- Positive: New users can understand the system model before entering a workspace.
- Positive: Root-route rendering remains independent of authored design-fact data and scope-safe by construction.
- Positive: The existing dashboard keeps its operational focus under `/workspace?scope=<applicationServiceId>`.
- Tradeoff: Navigation must preserve the selected application-service scope only when entering scoped destinations.
- Tradeoff: Cross-service comparison remains a separately authorized, deferred capability.

## Constraints

- English is canonical and every human-facing orientation concept has a Chinese overlay.
- `/` must not import scoped asset loaders, dashboard loaders, or aggregate authored facts.
- Scoped destinations must use the selected application-service ID and retain its exact scope boundary.
- Proposal, Context Pack, ADR, typed links, and evidence are written only through MCP in the exact owning Designer Scope.
- Completion requires MCP persistence and read-back of the exact IDs, scope, localization, typed links, and evidence.

## Evidence

- **Verified:** `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts apps/web/app/__tests__/overview-page.test.tsx apps/web/components/__tests__/app-shell.test.tsx` passed 3 files and 11 tests during the implemented stage.
- **Verified:** `pnpm --filter @specforge/web lint` passed during the implemented stage.
- **Blocked outside this feature change range:** Web typecheck stops at `apps/web/lib/db.ts(1,10)` because generated `@prisma/client` does not export `PrismaClient`.
- **MCP synchronized and read back:** `pnpm design-facts:sync` persisted the ADR, Proposal, Context Pack, Evidence, and typed links through the exact Designer Scope. `pnpm design-facts:check` verified all ten decisions with no missing, mismatched, out-of-scope, or blocked facts. The focused persistence, tools, and manifest suites passed 54 tests.

## 中文本地化 / Chinese Localization

**同步完成说明：** 2026-07-29 已重新生成 Prisma Client，并通过仅本机可访问的权威 PostgreSQL 隧道执行 `pnpm design-facts:sync` 和 `pnpm design-facts:check`。首页 ADR、Proposal、Context Pack、Evidence 与有类型关系均已在精确 Designer Scope 中写入并回读；10 项决策均无缺失、不匹配、越界或受阻事实。以下历史“同步受阻”描述由本说明取代。

### 状态

**已接受；实现已完成本地验证；MCP 同步受阻。**

- 稳定 ADR/MCP ID：`adr-architecture-overview-home`
- 对应 Proposal ID：`proposal-architecture-overview-home`
- 对应 Context Pack ID：`ctx-architecture-overview-home`
- 所属 `architectureScope.applicationServiceId`：`com.huawei.celon.desiner`
- 所属 `architectureScope.scopePath`：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

### 背景

SpecForge 需要一个系统定位入口，用于说明 MCP-first 设计事实生命周期，而不能把应用根路由变成操作仪表盘。应用服务 Scope 是隔离边界：已编写的设计事实、派生计数和仪表盘指标都属于一个已选应用服务，访问根路由本身不得读取或聚合这些数据。

### 决策

将 `/` 作为静态双语架构定位页。它展示从 Proposal、ADR、资产、规则与契约、Context Pack 到证据的设计事实流，并提供进入已选应用服务工作台的导航。将 `/workspace` 作为范围化的操作仪表盘。根路由不得加载、关联、计数或聚合跨应用服务的已编写设计事实。

### 备选方案

1. 保留范围化仪表盘在 `/`。拒绝，因为这会混淆系统定位与已选应用服务的工作区域。
2. 在 `/` 聚合所有应用服务指标。拒绝，因为它跨越 Scope 隔离边界，并可能暴露未授权的设计事实。
3. 将定位页做成静态营销页。拒绝，因为该页面必须引导用户理解实际的 SpecForge 治理概念和可达目的地。

### 后果

- 积极影响：新用户可以在进入工作台前理解系统模型。
- 积极影响：根路由不依赖已编写设计事实数据，因此按构造满足 Scope 安全。
- 积极影响：现有仪表盘在 `/workspace?scope=<applicationServiceId>` 下保持操作工作台定位。
- 权衡：导航仅在进入范围化目的地时保留已选应用服务 Scope。
- 权衡：跨应用服务比较仍是需要单独授权的延期能力。

### 约束

- 英文为规范内容，所有面向人的定位概念均提供中文覆盖。
- `/` 不得导入范围化资产加载器、仪表盘加载器，也不得聚合已编写事实。
- 范围化目的地必须使用已选应用服务 ID，并保留其精确 Scope 边界。
- Proposal、Context Pack、ADR、类型化链接和证据只能通过 MCP 写入精确所属的 Designer Scope。
- 只有 MCP 持久化并回读精确 ID、Scope、本地化、类型化链接和证据后才能完成。

### 证据

- **已验证：** 实现阶段运行 `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts apps/web/app/__tests__/overview-page.test.tsx apps/web/components/__tests__/app-shell.test.tsx`，3 个文件、11 个测试通过。
- **已验证：** 实现阶段 `pnpm --filter @specforge/web lint` 通过。
- **功能变更范围外的阻塞：** Web typecheck 在 `apps/web/lib/db.ts(1,10)` 停止，原因是生成的 `@prisma/client` 未导出 `PrismaClient`。
- **MCP synchronization blocked：** 负责人：SpecForge Architecture。`pnpm design-facts:sync` 和 `pnpm design-facts:check` 无法启动 MCP 服务，因为 `apps/mcp-server/src/persistence.ts:1` 导入 `PrismaClient`，但生成的 `@prisma/client` 模块未导出该符号。MCP 客户端收到 `MCP error -32000: Connection closed`；此决策的 ADR、Proposal、Context Pack、证据和类型化链接均未持久化或回读。重试触发条件：在已配置运行环境中重新生成或修复 Prisma Client，然后在精确 Designer Scope 下运行 `pnpm design-facts:sync` 与 `pnpm design-facts:check`，并确认已持久化的 ID、本地化字段以及 `IMPLEMENTS_DECISION`、`IMPLEMENTS_CONTEXT_FOR`、`DECIDES` 和 `VALIDATES` 链接。
