# Brownfield PostgreSQL Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Establish Prisma migration ownership for the existing canonical PostgreSQL database while repairing only missing `AssetLink` graph projections without duplicating relationships, events, or Outbox records.

**Architecture:** Add a deterministic missing-only SQL migration after the existing scanner-governance migration. Add a Node/TypeScript audit-and-baseline command that validates the reviewed database, backup reference, Schema drift, Scope completeness, relationship-gap digest, and migration allowlist before sequentially invoking Prisma's migration-resolution command. Prove the entire sequence on a restored probe database, then repeat it against the canonical Docker database.

**Tech Stack:** PostgreSQL 16, Prisma Migrate, Prisma Client, TypeScript/tsx, Node test runner, Docker PostgreSQL, existing MCP design-context and design-fact scripts.

## Global Constraints

- Owning Scope is `com.specforge.designcenter` at `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- PostgreSQL remains authoritative; graph projections and Outbox consumers remain derived.
- The canonical endpoint is `localhost:15433`, forwarding to `deploy-postgres-1/specforge_canonical`.
- `.specforge/backups/`, `.specforge/baselines/`, and `.specforge/scans/` remain private and are never staged.
- `db push`, database reset, destructive table recreation, and direct editing of `_prisma_migrations` are forbidden.
- Historical migrations through `20260917_system_scan_governance` may be resolved only after the reviewed Schema and data postconditions pass.
- `20260919000000_unique_active_scan_governance` and the new repair migration must run through normal `prisma migrate deploy`.
- All repair identities are deterministic and rerunning the repair migration must insert zero additional rows.

---

### Task 1: Add the missing-only AssetLink graph repair migration

**Files:**
- Create: `prisma/migrations/20260920000000_repair_missing_asset_link_relationships/migration.sql`
- Test: `scripts/brownfield-baseline.integration.test.ts`

**Interfaces:**
- Consumes: current `AssetLink`, `AssetNode`, `RelationshipCurrent`, `RelationshipEvent`, and `RelationshipOutbox` tables.
- Produces: one deterministic relationship, event, and pending Outbox record only for each exact semantic link with no existing equivalent.

- [ ] **Step 1: Write the failing probe assertions.**

  The integration test must restore the repository backup into a uniquely named PostgreSQL probe database, run the new migration through `prisma migrate deploy`, and assert:

  ```text
  missingEquivalentRelationships = 0
  duplicateSemanticRelationshipsIntroduced = 0
  repairEvents = repairedLinks
  repairOutboxRows = repairedLinks
  secondRunInsertedRows = 0
  ```

  Skip the test with a clear message unless `SPECFORGE_BASELINE_PROBE_DATABASE_URL` is explicitly provided; never default the test to the canonical database.

- [ ] **Step 2: Create the temporary missing-link snapshot.**

  In one transaction, create a temporary table containing `AssetLink.dbId`, Scope, source identity, target identity, relation type, description, and timestamps for links that have no matching relationship under `legacy-enterprise`. Match nodes by Scope, `nodeType`, and `logicalId`; match relationships by Scope, source node, target node, and `relationType`, regardless of historical `source`.

- [ ] **Step 3: Insert missing endpoints and relationships.**

  Insert endpoint nodes with `ON CONFLICT` against `AssetNode_scope_identity_key`. Insert relationships with source `brownfield-asset-link-baseline` and source reference formed as `asset-link:` concatenated with `AssetLink.dbId`, using the existing relationship uniqueness constraint. Capture only rows inserted by this migration in a temporary inserted-relationship table.

- [ ] **Step 4: Insert exactly one event and Outbox record per repair.**

  Use idempotency keys formed by concatenating `brownfield-asset-link-event:` or `brownfield-asset-link-outbox:` with `AssetLink.dbId`. Event metadata must include `migrationId=20260920000000_repair_missing_asset_link_relationships`; Outbox payload must include the relationship event ID and the same migration ID. Existing equivalent relationships must not generate a new event.

- [ ] **Step 5: Run SQL lint and probe tests.**

  Run:

  ```powershell
  pnpm exec prisma validate
  pnpm exec vitest run scripts/brownfield-baseline.integration.test.ts
  ```

  Expected: schema validation passes; the probe test passes or is explicitly skipped because the probe URL is not configured; no command connects to the canonical database.

- [ ] **Step 6: Commit the repair migration.**

  ```powershell
  git add prisma/migrations/20260920000000_repair_missing_asset_link_relationships scripts/brownfield-baseline.integration.test.ts
  git commit -m "fix: repair missing asset link relationships"
  ```

### Task 2: Implement the audit and baseline command

**Files:**
- Create: `scripts/baseline-canonical-postgres.ts`
- Modify: `package.json`
- Test: `scripts/baseline-canonical-postgres.test.ts`

**Interfaces:**
- `pnpm baseline:canonical -- --mode audit --backup .specforge/backups/specforge_canonical-20260920.dump` produces a JSON audit report.
- `pnpm baseline:canonical -- --mode apply --backup .specforge/backups/specforge_canonical-20260920.dump --expected-gap-digest $baselineAudit.missingLinkDigest --confirm-canonical` performs the allowlisted baseline resolution.
- The command exits non-zero before any write when the database name, backup, Schema drift, active-governance uniqueness, Scope completeness, gap count/digest, migration allowlist, or repair migration presence is invalid.

- [ ] **Step 1: Add audit command tests.**

  Test pure functions for migration allowlist selection, expected-gap digest calculation, the three allowlisted extra indexes, rejection of unexpected drift, rejection of duplicate ACTIVE governance rows, rejection of a missing backup file, and refusal to apply without `--confirm-canonical`.

- [ ] **Step 2: Implement read-only audit mode.**

  Use Prisma raw queries to collect database identity, `_prisma_migrations` presence, Schema drift summary, active-governance duplicates, Scope-null counts, exact missing-link rows, and SHA-256 digest of the sorted missing-link IDs. Write only `.specforge/baselines/latest-audit.json` and print the same JSON to stdout.

- [ ] **Step 3: Implement guarded apply mode.**

  Require the exact database name `specforge_canonical`, a readable backup path, the expected gap digest, and `--confirm-canonical`. Re-run audit immediately before writes. Invoke `pnpm exec prisma migrate resolve --applied 20260713233000_migrate_legacy_persisted_identities` and then each remaining migration name in the explicit allowlist through `20260917_system_scan_governance`; then invoke `pnpm exec prisma migrate deploy`. After each subprocess verify the expected migration row and stop on the first mismatch. Do not issue SQL against `_prisma_migrations` directly.

- [ ] **Step 4: Add failure-safe audit records.**

  Record command arguments, database identity, backup path, migration names resolved, deploy result, and postcondition results. Never include `DATABASE_URL` credentials. On failure, record `MCP synchronization blocked` only for an MCP failure; record database baseline failure separately with the retry trigger.

- [ ] **Step 5: Run command tests and typecheck.**

  Run:

  ```powershell
  pnpm exec vitest run scripts/baseline-canonical-postgres.test.ts
  pnpm typecheck
  pnpm baseline:canonical -- --mode audit --backup .specforge/backups/specforge_canonical-20260920.dump
  ```

  Expected: pure tests pass; typecheck passes; audit mode reports the current canonical database without changing it.

- [ ] **Step 6: Commit the baseline command.**

  ```powershell
  git add scripts/baseline-canonical-postgres.ts scripts/baseline-canonical-postgres.test.ts package.json
  git commit -m "feat: add guarded postgres baseline command"
  ```

### Task 3: Exercise the full sequence on a restored probe database

**Files:**
- Modify: `scripts/brownfield-baseline.integration.test.ts`
- Modify: `docs/evidence/governed-full-asset-repository-scan.md`

**Interfaces:**
- Probe database is created from `.specforge/backups/specforge_canonical-20260920.dump` under a unique name.
- Probe execution uses the same migration directory and baseline allowlist as production.

- [ ] **Step 1: Restore the backup and calculate the reviewed digest.**

  Create a unique probe database, restore the custom-format backup, run audit mode, and persist the exact missing-link count and digest in the private audit report. Confirm the probe is not `specforge_canonical`.

- [ ] **Step 2: Resolve only the historical allowlist in the probe.**

  Run apply mode against the probe with the explicit probe database URL and verify `_prisma_migrations` contains exactly the historical allowlist before deployment.

- [ ] **Step 3: Deploy current migrations in the probe.**

  Run `pnpm exec prisma migrate deploy` and assert that both `20260919000000_unique_active_scan_governance` and `20260920000000_repair_missing_asset_link_relationships` finish successfully.

- [ ] **Step 4: Run postconditions twice.**

  Verify zero missing equivalent relationships, zero introduced duplicates, exactly one repair Event and Outbox per repaired link, one ACTIVE governance row per kind, and zero inserts on a second repair attempt. Record exact counts and commands.

- [ ] **Step 5: Drop only the named probe database.**

  After evidence is captured, drop the uniquely named probe database and remove only its temporary container files. Do not touch `deploy-postgres-1`, `specforge-postgres`, or either persistent volume.

- [ ] **Step 6: Commit probe evidence.**

  ```powershell
  git add docs/evidence/governed-full-asset-repository-scan.md
  git commit -m "test: verify brownfield postgres baseline"
  ```

### Task 4: Apply the reviewed baseline to the canonical database

**Files:**
- Modify: `docs/TODO.md`
- Modify: `docs/adr/0049-system-owned-full-asset-repository-discovery.md`
- Modify: `docs/evidence/governed-full-asset-repository-scan.md`

- [ ] **Step 1: Take a fresh canonical backup.**

  Run `docker exec deploy-postgres-1 pg_dump -U specforge -d specforge_canonical -Fc -f /tmp/specforge_canonical-20260920-final.dump`, copy it to `.specforge/backups/specforge_canonical-20260920-final.dump`, and validate it with `docker exec deploy-postgres-1 pg_restore -l`.

- [ ] **Step 2: Run guarded apply with explicit canonical confirmation.**

  Set `$baselineAudit = Get-Content .specforge/baselines/latest-audit.json | ConvertFrom-Json`, then run `pnpm baseline:canonical -- --mode apply --backup .specforge/backups/specforge_canonical-20260920-final.dump --expected-gap-digest $baselineAudit.missingLinkDigest --confirm-canonical` and stop immediately on any precondition or postcondition failure.

- [ ] **Step 3: Verify canonical migration state and data invariants.**

  Run `pnpm exec prisma migrate status`, the focused governance integration suite, relationship counts, duplicate checks, and application health. Confirm the unique partial index exists and the repair migration is recorded.

- [ ] **Step 4: Synchronize and close MCP design facts.**

  Update bilingual ADR/Evidence/TODO with exact commands and results, run scoped `design-facts:sync` and `design-facts:check`, then close `design-change-session:d7f00607-dc6b-4df5-8729-12e2e101d9b0` as `CONVERGED` only if database deployment and all postconditions pass. Otherwise close it as `BLOCKED` with the exact failure and retry trigger.

- [ ] **Step 5: Commit final evidence.**

  ```powershell
  git add docs/TODO.md docs/adr/0049-system-owned-full-asset-repository-discovery.md docs/evidence/governed-full-asset-repository-scan.md
  git commit -m "docs: close brownfield postgres baseline"
  ```

## Verification Matrix

| Gate | Required result |
| --- | --- |
| Backup | `pg_restore -l` recognizes the archive and the file remains private |
| Schema | Only the three reviewed historical indexes differ |
| Gap repair | Exact missing-link digest is repaired once and only once |
| Migration baseline | Historical allowlist is recorded by Prisma, not direct SQL |
| Governance uniqueness | At most one ACTIVE row per governance kind |
| MCP | Exact Scope sync and reconciliation report no missing, mismatch, out-of-Scope, or blocked records |
| Rollback | Backup and uniquely named probe restore are available before canonical writes |

## Self-Review

- The plan distinguishes probe execution from canonical execution.
- It never replays the unsafe historical relationship migration in production.
- It does not use `db push`, reset the database, or directly edit Prisma migration metadata.
- The repair migration is deterministic, Scope-safe, and idempotent.
- The plan records the existing three-index drift as an explicit allowlist instead of silently deleting it.
- The final design session can only converge after database and MCP evidence both pass.

## 中文本地化覆盖

本计划采用“只补缺失关系、探针库先演练、审核后建立 Prisma 基线、最后部署权威库”的顺序。历史迁移中的数据回填和图关系种子不会被直接重放；基线命令默认只审计，只有提供备份、缺口摘要、精确数据库名和显式 `--confirm-canonical` 才能执行。

新增修复迁移使用稳定的关系引用、Event 幂等键和 Outbox 幂等键。它只处理没有等价关系的 `AssetLink`，再次执行新增 0 行。探针库必须验证缺失关系为 0、无新增重复关系、每个修复链接只有一条 Event 和 Outbox、治理 kind 只有一个 ACTIVE 版本，且迁移状态正常。

权威库执行前必须重新备份。任何失败都停止流程；MCP 设计事实只有在数据库迁移、验证、同步和对账全部成功后才能关闭为 `CONVERGED`，否则保持 `BLOCKED` 并登记重试条件。
