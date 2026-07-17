# ADR 0002: MCP-First Design Authoring

## Status

**Implemented:** MCP tools are the application write boundary for design assets, proposals, context packs, and typed links.

**Local-verified:** Focused MCP tests exist and prior implementation commits record this behavior; fresh execution in this worktree is blocked because the `vitest` binary is unavailable.

**Deferred:** A production MCP synchronization receipt and read-back for this repository ADR are deferred until the synchronization workflow is run against the configured MCP service.

**Stable ID:** `adr-mcp-first-architecture`

**Owning architectureScope:** `com.huawei.celon.desiner` with scope path `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.

**中文本地化覆盖：**

**已实现：** MCP 工具是设计资产、提案、上下文包和类型化链接的应用写入边界。

**本地验证状态：** 聚焦 MCP 测试已存在，之前的实现提交记录了这些行为；当前工作区无法运行 `vitest`，因此未完成新鲜执行。

**延期：** 本仓库 ADR 的生产 MCP 同步回执和回读验证延期到针对已配置 MCP 服务运行同步流程之后。

**稳定 ID：** `adr-mcp-first-architecture`

**所属 architectureScope：** `com.huawei.celon.desiner`，范围路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。

## Context

Design authoring must have one auditable write path. Direct database writes or Web-only mutation paths can bypass scope authorization, localization validation, audit events, and relationship checks. MCP provides the shared boundary used by human workflows and agents.

**中文本地化覆盖：**

设计编写必须只有一条可审计的写入路径。直接数据库写入或仅 Web 变更路径可能绕过范围授权、本地化校验、审计事件和关系检查。MCP 提供人类工作流与代理共同使用的边界。

## Decision

All authored design facts in this service scope are written through MCP tools. The write path validates the exact scope, canonical English fields, complete Chinese overlays, stable IDs, and typed relationship targets before PostgreSQL persistence. PostgreSQL remains authoritative; graph projections are downstream and never authoring sources.

**中文本地化覆盖：**

本服务范围内的所有已编写设计事实都通过 MCP 工具写入。写入路径在 PostgreSQL 持久化前校验精确范围、英文规范字段、完整中文覆盖、稳定 ID 和类型化关系目标。PostgreSQL 保持权威；图投影是下游派生数据，绝不是编写来源。

## Alternatives

1. **Let Web routes write directly to repositories.** Rejected because agents and Web would have different enforcement.
2. **Treat PostgreSQL as the public authoring API.** Rejected because persistence would be exposed without the MCP contract, audit, and tool validation.
3. **Make graph storage the authoring source.** Rejected because projections and traversal concerns must not define transactional truth.

**中文本地化覆盖：**

1. **让 Web 路由直接写入仓储。** 拒绝，因为代理和 Web 会采用不同的约束执行方式。
2. **将 PostgreSQL 作为公开编写 API。** 拒绝，因为这会在没有 MCP 合约、审计和工具校验的情况下暴露持久化层。
3. **将图存储作为编写来源。** 拒绝，因为投影和遍历不应定义事务真相。

## Consequences

The write contract is centralized and auditable, and agent and human paths converge on the same validation. Authoring depends on MCP availability and incurs an extra boundary call. A failed write blocks completion and must become visible deferred work rather than a silent local-only change.

**中文本地化覆盖：**

写入合约集中且可审计，代理和人类路径通过同一校验收敛。设计编写依赖 MCP 可用性并增加一次边界调用。写入失败会阻止完成，必须呈现为可见的延期工作，而不能成为静默的仅本地变更。

## Constraints

- Every mutation must include the exact owning application-service scope.
- MCP IDs are stable and must match the repository ADR IDs.
- PostgreSQL is authoritative for authored assets, relationship events, audit records, and outbox state.
- Graph projection, local fixtures, and repository Markdown cannot substitute for a successful MCP write.

**中文本地化覆盖：**

- 每次变更都必须包含精确的所属应用服务范围。
- MCP ID 必须稳定，并与仓库 ADR ID 一致。
- PostgreSQL 对已编写资产、关系事件、审计记录和 outbox 状态保持权威。
- 图投影、本地 fixture 和仓库 Markdown 不能替代成功的 MCP 写入。

## Evidence

- `pnpm exec vitest run packages/core/src/__tests__/mcp-services.test.ts`: blocked before test startup because `vitest` is unavailable in this worktree.
- `rg -n "createAdr|upsert.*Proposal|upsert.*Context|link_assets|architectureScope" apps/mcp-server/src`: local inspection of the MCP-first write boundary.
- Production MCP write and read-back for this ADR: deferred and not claimed as verified.

**中文本地化覆盖：**

- `pnpm exec vitest run packages/core/src/__tests__/mcp-services.test.ts`：在测试启动前因当前工作区缺少 `vitest` 而阻塞。
- `rg -n "createAdr|upsert.*Proposal|upsert.*Context|link_assets|architectureScope" apps/mcp-server/src`：本地检查 MCP 优先的写入边界。
- 本 ADR 的生产 MCP 写入和回读：延期，不声称已验证。

## MCP Record

- **MCP ADR ID:** `adr-mcp-first-architecture` (existing stable ID supplied for this decision).
- **Scope:** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **Matching Proposal:** deferred; no stable Proposal ID was supplied or verified in this assignment.
- **Matching Context Pack:** deferred; no stable Context Pack ID was supplied or verified in this assignment.
- **Related assets and typed links:** MCP write tools, scoped persistence, audit/relationship events, and PostgreSQL authority; exact link targets remain deferred until read-back.
- **Synchronization state:** `implemented; local verification blocked; production synchronization deferred`. Record **`MCP synchronization blocked`** on any failed attempt, including reason and retry trigger.

**中文本地化覆盖：**

- **MCP ADR ID：** `adr-mcp-first-architecture`（本决策使用任务提供的现有稳定 ID）。
- **范围：** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **匹配 Proposal：** 延期；本任务未提供或验证稳定 Proposal ID。
- **匹配 Context Pack：** 延期；本任务未提供或验证稳定 Context Pack ID。
- **相关资产和类型化链接：** MCP 写工具、范围化持久化、审计/关系事件和 PostgreSQL 权威性；精确链接目标将在回读验证时补齐。
- **同步状态：** `implemented; local verification blocked; production synchronization deferred`。任何失败尝试都必须记录 **`MCP synchronization blocked`**、失败原因和重试触发条件。
