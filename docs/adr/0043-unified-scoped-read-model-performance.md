# ADR-0043: Unified Scoped Read Model Performance

## Status

Accepted and implemented under exact-Scope design-change-session `design-change-session:5e1f747e-e1c6-4acd-82e4-1b4f4dfd0b24` in the Designer Scope. Repository and MCP records are synchronized by the filtered design-fact sync and read-back checks for this ADR.

## Context

Web asset lists, MCP search, and derived graph reads could load the complete application-service catalog before returning a first page. That inflated latency, response size, and agent token usage, while making the read boundary harder to reason about at enterprise scale.

## Decision

1. Use a shared database-independent scoped-read contract with bounded pages, signed opaque cursors, catalog/projection version binding, and deterministic result digests.
2. Keep PostgreSQL authored tables authoritative and maintain a rebuildable bilingual `AssetSearchProjection` for cross-type summary search. Projection updates happen in the same transaction as governed MCP writes; existing records are backfilled with `pnpm design-read:rebuild`.
3. Make Web typed lists use Scope-qualified summary reads and direct detail reads. Data-model ER graph loading is on demand and starts with a bounded page rather than running for list view.
4. Add additive MCP pagination metadata, bounded `query_asset_links`, and bounded/focused `query_asset_graph`. Compatibility tools remain available; graph responses report partial results and truncation reasons.
5. Treat cursor reuse across Scope, principal, locale, query, projection version, or catalog version as invalid. Never use an unversioned TTL cache or silently aggregate across application services.

## Alternatives

- Keep full-catalog reads: rejected because first-page latency and agent token cost grow with every asset type.
- Add an unversioned TTL cache: rejected because stale or cross-Scope data would be difficult to audit and invalidate.
- Introduce a graph database for this read path: deferred because PostgreSQL projections satisfy the bounded summary/search requirement without a second authoritative store.

## Consequences

- First-page reads avoid full-catalog materialization in the optimized Web and MCP paths, reducing payload and token pressure.
- Existing authored assets remain intact; the search projection can be rebuilt after deployment or migration.
- A fresh write is visible to the next read after the transaction commits. A missing projection temporarily uses the bounded Web fallback or the legacy MCP compatibility path until backfill completes.
- Large graph reads still require explicit bounds; the bounded MCP graph surface is a response and token guard, not a claim of production-scale graph query certification.

## Constraints

- Exact application-service Scope is mandatory: `com.huawei.celon.desiner` and `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- English remains canonical and Chinese is a complete human-facing overlay.
- PostgreSQL is authoritative; graph stores remain derived projections.
- Query-plan benchmark and live production-scale latency certification remain deferred until a representative enterprise dataset is available.

## Evidence

- `pnpm --filter @specforge/scoped-read typecheck` passed.
- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `pnpm --filter @specforge/web typecheck` passed.
- `pnpm exec vitest run apps/mcp-server/src/mcp-read-performance.test.ts apps/mcp-server/src/scoped-derived.test.ts apps/mcp-server/src/tools.test.ts` passed: 33 files and 474 tests in the current workspace scan.
- `pnpm exec vitest run apps/mcp-server/src/persistence.test.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/scoped-derived.test.ts` passed: 50 files and 964 tests in the current workspace scan.
- `pnpm exec prisma validate` passed.
- `pnpm design-read:rebuild` passed for the exact Designer Scope: 409 projection rows rebuilt at catalog version 1559.
- `git diff --check` passed with only Windows line-ending normalization warnings.

## MCP Record

- MCP ADR ID: `adr-unified-scoped-read-model-performance`
- Proposal: `proposal-scoped-read-model-performance`
- Context Pack: `ctx-scoped-read-model-performance`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, `data-specforge-3a-projection-read-model`

## 中文本地化覆盖

### 标题

统一 Scope 读取模型性能

### 状态

已接受，并在 Designer Scope 的精确 Scope 设计变更会话 `design-change-session:5e1f747e-e1c6-4acd-82e4-1b4f4dfd0b24` 下实现。仓库记录与 MCP 记录通过本 ADR 的过滤同步和回读检查保持一致。

### 背景

Web 设计资产列表、MCP 搜索和派生图读取在返回第一页前可能加载整个应用服务目录，导致延迟、响应体和 Agent Token 消耗增长，也让企业规模下的读取边界更难治理。

### 决策

1. 采用与数据库无关的统一 scoped-read 契约，支持有界分页、签名不透明游标、目录/投影版本绑定和确定性结果摘要。
2. PostgreSQL 编写表保持权威，并维护可重建的双语 `AssetSearchProjection` 用于跨类型概要搜索。投影与受治理 MCP 写入在同一事务中更新；存量记录通过 `pnpm design-read:rebuild` 回填。
3. Web 类型列表使用按 Scope 限定的概要读取和直接详情读取；数据模型 ER 图按需加载，列表视图不再触发图请求，并从有界页开始。
4. MCP 增加分页元数据、有界 `query_asset_links` 和有焦点/上限的 `query_asset_graph`。兼容工具继续保留；图响应明确返回 partial 和截断原因。
5. Scope、主体、语言、查询、投影版本或目录版本变化时，游标必须失效。禁止使用无版本 TTL 缓存，也禁止跨应用服务隐式聚合。

### 备选方案

- 保留完整目录读取：否决，因为每增加一种资产类型，首页延迟和 Agent Token 成本都会增长。
- 增加无版本 TTL 缓存：否决，因为陈旧或跨 Scope 数据难以审计和失效。
- 为该读取路径引入图数据库：延期，因为 PostgreSQL 投影已满足有界概要/搜索需求，不需要第二个权威存储。

### 后果

- 优化后的 Web 和 MCP 首页读取不再物化完整目录，降低响应体和 Token 压力。
- 既有设计资产保持不变；部署或迁移后可以重新构建搜索投影。
- 事务提交后下一次读取即可看到新写入；投影尚未回填时，Web 使用有界回退路径，MCP 使用旧兼容路径。
- 大图读取仍需显式上限；有界 MCP 图面是响应和 Token 保护，不代表已完成生产规模图查询认证。

### 约束

- 必须使用精确应用服务 Scope：`com.huawei.celon.desiner` 以及 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- 英文保持规范语言，中文保持完整的人类可读覆盖。
- PostgreSQL 保持权威；图数据库只能作为派生投影。
- 查询计划基准和生产规模延迟认证，待具备代表性企业数据集后再做。

### 证据

- `pnpm --filter @specforge/scoped-read typecheck` 通过。
- `pnpm --filter @specforge/mcp-server typecheck` 通过。
- `pnpm --filter @specforge/web typecheck` 通过。
- MCP 读取性能、精确 Scope 图读取和工具契约测试通过：当前工作区扫描共 33 个文件、474 个测试。
- MCP 持久化、工具和派生读取测试通过：当前工作区扫描共 50 个文件、964 个测试。
- `pnpm exec prisma validate` 通过。
- 精确 Designer Scope 回填 409 条投影记录，目录版本为 1559。
- `git diff --check` 通过，仅有 Windows 换行规范化提示。
