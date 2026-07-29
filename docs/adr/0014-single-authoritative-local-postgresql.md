# ADR-0014: Single Authoritative Local PostgreSQL

## Status

Accepted for implementation on 2026-07-29.

## Context

Two independent Docker Compose projects were started from isolated worktrees. The `deploy` PostgreSQL instance contains deployment-validation design facts, while the `specforge-graph-verify` PostgreSQL instance contains the complete authored asset catalog. Allowing Web, MCP, or graph-projection processes to select either instance makes the same application service appear to have different API, data-model, and relationship inventories.

## Decision

Use one PostgreSQL instance as the sole local authority for authored SpecForge records. The complete asset catalog from `specforge-graph-verify-postgres` is the source for a one-time, rollback-safe import into the canonical `deploy-postgres` instance. After verified import, local Web, MCP, reconciliation, and graph projection use only the canonical deployment database connection. The graph verification Compose project remains a disposable derived-projection environment and must not be used as an authored-data authority.

## Consequences

- Positive: every local entry point reads the same scoped assets, links, counts, and design facts.
- Positive: deployment exercises the same PostgreSQL authority that developers use.
- Positive: graph verification cannot silently become a second system of record.
- Tradeoff: the one-time import requires backup, integrity checks, and a controlled service restart.
- Tradeoff: verification containers must be recreated from the canonical database rather than treated as persistent authoring stores.

## Safety Constraints

- Export both source and target before importing; never reset or delete either database during migration.
- Compare row counts by table, asset type, and `applicationServiceId`, then validate stable IDs and relationship counts before the cutover.
- Use a single explicitly configured `DATABASE_URL`; no runtime fallback across ports or databases is allowed.
- PostgreSQL remains authoritative. NebulaGraph remains a derived projection only.
- A failed import or reconciliation leaves the existing source data intact and restores the former Web connection.

## Chinese Localization / 中文本地化

### 背景

两个来自隔离工作区的 Docker Compose 项目分别启动了 PostgreSQL。`deploy` 数据库只包含部署验证产生的设计事实，而 `specforge-graph-verify` 数据库保存了完整的设计资产目录。若 Web、MCP 或图投影进程可以任意选择其中之一，同一应用服务会呈现不同的 API、数据模型和关系数量。

### 决策

本地已编写 SpecForge 记录只允许存在一个 PostgreSQL 权威库。以含完整资产的 `specforge-graph-verify-postgres` 为源，执行一次可回滚导入到规范的 `deploy-postgres`。导入并核验成功后，本地 Web、MCP、对账与图投影只使用规范部署库。图验证 Compose 项目只是可重建的派生投影环境，禁止作为已编写设计数据的权威来源。

### 安全约束

- 导入前同时导出源库和目标库；迁移期间不重置或删除任何数据库。
- 按表、资产类型和 `applicationServiceId` 对比行数，并在切换前核验稳定 ID 与关系数量。
- 只允许一个显式配置的 `DATABASE_URL`；禁止跨端口或跨数据库运行时回退。
- PostgreSQL 保持权威，NebulaGraph 只保留为派生投影。
