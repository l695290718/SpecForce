# ADR-0050: Canonical PostgreSQL Brownfield Baseline

Status: Accepted and implemented on 2026-09-20

Stable ID: `adr-canonical-postgresql-brownfield-baseline`

Owning `architectureScope`: `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`

## Context

The Docker PostgreSQL database `specforge_canonical` already contained authored SpecForge data, but it had no Prisma migration ledger. A direct `prisma migrate deploy` therefore returned `P3005`. Replaying historical migrations was unsafe because several of them contain data backfills and graph seed writes. The existing `AssetLink` table also had 373 semantic relationships missing from the relationship ledger.

## Decision

Establish Prisma ownership without resetting or pushing the schema:

1. Create and validate a custom-format rollback backup before any canonical write.
2. Compare the live schema against the repository schema and allow only the three reviewed extra indexes: `AssetLink_scope_source_idx`, `AssetLink_scope_target_idx`, and `KnowledgePromotionReceipt_scope_decision_key`.
3. Resolve only the explicit historical migration allowlist through the guarded `baseline:canonical` command; do not replay historical SQL.
4. Apply a missing-only repair migration that derives endpoint nodes from existing `AssetLink` rows, inserts deterministic `RelationshipCurrent` rows, and emits one idempotent `RelationshipEvent` and `RelationshipOutbox` row per repaired link.
5. Require an expected missing-link digest, exact database identity, explicit confirmation, and post-apply migration and relationship invariants.

PostgreSQL remains authoritative. The graph projection consumes the repaired relationship events and is not an authoring source.

## Alternatives

- Replay every historical migration: rejected because historical data backfills and graph seed writes create duplicate semantic relationships and audit records.
- Mark every migration applied without repair: rejected because schema similarity does not prove relationship, event, or Outbox completeness.
- Reset or use `db push`: rejected because authored design facts would be at risk and Prisma migration ownership would remain ambiguous.

## Consequences

- The existing authored data is preserved and the repository now owns future migration execution.
- A rollback requires restoring the private final backup during an approved maintenance window; the baseline command remains the controlled path for future brownfield environments.

## Constraints

- The command targets one exact database and one reviewed `architectureScope`.
- It preserves PostgreSQL authority, never writes graph stores as an authoring path, never resets authored data, and never replays historical data migrations.
- Private backups and audit reports are excluded from Git.

## Evidence

- Final backup: `.specforge/backups/specforge_canonical-20260920-final.dump`, 2,540,597 bytes; `pg_restore -l` succeeded.
- Probe restore and apply passed; second application remained idempotent.
- Canonical `pnpm exec prisma migrate status`: 27 migrations found; database schema is up to date.
- Canonical audit: `migrationTablePresent=true`, `pendingHistoricalMigrations=[]`, `missingLinkCount=0`, `unexpectedIndexes=[]`, all tracked Scope-null counts `0`, and no duplicate ACTIVE governance groups.
- Canonical invariants: 373 repair relationships, 373 repair events, 373 repair Outbox rows, and 0 active governance duplicate groups.
- Focused verification: `pnpm exec vitest run scripts/baseline-canonical-postgres.test.ts scripts/brownfield-baseline.integration.test.ts` passed the pure tests; the integration suite passed against both the isolated probe and canonical database.

## MCP Record

Matching MCP ADR ID: `adr-canonical-postgresql-brownfield-baseline`.

The matching Proposal, Context Pack, typed links, and evidence must be synchronized in the exact owning Scope before this ADR is considered complete. The implementation session is `design-change-session:d7f00607-dc6b-4df5-8729-12e2e101d9b0`; its final closure is recorded after exact-Scope synchronization and reconciliation checks.

## 中文本地化覆盖

### 背景

`specforge_canonical` Docker PostgreSQL 中已经存在 SpecForge 设计数据，但没有 Prisma 迁移账本，直接执行 `prisma migrate deploy` 会返回 `P3005`。历史迁移包含数据回填和图关系种子，不能直接重放；原有 `AssetLink` 还有 373 条语义关系没有进入关系账本。

### 决策

本决策采用“不重置、不 db push、先备份、探针演练、显式基线登记、只补缺失关系”的方式。正式库已完成 27 个迁移的登记/应用，373 条关系、事件和 Outbox 记录已补齐，关系缺口为 0，Scope 空值和治理重复组均为 0。PostgreSQL 继续作为权威存储，图投影只能消费关系事件，不能作为设计事实写入源。

### 备选方案

- 不重放历史数据迁移，避免重复语义关系和重复审计事件。
- 不在没有关系完整性证据时直接把全部迁移标记为已应用。
- 不重置数据库或使用 `db push`，保护已维护的设计事实。

### 后果

- 现有设计事实得到保留，仓库重新拥有后续迁移执行权。
- 后续存量数据库必须使用受保护的审计/应用命令；回滚需要在维护窗口恢复私有最终备份。

### 约束

- 命令只允许面向一个精确数据库和一个审核过的 `architectureScope`。
- PostgreSQL 保持权威，图数据库只能作为派生投影。
- 私有备份和审计报告不得提交到 Git，历史数据迁移不得重放。

### 证据

- 最终备份通过 `pg_restore -l`，大小为 2,540,597 字节。
- `pnpm exec prisma migrate status` 报告 27 个迁移且 Schema 已是最新。
- 正式库关系缺口为 0，修复关系、Event 和 Outbox 各 373 条，治理重复组为 0。

## References

- `docs/superpowers/specs/2026-09-20-brownfield-postgres-baseline-design.md`
- `docs/superpowers/plans/2026-09-20-brownfield-postgres-baseline.md`
- `scripts/baseline-canonical-postgres.ts`
- `prisma/migrations/20260920000000_repair_missing_asset_link_relationships/migration.sql`
