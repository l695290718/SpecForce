# Federation Hardening Slice 3B Fix Report

## Finding Fixed

Failed federation exceptions are no longer persisted raw in `AuditLog.errorMessage`. The failed-call audit path now stores only the stable client error code plus a deterministic SHA-256 diagnostic reference:

`FEDERATION_TOOL_ERROR;diagnosticRef=<64-hex-digest>`

The digest is derived from the action, target identifiers, and private exception detail for correlation without retaining the exception text. Client responses continue to use the existing safe stable error mapping.

## Evidence

- Updated the unknown-runtime regression to assert the credential-bearing exception text is absent from both the client response and `AuditLog.errorMessage`, while the stable code and 64-hex diagnostic reference remain.
- `node .\\node_modules\\.pnpm\\vitest@2.1.9_@types+node@22.20.1\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src\\federation\\tools.test.ts apps\\mcp-server\\src\\federation\\persistence.test.ts`: **2 files, 96 tests passed**.
- `pnpm --filter @specforge/core typecheck`: passed.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `git diff --check`: passed; only normal LF-to-CRLF working-copy warnings were reported.

## MCP Synchronization Blocked

Live PostgreSQL/MCP synchronization remains unverified because `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are unavailable. Retry after configuring PostgreSQL and the exact Scope, then run `pnpm design-facts:sync`, `pnpm design-facts:check`, the federation check, and read back receipts. No live synchronization success is claimed.
