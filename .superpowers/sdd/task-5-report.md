# Task 5 Report: Federated Design-Fact Governance

## Implementation

Recorded ADR adr-federated-design-fact-synchronization for the first federated governance-core increment. The ADR has the required English canonical sections and complete Chinese localization, names the exact Designer Scope, distinguishes implemented contracts from deferred connector capabilities, and records the unavailable MCP synchronization/read-back as blocked.

Added the ADR to the baseline manifest with its dedicated Proposal (proposal-federated-design-fact-governance-core), Context Pack (context-pack-federated-design-fact-governance), DECIDES targets, and three Evidence records. The existing manifest-driven synchronizeDesignFacts builder maintains the required ADR, Proposal, Context Pack, directional links, and Evidence records through MCP for this new decision; no parallel synchronization path was added.

Updated repository governance, the ADR index rules, the federation design specification's verified evidence, and a scoped backlog fact. No legacy scanner, continuous inbound connector, outbound proposal, or external APPLY capability is claimed.

## Files

- AGENTS.md
- docs/TODO.md
- docs/adr/README.md
- docs/adr/0010-federated-design-fact-synchronization.md
- docs/design-facts/baseline-manifest.json
- docs/superpowers/specs/2026-07-19-federated-design-fact-synchronization-design.md
- scripts/design-fact-manifest.test.ts
- .superpowers/sdd/task-5-report.md

## TDD Evidence

RED: node node_modules/vitest/vitest.mjs run scripts/design-fact-manifest.test.ts

The new assertion failed as intended: adr-federated-design-fact-synchronization was absent from the baseline manifest.

GREEN: node node_modules/vitest/vitest.mjs run scripts/design-fact-manifest.test.ts

Result: 1 file passed, 2 tests passed.

## Verification

- node node_modules/vitest/vitest.mjs run scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts scripts/reconcile-design-facts.test.ts scripts/reconcile-federated-facts.test.ts: 4 files passed, 18 tests passed.
- node node_modules/vitest/vitest.mjs run packages/core/src/__tests__: 12 files passed, 126 tests passed.
- node node_modules/vitest/vitest.mjs run apps/mcp-server/src: 12 files passed, 144 tests passed; 9 PostgreSQL integration tests skipped because DATABASE_URL was absent.
- pnpm --filter @specforge/core typecheck: exit 0.
- pnpm --filter @specforge/mcp-server typecheck: exit 0.

## Concerns

- DATABASE_URL, SPECFORGE_APPLICATION_SERVICE_ID, and SPECFORGE_SCOPE_PATH were absent. Per task instruction, pnpm design-facts:sync, pnpm design-facts:check, and pnpm design-facts:federation:check were not run.
- The exact package test commands were attempted. pnpm --filter @specforge/core test is blocked before collection by Vitest 2.1/esbuild config loading in this Windows sandbox; pnpm --filter @specforge/mcp-server exec vitest run cannot resolve the worktree's generated Vitest command shim. The workspace-level Vitest commands above passed instead.
- MCP synchronization remains blocked until a reachable configured PostgreSQL database is available. docs/TODO.md records the owner, rationale, and retry trigger.

## Commit

docs: record federated design fact governance
