# Federation Hardening Slice 2B

## Scope

This slice hardens federation authorization, candidate promotion boundaries, and MCP audit recovery. It intentionally does not change federation outbox delivery, connector lifecycle, or source-version reconciliation behavior.

## Implemented

- Federation MCP reads and writes require an exact application-service Scope grant. A parent module grant cannot authorize a descendant service.
- MCP permissions are derived only from authenticated `authInfo.scopes`. Actor-provided `permissions` are not merged into the authorization decision. Every permission declared by a tool is checked independently.
- `PromoteCandidateInput` contains only `candidateId`, `approvalReason`, and `architectureScope`. Runtime validation rejects extra or malformed fields. Promotion derives payload, bilingual localization, digest, provenance, asset identity, and authority policy from the persisted candidate observation and scoped identity mapping.
- Audit finalization is recoverable after a committed mutation: if terminal finalization fails, the wrapper attempts an idempotent `failed` marker with `AUDIT_FINALIZATION_RETRY_REQUIRED`. The caller receives a stable audit persistence error, and the marker identifies the record for reconciliation/retry.

## Evidence

- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `$vitest = (Resolve-Path 'node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs').Path; node $vitest run src/federation/tools.test.ts src/federation/persistence.test.ts --root apps/mcp-server` passed: **2 files, 73 tests passed**.
- The focused tests cover parent-only Scope denial for reads/writes, exact-grant success, one-sided missing authenticated permission claims, arbitrary promotion input rejection, candidate-derived promotion, and audit recovery marking.

## External status

Live PostgreSQL and external MCP synchronization were not claimed. This worktree run did not provide the required `DATABASE_URL` and MCP synchronization environment. Production synchronization remains blocked until those checks can be executed; this report records local implementation and test evidence only.
