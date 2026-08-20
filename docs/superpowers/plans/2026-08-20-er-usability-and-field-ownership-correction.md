# ER Usability And Field Ownership Correction Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a focused verification after each task. Keep the exact design-change session open until all code, data, documentation, and MCP evidence converge.

**Goal:** Make the ER workspace show authoritative fields and provide usable bounded labels, zoom, canvas pan, entity drag, and exact-Scope field ownership for all current self-design data models.

**Architecture:** PostgreSQL and MCP remain the authored data boundary. The graph API keeps its signed, exact-Scope contract; the client aggregates all verified pages, projects only explicit field ownership, and renders a screen-space Pixi stage with a transformed graph root. Legacy unowned fields become quality facts, never inferred table columns.

**Tech Stack:** Next.js/React, TypeScript, PixiJS 8, Vitest, Prisma/PostgreSQL, SpecForge MCP stdio tools, pnpm, PowerShell Docker deployment.

## Global Constraints

- Owning application service: `com.huawei.celon.desiner`.
- Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored assets and relationship events; graph stores remain derived projections.
- ADRs, Proposals, Context Packs, DataModels, and typed links are synchronized through the exact-Scope MCP boundary.
- English is canonical; human-facing decision and quality content must have complete Chinese localization.
- No heuristic field ownership, cross-Scope read, new page authoring UI, or client-authored design fact is allowed.
- Design change session: `design-change-session:d4534150-0737-48be-a133-9e7986c132ee`.
- Preserve unrelated worktree files: `outputs/` and `scripts/build-design-code-challenge-workbook.mjs`.

---

### Task 1: Add strict field-ownership quality semantics

**Files:**
- Modify: `packages/core/src/__tests__/data-model-v2.test.ts`
- Modify: `apps/web/components/data-model-er/er-diagram-projection.ts`
- Modify: `apps/web/components/data-model-er/er-graph-store.ts`
- Modify: `apps/web/components/data-model-er/er-diagram-projection.test.ts`
- Modify: `apps/web/components/data-model-er/er-graph-store.test.ts`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- `projectErDiagram()` continues to return `ErDiagramProjection`.
- Add `FIELD_OWNERSHIP_AMBIGUOUS` to `ErQualityIssueCode` with model/field identifiers in its issue payload.
- `deriveErLod()` keeps the existing return shape but must not hide fields at normal graph scales.

- [ ] **Step 1: Write failing projection tests**

Add core tests proving that a multi-entity v2 model with an unknown or missing field owner is rejected by `validateDataModelV2`, plus projection tests proving that a graph field lacking both a `CONTAINS` owner and valid `metadata.entityId` produces `FIELD_OWNERSHIP_AMBIGUOUS`, while a v2 field with an exact `entityId` is rendered in the matching card.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm exec vitest run packages/core/src/__tests__/data-model-v2.test.ts apps/web/components/data-model-er/er-diagram-projection.test.ts apps/web/components/data-model-er/er-graph-store.test.ts`

Expected: the new ownership and normal-LOD assertions fail against the current projection/LOD behavior.

- [ ] **Step 3: Implement strict ownership and normal-field LOD**

Keep the existing owner precedence (`CONTAINS`, then exact `entityId`). When a `dataField` has no owner and its root model has multiple entities, append a deterministic `FIELD_OWNERSHIP_AMBIGUOUS` issue and exclude it from cards. Change LOD so `showFields` remains true for normal and compact render scales; only a distant threshold below the existing interactive range may hide non-key field rows, and a zoom-in must restore them.

- [ ] **Step 4: Add bilingual quality copy**

Add English and Chinese translations for the ownership issue, field visibility state, zoom percentage, zoom-in, zoom-out, and pan interaction status. Keep canonical English wording stable for tests.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run packages/core/src/__tests__/data-model-v2.test.ts apps/web/components/data-model-er/er-diagram-projection.test.ts apps/web/components/data-model-er/er-graph-store.test.ts`

Expected: PASS. Commit with `git add apps/web/components/data-model-er apps/web/lib/i18n.ts && git commit -m "fix: preserve er fields and report ambiguous ownership"`.

---

### Task 2: Aggregate complete graph pages before ER projection

**Files:**
- Modify: `apps/web/components/asset-detail-sections.tsx`
- Modify: `apps/web/components/data-model-er/data-model-er-workspace.tsx`
- Modify: `apps/web/components/data-model-er/data-model-er-workspace.test.ts`
- Modify: `apps/web/lib/data-model-graph.ts` only if the focused API test exposes a cursor or partial-state defect

**Interfaces:**
- Add a client helper `readCompleteDataModelGraph(query: string, headers: HeadersInit): Promise<DataModelGraphResponse[]>` that returns pages in waterline order.
- Keep `DataModelErWorkspace.responses` as the existing page-array input so merge behavior remains deterministic.

- [ ] **Step 1: Write a failing page-aggregation test**

Mock a first response with `hasMore: true` and `nextCursor`, then a second response with the same waterlines and fields. Assert the workspace projection contains both entity and field nodes and does not report `PARTIAL`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run apps/web/components/data-model-er/data-model-er-workspace.test.ts`

Expected: the current single-response fetch leaves the second page unread or marks the result incorrectly.

- [ ] **Step 3: Implement bounded page aggregation**

Fetch the initial graph query, follow `nextCursor` until `hasMore` is false, reject a waterline change, and cap the number of requests at the server `clientCapacity` boundary. Preserve a `PARTIAL` response when the server reports partial data or a retry/error occurs. Pass the full response array to `DataModelErWorkspace`.

- [ ] **Step 4: Expose unresolved ownership in the semantic surface**

Keep unowned fields out of entity cards, but show their quality issue and field identity in the existing semantic/inspector area so users can distinguish “no field exists” from “field ownership is incomplete.”

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run apps/web/components/data-model-er/data-model-er-workspace.test.ts apps/web/lib/data-model-graph.test.ts apps/web/app/api/data-model-graph/route.test.ts`

Expected: PASS. Commit with `git add apps/web/components/asset-detail-sections.tsx apps/web/components/data-model-er apps/web/lib/data-model-graph.ts && git commit -m "fix: aggregate complete er graph pages"`.

---

### Task 3: Fit entity names and field rows inside stable cards

**Files:**
- Modify: `apps/web/components/data-model-er/er-pixi-renderer.ts`
- Create: `apps/web/components/data-model-er/er-label-fitting.ts`
- Create: `apps/web/components/data-model-er/er-label-fitting.test.ts`
- Modify: `apps/web/components/data-model-er/er-pixi-renderer.test.ts`

**Interfaces:**
- Add pure helper `fitErLabel(value: string, maxCharacters: number): string` with deterministic end ellipsis.
- Add pure helper `getErHeaderLabelWidths(cardWidth: number): { title: number; subtitle: number }`.
- Keep full labels in `ErDrawEntity.entity` and semantic DOM; only canvas paint labels are fitted.

- [ ] **Step 1: Write failing label tests**

Cover short values, exact-width values, long ASCII names, long dotted physical names, and the guarantee that the returned string length does not exceed the requested bound.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run apps/web/components/data-model-er/er-label-fitting.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement deterministic fitting**

Use a minimum bound that always preserves at least one visible character and append `...` only when truncation is required. Use the helper for display and physical names in `drawEntity`; keep the existing stable card width and field-row column widths.

- [ ] **Step 4: Add renderer assertions**

Assert the draw model preserves full names while the renderer paint path receives bounded labels, and assert all field rows are present in normal LOD.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run apps/web/components/data-model-er/er-label-fitting.test.ts apps/web/components/data-model-er/er-pixi-renderer.test.ts`

Expected: PASS. Commit with `git add apps/web/components/data-model-er && git commit -m "fix: fit er labels within entity cards"`.

---

### Task 4: Make Pixi pan and zoom usable

**Files:**
- Modify: `apps/web/components/data-model-er/er-pixi-renderer.ts`
- Modify: `apps/web/components/data-model-er/er-interaction.ts`
- Modify: `apps/web/components/data-model-er/er-interaction.test.ts`
- Modify: `apps/web/components/data-model-er/data-model-er-workspace.tsx`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Add public renderer methods `zoomIn(): ErCamera`, `zoomOut(): ErCamera`, and `setZoom(scale: number, anchor?: ErPoint): ErCamera`.
- Add a camera scale display to `DataModelErWorkspace` fed by `onCameraChange`.

- [ ] **Step 1: Write failing camera tests**

Cover bounded zoom-in/zoom-out, pointer-centered wheel zoom, stage blank-area pan, and separation between entity drag and canvas pan.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run apps/web/components/data-model-er/er-interaction.test.ts`

Expected: FAIL for explicit zoom methods and stage pan behavior.

- [ ] **Step 3: Bind gestures to the stable stage**

Set the Pixi stage hit area to the screen-sized canvas, attach global move/up handlers to the stage, and attach blank-canvas pointer-down to the stage. Leave entity and field handlers on content objects with propagation stopped. Convert pointer deltas from screen space to world space using the current camera scale.

- [ ] **Step 4: Add explicit toolbar controls**

Add icon buttons for zoom in/out with tooltips, a percentage readout, and existing fit/reset controls. Keep controls disabled until the renderer is ready. Use Lucide icons and bilingual labels.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run apps/web/components/data-model-er/er-interaction.test.ts apps/web/components/data-model-er/er-pixi-renderer.test.ts apps/web/components/data-model-er/data-model-er-workspace.test.ts`

Expected: PASS. Commit with `git add apps/web/components/data-model-er apps/web/lib/i18n.ts && git commit -m "feat: add usable er canvas pan and zoom"`.

---

### Task 5: Upgrade all current Scope data models through MCP

**Files:**
- Modify: `prisma/data/specforge-self-design.ts` only for reproducible seed/catalog alignment after MCP facts are accepted
- Modify: `docs/design-facts/baseline-manifest.json` with the resulting canonical field summaries
- Modify: `docs/adr/0037-webgl-data-model-er-workspace.md`
- Modify: `docs/superpowers/specs/2026-08-20-er-usability-and-field-ownership-correction-design.md`

**Interfaces:**
- Use the existing MCP DataModel upsert/change-set tool; do not write authored asset rows directly with Prisma.
- Every payload must contain the exact owning `architectureScope`, stable model/entity/field IDs, English canonical fields, complete Chinese overlays, and evidence references.

- [ ] **Step 1: Build a deterministic migration inventory**

Read the current 12 model payloads in the exact Scope, map all 40 entities, preserve known fields, and mark models with no source field facts as `FIELD_CATALOG_GAP` until reviewed. Do not create arbitrary technical columns solely to make cards non-empty.

- [ ] **Step 2: Submit reviewed v2 models through MCP**

Use the MCP change-set/upsert path for each model. Require `entityDefinitions`, `fields[].entityId`, and localized content. Reject the batch on ambiguous ownership, duplicate IDs, or missing entity references.

- [ ] **Step 3: Verify authoritative readback**

Read the same Scope through MCP and `/api/data-model-graph`; assert every intentionally field-bearing entity has owned fields, every empty entity has an explicit reason, and no cross-Scope rows are visible.

- [ ] **Step 4: Update design facts and evidence**

Record exact commands, MCP receipts, model counts, ownership quality results, and remaining gaps in ADR/Proposal/Context Pack and the baseline manifest. Add directional typed links for the ER workspace, data model, API, and quality rule.

- [ ] **Step 5: Run reconciliation and commit**

Run: `pnpm design-context:status -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

Expected: the exact Scope is readable and the catalog/relationship digests match the recorded MCP evidence. Commit only repository records and seed alignment; do not commit generated or unrelated files.

---

### Task 6: Full verification, Docker refresh, and session closure

**Files:**
- Modify: `docs/adr/0037-webgl-data-model-er-workspace.md`
- Modify: `docs/superpowers/specs/2026-08-20-er-usability-and-field-ownership-correction-design.md`
- Modify: `docs/design-facts/baseline-manifest.json`

- [ ] **Step 1: Run focused and project checks**

Run: `pnpm exec vitest run apps/web/components/data-model-er apps/web/lib/data-model-graph.test.ts apps/web/app/api/data-model-graph/route.test.ts`

Run: `pnpm --filter @specforge/web typecheck`

Run: `pnpm --filter @specforge/web build`

Expected: all focused tests, typecheck, and the non-standalone web build pass.

- [ ] **Step 2: Refresh the 3010 Docker service**

Run the repository deployment script that owns the web and PostgreSQL services, then verify `/healthz` on 3010 and the graph endpoint for the exact Scope. Do not start another unrelated dev server or database.

- [ ] **Step 3: Perform browser acceptance once per port**

On 3000 and 3010, verify the selected `GeneratedDraft` view shows fields, long names stay inside cards, zoom buttons change the percentage, wheel zoom works, blank-canvas drag pans, entity drag moves only the card, and the browser console has no new errors.

- [ ] **Step 4: Close the design session**

Run `pnpm design-context:close -- --session design-change-session:d4534150-0737-48be-a133-9e7986c132ee --status CONVERGED --evidence "pnpm exec vitest run apps/web/components/data-model-er, pnpm --filter @specforge/web typecheck, pnpm --filter @specforge/web build, 3000-browser-er-acceptance, 3010-browser-er-acceptance, mcp-readback-and-reconciliation"` only when all evidence is real. If any MCP write or browser check is blocked, close `BLOCKED` with the exact reason and retry trigger instead.

- [ ] **Step 5: Commit final evidence**

Run `git status --short` and commit only the implementation and matching design records. Leave `outputs/` and `scripts/build-design-code-challenge-workbook.mjs` untouched.
