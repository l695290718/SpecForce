# Asset-to-3A Mapping Semantics Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with focused tests and a review checkpoint after each task.

**Goal:** Make design-asset-to-3A assignment the primary mapping contract while presenting unit-to-unit relationships as architecture realizations, without breaking v5/v6 Baselines.

**Architecture:** Keep authored membership revisions, coverage rows, and the published 3A unit projection as the authoritative inputs. Add a deterministic, generation-bound asset mapping read model in the MCP read boundary that emits one outcome per scoped catalog record. This compatibility increment composes existing PostgreSQL projections at read time and does not add a redundant authored table; a persistent high-volume materializer remains separately governed. Preserve the existing unit realization projection internally and add public compatibility aliases rather than destructive table or ID changes.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, MCP stdio tools, `@specforge/core`, `@specforge/knowledge-query`, `@specforge/knowledge-projector`, Next.js/React, Vitest, pnpm.

## Global Constraints

- Scope is exactly `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL is authoritative for authored assets, memberships, realizations, relationships, Baselines, and coverage; projections are rebuildable.
- MCP is the only authored design-fact write boundary; the Web remains read-only.
- English canonical fields are required and Chinese human-facing overlays are complete.
- `DIRECT` is authoritative; `TRACE` is derived; `EXEMPT` and `BLOCKED` require explicit reasons.
- v5 remains `4/38/3`; v6 remains `8/42/6`; no v7 architecture units are published in this increment.
- All reads enforce exact Scope before returning counts, records, or diagnostics.
- Implementation session: `design-change-session:8341f602-0627-463b-9aae-1636fcfe8e94`.

---

### Task 1: Add the asset mapping domain contract and deterministic read model

**Files:**
- Create: `packages/core/src/architecture-map/asset-mapping.ts`
- Create: `packages/core/src/architecture-map/asset-mapping.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: accepted `ArchitectureUnitMemberProjection` rows, current coverage projection rows, the pinned catalog identity, and the published Baseline identity.
- Produces: `Asset3AMappingMode`, `Asset3AMappingProjection`, deterministic materialization, and a bounded exact-Scope composition over persisted coverage, memberships, and units.

- [x] **Step 1: Add strict types and validation tests.**

  Define `DIRECT | TRACE | EXEMPT | BLOCKED`, the projection identity fields, target unit fields, evidence path fields, and reason codes. Require an asset identity, exact Scope, generation identity, mode, and digest. Require a target unit and membership revision for `DIRECT`; require a non-empty ordered path for `TRACE`; require owner/rationale/trigger for `EXEMPT` and `BLOCKED`.

- [x] **Step 2: Preserve authoritative storage boundaries.**

  Reuse the existing PostgreSQL coverage, membership, and architecture-unit projection tables for this compatibility increment. Do not add a second authored table or rename/delete existing unit member/mapping models. A durable materialized mapping table for sources above the bounded read limit remains a deferred scale increment and must receive its own design session.

- [x] **Step 3: Implement deterministic materialization.**

  Read one pinned catalog/relationship/Baseline/coverage tuple. Emit one result for every catalog asset. Prefer one accepted direct membership. Otherwise translate an existing coverage path to `TRACE`; preserve explicit exempt/blocked states; fail on multiple conflicting primary targets. Sort by semantic identity and calculate each row digest and the generation digest.

- [x] **Step 4: Add deterministic replay and conflict tests.**

  Reject cross-Scope rows, generation mismatches, duplicate assets, and conflicting direct targets. Test direct, trace, blocked, ambiguous, and exact-Scope cases. Persistence replay remains covered by the existing authoritative coverage generation rather than duplicated here.

- [x] **Step 5: Run focused checks.**

  Run `pnpm exec vitest run apps/knowledge-projector/src/asset-3a-mapping-materializer.test.ts prisma/three-a-schema.test.ts`.

Expected: all new tests pass and no existing authoritative model is removed.

### Task 2: Expose asset mappings and rename unit relationships in MCP contracts

**Files:**
- Modify: `apps/mcp-server/src/knowledge/architecture-map-adapter.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`

**Interfaces:**
- Consumes: `Asset3AMappingProjection` materializer and existing exact-Scope architecture repositories.
- Produces: `search_3a_asset_mappings`, `get_3a_asset_mapping`, `search_3a_architecture_realizations`, and `architectureMap.realizations` with deprecated `mappings` compatibility.

- [x] **Step 1: Define bounded query inputs and outputs.**

  Add filters for asset type, target layer, target unit, mapping mode, status, and text. Require a positive bounded limit and opaque continuation token. Return Scope, Baseline, generation, freshness, totals, rows, and partial reasons without exposing unauthorized global counts.

- [x] **Step 2: Implement bounded composition queries.**

  Filter all Prisma reads by the full architecture identity. Use deterministic keyset ordering by asset type and asset ID, and compose persisted coverage rows with the published v6 unit projection. Do not use arbitrary graph traversal for asset mapping reads.

- [x] **Step 3: Register exact-Scope MCP tools.**

  Register `search_3a_asset_mappings`, `get_3a_asset_mapping`, and `search_3a_architecture_realizations`. Reuse the existing authorization and MCP audit path. Return `SCOPE_ACCESS_DENIED` before counts or records when the grant is missing.

- [x] **Step 4: Add compatibility output.**

  Make `realizations` canonical on `search_3a_architecture_map`. Keep `mappings` as a deprecated alias containing the same unit-to-unit records. Add tests proving that existing v5/v6 map consumers still receive identical realization IDs.

- [x] **Step 5: Run focused checks.**

  Run `pnpm exec vitest run packages/knowledge-query/src/architecture-map.test.ts apps/mcp-server/src/tools.test.ts`.

Expected: asset queries are Scope-safe and bounded; realization compatibility passes; no cross-Scope count is returned. The bounded source guard fails closed above 1,000 coverage rows until the scale increment is separately implemented.

### Task 3: Update the 3A workspace and bilingual terminology

**Files:**
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`
- Create: `apps/web/components/three-a/asset-3a-mapping-view.tsx`
- Create: `apps/web/components/three-a/asset-3a-mapping-detail.tsx`
- Modify: `apps/web/components/three-a/architecture-map-workspace.tsx`
- Modify: `apps/web/components/three-a/coverage-detail.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/components/three-a/*.test.tsx` where existing 3A view tests live

**Interfaces:**
- Consumes: the new MCP/query asset mapping result and existing architecture realization result.
- Produces: three explicit views: Asset Mapping, Architecture Realization, and Relationship Network.

- [x] **Step 1: Add Asset Mapping as the primary view.**

  Render asset ID/type, canonical and Chinese names, target layer/unit, mode, confidence, freshness, and evidence summary. Use stable rows and bounded pagination. Do not render raw asset nodes as the architecture realization graph.

- [x] **Step 2: Add mapping detail behavior.**

  Show the direct membership revision for `DIRECT`; show the ordered relationship path for `TRACE`; show owner/rationale/trigger for `EXEMPT` or `BLOCKED`. Keep labels visibly distinct and support bilingual switching.

- [x] **Step 3: Rename existing unit relationship UI.**

  Change user-facing “3A mapping” labels for unit-to-unit data to “Architecture Realization / 架构实现”. Keep existing URL parameters and graph behavior compatible.

- [x] **Step 4: Preserve the advanced network view.**

  Keep asset-to-asset typed relationships and impact analysis under “Relationship Network / 关系网络”. Do not merge those edges into the asset assignment table.

- [x] **Step 5: Run browser-facing component checks.**

  Run `pnpm --filter @specforge/web typecheck` and the focused 3A component tests.

Expected: bilingual labels distinguish assignment, realization, and relationship network; direct and trace states are not visually conflated. The current workspace reuses the published coverage table for the asset mapping view; a dedicated high-volume virtualized view remains a later UI increment.

### Task 4: Synchronize design facts, evidence, and backlog status

**Files:**
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Modify: `docs/TODO.md`
- Create: `docs/evidence/asset-to-3a-mapping-semantics-evidence.md`
- Modify: `docs/superpowers/specs/2026-08-19-asset-to-3a-mapping-semantics-design.md`
- Modify: `scripts/sync-design-facts.ts` or add a focused `scripts/sync-asset-3a-mapping-design-facts.ts`

**Interfaces:**
- Consumes: implementation receipts, exact test commands, current v5/v6 read-back, and the active design session.
- Produces: matching bilingual ADR/Proposal/Context Pack/Evidence, typed links, and an explicit backlog state that keeps v7 unit expansion deferred until mapping evidence is available.

- [x] **Step 1: Update repository ADR and evidence.**

  Record the terminology split, projection contract, compatibility policy, exact Scope, session ID, and command results. Explicitly state that current six unit relationships are realizations.

- [x] **Step 2: Write matching MCP design facts.**

  Through MCP, update the existing ADR and linked Proposal/Context Pack, create Evidence, and maintain typed links for implementation, context, validation, and impact. All canonical English fields must have complete Chinese overlays.

- [x] **Step 3: Update the active backlog.**

  Keep future structural v7 expansion as a tracked deferred item with owner, trigger, and rationale. Do not mark enterprise-wide 3A structural completeness complete merely because every current asset has a mapping outcome.

- [x] **Step 4: Read back and verify.**

  Run `pnpm design-facts:check` and read all changed records by stable ID through MCP.

Expected: no missing, mismatched, out-of-scope, or blocked design facts.

### Task 5: Complete verification and close the design session

**Files:**
- Modify: `docs/evidence/asset-to-3a-mapping-semantics-evidence.md`
- Modify: `docs/TODO.md`

- [x] **Step 1: Run focused and package checks.**

  Run `pnpm exec vitest run apps/knowledge-projector/src/asset-3a-mapping-materializer.test.ts packages/knowledge-query/src/architecture-map.test.ts apps/mcp-server/src/tools.test.ts`, `pnpm typecheck`, `pnpm enterprise-3a:verify`, and `git diff --check`.

- [x] **Step 2: Verify published read-back.**

  Confirm the exact Scope, 8 units, 42 direct memberships, 6 realizations, one asset mapping outcome per current catalog record, v6 `READY`, v5 `4/38/3`, and no fixture IDs.

- [x] **Step 3: Close the same session.**

  Run `pnpm design-context:close -- --session design-change-session:8341f602-0627-463b-9aae-1636fcfe8e94 --status CONVERGED --evidence "asset-mapping-materializer=PASS,asset-mapping-mcp=PASS,realization-compatibility=PASS,web-typecheck=PASS,enterprise-3a-readback=8-42-6,design-facts-check=PASS,git-diff-check=PASS"` only after all evidence is available. If any MCP write/read-back fails, close `BLOCKED` with the exact reason and retry trigger.

- [x] **Step 4: Commit the implementation as one coherent change.**

  Stage only the implementation, migration, tests, design records, and evidence. Preserve unrelated user files. Commit with `feat: make asset-to-3a mapping primary`.
