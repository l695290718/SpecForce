# Federation Hardening Slice 3C Report

## Scope

Documentation and canonical design-fact records only. No implementation files or runtime contracts were changed.

## Updated Records

- ADR-0010 now documents the audit-security contract in English and Chinese: failed federation calls persist only `FEDERATION_TOOL_ERROR;diagnosticRef=<64-hex SHA-256 digest>` in `AuditLog.errorMessage`; raw exception messages and credential text are not persisted.
- `docs/design-facts/baseline-manifest.json` carries the same bilingual contract fields and adds a sixth audit-redaction Evidence entry. Existing manifest-driven synchronization will create `evidence-adr-federated-design-fact-synchronization-6 --VALIDATES--> adr-federated-design-fact-synchronization`, preserving the existing Proposal, Context Pack, related-asset, and Evidence links.
- The bilingual TODO/backlog records local implementation, the blocked MCP synchronization state, owner, reason, and retry trigger.
- The Slice 3B fix report now uses the explicit repository Vitest path and is reproducible without an initialized shell variable.

## Evidence

- `node .\\node_modules\\.pnpm\\vitest@2.1.9_@types+node@22.20.1\\node_modules\\vitest\\vitest.mjs run scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts --root .`: **2 files, 7 tests passed**.
- `node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('docs/design-facts/baseline-manifest.json','utf8')); console.log('baseline manifest JSON valid')"`: passed.
- `git diff --check`: passed; only normal LF-to-CRLF working-copy warnings were reported.

## MCP Synchronization Blocked

**Owner:** SpecForge Architecture.

**Reason:** `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable, so the updated ADR, sixth Evidence asset, typed `VALIDATES` link, localized fields, and read-back receipts cannot be verified in PostgreSQL/MCP.

**Retry trigger:** Configure reachable PostgreSQL and the exact Designer Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured-scope federation check, then read back all IDs, Scope, canonical English fields, Chinese overlays, the sixth Evidence/`VALIDATES` link, and the audit-security contract. No synchronization success is claimed.
