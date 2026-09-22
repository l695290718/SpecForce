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

The 2026-09-21 native release increment additionally passed `go test ./...`, `pnpm exec vitest run apps/mcp-server/src/scanner/finalization.test.ts` (10 tests), and `pnpm --filter @specforge/mcp-server typecheck`. `pnpm scanner:provision-local` registered signed native release `scanner-release:2.1.20260921095754-windows-amd64` plus portable fallback `scanner-release:2.1.20260921095753-portable`. With `SPECFORGE_DESIGN_CHANGE_SESSION=design-change-session:2e8bf691-87dc-4c77-8c0b-5fdee242e9b9`, `pnpm scan:governed-local` accepted 6,078 observations in 13 hash-chained batches and finalized session `knowledge-scan:4d3513f9-6dd8-4a57-a6f8-150dba321751` as `READY_FOR_ANALYSIS`. Snapshot digest: `36aeddea57688d8b7b68f9cc0d8e99fe130746245bc7d58d0670a33d5f55e672`; finalization digest: `2039780dee422d740d6427995d5c25db4e78f6d1aa9add00bf5419e930e3cc77`. Semantic candidate generation and promotion were deliberately not run.

The bounded semantic-read increment used design session `design-change-session:d3959824-0a3c-4b49-949a-055791c1b783`. `pnpm exec vitest run --dir apps/mcp-server/src apps/mcp-server/src/scanner/report.test.ts apps/mcp-server/src/tools.test.ts` passed 81 tests, and `pnpm --filter @specforge/mcp-server typecheck` passed. A live PostgreSQL read of two consecutive `includePayload=true` pages from governed session `knowledge-scan:4d3513f9-6dd8-4a57-a6f8-150dba321751` returned four distinct observation IDs, `observationCount=6078`, `status=READY_FOR_ANALYSIS`, and zero blocking issues. The signed cursor was accepted only for the matching exact Scope, actor, session, and payload mode.

The full-asset semantic-governance increment uses design session `design-change-session:15373558-985e-4d62-8a1e-e92f5e791ff6`. `pnpm --filter @specforge/core typecheck` and `pnpm --filter @specforge/mcp-server typecheck` passed. Core semantic/risk tests passed 28 checks; MCP candidate persistence, review partition, promotion mapping, risk-policy, and tool routing passed 60 checks. The governed scan script imported successfully without starting a scan, and the database E2E source compiled with its integration case explicitly skipped because `SPECFORGE_KNOWLEDGE_INTEGRATION` was not enabled. A live dry run over two real observations validated the session-pinned prompt-pack/policy digests and evidence-cluster digest, and rejected an unclustered legacy batch. The dry run made no candidate or canonical writes. The session closed as `BLOCKED`: all approved risk/domain partitions must be aggregated into one atomic ChangeSet before candidate promotion; partial Baseline publication is forbidden. This is the retry trigger for candidate authoring.

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

## Atomic review-set promotion evidence (2026-09-22)

The exact owning Scope is `com.specforge.designcenter` / `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`, and the implementation session is `design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de`.

- `pnpm exec prisma migrate deploy` -> applied `20260922000000_add_aggregate_review_set_promotion` to `specforge_canonical` without resetting data.
- `pnpm exec prisma migrate status` -> `Database schema is up to date!`.
- `pnpm --filter @specforge/core typecheck` -> exit 0.
- `pnpm --filter @specforge/mcp-server typecheck` -> exit 0.
- `pnpm --dir apps/mcp-server exec vitest run src/knowledge/promotion.integration.test.ts` with `SPECFORGE_KNOWLEDGE_INTEGRATION=1` -> 5 tests passed, including two approved partitions promoted as one ChangeSet, idempotent retry, aggregate reconciliation, Baseline publication, rollback, and missing-partition rejection.
- `pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts` -> 33 tests passed, including `promote_knowledge_review_set` routing.
- `pnpm exec vitest run packages/core/src/knowledge/aggregate-promotion.test.ts packages/core/src/knowledge/semantic-candidates.test.ts` -> passed in the focused verification run.

The automatic `prisma migrate dev --create-only` path was blocked by the historical brownfield shadow database (`P3006`/`P1014`); the checked-in migration is an additive, reviewed replacement and was deployed successfully. No 6,078-observation semantic candidate set or production Baseline was promoted by this increment; the aggregate path is implemented and the scan remains at the Agent/review boundary.

## 原子审核集合提升证据（2026-09-22）

精确归属 Scope 为 `com.specforge.designcenter` / `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`，实现会话为 `design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de`。

- `pnpm exec prisma migrate deploy` -> 在不重置数据的前提下，将 `20260922000000_add_aggregate_review_set_promotion` 应用到 `specforge_canonical`。
- `pnpm exec prisma migrate status` -> `Database schema is up to date!`。
- `pnpm --filter @specforge/core typecheck` -> 退出码 0。
- `pnpm --filter @specforge/mcp-server typecheck` -> 退出码 0。
- 设置 `SPECFORGE_KNOWLEDGE_INTEGRATION=1` 执行 `pnpm --dir apps/mcp-server exec vitest run src/knowledge/promotion.integration.test.ts` -> 5 项通过，覆盖双分区单 ChangeSet、幂等重试、聚合对账、Baseline 发布、回滚和缺失分区拒绝。
- `pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts` -> 33 项通过，包含 `promote_knowledge_review_set` 路由。
- `pnpm exec vitest run packages/core/src/knowledge/aggregate-promotion.test.ts packages/core/src/knowledge/semantic-candidates.test.ts` -> 聚焦验证通过。

自动 `prisma migrate dev --create-only` 由于历史棕地影子数据库失败（`P3006`/`P1014`）；提交的迁移是经审查的增量替代方案，已成功部署。本增量没有提升 6,078 条观察的语义候选集或生产 Baseline；聚合提升路径已经实现，扫描仍停留在 Agent/审核边界。
