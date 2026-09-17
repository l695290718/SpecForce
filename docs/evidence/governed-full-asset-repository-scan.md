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

These checks cover exact Scope assertions, policy receipt pinning, unsupported-capability blocking, bounded report remediation, bilingual candidate input, Python/Go/TypeScript/neutral extraction, private resume context, cross-Agent contract equivalence, and the 100,000-observation batch invariant.

The exact-Scope MCP synchronization and reconciliation were also completed:

- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync` -> complete.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:check` -> `missing=[]`, `mismatched=[]`, `outOfScope=[]`, `blocked=[]`.

## Deliberate environment boundary

The default Next standalone build is environment-blocked on Windows OneDrive because Next cannot create trace symlinks (`EPERM`); the equivalent non-standalone build passed, and the production Docker/Linux path is unchanged. An unscoped full-baseline design-fact sync is also blocked by an unrelated historical ADR that requires a governed data-model upgrade; the current repository-scan increment is synchronized and reconciled independently under its exact Scope.
