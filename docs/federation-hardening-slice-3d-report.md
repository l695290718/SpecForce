# Federation Hardening Slice 3D Report

## Scope

This slice changes only the manifest-driven design-fact synchronization path and its documentation/tests. Runtime federation implementation is unchanged.

## Implemented

- `scripts/sync-design-facts.ts` now merges the supported `decision.localizedContent.en` and `.zh` governance metadata into the canonical ADR payload.
- The supported overlay whitelist is limited to `status`, `owner`, `reason`, `retryTrigger`, `auditFailureCode`, `auditDiagnosticReference`, and `auditSecurityContract`. Parsed ADR title, description, context, decision, alternatives, consequences, and constraints remain authoritative; unsupported overlay fields cannot override or enter the MCP ADR.
- The baseline audit contract reaches the MCP ADR when synchronization runs: `FEDERATION_TOOL_ERROR` plus `diagnosticRef=<64-hex SHA-256 digest>`, with no raw exception or credential persistence, and the bilingual blocked owner/reason/retry metadata.
- Existing evidence iteration continues to emit Evidence 6 as `evidence-adr-federated-design-fact-synchronization-6 --VALIDATES--> adr-federated-design-fact-synchronization` in the exact manifest Scope.

## Evidence

- `node .\\node_modules\\.pnpm\\vitest@2.1.9_@types+node@22.20.1\\node_modules\\vitest\\vitest.mjs run scripts/sync-design-facts.test.ts scripts/design-fact-manifest.test.ts --root .`: **2 files, 8 tests passed**.
- `node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('docs/design-facts/baseline-manifest.json','utf8')); console.log('baseline manifest JSON valid')"`: passed.
- `git diff --check`: passed; only normal LF-to-CRLF working-copy warnings were reported.

## MCP Synchronization Blocked

**Owner:** SpecForge Architecture.

**Reason:** `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable, so the updated ADR payload, Evidence 6 asset, `VALIDATES` link, localized overlays, and read-back receipts cannot be verified in PostgreSQL/MCP.

**Retry trigger:** Configure reachable PostgreSQL and exact Designer Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured-scope federation check, then read back all IDs, Scope, canonical English sections, bilingual audit metadata, Evidence 6, and typed links. No synchronization success is claimed.
