# Federation Hardening Slice 3B Report

## Scope

This slice hardens source-version determinism, reconciliation roots, audit-summary hygiene, and design-fact related-asset validation. It does not change outbox, connector, authorization, or promotion contracts.

## Implemented

- Reconciliation now ignores `TOMBSTONED` observations and selects one latest active observation per exact Scope plus connector/source namespace/external asset type/external ID. Freshness ordering is numeric monotonic version (`9` before `10`, with optional `v` prefix), then `observedAt`, then lexical `sourceVersion`, then observation ID.
- Accepted facts, mappings, observations, fact digests, and final issues are canonical-sorted before diagnostics and root digest generation. Reordered database results therefore produce the same report and root.
- Audit summaries recursively redact credential-shaped fields such as `secretReference`, passwords, tokens, authorization values, API keys, and private keys. Arbitrary `payload` values are replaced by a digest marker while identifiers and digest fields remain available for diagnosis.
- Design-fact synchronization now rejects unknown related-asset prefixes instead of defaulting them to `api`.

## Evidence

- `node $vitest run packages/core/src/__tests__ --root .`: **12 files, 134 tests passed**.
- `node $vitest run src/federation/tools.test.ts src/federation/persistence.test.ts --root apps/mcp-server`: **2 files, 96 tests passed**.
- `node $vitest run scripts/reconcile-federated-facts.test.ts --root .`: **11 tests passed**.
- `node $vitest run scripts/sync-design-facts.test.ts scripts/design-fact-manifest.test.ts --root .`: **2 files, 7 tests passed**.
- `pnpm --filter @specforge/core typecheck`: passed.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `git diff --check`: passed; Git reported only normal LF-to-CRLF working-copy warnings.

## MCP Synchronization Blocked

Live PostgreSQL/MCP synchronization remains unverified because `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable. Retry after configuring PostgreSQL and the exact Scope, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, the federation check, and read back receipts. No live synchronization success is claimed.
