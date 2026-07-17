# Design Evidence Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist, localize, link, and reconcile verification Evidence as first-class SpecForge assets through MCP.

**Architecture:** Extend the shared registry with an `evidence` payload stored in the existing generic design-asset table. The generic `upsert_design_asset` MCP tool writes it; `link_assets` records `Evidence --VALIDATES--> ADR`; scripts continue to communicate only through MCP.

**Tech Stack:** TypeScript, Vitest, Zod MCP contracts, Prisma-backed generic asset persistence, pnpm.

## Global Constraints

- English is canonical; human-facing Evidence fields require a complete Chinese overlay.
- Every Evidence write and read carries the exact owning `architectureScope`.
- MCP is the only design-record write boundary.
- A missing, mismatched, failed, out-of-scope, or unlinked Evidence blocks reconciliation.

---

### Task 1: Register And Localize Evidence Assets

**Files:** `packages/core/src/types.ts`, `packages/core/src/repository.ts`, `packages/core/src/localization/assets.ts`, `packages/core/src/data/seed-data.ts`, `packages/core/src/__tests__/asset-localization.test.ts`.

**Produces:** `Evidence`, `EvidenceLocalizedFields`, `AssetType = "evidence"`, and `SpecForgeDataStore.evidence`. `validateAssetLocalization("evidence", evidence)` requires English and Chinese `name`, `description`, `command`, and `result`.

- [ ] Write a failing localization test for a missing Chinese Evidence result.
- [ ] Run `pnpm exec vitest run packages/core/src/__tests__/asset-localization.test.ts`; observe the expected failure.
- [ ] Add the minimal type, collection, label, seed collection, and localization registry entry.
- [ ] Run `pnpm exec vitest run packages/core/src/__tests__/asset-localization.test.ts` and `pnpm --filter @specforge/core typecheck`.
- [ ] Commit `feat: add evidence design assets`.

### Task 2: Add Evidence Validation Relationship

**Files:** `packages/core/src/relationships/ontology.ts`, `packages/core/src/__tests__/relationship-ontology.test.ts`.

**Produces:** canonical `VALIDATES`, valid only from `evidence` to `adr`.

- [ ] Write a failing assertion for `evidence -> adr / VALIDATES`.
- [ ] Run `pnpm exec vitest run packages/core/src/__tests__/relationship-ontology.test.ts`; observe failure.
- [ ] Add the canonical ontology entry with constrained endpoints.
- [ ] Re-run the ontology test and commit `feat: model evidence validation links`.

### Task 3: Synchronize And Reconcile Evidence Through MCP

**Files:** `scripts/sync-design-facts.ts`, `scripts/sync-design-facts.test.ts`, `scripts/reconcile-design-facts.ts`, `scripts/reconcile-design-facts.test.ts`, `docs/TODO.md`.

**Produces:** deterministic Evidence IDs; `upsert_design_asset` Evidence payloads and `VALIDATES` links; reconciliation requiring exact command, result, passed status, Chinese overlay, scope, and edge.

- [ ] Write failing sync and reconciliation tests for missing Evidence and missing `VALIDATES` relationship.
- [ ] Run `pnpm exec vitest run scripts/sync-design-facts.test.ts scripts/reconcile-design-facts.test.ts`; observe failure.
- [ ] Implement deterministic IDs, bilingual payload construction, MCP upsert/link calls, and fail-closed checks.
- [ ] Run script tests, then `pnpm design-facts:sync` and `pnpm design-facts:check` against the local database.
- [ ] Mark the backlog item complete only after the MCP readback succeeds; commit `feat: synchronize design evidence facts`.

### Task 4: Final Verification

- [ ] Run `pnpm typecheck`, focused script tests, and `pnpm design-facts:check`.
- [ ] Confirm `git status --short` is clean and record final commit IDs.
