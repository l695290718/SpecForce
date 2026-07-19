# Federation Hardening Slice 3E Report

## Scope

This slice hardens manifest-driven ADR localization synchronization. Runtime federation, outbox, connector, and source-version behavior are unchanged.

## Implemented

- ADR localized overlays are limited to the validator-supported keys: `name`, `title`, `description`, `context`, `decision`, `alternatives`, `consequences`, and `constraints`.
- Unknown overlay keys, including legacy audit metadata and caller-supplied arbitrary fields, fail with a stable `DESIGN_FACT_LOCALIZATION_KEY_UNSUPPORTED` error. A changed caller title fails with `DESIGN_FACT_LOCALIZATION_CANONICAL_OVERRIDE`; parsed ADR identity sections remain authoritative.
- Manifest owner, reason, retry trigger, status, and audit fields are canonical decision metadata. The bilingual security and blocked-sync contract is carried through valid ADR `decision` and `constraints` fields, and the English overlay also supplies the canonical ADR fields sent to `create_adr`.
- Evidence 6 remains emitted and linked as `VALIDATES` to the federated ADR in the exact Scope.

## Evidence

- `node .\\node_modules\\.pnpm\\vitest@2.1.9_@types+node@22.20.1\\node_modules\\vitest\\vitest.mjs run scripts\\sync-design-facts.test.ts scripts\\design-fact-manifest.test.ts`: **2 files, 9 tests passed**.
- `node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck scripts/sync-design-facts.ts`: passed.
- `pnpm --filter @specforge/core typecheck`: passed.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('docs/design-facts/baseline-manifest.json','utf8')); console.log('baseline manifest JSON valid')"`: passed.
- `git diff --check`: passed; only normal LF-to-CRLF working-copy warnings were reported.

## MCP Synchronization Blocked

**Owner:** SpecForge Architecture.

**Reason:** `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable, so the updated ADR payload, localized overlays, Evidence 6, `VALIDATES` link, and PostgreSQL read-back cannot be verified in the live MCP environment.

**Retry trigger:** Configure reachable PostgreSQL and the exact Designer Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured-scope federation check, then read back the ADR, bilingual canonical fields, Evidence 6, typed link, and receipts. No synchronization success is claimed.
