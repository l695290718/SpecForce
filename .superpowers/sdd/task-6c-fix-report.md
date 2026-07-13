# Task 6C Review Fix Report

## Result

All Task 6C review findings were addressed with test-first regressions.

## Fixed Workflows

- `generate_context_pack` now always generates an English-canonical bilingual pack from the exact scoped persisted catalog.
- Generation attaches the authorized application-service `architectureScope`, validates bilingual completeness, persists through `upsertContextPack`, then returns the requested locale projection plus canonical generated-pack provenance.
- Chinese projection cannot replace canonical fields. Asset IDs, proposal IDs, reference types, and reference IDs remain invariant; only projected reference labels localize.
- `create_proposal` and `update_proposal` now require matching `applicationServiceId` and `architectureScope`, accept a complete bilingual proposal, and write through persisted `upsertProposal`.
- `create_adr` now requires the same scope contract and writes through persisted `upsertDesignAsset` as an ADR.
- Removed all MCP tool imports and calls to global seed-backed Proposal/ADR mutation services.
- Canonical and localized graphs are built independently. Persisted Context Packs and links are appended to each graph independently, and canonical provenance is locale-invariant.
- Smoke now verifies scoped resource URIs, localized graph output, generated-pack persistence/export, missing scope rejection, and denied scope rejection. The manual post-generation Context Pack upsert was removed.

## Diagnostics Retained

- Seed subprocess stderr remains inherited for actionable seed diagnostics.
- Seed-mode tool failures log their underlying error before returning the stable MCP error envelope.

## Verification

- Focused MCP derived/tool/resource tests: 31 passed.
- MCP + Core full tests: 113 passed in the standard run.
- Dedicated PostgreSQL scope-identity integration tests: 3 passed in the isolated `specforge_scope_identity_test` schema.
- Root Core/MCP/Web typecheck: passed.
- Live PostgreSQL MCP smoke: passed all 10 workflow assertions.

## Coordination

`apps/mcp-server/src/persistence.ts` and `apps/mcp-server/src/persistence.integration.test.ts` remain owned by the separate persistence bugfix and are excluded from this commit.
