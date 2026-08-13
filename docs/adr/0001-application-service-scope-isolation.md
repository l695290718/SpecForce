# ADR 0001: Application-Service Scope Isolation

## Status

**Implemented:** Scope resolution, persisted scope columns, scoped MCP reads and writes, and Web scope propagation are implemented in the checked-out branch.

**Local-verified:** Focused test files exist and prior implementation commits record this behavior; fresh execution in this worktree is blocked because the `vitest` binary is unavailable.

**Deferred:** Cross-service aggregation and production identity/authorization integration remain deferred. The repository-only ADR does not claim MCP persistence for this record until a scoped MCP write and read-back are performed.

The Web 3A boundary now supports an explicitly configured static Principal for local or single-host deployment. This is a deployment identity, not a production IdP integration: it must carry exact application-service grants, and missing or malformed claims fail closed. Production OIDC or gateway integration continues through the `WebPrincipalResolver` boundary.

**Stable ID:** `adr-application-service-scope-isolation`

**Owning architectureScope:**

```json
{
  "applicationServiceId": "com.huawei.celon.desiner",
  "scopePath": "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
}
```

**中文本地化覆盖：**

**已实现：** 当前分支已实现范围解析、持久化范围列、MCP 范围化读写以及 Web 范围传递。

**本地验证状态：** 聚焦测试文件已存在，之前的实现提交记录了这些行为；当前工作区无法运行 `vitest`，因此未完成新鲜执行。

**延期：** 跨服务聚合以及生产身份/授权集成仍然延期。在完成范围化 MCP 写入和回读之前，本仓库 ADR 不声称该记录已完成 MCP 持久化。

**稳定 ID：** `adr-application-service-scope-isolation`

**所属 architectureScope：** `applicationServiceId` 为 `com.huawei.celon.desiner`，`scopePath` 为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。

## Context

SpecForge exposes design assets through Web views and MCP tools. An implicit default or a module-level context can leak assets between application services and makes authorization inconsistent. The initial owned service is `com.huawei.celon.desiner`; every authored asset, proposal, context pack, and relationship must carry that exact application-service identity and materialized path.

**中文本地化覆盖：**

SpecForge 通过 Web 视图和 MCP 工具暴露设计资产。隐式默认范围或模块级上下文可能导致应用服务之间的资产泄漏，并使授权行为不一致。当前所属服务是 `com.huawei.celon.desiner`；所有已编写资产、提案、上下文包和关系都必须携带完全一致的应用服务身份及其物化路径。

## Decision

Normal reads and writes require an explicit, authorized application-service scope. The shared scope model validates service level and actor access; persistence filters use both `applicationServiceId` and `scopePath`; MCP is the write boundary. Cross-service reads are permitted only through an explicitly authorized future impact-analysis flow.

**中文本地化覆盖：**

普通读写必须要求明确且已授权的应用服务范围。共享范围模型校验应用服务层级和操作者权限；持久化过滤同时使用 `applicationServiceId` 与 `scopePath`；MCP 是写入边界。跨服务读取只能通过未来明确授权的影响分析流程进行。

## Alternatives

1. **Implicitly default every request to the Designer service.** Rejected because missing context becomes silent data access and hides caller errors.
2. **Authorize only at the Web layer.** Rejected because MCP and other callers could bypass the same isolation rule.
3. **Use only a hierarchical parent scope.** Rejected because a module scope is too broad for application-service ownership and indexed filtering.

**中文本地化覆盖：**

1. **将每个请求隐式默认为 Designer 服务。** 拒绝，因为缺少上下文会变成静默的数据访问并掩盖调用方错误。
2. **只在 Web 层授权。** 拒绝，因为 MCP 和其他调用方可以绕过同一隔离规则。
3. **只使用层级父范围。** 拒绝，因为模块范围对于应用服务所有权和索引过滤过于宽泛。

## Consequences

The system gains predictable isolation, consistent authorization, and auditable scope identity. Every caller must carry scope context, database queries retain two scope predicates, and links require scope-safe endpoints. Cross-service analysis becomes an explicit product capability rather than an accidental side effect.

**中文本地化覆盖：**

系统获得可预测的隔离、一致的授权和可审计的范围身份。每个调用方都必须携带范围上下文，数据库查询保留两个范围谓词，关系链接必须指向范围安全的端点。跨服务分析成为明确的产品能力，而不是意外副作用。

## Constraints

- Scope is exactly `com.huawei.celon.desiner` and its exact `scopePath` in this ADR.
- PostgreSQL is authoritative for authored scoped records and relationship events; graph data is derived.
- No missing, unknown, non-service, or unauthorized scope may fall back to the Designer service.
- Production identity, tenant policy, and cross-service authorization are deferred and must not be inferred from the mock actor.

**中文本地化覆盖：**

- 本 ADR 的范围严格是 `com.huawei.celon.desiner` 及其精确 `scopePath`。
- PostgreSQL 对已编写的范围记录和关系事件保持权威；图数据是派生数据。
- 缺失、未知、非应用服务或未授权范围都不得回退到 Designer 服务。
- 生产身份、租户策略和跨服务授权已延期，不得从模拟操作者推断。

## Evidence

- `pnpm --filter @specforge/web typecheck` passed after wiring Web 3A to the configured auth mode; focused Principal and query tests passed 11/11. Static claims authorize the exact `com.huawei.celon.desiner` application service, while missing or malformed claims fail closed.
- `docker compose --env-file deploy/.env.example -f deploy/compose.yaml config --quiet` and `powershell -NoProfile -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly` passed after adding the required Web principal configuration to deployment checks.
- `SPECFORGE_APPLICATION_SERVICE_ID=com.huawei.celon.desiner SPECFORGE_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner pnpm design-facts:federation:check` returned `blocking:false`; exact-Scope design-fact reconciliation returned no missing, mismatched, outOfScope, or blocked facts.

- `pnpm exec vitest run packages/core/src/__tests__/architecture-scope.test.ts apps/web/lib/__tests__/scope.test.ts`: blocked before test startup because `vitest` is unavailable in this worktree.
- `pnpm exec vitest run packages/core/src/__tests__/mcp-services.test.ts`: blocked before test startup for the same missing-binary reason.
- `git log --oneline --all -- apps/web/lib/scope.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/persistence.ts`: implementation history is present in the checked-out repository.

**中文本地化覆盖：**

- `pnpm exec vitest run packages/core/src/__tests__/architecture-scope.test.ts apps/web/lib/__tests__/scope.test.ts`：在测试启动前因当前工作区缺少 `vitest` 而阻塞。
- `pnpm exec vitest run packages/core/src/__tests__/mcp-services.test.ts`：同样因缺少该二进制而在测试启动前阻塞。
- `git log --oneline --all -- apps/web/lib/scope.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/persistence.ts`：当前仓库包含对应实现历史。

## Reconciliation Update (2026-07-19)

This update supersedes earlier statements that this ADR, its matching Proposal/Context Pack, typed links, or evidence were deferred solely because MCP synchronization had not run. The baseline record is now persisted and read back through MCP in its exact Designer scope. Cross-service aggregation and production identity/authorization remain deferred.

### 对账更新（2026-07-19）

本更新覆盖此前仅因未执行 MCP 同步而将本 ADR、关联 Proposal/Context Pack、类型化关系或证据标记为延期的描述。基线记录现已在精确 Designer Scope 中通过 MCP 持久化并回读验证。跨服务聚合和生产身份/授权仍保持延期。

## MCP Record

- **MCP ADR ID:** `adr-application-service-scope-isolation`
- **Scope:** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **Matching Proposal:** deferred; no stable Proposal ID was supplied or verified in this assignment.
- **Matching Context Pack:** deferred; no stable Context Pack ID was supplied or verified in this assignment.
- **Related assets and typed links:** scope authorization, scoped persistence, MCP read/write boundary, and Web scope resolver; typed MCP links are deferred until synchronization.
- **Evidence references:** the commands in Evidence.
- **Synchronization state:** `deferred` for this repository-only change. If a write fails, record **`MCP synchronization blocked`**, the failure reason, and retry trigger in the tracked backlog fact.

**中文本地化覆盖：**

- **MCP ADR ID：** `adr-application-service-scope-isolation`
- **范围：** `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **匹配 Proposal：** 延期；本任务未提供或验证稳定 Proposal ID。
- **匹配 Context Pack：** 延期；本任务未提供或验证稳定 Context Pack ID。
- **相关资产和类型化链接：** 范围授权、范围化持久化、MCP 读写边界和 Web 范围解析器；类型化 MCP 链接将在同步时补齐。
- **证据引用：** Evidence 中的命令。
- **同步状态：** 本次仅仓库变更，状态为 `deferred`。如果写入失败，必须在跟踪的待办事实中记录 **`MCP synchronization blocked`**、失败原因和重试触发条件。
