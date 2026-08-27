# ADR-0043: Unified Scoped Read Model Performance

## Status

Accepted and implemented under exact-Scope design-change-sessions `design-change-session:5e1f747e-e1c6-4acd-82e4-1b4f4dfd0b24` and `design-change-session:c2366b3a-b5f6-4924-92a8-9c678b8d32ca` in the Designer Scope. Repository and MCP records are synchronized by the filtered design-fact sync and read-back checks for this ADR.

## Context

Web asset lists, MCP search, and derived graph reads could load the complete application-service catalog before returning a first page. That inflated latency, response size, and agent token usage, while making the read boundary harder to reason about at enterprise scale.

## Decision

1. Use a shared database-independent scoped-read contract with bounded pages, signed opaque cursors, catalog/projection version binding, and deterministic result digests.
2. Keep PostgreSQL authored tables authoritative and maintain a rebuildable bilingual `AssetSearchProjection` for cross-type summary search. Projection updates happen in the same transaction as governed MCP writes; existing records are backfilled with `pnpm design-read:rebuild`.
3. Make Web typed lists use Scope-qualified summary reads and direct detail reads. Data-model ER graph loading is on demand and starts with a bounded page rather than running for list view.
4. Add additive MCP pagination metadata, bounded `query_asset_links`, and bounded/focused `query_asset_graph`. Compatibility tools remain available; graph responses report partial results and truncation reasons.
5. Treat cursor reuse across Scope, principal, locale, query, projection version, or catalog version as invalid. Never use an unversioned TTL cache or silently aggregate across application services.
6. Derive graph waterline digests from the monotonic exact-Scope catalog and relationship versions instead of rescanning append-only revision and event ledgers on every request.
7. Use a single-row exact-Scope detail read for asset detail pages, loading only the target asset and proposal Context Packs required by proposal governance checks.

## Alternatives

- Keep full-catalog reads: rejected because first-page latency and agent token cost grow with every asset type.
- Add an unversioned TTL cache: rejected because stale or cross-Scope data would be difficult to audit and invalidate.
- Introduce a graph database for this read path: deferred because PostgreSQL projections satisfy the bounded summary/search requirement without a second authoritative store.

## Consequences

- First-page reads avoid full-catalog materialization in the optimized Web and MCP paths, reducing payload and token pressure.
- Existing authored assets remain intact; the search projection can be rebuilt after deployment or migration.
- A fresh write is visible to the next read after the transaction commits. A missing projection temporarily uses the bounded Web fallback or the legacy MCP compatibility path until backfill completes.
- Graph waterline reads no longer materialize the full revision/event ledgers; monotonic Scope versions still invalidate cursors and detect snapshot changes.
- Asset detail pages avoid loading unrelated assets and links; proposal detail reads additionally load only Context Packs belonging to that proposal.
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
- `pnpm --filter @specforge/web typecheck` passed after direct-detail and version-waterline optimization.
- Focused Web read tests passed: 4 files and 22 tests.
- Docker Web image rebuilt and 3010 restarted successfully; `/healthz` returned 200.
- Live 3010 checks after restart: `/api/data-model-graph` returned 200 and 15,494 bytes; repeated timings were 958, 828, 525, and 675 ms. `/api/assets/{data-models,apis,events,rules}` returned 200 with repeated timings between 11 and 40 ms.

## MCP Record

- MCP ADR ID: `adr-unified-scoped-read-model-performance`
- Proposal: `proposal-scoped-read-model-performance`
- Context Pack: `ctx-scoped-read-model-performance`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, `data-specforge-3a-projection-read-model`

## 中文本地化覆盖

### 标题

统一 Scope 读取模型性能

### 状态

已接受，并在 Designer Scope 的精确 Scope 设计变更会话 `design-change-session:5e1f747e-e1c6-4acd-82e4-1b4f4dfd0b24`、`design-change-session:c2366b3a-b5f6-4924-92a8-9c678b8d32ca` 下实现。仓库记录与 MCP 记录通过本 ADR 的过滤同步和回读检查保持一致。

### 背景

Web 设计资产列表、MCP 搜索和派生图读取在返回第一页前可能加载整个应用服务目录，导致延迟、响应体和 Agent Token 消耗增长，也让企业规模下的读取边界更难治理。

### 决策

1. 采用与数据库无关的统一 scoped-read 契约，支持有界分页、签名不透明游标、目录/投影版本绑定和确定性结果摘要。
2. PostgreSQL 编写表保持权威，并维护可重建的双语 `AssetSearchProjection` 用于跨类型概要搜索。投影与受治理 MCP 写入在同一事务中更新；存量记录通过 `pnpm design-read:rebuild` 回填。
3. Web 类型列表使用按 Scope 限定的概要读取和直接详情读取；数据模型 ER 图按需加载，列表视图不再触发图请求，并从有界页开始。
4. MCP 增加分页元数据、有界 `query_asset_links` 和有焦点/上限的 `query_asset_graph`。兼容工具继续保留；图响应明确返回 partial 和截断原因。
5. Scope、主体、语言、查询、投影版本或目录版本变化时，游标必须失效。禁止使用无版本 TTL 缓存，也禁止跨应用服务隐式聚合。
6. 图读取水位摘要使用精确 Scope 内单调递增的目录版本和关系版本，不再每次扫描追加式修订日志和事件日志。
7. 资产详情页按精确 Scope 读取单条目标资产；提案详情只额外读取该提案需要的 Context Pack。

### 备选方案

- 保留完整目录读取：否决，因为每增加一种资产类型，首页延迟和 Agent Token 成本都会增长。
- 增加无版本 TTL 缓存：否决，因为陈旧或跨 Scope 数据难以审计和失效。
- 为该读取路径引入图数据库：延期，因为 PostgreSQL 投影已满足有界概要/搜索需求，不需要第二个权威存储。

### 后果

- 优化后的 Web 和 MCP 首页读取不再物化完整目录，降低响应体和 Token 压力。
- 既有设计资产保持不变；部署或迁移后可以重新构建搜索投影。
- 事务提交后下一次读取即可看到新写入；投影尚未回填时，Web 使用有界回退路径，MCP 使用旧兼容路径。
- 图读取水位不再物化完整修订/事件日志；单调 Scope 版本仍用于游标失效和快照变化检测。
- 资产详情页不再加载无关资产和关系；提案详情只读取属于该提案的上下文包。
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
- 直接详情读取和版本水位优化后，`pnpm --filter @specforge/web typecheck` 通过。
- Web 聚焦读取测试通过：4 个文件、22 个测试。
- Docker Web 镜像重建并成功重启 3010；`/healthz` 返回 200。
- 重启后的 3010 实测：`/api/data-model-graph` 返回 200、15,494 字节，连续耗时 958、828、525、675 毫秒；`/api/assets/{data-models,apis,events,rules}` 均返回 200，连续耗时 11-40 毫秒。
