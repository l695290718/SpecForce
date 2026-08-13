# ADR-0014: Single Authoritative Local PostgreSQL

## Status

Accepted; local canonical database cutover verified and MCP synchronized on 2026-07-29.

## Context

Two independent Docker Compose projects were started from isolated worktrees. The `deploy` PostgreSQL instance contains deployment-validation design facts, while the `specforge-graph-verify` PostgreSQL instance contains the complete authored asset catalog. Allowing Web, MCP, or graph-projection processes to select either instance makes the same application service appear to have different API, data-model, and relationship inventories.

## Decision

Use one PostgreSQL instance as the sole local authority for authored SpecForge records. The complete asset catalog from `specforge-graph-verify-postgres` is restored into a fresh `specforge_canonical` database inside the canonical `deploy-postgres` instance. This avoids overwriting the existing deployment-validation database during cutover. After verified import, local Web, MCP, reconciliation, and graph projection use only the canonical deployment database connection. The graph verification Compose project remains a disposable derived-projection environment and must not be used as an authored-data authority.

## Alternatives

1. Continue selecting the database by local port. Rejected because the same scope can silently show different assets.
2. Restore the source directly over the existing deployment database. Rejected because it can overwrite newer deployment-validation facts.
3. Merge every table into the existing deployment database. Rejected for this cutover because stable-ID and graph-record conflicts would make the first consolidation needlessly destructive.

## Consequences

- Positive: every local entry point reads the same scoped assets, links, counts, and design facts.
- Positive: deployment exercises the same PostgreSQL authority that developers use.
- Positive: graph verification cannot silently become a second system of record.
- Tradeoff: the one-time import requires backup, integrity checks, and a controlled service restart.
- Tradeoff: verification containers must be recreated from the canonical database rather than treated as persistent authoring stores.

## Constraints

- Export both source and target before importing; never reset or delete either database during migration.
- Compare row counts by table, asset type, and `applicationServiceId`, then validate stable IDs and relationship counts before the cutover.
- Use a single explicitly configured `DATABASE_URL`; no runtime fallback across ports or databases is allowed.
- PostgreSQL remains authoritative. NebulaGraph remains a derived projection only.
- A failed import or reconciliation leaves the existing source data intact and restores the former Web connection.

## Evidence

- `pg_dump` created non-empty logical backups for both source and former deployment databases before cutover.
- `pg_restore` restored the full source backup into `deploy-postgres-1/specforge_canonical` without modifying `deploy-postgres-1/specforge`.
- The post-import canonical fingerprint matched the source: 70 design assets, 115 AssetLinks, 173 current relationships, 411 relationship events, and 411 outbox records.
- Canonical Web route checks rendered the scoped API, data-model, graph, and workspace pages without Prisma errors.
- `pnpm design-facts:sync` and `pnpm design-facts:check` persisted and read back all 11 decisions in the exact Designer Scope with no missing, mismatched, out-of-scope, or blocked records.

## Legacy Verification Stack Retirement (2026-08-13)

The legacy graph-verification authority is retired. Read-only Docker inspection found no remaining `specforge-graph-verify-postgres` container or volume, and every retained Graph Projector configuration targets `deploy-postgres-1:5432/specforge_canonical`. The preserved source backup remains recoverable at `artifacts/db-consolidation/2026-07-29/source-graph-verify.dump`; its SHA-256 is `525BF44496C212CEE7330EB1927C965AB32FF3FE82F11AD608AA4C7E962481DF`, and `pg_restore --list` returned 174 TOC entries.

After the canonical live projection gate passed, all local graph-verification services were stopped by exact container name. Their containers and both Nebula volume sets were retained. `deploy-postgres-1` and the MCP PostgreSQL tunnel remained healthy and running. No database, payload, container, or volume was deleted.

## 旧验证栈退役（2026-08-13）

旧图验证权威已完成退役。只读 Docker 核查未发现仍存在的 `specforge-graph-verify-postgres` 容器或卷，所有保留的 Graph Projector 配置均指向 `deploy-postgres-1:5432/specforge_canonical`。源库备份仍保存在 `artifacts/db-consolidation/2026-07-29/source-graph-verify.dump`，其 SHA-256 为 `525BF44496C212CEE7330EB1927C965AB32FF3FE82F11AD608AA4C7E962481DF`，并已通过包含 174 个 TOC 条目的可恢复性检查。

规范 live 投影门禁通过后，所有本地图验证服务均按精确容器名停止；容器和两组 Nebula 卷全部保留。`deploy-postgres-1` 与 MCP PostgreSQL 隧道继续健康运行，未删除任何数据库、载荷、容器或卷。

## Chinese Localization / 中文本地化

### 备选方案

1. 继续通过本地端口选择数据库。拒绝，因为同一 Scope 可能静默展示不同资产。
2. 直接用源库覆盖原部署数据库。拒绝，因为可能覆盖较新的部署验证事实。
3. 将每张表合并到原部署数据库。拒绝，因为稳定 ID 和图记录冲突会使首次收敛具有破坏性。

### 后果

- 正向影响：每个本地入口读取同一组范围化资产、链接、计数和设计事实。
- 正向影响：部署环境使用与开发人员相同的 PostgreSQL 权威源。
- 正向影响：图验证环境不能再静默成为第二个事实来源。
- 权衡：一次性导入需要备份、完整性检查和受控的服务重启。
- 权衡：验证容器必须从规范数据库重建，而不能被视为长期编写存储。

### 约束

- 导入前导出源库和目标库；迁移期间不得重置或删除任何数据库。
- 按表、资产类型和 `applicationServiceId` 对比行数，并核验稳定 ID 与关系数量。
- 只允许一个显式配置的 `DATABASE_URL`；禁止跨端口或跨数据库运行时回退。
- PostgreSQL 保持权威，NebulaGraph 只保留为派生投影。
- 导入或对账失败时保留源数据并恢复先前的 Web 连接。

### 证据

- 已在切换前为源库和原部署库创建非空逻辑备份。
- 已将完整源库恢复到 `deploy-postgres-1/specforge_canonical`，未修改原 `specforge` 数据库。
- 导入后指纹与源库一致：70 条设计资产、115 条 AssetLink、173 条当前关系、411 条关系事件和 411 条 Outbox 记录。
- 规范 Web 服务已渲染范围化 API、数据模型、图谱和工作台页面，未出现 Prisma 错误。

### 背景

两个来自隔离工作区的 Docker Compose 项目分别启动了 PostgreSQL。`deploy` 数据库只包含部署验证产生的设计事实，而 `specforge-graph-verify` 数据库保存了完整的设计资产目录。若 Web、MCP 或图投影进程可以任意选择其中之一，同一应用服务会呈现不同的 API、数据模型和关系数量。

### 决策

本地已编写 SpecForge 记录只允许存在一个 PostgreSQL 权威库。以含完整资产的 `specforge-graph-verify-postgres` 为源，执行一次可回滚导入到规范的 `deploy-postgres`。导入并核验成功后，本地 Web、MCP、对账与图投影只使用规范部署库。图验证 Compose 项目只是可重建的派生投影环境，禁止作为已编写设计数据的权威来源。

### 安全约束

- 导入前同时导出源库和目标库；迁移期间不重置或删除任何数据库。
- 按表、资产类型和 `applicationServiceId` 对比行数，并在切换前核验稳定 ID 与关系数量。
- 只允许一个显式配置的 `DATABASE_URL`；禁止跨端口或跨数据库运行时回退。
- PostgreSQL 保持权威，NebulaGraph 只保留为派生投影。
