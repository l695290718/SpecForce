# Single Authoritative Local PostgreSQL Design

## Objective

Converge the local SpecForge environment onto one PostgreSQL authority without losing authored assets or design facts.

## Canonical Target

`deploy-postgres` becomes the canonical local PostgreSQL instance. The complete catalog currently held by `specforge-graph-verify-postgres` is imported into it once. The graph-verification stack is then recreated only from the canonical authority when projection verification is needed.

## Migration Flow

1. Quiesce the local Web and MCP writers.
2. Produce timestamped logical backups of both PostgreSQL databases.
3. Capture source and target fingerprints: row counts per table, design assets by type and application-service scope, proposals, context packs, typed links, relationship events, and outbox rows.
4. Import the complete source catalog into the canonical target without deleting the source backup.
5. Recompute and compare fingerprints. Stable asset IDs, scope paths, relationship identifiers, and design-fact IDs must match the source.
6. Configure the root local environment and operational commands to one canonical target connection only; remove stale references to `5432`, `5433`, `15432`, and `15433` from active local instructions.
7. Restart Web and MCP against the canonical target, then validate scoped API, data-model, graph, dashboard, MCP design-fact reconciliation, and graph-projection checks.
8. Stop the graph-verification PostgreSQL only after it has been replaced by a reproducible projection test setup and all validation passes.

## Failure Handling

No destructive database command is part of this migration. If any import, fingerprint comparison, reconciliation, or UI verification fails, restore the prior Web connection and retain both backups and source database for diagnosis. Record the failure as a blocked design fact with the exact retry trigger.

## Success Criteria

- One active canonical `DATABASE_URL` is used by Web, MCP, reconciliation, and graph projection.
- The canonical target contains every source design asset and design fact in its original owning scope.
- The Designer scope visibly contains the API, domain, data-model, rule, state-machine, event, integration, quality, and observability assets.
- No active local application process reads the temporary graph-verification PostgreSQL instance.
- Repository ADR and scoped MCP design records describe and evidence the completed cutover.

## 中文本地化

### 目标

在不丢失已编写资产和设计事实的前提下，将本地 SpecForge 收敛为单一 PostgreSQL 权威库。

### 迁移原则

`deploy-postgres` 成为本地规范库；完整资产从 `specforge-graph-verify-postgres` 一次性、可回滚地导入。导入成功后，图验证栈只能从规范库重建，不得保存独立的已编写数据。

### 成功标准

- Web、MCP、对账和图投影只有一个有效的 `DATABASE_URL`。
- 规范库保留源库全部设计资产、设计事实和精确所属 Scope。
- Designer Scope 页面可见 API、领域、数据模型、规则、状态机、事件、集成、质量和可观测性资产。
- 没有本地应用进程继续读取临时图验证 PostgreSQL。
