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

## MockAI semantic candidate authoring evidence (2026-09-22)

The exact-Scope design session was `design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5`. With `SPECFORGE_SEMANTIC_PROVIDER=mock`, `pnpm scan:governed-local` returned `GOVERNED_SCAN_READY_FOR_REVIEW` for scan session `knowledge-scan:0afad255-b0ff-4a5c-b26e-9599fc5806dc` under `com.specforge.designcenter`.

- Observation count: `6,133`.
- Hash-chained batch count: `13`.
- Candidate count persisted through MCP: `6,133`.
- Review coverage: complete (`6,133/6,133`).
- Review status: `BLOCKED`, risk tier `T3`.
- Blocking reason: candidates remain `UNMATCHED` and carry unresolved questions by MockAI policy; no candidate, authored asset, relationship, ChangeSet, or Baseline was promoted.
- `pnpm --filter @specforge/mcp-server typecheck` -> exit 0.
- `pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts src/knowledge/candidate-persistence.test.ts` -> 41 tests passed.

- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync` -> `status=complete`.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:check` -> `missing=[]`, `mismatched=[]`, `outOfScope=[]`, `blocked=[]`.
- `pnpm design-context:close -- --session design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5 --status CONVERGED --evidence "candidateCount=6133;reviewStatus=BLOCKED;typecheck=exit0;tests=41 passed;design-facts:check=empty"` -> `status=CONVERGED`.

The run also exposed and fixed a contract gap in the MCP boundary: the submission schema now requires full-asset metadata, evidence clusters, English canonical content, and the `localizedContent.zh` overlay. The runner normalizes MockAI's summary-only output into deterministic bilingual candidate content, while preserving `UNMATCHED` identity and unresolved-question blockers. This is candidate authoring evidence only; independent T1-T3 review, atomic aggregate promotion, reconciliation, and publication remain the explicit retry trigger.

## MockAI 语义候选编写证据（2026-09-22）

精确 Scope 设计会话为 `design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5`。设置 `SPECFORGE_SEMANTIC_PROVIDER=mock` 执行 `pnpm scan:governed-local`，在 `com.specforge.designcenter` 下为扫描会话 `knowledge-scan:0afad255-b0ff-4a5c-b26e-9599fc5806dc` 返回 `GOVERNED_SCAN_READY_FOR_REVIEW`。

- 观察数：`6,133`。
- 哈希链批次数：`13`。
- 通过 MCP 持久化的候选数：`6,133`。
- 审核覆盖：完整（`6,133/6,133`）。
- 审核状态：`BLOCKED`，风险等级 `T3`。
- 阻断原因：MockAI 策略要求候选保持 `UNMATCHED` 并携带未决问题；没有提升候选、正式资产、关系、ChangeSet 或 Baseline。
- `pnpm --filter @specforge/mcp-server typecheck` -> 退出码 0。
- `pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts src/knowledge/candidate-persistence.test.ts` -> 41 项通过。

- 设置 `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'` 执行 `pnpm design-facts:sync` -> `status=complete`。
- 设置 `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'` 执行 `pnpm design-facts:check` -> `missing=[]`、`mismatched=[]`、`outOfScope=[]`、`blocked=[]`。
- `pnpm design-context:close -- --session design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5 --status CONVERGED --evidence "candidateCount=6133;reviewStatus=BLOCKED;typecheck=exit0;tests=41 passed;design-facts:check=empty"` -> `status=CONVERGED`。

本次运行还发现并修复了 MCP 边界的契约缺口：提交 Schema 现在要求完整资产元数据、证据簇、英文规范内容和 `localizedContent.zh` 覆盖。运行器将 MockAI 仅有摘要的输出规范化为确定性的双语候选内容，同时保留 `UNMATCHED` 身份与未决问题阻断。这里仅证明候选编写；独立 T1-T3 审核、原子聚合提升、对账和发布仍是明确的重试触发条件。

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
