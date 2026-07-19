# Task 5 Report: Federated Design-Fact Governance

## Implementation

Recorded `adr-federated-design-fact-synchronization` with explicit English canonical Context, Decision, Alternatives, Consequences, Constraints, and Evidence fields plus complete Chinese localization. The ADR, manifest, Proposal, Context Pack, typed links, and Evidence records use the exact Designer Scope and stable IDs.

Fixed the existing manifest-driven `synchronizeDesignFacts` MCP builder to parse structured ADR sections, preserve non-empty canonical fields, emit only validator-supported ADR localization fields in `localizedContent.en` and `localizedContent.zh`, map `data-*` references to `dataModel`, and generate Proposal, Context Pack, typed `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `DECIDES`, `VALIDATES`, and separate Evidence asset calls through the same MCP path. ADR evidence remains canonical and is not duplicated into the ADR localization overlay. The federated ADR covers valid `DECIDES` target types `api`, `dataModel`, and `adr`; no parallel sync path was added.

Aligned the design specification status: governance-core implementation is complete locally; MCP persistence/read-back and real PostgreSQL verification are blocked pending environment configuration; legacy scanners, continuous inbound/outbound synchronization, and external `APPLY` remain deferred. No Task 6 or unrelated UI work is included.

## Files

Task 5 deliverable files:

- `AGENTS.md`
- `docs/TODO.md`
- `docs/adr/README.md`
- `docs/adr/0010-federated-design-fact-synchronization.md`
- `docs/design-facts/baseline-manifest.json`
- `docs/superpowers/specs/2026-07-19-federated-design-fact-synchronization-design.md`
- `scripts/design-fact-manifest.test.ts`
- `scripts/sync-design-facts.ts`
- `scripts/sync-design-facts.test.ts`
- `.superpowers/sdd/task-5-report.md`

## TDD Evidence

RED: `node .\\node_modules\\vitest\\vitest.mjs run scripts\\sync-design-facts.test.ts`

The review-focused test failed as intended before implementation: canonical section fields were empty/whole-Markdown values, `localizedContent.en` was absent, and all related assets were emitted as `api`.

P1 RED: the follow-up assertion failed because `localizedContent.en/zh.evidence` was emitted even though the ADR localization registry does not permit that field.

GREEN: `node .\\node_modules\\vitest\\vitest.mjs run scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts scripts\\reconcile-design-facts.test.ts scripts\\reconcile-federated-facts.test.ts`

Result: 4 files passed, 19 tests passed; the sync fixture also passes the existing `validateAssetLocalization("adr", ...)` validator.

## Verification

- `node .\\node_modules\\vitest\\vitest.mjs run scripts\\design-fact-manifest.test.ts scripts\\sync-design-facts.test.ts scripts\\reconcile-design-facts.test.ts scripts\\reconcile-federated-facts.test.ts`: 4 files passed, 19 tests passed.
- `node .\\node_modules\\vitest\\vitest.mjs run packages\\core\\src\\__tests__`: 12 files passed, 126 tests passed.
- `node .\\node_modules\\vitest\\vitest.mjs run apps\\mcp-server\\src`: 12 files passed, 144 tests passed; 9 PostgreSQL integration tests skipped without `DATABASE_URL`.
- `pnpm --filter @specforge/core typecheck`: exit 0.
- `pnpm --filter @specforge/mcp-server typecheck`: exit 0.
- `git diff --check`: exit 0; only expected Git LF/CRLF normalization warnings.

## Concerns

- `DATABASE_URL`, `SPECFORGE_APPLICATION_SERVICE_ID`, and `SPECFORGE_SCOPE_PATH` are absent. `pnpm design-facts:sync`, `pnpm design-facts:check`, and the configured federation check were not run.
- MCP synchronization/read-back remains blocked until a reachable configured PostgreSQL/MCP environment is available. `docs/TODO.md` records the owner, rationale, and retry trigger.
- Exact package test entrypoints remain affected by the known Windows Vitest/esbuild config/shim issue; direct workspace Vitest commands above passed.

## Commit

`fix: remove unsupported ADR evidence localization`
