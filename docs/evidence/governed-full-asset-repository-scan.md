# Governed Full-Asset Repository Scan Evidence

## Scope

The implementation is owned by `com.specforge.designcenter` at `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`. PostgreSQL remains authoritative for authored assets, scan sessions, observations, candidates, review bundles, relationships, and Baselines.

## Verified locally

- `pnpm scanner-contract:check`
- `pnpm --filter @specforge/scan-contract test`
- `pnpm exec vitest run apps/mcp-server/src/scanner/session.test.ts apps/mcp-server/src/scanner/finalization.test.ts apps/mcp-server/src/scanner/report.test.ts apps/mcp-server/src/scanner/full-asset-scan.scale.test.ts apps/mcp-server/src/scanner/full-asset-scan.e2e.test.ts apps/mcp-server/src/knowledge/candidate-persistence.test.ts`
- `pnpm --filter @specforge/mcp-server typecheck`
- `Push-Location apps/specforge-cli; go test ./...; Pop-Location`
- `node --test skills/specforge-repository-scan/scripts/verify-input.test.mjs`
- `pnpm typecheck`
- `SPECFORGE_NEXT_STANDALONE=0 pnpm build`
- `node --test apps/specforge-cli/portable/scanner.test.mjs`
- `node scripts/build-portable-scanner-release.mjs --check`
- `node --test skills/specforge-repository-scan/scripts/readiness-gate.test.mjs skills/specforge-repository-scan/scripts/verify-input.test.mjs`
- `pnpm exec vitest run packages/core/src/knowledge-readiness/policy.test.ts apps/mcp-server/src/scanner/governance-bootstrap.test.ts`

These checks cover exact Scope assertions, policy receipt pinning, unsupported-capability blocking, bounded report remediation, bilingual candidate input, Python/Go/TypeScript/neutral extraction, private resume context, cross-Agent contract equivalence, and the 100,000-observation batch invariant.

The exact-Scope MCP synchronization and reconciliation were also completed:

- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync` -> complete.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:check` -> `missing=[]`, `mismatched=[]`, `outOfScope=[]`, `blocked=[]`.

The 2026-09-19 portable-release increment also verifies a signed Node runtime path, compatible release selection, first-scan bootstrap classification, and one ACTIVE governance version per kind. PostgreSQL-backed integration tests remain disabled in this local verification run and must be enabled before claiming database migration deployment proof.

Canonical database baseline closure: the guarded `pnpm baseline:canonical` command was rehearsed against a restored probe database and then applied to `specforge_canonical` after a final custom-format backup. `pnpm exec prisma migrate status` now reports 27 migrations and `Database schema is up to date!`. The final audit reports `pendingHistoricalMigrations=[]`, `missingLinkCount=0`, `unexpectedIndexes=[]`, all tracked Scope-null counts `0`, and no duplicate ACTIVE governance groups. Canonical invariant queries report 373 `RelationshipCurrent` rows, 373 `RelationshipEvent` rows, and 373 `RelationshipOutbox` rows for `20260920000000_repair_missing_asset_link_relationships`. The probe and canonical integration suites each passed 3 tests. The former `backlog-portable-scanner-postgres-baseline` is complete; future brownfield environments must use the guarded audit/apply command and must not use `db push` or reset the database.

The configured `localhost:15433` endpoint was verified to forward to Docker service `deploy-postgres-1/specforge_canonical`; the separate `specforge-postgres` container is not the configured application database. The final rollback backup `.specforge/backups/specforge_canonical-20260920-final.dump` is 2,540,597 bytes and passed `pg_restore -l`. Historical migrations include data backfills and graph seed writes, so the baseline command resolves only the reviewed explicit allowlist and never replays historical SQL.

## Deliberate environment boundary

The default Next standalone build is environment-blocked on Windows OneDrive because Next cannot create trace symlinks (`EPERM`); the equivalent non-standalone build passed, and the production Docker/Linux path is unchanged. An unscoped full-baseline design-fact sync is also blocked by an unrelated historical ADR that requires a governed data-model upgrade; the current repository-scan increment is synchronized and reconciled independently under its exact Scope.

权威数据库基线已闭环：受保护的 `pnpm baseline:canonical` 命令先在恢复的探针库演练，再在最终备份后应用到 `specforge_canonical`。`pnpm exec prisma migrate status` 现报告 27 个迁移且 Schema 已是最新；审计显示历史待迁移为空、关系缺口为 0、意外漂移为空、Scope 空值为 0、治理重复组为 0。正式库中该迁移写入 373 条 `RelationshipCurrent`、373 条 `RelationshipEvent` 和 373 条 `RelationshipOutbox`，探针库和正式库集成测试各通过 3 项。`backlog-portable-scanner-postgres-baseline` 已完成；未来存量环境必须使用受保护审计/应用命令，禁止 `db push` 或重置数据库。

已核实配置的 `localhost:15433` 端点转发到 Docker 服务 `deploy-postgres-1/specforge_canonical`；旁边的 `specforge-postgres` 容器不是应用配置使用的数据库。最终回滚备份 `.specforge/backups/specforge_canonical-20260920-final.dump` 为 2,540,597 字节并通过 `pg_restore -l` 校验。历史迁移包含数据回填和图关系种子写入，因此基线命令只处理审核过的显式 allowlist，绝不重放历史 SQL。
