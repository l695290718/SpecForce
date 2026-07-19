# Federation Hardening Slice 2C

## Scope

This slice hardens post-mutation AuditLog finalization and records the unavailable MCP synchronization environment. It does not change federation outbox, connector, or source-version behavior.

## Implemented

- A successful mutation followed by AuditLog finalization failure now writes the intended success output summary with status `SUCCESS_REPAIR_REQUIRED` and error marker `AUDIT_FINALIZATION_RETRY_REQUIRED`; it is not rewritten as a generic failed outcome.
- Exported `retryFederationAuditFinalization(id)` reads the repair marker and converges it to `success`, preserving the stored summary. Repeated retries after convergence are no-ops.
- If the repair marker itself cannot be written, the client receives only `AUDIT_PERSISTENCE_FAILED`; database error details remain server-side and the original row is not falsely reported as successful.

## Evidence

- `$vitest = (Resolve-Path 'node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs').Path; node $vitest run src/federation/tools.test.ts src/federation/persistence.test.ts --root apps/mcp-server` passed: **2 files, 76 tests passed**.
- `$vitest = (Resolve-Path 'node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs').Path; node $vitest run scripts/design-fact-manifest.test.ts --root .` passed: **2 tests passed**.
- `pnpm --filter @specforge/core typecheck` passed.
- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `git diff --check` passed.

## MCP Synchronization Blocked

**Owner:** SpecForge Architecture.

**Reason:** `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable in the current environment, so MCP persistence and read-back cannot be verified.

**Retry trigger:** Configure reachable PostgreSQL and the exact Designer Scope variables, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured-scope federation check; read back the persisted IDs, Scope, canonical English fields, Chinese overlays, links, and evidence.

## 中文本地化状态

审计恢复已在本地测试通过，但 MCP 同步仍被阻塞。负责人是 SpecForge Architecture；原因是当前环境没有可用的 `DATABASE_URL`、`SPECFORGE_APPLICATION_SERVICE_ID` 和 `SPECFORGE_SCOPE_PATH`。配置 PostgreSQL 和精确 Scope 变量后，运行同步、检查、联邦 Scope 检查并回读记录，是允许重试的条件。
