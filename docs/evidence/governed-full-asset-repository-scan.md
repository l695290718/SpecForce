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

Database deployment boundary: `pnpm exec prisma migrate status` reported 26 pending migrations, and `pnpm exec prisma migrate deploy` returned `P3005` because the existing `specforge_canonical` schema is non-empty without a Prisma migration baseline. The partial unique-index migration is prepared but not applied. This is tracked as `backlog-portable-scanner-postgres-baseline`; do not use `db push` or reset the database. MCP synchronization for the exact Scope completed successfully.

## Deliberate environment boundary

The default Next standalone build is environment-blocked on Windows OneDrive because Next cannot create trace symlinks (`EPERM`); the equivalent non-standalone build passed, and the production Docker/Linux path is unchanged. An unscoped full-baseline design-fact sync is also blocked by an unrelated historical ADR that requires a governed data-model upgrade; the current repository-scan increment is synchronized and reconciled independently under its exact Scope.

数据库部署阻断：`pnpm exec prisma migrate status` 报告 26 个待执行迁移，`pnpm exec prisma migrate deploy` 因现有 `specforge_canonical` Schema 非空且没有 Prisma 迁移基线而返回 `P3005`。部分唯一索引迁移已准备但未应用。该问题已登记为 `backlog-portable-scanner-postgres-baseline`，禁止使用 `db push` 或重置数据库。精确 Scope 的 MCP 同步已经成功。
