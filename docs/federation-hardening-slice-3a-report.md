# Federation Hardening Slice 3A

## Scope

This slice hardens transactional federation delivery and connector readiness. It does not change source-version selection, reconciliation root sorting, audit redaction, or related-asset prefix mapping.

## Implemented

- Connector registration now upserts the connector and its scoped `FEDERATION_CONNECTOR_REGISTERED` outbox event in one Prisma transaction.
- Candidate promotion now emits one exact-Scope `FEDERATION_CANDIDATE_PROMOTED` outbox event in the promotion transaction.
- DesignChangeSession creation now emits one exact-Scope `FEDERATION_DESIGN_CHANGE_SESSION_CREATED` outbox event in the session transaction.
- All three event families use stable idempotency keys, so replay is bounded to one event per Scope and subject. Event failure rolls back the accepted write.
- `recordObservation` takes a transaction-scoped advisory lock, rechecks the exact-Scope connector, and rejects missing, non-`ACTIVE`, or non-`OBSERVE` connectors before writing the observation. Existing observation/outbox atomicity remains covered.
- Cross-Scope connector IDs are rejected and outbox references are persisted with the requested exact Scope.

## Evidence

- `node $vitest run src/federation/tools.test.ts src/federation/persistence.test.ts --root apps/mcp-server` passed: **2 files, 92 tests passed**.
- `node $vitest run scripts/design-fact-manifest.test.ts --root .` passed: **3 tests passed**.
- `pnpm --filter @specforge/core typecheck` passed.
- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `git diff --check` passed; Git reported only normal LF-to-CRLF working-copy warnings.
- `docs/design-facts/baseline-manifest.json` parsed successfully.
- No Prisma schema or migration changes were required; the existing scoped FederationOutbox constraints were used.

## MCP Synchronization Blocked

**Owner:** SpecForge Architecture.

**Reason:** `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable in this environment, so live PostgreSQL persistence, MCP synchronization, and read-back receipts were not verified.

**Retry trigger:** Configure reachable PostgreSQL and the exact Scope variables, run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured federation check, then read back receipts, IDs, Scope, localized fields, links, and evidence. No live synchronization success is claimed.
