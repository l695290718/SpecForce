# Federation Hardening Slice 1 Report

## Status

Locally verified and recorded by its enclosing commit. Whole-branch integration hardening remains in progress; PostgreSQL/MCP verification and the requested second slice are not complete.

## Implemented

- Removed public `acceptedFacts` from `reconcile_federated_scope`; the read-only tool loads exact-Scope promoted canonical facts through `listPersistedCanonicalFederatedFacts` and validates persisted envelopes.
- Bound promotion to the selected candidate observation and required `mapping.assetId`; caller content, digest, provenance, authority, and localization bypass attempts are rejected, while the final envelope is derived from persisted candidate, mapping, and policy state.
- Made every reconciliation issue blocking in core and CLI, including content drift, missing facts, undeclared changes, Scope or identity conflicts, incomplete localization, pending required delivery, and unavailable connectors.

## TDD Evidence

- MCP boundary regressions failed before implementation because caller-controlled fields were public and candidate-binding violations collapsed to `FEDERATION_TOOL_ERROR`.
- Candidate adversarial persistence tests failed before implementation for missing mapped identity, content/digest substitution, invalid candidate digest/provenance, and localization bypass.
- Core/CLI regressions failed before implementation because content and missing-fact issues could produce a successful gate result.

## Final Local Verification

- `node .\\node_modules\\vitest\\vitest.mjs run packages\\core\\src\\__tests__\\federation.test.ts scripts\\reconcile-federated-facts.test.ts`: passed 2 files, 30 tests.
- `node .\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src\\federation\\persistence.test.ts apps\\mcp-server\\src\\federation\\tools.test.ts`: passed 2 files, 64 tests.
- `node .\\node_modules\\vitest\\vitest.mjs run scripts\\design-fact-manifest.test.ts`: passed 1 file, 2 tests.
- `pnpm --filter @specforge/core typecheck`: passed.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `git diff --check`: passed with line-ending warnings only.

## Pending

- Slice 2: transactional outbox coverage, connector permission/state checks, deterministic latest-observation handling, and remaining scoped Important/Minor findings.
- **MCP synchronization blocked:** no reachable `DATABASE_URL` was available for live PostgreSQL checks or `pnpm design-facts:sync` / `pnpm design-facts:check`. Retry when the configured PostgreSQL/MCP environment is available.
