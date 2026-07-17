# Legacy Relation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize legacy AssetLink vocabulary into ontology-valid relationships before MCP persistence.

**Architecture:** A registry in the MCP server maps historical relationship codes to one or more canonical relation commands. Seed data passes through this registry, then the existing `link_assets` MCP write boundary; unknown or ambiguous mappings fail with durable bilingual backlog evidence.

**Tech Stack:** TypeScript, Vitest, MCP SDK, PostgreSQL/Prisma, SpecForge relationship ontology.

## Global Constraints

- Preserve exact architecture scope and MCP-only system writes.
- Do not silently drop, invert, or broaden unknown legacy relations.
- `reads-writes` splits into `READS` and `WRITES`; `calls` requires explicit role metadata or fails.
- Every supported migration has ADR evidence and deterministic tests.

### Task 1: Registry and Normalization Tests

**Files:**
- Create: `apps/mcp-server/src/relationships/legacy-migration.ts`
- Create: `apps/mcp-server/src/relationships/legacy-migration.test.ts`

- [ ] Write failing tests for `reads-writes` splitting, valid API contract `contains`, aggregate data-model reads/writes, unknown-code rejection, and ambiguous `calls` rejection.
- [ ] Run `pnpm --filter @specforge/mcp-server test -- legacy-migration.test.ts`; expect failure.
- [ ] Implement `normalizeLegacyAssetLink(link): CanonicalAssetLink[]` with a versioned mapping registry and typed migration errors.
- [ ] Re-run the focused test; expect pass.
- [ ] Commit `feat: normalize legacy relationship vocabulary`.

### Task 2: Seed Through the Registry

**Files:**
- Modify: `apps/mcp-server/src/seed.ts`
- Modify: `prisma/data/specforge-self-design.ts`
- Test: `apps/mcp-server/src/persistence.test.ts`

- [ ] Add a failing seed-level test proving every self-design AssetLink normalizes before `link_assets` is called.
- [ ] Replace direct AssetLink tool calls with normalized outputs, preserving source, target, descriptions, and scope.
- [ ] Annotate historical `calls` links with explicit consuming/providing role metadata or replace them with their canonical relationship in seed data.
- [ ] Run `pnpm --filter @specforge/mcp-server test` and `pnpm db:seed`; expect pass.
- [ ] Commit `feat: normalize seed asset links before MCP writes`.

### Task 3: Drift Evidence and MCP Reconciliation

**Files:**
- Create: `scripts/check-legacy-relations.ts`
- Create: `scripts/check-legacy-relations.test.ts`
- Modify: `package.json`
- Modify: `docs/adr/0007-design-fact-dual-record-governance.md`

- [ ] Write a failing test that reports unregistered legacy code and missing ADR evidence.
- [ ] Implement the checker to inspect self-design links and registry mappings; print a structured report and exit non-zero on unknown/ambiguous relations.
- [ ] Add `design-facts:relations:check` and document the migration version/evidence in ADR 0007.
- [ ] Run the focused checker test, `pnpm design-facts:relations:check`, and MCP seed; expect pass.
- [ ] Commit `feat: guard legacy relation drift`.
