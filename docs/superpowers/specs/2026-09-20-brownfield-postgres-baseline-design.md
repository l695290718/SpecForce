# Brownfield PostgreSQL Migration Baseline Design

## Status

Approved and implemented on 2026-09-20. Owning application-service Scope: `com.specforge.designcenter` at `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.

Design change session: `design-change-session:d7f00607-dc6b-4df5-8729-12e2e101d9b0`.

## Problem

The canonical PostgreSQL database contains the current SpecForge schema and authored data, but it has no `_prisma_migrations` history. Prisma therefore reports all 26 repository migrations as pending and refuses `migrate deploy` with `P3005`.

This is not only a metadata problem. The historical enterprise relationship migration contains data backfills. The current database has 458 `AssetLink` records, while 373 do not have an equivalent `RelationshipCurrent` identified by exact Scope, source node type/id, target node type/id, and relation type. Replaying the historical migration against a restored backup removes the gaps but creates two duplicate semantic relationships, 593 legacy events, and 458 Outbox records. Replaying it in production would therefore corrupt audit meaning even though the SQL completes.

## Decision

Adopt a reviewed brownfield baseline with a new missing-only repair migration. Do not reset the database, use `db push`, replay the complete historical relationship migration, or automatically mark all migrations applied.

The sequence is:

1. Preserve and verify a custom-format backup of the canonical database.
2. Verify the live schema against `prisma/schema.prisma`, allowing only the three already identified additional indexes.
3. Add a new idempotent migration that creates graph records only for `AssetLink` relationships that have no exact semantic equivalent.
4. Restore the backup into a probe database, verify the reviewed gap digest, and mark historical migrations through `20260917_system_scan_governance` as applied there.
5. Run normal `prisma migrate deploy` in the probe so Prisma applies `20260919000000_unique_active_scan_governance` and the new repair migration in order.
6. Validate relationship, event, Outbox, Scope, duplicate, migration-status, and projection invariants in the probe.
7. Repeat the same baseline and deploy procedure against the canonical database, then run focused integration tests, application health, MCP reconciliation, and graph-projection read-back.

## Considered Approaches

### A. Replay every historical migration

Rejected. Several migrations contain data transformations and graph seed writes. The restored-backup probe proved that a complete replay can create duplicate semantic relationships and redundant audit events.

### B. Mark all migrations applied immediately

Rejected. Schema similarity does not prove that data backfills, typed relationships, events, or Outbox entries are complete. This would hide the 373 missing graph relationships.

### C. Missing-only repair followed by a reviewed baseline

Selected. It preserves authored data, makes the repair measurable and idempotent, and returns the database to normal Prisma migration management without pretending historical data work already happened.

## Repair Migration

Create `prisma/migrations/20260920000000_repair_missing_asset_link_relationships/migration.sql`.

The migration runs in one explicit PostgreSQL transaction and snapshots missing links into a temporary table. A link is missing only when no ACTIVE or historical `RelationshipCurrent` exists in the same application-service Scope with matching source node type/logical ID, target node type/logical ID, and relation type. The check is semantic and does not depend only on the old `sourceReference`.

For each missing link, the migration:

- creates missing `AssetNode` endpoints under `legacy-enterprise` using the existing scope identity constraint;
- inserts one `RelationshipCurrent` with source `brownfield-asset-link-baseline` and source reference `asset-link:<AssetLink.dbId>`;
- inserts one `RelationshipEvent` with idempotency key `brownfield-asset-link-event:<AssetLink.dbId>`;
- inserts one PENDING `RelationshipOutbox` row with idempotency key `brownfield-asset-link-outbox:<AssetLink.dbId>`;
- stores the migration ID and original `AssetLink` identity in metadata.

Every insert uses the existing unique constraints and a deterministic identity. A second execution must add zero rows. Existing equivalent relationships are never rewritten, superseded, or re-emitted.

## Baseline Tool

Add a repository script that defaults to audit-only mode. It must:

- require the exact canonical database name and explicit `--apply` before writes;
- reject an absent or unreadable backup reference;
- reject unexpected Schema drift, duplicate ACTIVE scanner-governance rows, Scope-null records, or a relationship-gap count/digest that differs from the reviewed audit;
- hold an advisory lock while changing migration metadata;
- mark only the allowlisted historical migration names through `20260917_system_scan_governance` as applied;
- leave `20260919000000_unique_active_scan_governance` and the new repair migration pending for normal `migrate deploy`;
- write a machine-readable audit report under `.specforge/baselines/`, which remains private and untracked.

The script never runs `db push`, resets a schema, drops data, or edits checksums. It stops before each write if the observed migration directory does not match the reviewed allowlist. `--confirm-probe` is accepted only for a uniquely named `specforge_baseline_probe_*` database; `--confirm-canonical` is accepted only for `specforge_canonical`. Historical migrations already present in the ledger are skipped, and each newly resolved migration is read back before continuing.

## Verification And Rollback

First restore the verified backup into a uniquely named probe database. Run audit mode, apply the missing-only migration, establish the baseline, and run `migrate deploy` there. The probe must prove:

- missing equivalent relationships: `0`;
- duplicate semantic relationships introduced by the repair: `0`;
- one repair event and one Outbox record per repaired link;
- second repair execution inserts `0` rows;
- no duplicate ACTIVE `SystemScanGovernanceRecord` by kind;
- `prisma migrate status` is current;
- focused graph, scanner-governance, and Scope-isolation tests pass.

Production execution used the same commands and digest after a fresh backup. Failure before commit rolls back the repair transaction. Failure after migration metadata changes uses the verified backup for full database restore; migration metadata is never manually edited in place. Final evidence: 27 migrations are current, the semantic gap is 0, 373 repair relationship/event/Outbox rows exist, and the focused probe and canonical integration suites each pass 3 tests.

## Operational Boundaries

The configured `localhost:15433` endpoint forwards to Docker service `deploy-postgres-1/specforge_canonical`. The separate `specforge-postgres` container is not the configured application database. PostgreSQL remains authoritative; graph stores remain derived projections. The backup and generated audit reports are private runtime evidence and must never be committed.

## 中文本地化覆盖

### 问题

权威 PostgreSQL 已包含当前 SpecForge Schema 和正式数据，但没有 `_prisma_migrations` 历史，因此 Prisma 将仓库中的 26 个迁移全部判定为待执行，并以 `P3005` 拒绝 `migrate deploy`。

这不只是迁移元数据问题。历史关系图迁移包含数据回填。当前数据库有 458 条 `AssetLink`，其中 373 条没有按精确 Scope、源节点类型/标识、目标节点类型/标识和关系类型匹配的 `RelationshipCurrent`。在备份恢复库重放旧迁移虽然能补齐缺口，但会产生 2 条重复语义关系、593 条 legacy Event 和 458 条 Outbox，因此不能直接在生产库重放。

### 决策

采用“缺失关系定向修复 + 审核后建立 Prisma 基线”。禁止重置数据库、使用 `db push`、完整重放历史关系迁移，或在没有数据证据时直接将全部迁移标记为已应用。

执行顺序为：验证备份；核对 Schema 并新增只补真正缺失关系的迁移；在恢复出的探针库核验缺口摘要，并将 `20260917_system_scan_governance` 及以前的历史迁移建立基线；再通过正常 `prisma migrate deploy` 按顺序执行 ACTIVE 治理唯一索引和新的修复迁移；验证幂等性与不变量后，在权威库重复相同的基线与部署流程；最后执行迁移状态、集成测试、健康检查、MCP 对账和图投影回读。

### 修复迁移

新增 `20260920000000_repair_missing_asset_link_relationships`。迁移在一个显式事务中快照缺失链接。只有在同一应用服务 Scope 内找不到源/目标节点和关系类型完全一致的关系时才创建记录。新增关系使用 `brownfield-asset-link-baseline` 来源，并以 `AssetLink.dbId` 生成稳定的关系引用、Event 幂等键和 Outbox 幂等键。再次执行必须新增 0 行，已有等价关系不得被改写或重复发出。

### 基线工具

新增默认只审计的仓库脚本。它必须校验数据库名称、备份、允许的 Schema 差异、Scope 完整性、关系缺口、治理版本唯一性和迁移目录白名单；只有显式 `--apply` 才能在 advisory lock 下写入 Prisma 迁移元数据。它只能把 `20260917_system_scan_governance` 及以前的历史迁移标记为已应用，必须让唯一索引迁移和新修复迁移由正常 `migrate deploy` 执行。审计报告写入不跟踪的 `.specforge/baselines/`。

### 验证与回滚

先在唯一命名的探针数据库完整演练。必须证明缺失关系为 0、修复引入的重复关系为 0、每个修复链接只有一条 Event 和一条 Outbox、第二次执行新增 0 行、每个治理 kind 只有一个 ACTIVE 版本、迁移状态正常，并通过关系图、扫描治理和 Scope 隔离测试。

生产执行前重新备份并使用完全相同的命令与摘要。修复事务提交前失败时由事务回滚；迁移元数据写入后失败时使用已验证备份整体恢复，禁止直接手改迁移表。
