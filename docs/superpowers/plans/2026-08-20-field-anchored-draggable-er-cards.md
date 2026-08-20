# Field-Anchored Draggable ER Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current flat WebGL data-model graph into a usable ER workspace with draggable entity cards, visible field rows, field-anchored relationship lines, persisted local positions, and a semantic fallback.

**Architecture:** Keep the existing exact-Scope `GET /api/data-model-graph` read boundary and PostgreSQL/MCP authority. Add a deterministic client projection that groups flat model/entity/field facts into entity cards and relation groups, then let a focused Pixi renderer own camera transforms, hit testing, field ports, dragging, and route updates. React continues to own query state, localization, inspector state, and the semantic DOM representation.

**Tech Stack:** Next.js 15, React 19, TypeScript, PixiJS, ELK layout Worker, Vitest, Playwright through the in-app browser, PostgreSQL-backed MCP read contracts.

## Global Constraints

- Exact Scope is `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored assets and relationship events; graph data remains a derived read projection.
- The browser remains read-only; no ER layout, position, or relationship write may bypass MCP.
- Structured `fieldMappings` are the only authority for field-to-field relationship lines; names and narrative relationship strings must never infer foreign keys.
- Local positions are browser preferences keyed by exact Scope, mode, root model, topology digest, and preference schema version.
- English canonical fields remain authoritative and all human-facing additions require Chinese localization overlays.
- Existing untracked `outputs/` and `scripts/build-design-code-challenge-workbook.mjs` are unrelated and must not be staged.
- The implementation must close `design-change-session:6249b0a9-bd5b-476d-81e6-b78bf7b19afc` only after code, focused tests, 3000/3010 browser evidence, MCP synchronization, and exact-Scope reconciliation pass.

## File Map

- Create `apps/web/components/data-model-er/er-diagram-projection.ts`: deterministic flat-graph to entity-card projection and relation-group derivation.
- Create `apps/web/components/data-model-er/er-diagram-projection.test.ts`: projection, field ordering, metadata, composite mapping, and no-inference tests.
- Create `apps/web/components/data-model-er/er-position-store.ts`: versioned Scope-safe local position persistence.
- Create `apps/web/components/data-model-er/er-position-store.test.ts`: key isolation, stale topology rejection, reset, and invalid-coordinate tests.
- Create `apps/web/components/data-model-er/er-interaction.ts`: camera transform, pointer modes, drag threshold, pointer capture state, and hit-test geometry.
- Create `apps/web/components/data-model-er/er-interaction.test.ts`: deterministic interaction state-machine tests.
- Modify `apps/web/lib/data-model-graph.ts`: enrich existing node metadata with the authored entity/field facts needed by the projection while preserving the existing endpoint and response shape.
- Modify `apps/web/lib/data-model-graph.test.ts`: assert metadata enrichment and exact Scope behavior.
- Modify `apps/web/components/data-model-er/er-layout.ts`: accept entity-card dimensions and return card positions plus field-port positions and orthogonal route anchors.
- Modify `apps/web/components/data-model-er/er-layout.test.ts`: assert stable card layout, port coordinates, and route endpoints.
- Modify `apps/web/components/data-model-er/er-pixi-renderer.ts`: render entity cards, field rows, field ports, relation routes, camera transforms, hit testing, drag updates, and selection states.
- Modify `apps/web/components/data-model-er/data-model-er-workspace.tsx`: wire projection, position store, renderer commands, toolbar actions, inspector selection, and semantic list parity.
- Modify `apps/web/components/data-model-er/data-model-er-workspace.test.tsx`: assert workspace integration and fallback behavior.
- Modify `apps/web/components/data-model-er/er-inspector.tsx`: show selected field facts, mappings, relation groups, evidence, and quality issues.
- Modify `apps/web/lib/i18n.ts`: add complete English and Chinese labels for ER controls, field markers, relation warnings, drag/reset status, and inspector content.
- Modify `docs/adr/0037-webgl-data-model-er-workspace.md`, `docs/superpowers/specs/2026-08-20-field-anchored-draggable-er-cards-design.md`, and the matching manifest/MCP records: record implementation evidence and final status.

---

### Task 1: Build The Deterministic ER Diagram Projection

**Files:**
- Create: `apps/web/components/data-model-er/er-diagram-projection.ts`
- Create: `apps/web/components/data-model-er/er-diagram-projection.test.ts`
- Modify: `apps/web/lib/data-model-graph.ts`
- Modify: `apps/web/lib/data-model-graph.test.ts`

**Interfaces:**
- Consumes: `DataModelGraphResponse`, `DataModelGraphNode`, `DataModelGraphEdge`, and the existing `mergeErGraphResponses` output.
- Produces: `ErDiagramProjection`, `ErEntityCard`, `ErFieldRow`, `ErRelationGroup`, and `ErQualityIssue` used by layout, renderer, inspector, and semantic fallback.

- [ ] **Step 1: Write failing projection tests.**

Add fixtures with two entities, ordered fields, one simple reference, one two-field composite reference, one entity-only reference, and one missing endpoint. Assert the expected behavior:

```ts
it("groups fields into ordered entity cards and derives FK markers from mappings", () => {
  const projection = projectErDiagram(responseWithRelations);
  expect(projection.entities.map((entity) => entity.id)).toEqual(["entity:account", "entity:order"]);
  expect(projection.entities[1]?.fields.map((field) => field.id)).toEqual(["field:order.id", "field:order.accountId"]);
  expect(projection.entities[1]?.fields[1]?.foreignKey).toBe(true);
});

it("keeps composite mappings in one relation group", () => {
  const projection = projectErDiagram(responseWithCompositeRelation);
  expect(projection.relations.find((relation) => relation.id === "relation:account-order")?.mappings).toHaveLength(2);
});

it("does not infer a field edge from names or narrative text", () => {
  const projection = projectErDiagram(responseWithEntityOnlyRelation);
  expect(projection.relations[0]).toMatchObject({ mappingConfigured: false });
  expect(projection.qualityIssues).toEqual([]);
});

it("reports a missing mapped endpoint instead of inventing a table edge", () => {
  const projection = projectErDiagram(responseWithMissingFieldEndpoint);
  expect(projection.relations).toHaveLength(0);
  expect(projection.qualityIssues[0]?.code).toBe("ENDPOINT_NOT_FOUND");
});
```

- [ ] **Step 2: Run the focused projection suite and verify it fails.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-diagram-projection.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: FAIL because the projection module and metadata assertions do not exist yet.

- [ ] **Step 3: Add the projection types and implementation.**

Implement `projectErDiagram(response: DataModelGraphResponse | ErGraphSnapshot): ErDiagramProjection` with these deterministic rules:

```ts
export function projectErDiagram(input: ErProjectionInput): ErDiagramProjection {
  const nodes = indexNodes(input.nodes);
  const entities = buildEntityCards(nodes);
  const relations = buildRelationGroups(input.edges, nodes);
  return {
    identity: buildTopologyIdentity(input, entities),
    models: buildModelGroups(entities),
    entities,
    relations: relations.visible,
    qualityIssues: relations.issues
  };
}
```

Group only `dataField` nodes under their `rootModelId` and entity identity. Sort entities by `ordinal` then stable ID; sort fields by `ordinal` then stable ID. Derive `foreignKey` from an authored outgoing field-level `REFERENCES` edge. Keep entity-only `REFERENCES` as a relation with `mappingConfigured: false`. Drop only the affected relation when a mapped source or target field is missing and emit `ENDPOINT_NOT_FOUND` with stable IDs.

- [ ] **Step 4: Enrich the existing graph metadata without changing the endpoint contract.**

In `graphNodeFromIdentity`, add only structured metadata fields already present in the Data Model v2 payload: entity `physicalName` and `ordinal`; field `entityId`, `displayName`, `dataType`, `ordinal`, `primaryKey`, `unique`, `nullable`, `generated`, `classification`, `sensitiveLevel`, `example`, and `owner`. Preserve `DataModelGraphNode` and `DataModelGraphEdge` types and keep unknown metadata backward compatible.

- [ ] **Step 5: Run projection and graph tests.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-diagram-projection.test.ts apps/web/lib/data-model-graph.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: PASS with no Scope leakage and no inferred field relations.

- [ ] **Step 6: Commit the projection slice.**

```powershell
git add apps/web/components/data-model-er/er-diagram-projection.ts apps/web/components/data-model-er/er-diagram-projection.test.ts apps/web/lib/data-model-graph.ts apps/web/lib/data-model-graph.test.ts
git commit -m "feat: project data model facts into er cards"
```

---

### Task 2: Add Scope-Safe Position Persistence And Interaction State

**Files:**
- Create: `apps/web/components/data-model-er/er-position-store.ts`
- Create: `apps/web/components/data-model-er/er-position-store.test.ts`
- Create: `apps/web/components/data-model-er/er-interaction.ts`
- Create: `apps/web/components/data-model-er/er-interaction.test.ts`

**Interfaces:**
- Consumes: `ErDiagramProjection.identity`, entity rectangles, and browser pointer events.
- Produces: `ErPositionStore`, `ErCamera`, `ErPointerMode`, `ErDragState`, and hit-test helpers for the Pixi renderer.

- [ ] **Step 1: Write failing position and interaction tests.**

Cover exact key isolation and the pointer state machine:

```ts
it("does not reuse positions between Scope, root model, or topology digest", () => {
  const store = createErPositionStore(memoryStorage());
  store.save(keyFor(designerScope, "MODEL", "model-a", "digest-a"), { "entity:one": { x: 10, y: 20 } });
  expect(store.load(keyFor(policyScope, "MODEL", "model-a", "digest-a"))).toEqual({});
  expect(store.load(keyFor(designerScope, "MODEL", "model-b", "digest-a"))).toEqual({});
  expect(store.load(keyFor(designerScope, "MODEL", "model-a", "digest-b"))).toEqual({});
});

it("requires a movement threshold before entering drag mode", () => {
  const next = reduceErPointer(pointerDownOnEntity("entity:one", { x: 100, y: 100 }));
  expect(reduceErPointer(pointerMove({ x: 103, y: 102 }), next).mode).toBe("PENDING");
  expect(reduceErPointer(pointerMove({ x: 116, y: 102 }), next).mode).toBe("DRAGGING_ENTITY");
});
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-position-store.test.ts apps/web/components/data-model-er/er-interaction.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: FAIL because the storage and reducer modules do not exist.

- [ ] **Step 3: Implement the versioned position store.**

Use a key containing `applicationServiceId`, `scopePath`, `mode`, `rootModelId`, `topologyDigest`, and `schemaVersion`. Accept only finite coordinates for current entity IDs; ignore malformed JSON, unknown IDs, NaN, Infinity, and stale versions. Expose:

```ts
export interface ErPositionStore {
  load(key: ErPositionKey, entityIds?: ReadonlySet<string>): ErEntityPositions;
  save(key: ErPositionKey, positions: ErEntityPositions): void;
  clear(key: ErPositionKey): void;
}
```

Use `window.localStorage` in the browser and an injectable storage adapter in tests. Never access storage during server rendering.

- [ ] **Step 4: Implement camera and pointer state transitions.**

Expose `reduceErPointer`, `screenToWorld`, `worldToScreen`, `hitTestEntity`, and `hitTestField`. Keep camera scale clamped to `0.25..3`, use pointer capture for entity drags, and ensure a click remains selection unless movement exceeds the threshold. Keep panning separate from entity dragging.

- [ ] **Step 5: Run the focused interaction tests.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-position-store.test.ts apps/web/components/data-model-er/er-interaction.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: PASS with exact Scope, root, topology, and schema isolation.

- [ ] **Step 6: Commit the interaction slice.**

```powershell
git add apps/web/components/data-model-er/er-position-store.ts apps/web/components/data-model-er/er-position-store.test.ts apps/web/components/data-model-er/er-interaction.ts apps/web/components/data-model-er/er-interaction.test.ts
git commit -m "feat: add scoped er canvas interaction state"
```

---

### Task 3: Make Layout And Routes Field-Aware

**Files:**
- Modify: `apps/web/components/data-model-er/er-layout.ts`
- Modify: `apps/web/components/data-model-er/er-layout.test.ts`
- Modify: `apps/web/components/data-model-er/er-layout.worker.ts`

**Interfaces:**
- Consumes: `ErEntityCard`, current positions, and `ErRelationGroup`.
- Produces: `ErLayoutResult` with entity rectangles, field-row rectangles, source/target field ports, and orthogonal route points.

- [ ] **Step 1: Add failing layout assertions.**

Extend the existing layout tests:

```ts
it("places fields in ordinal order and returns exact source and target ports", () => {
  const result = layoutErDiagram(requestWithTwoMappedFields);
  expect(result.fieldPorts["field:order.accountId"]?.center.y).toBeLessThan(result.fieldPorts["field:order.createdAt"]?.center.y ?? 0);
  expect(result.edges[0]?.points[0]).toEqual(result.fieldPorts["field:order.accountId"]?.source);
  expect(result.edges[0]?.points.at(-1)).toEqual(result.fieldPorts["field:account.id"]?.target);
});
```

- [ ] **Step 2: Run the layout suite to capture the failing contract.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-layout.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: FAIL because the current result contains only node rectangles and center-to-center routes.

- [ ] **Step 3: Add card, field-row, and port geometry.**

Compute card height from header height plus `fieldRowHeight * visibleFieldCount`. Keep field rows out of ELK children. Return a `fieldPorts` map keyed by stable field ID and use exact field-row center points as route anchors. Entity-only relations use `headerPorts`.

- [ ] **Step 4: Update the Worker request and fallback.**

Pass the projected entity card dimensions and relation groups into the Worker. On ELK failure, use the existing deterministic grid fallback with the same field-port geometry and `degraded: true`; never fall back to center-to-center relation anchors.

- [ ] **Step 5: Run layout and core checks.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-layout.test.ts apps/web/components/data-model-er/er-diagram-projection.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
pnpm --filter @specforge/core typecheck
```

Expected: PASS with deterministic port coordinates and fallback routes.

- [ ] **Step 6: Commit the field-aware layout slice.**

```powershell
git add apps/web/components/data-model-er/er-layout.ts apps/web/components/data-model-er/er-layout.test.ts apps/web/components/data-model-er/er-layout.worker.ts
git commit -m "feat: route er relations through field ports"
```

---

### Task 4: Replace The Minimal Pixi Surface With An Interactive ER Renderer

**Files:**
- Modify: `apps/web/components/data-model-er/er-pixi-renderer.ts`
- Modify: `apps/web/components/data-model-er/er-pixi-renderer.test.ts`

**Interfaces:**
- Consumes: `ErDiagramProjection`, field-aware `ErLayoutResult`, `ErCamera`, and pointer reducer commands.
- Produces: Pixi entity cards, field rows, field ports, relation routes, selection callbacks, drag callbacks, renderer retry, and LOD status.

- [ ] **Step 1: Add failing renderer behavior tests.**

Add semantic renderer tests that inspect the draw model and interaction callbacks rather than fragile full-frame pixels:

```ts
it("draws one entity card with visible field rows and field ports", () => {
  const drawModel = buildErDrawModel(projection, layout, { zoom: 1 });
  expect(drawModel.cards).toHaveLength(2);
  expect(drawModel.cards[0]?.fields.length).toBeGreaterThan(0);
  expect(drawModel.edges[0]?.sourcePort.kind).toBe("FIELD");
  expect(drawModel.edges[0]?.targetPort.kind).toBe("FIELD");
});

it("moves related routes when an entity is dragged", () => {
  const moved = moveEntity(projection, layout, "entity:order", { x: 500, y: 240 });
  expect(moved.edges[0]?.points).not.toEqual(layout.edges[0]?.points);
});
```

- [ ] **Step 2: Run the renderer suite and verify the missing behavior.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-pixi-renderer.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: FAIL because the current renderer only draws fixed cards, field counts, and center-to-center lines.

- [ ] **Step 3: Implement the draw model before Pixi commands.**

Create `buildErDrawModel` as a pure function that produces card rectangles, header/field text, marker labels, port coordinates, relation route points, selected/hovered styles, and LOD visibility. Keep all coordinates in world space and apply the camera transform once at the root container.

- [ ] **Step 4: Implement Pixi card and route drawing.**

Render cards with stable header and row heights. Draw field rows, type labels, icon-and-text key markers, field ports, orthogonal routes, relation-group selection, and quality issue markers. Use `Graphics` and `Text` with the existing texture cache; do not create React nodes per field.

- [ ] **Step 5: Implement camera and drag event wiring.**

Use Pixi pointer events with explicit hit regions for cards and fields. Route pointer events through `reduceErPointer`, update local entity positions during drag, recompute only affected route points, and call `onSelectionChange`/`onPositionsChange` callbacks. Implement fit, reset, zoom, pan, and pointer capture behavior. Keep context-loss recovery and semantic fallback intact.

- [ ] **Step 6: Run renderer tests and Web typecheck.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/er-pixi-renderer.test.ts apps/web/components/data-model-er/er-layout.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
pnpm --filter @specforge/web typecheck
```

Expected: PASS; typecheck must not introduce browser-incompatible Node imports.

- [ ] **Step 7: Commit the renderer slice.**

```powershell
git add apps/web/components/data-model-er/er-pixi-renderer.ts apps/web/components/data-model-er/er-pixi-renderer.test.ts
git commit -m "feat: render interactive field-aware er cards"
```

---

### Task 5: Integrate Workspace Controls, Inspector, Localization, And Fallbacks

**Files:**
- Modify: `apps/web/components/data-model-er/data-model-er-workspace.tsx`
- Modify: `apps/web/components/data-model-er/data-model-er-workspace.test.tsx`
- Modify: `apps/web/components/data-model-er/er-inspector.tsx`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: projection, position store, interaction callbacks, renderer status, and existing URL query state.
- Produces: complete ER toolbar, semantic table/list parity, field-aware inspector, bilingual controls, and renderer retry without refetching valid data.

- [ ] **Step 1: Add failing workspace integration assertions.**

Assert that the workspace passes cards and fields to the renderer, exposes fit/reset controls, saves positions after drag, updates selection, and shows the semantic fallback when WebGL fails:

```tsx
it("exposes field rows and position controls through the workspace", () => {
  render(<DataModelErWorkspace responses={[responseWithRelations]} locale="zh" />);
  expect(screen.getByText("字段")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "适配全图" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重置布局" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run workspace tests to capture the missing controls.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er/data-model-er-workspace.test.tsx --exclude ".worktrees/**" --exclude ".pnpm-store/**"
```

Expected: FAIL until the integration and localization keys are added.

- [ ] **Step 3: Wire projection and positions into the workspace.**

Replace the renderer's current `ErGraphState`-only input with the projected diagram and current positions. Keep search/filter selection in React. On topology identity change, load only matching local positions; on drag end, save finite positions. Add toolbar callbacks for fit, reset, retry, relation filtering, and current-model/Scope mode.

- [ ] **Step 4: Expand the inspector and semantic representation.**

When a field is selected, show all field metadata and its relation mappings. When an entity relation lacks mappings, show `FIELD_MAPPING_UNCONFIGURED`. When a quality issue is selected, show the stable source/target IDs and read binding. Keep the semantic DOM table synchronized with the same projection and selection callbacks.

- [ ] **Step 5: Add bilingual labels.**

Add English and Chinese strings for `fit`, `reset layout`, `retry renderer`, `pin`, `unpin`, `field`, `data type`, `primary key`, `foreign key`, `unique`, `nullable`, `generated`, `unconfigured field mapping`, `layout degraded`, `partial`, and inspector relation/mapping labels. Use the existing i18n key structure; no visible hard-coded English-only UI text.

- [ ] **Step 6: Run integration checks.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er apps/web/lib/data-model-graph.test.ts apps/web/app/api/data-model-graph/route.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
pnpm --filter @specforge/web typecheck
```

Expected: PASS with English and Chinese semantic parity and no Scope regressions.

- [ ] **Step 7: Commit the integrated workspace slice.**

```powershell
git add apps/web/components/data-model-er/data-model-er-workspace.tsx apps/web/components/data-model-er/data-model-er-workspace.test.tsx apps/web/components/data-model-er/er-inspector.tsx apps/web/lib/i18n.ts
git commit -m "feat: integrate draggable er workspace controls"
```

---

### Task 6: Run Unified Browser Acceptance And Close Governance Records

**Files:**
- Modify: `docs/adr/0037-webgl-data-model-er-workspace.md`
- Modify: `docs/superpowers/specs/2026-08-20-field-anchored-draggable-er-cards-design.md`
- Modify: `docs/design-facts/baseline-manifest.json` only for exact evidence/status fields after implementation passes.

**Interfaces:**
- Consumes: all code and focused test outputs from Tasks 1-5.
- Produces: exact 3000/3010 browser evidence when available, synchronized ADR/Proposal/Context Pack/API facts, clean reconciliation, and a `CONVERGED` or explicitly `BLOCKED` close receipt for the active exact-Scope design session.

- [ ] **Step 1: Run the complete focused verification batch.**

Run:

```powershell
pnpm exec vitest run apps/web/components/data-model-er apps/web/lib/data-model-graph.test.ts apps/web/app/api/data-model-graph/route.test.ts --exclude ".worktrees/**" --exclude ".pnpm-store/**"
pnpm --filter @specforge/core typecheck
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/web build
git diff --check
```

Expected: all focused tests, core typecheck, Web typecheck, production build, and diff check pass. Record exact output in the ADR evidence list.

- [ ] **Step 2: Run fresh-browser acceptance on port 3000.**

Open a clean tab at `http://localhost:3000/assets/data-models?scope=com.huawei.celon.desiner` and verify:

```text
Canvas is nonblank
entity cards contain visible field rows
field-to-field route endpoints match source and target rows
drag changes the entity world position and connected route
fit, reset, selection, relation highlight, and semantic list work
refresh restores positions for the same Scope and topology
browser error log is empty
```

- [ ] **Step 3: Rebuild and verify port 3010 Docker service.**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\start.ps1
Invoke-WebRequest -UseBasicParsing http://localhost:3010/healthz
```

Then repeat the same clean-tab browser acceptance at `http://localhost:3010/assets/data-models?scope=com.huawei.celon.desiner`. Expected: Compose bootstrap and 3A bootstrap exit 0, Web health returns 200, the ER Canvas is nonblank, and browser errors are empty.

- [ ] **Step 4: Synchronize exact-Scope design facts.**

After evidence is recorded, run:

```powershell
$env:SPECFORGE_DESIGN_FACT_IDS='adr-webgl-data-model-er-workspace'; pnpm design-facts:sync
$env:SPECFORGE_DESIGN_FACT_IDS='adr-webgl-data-model-er-workspace'; pnpm design-facts:check
$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'; $env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'; pnpm design-facts:federation:check
```

Expected: sync reports `complete`, design-facts check reports no missing/mismatched/out-of-scope/blocked records, and federation check reports `blocking:false`.

- [ ] **Step 5: Close the existing design-change session.**

Run with the exact evidence references:

```powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:6249b0a9-bd5b-476d-81e6-b78bf7b19afc --status CONVERGED --evidence "projection-tests=PASS,graph-metadata-tests=PASS,position-tests=PASS,interaction-tests=PASS,layout-tests=PASS,renderer-tests=PASS,workspace-tests=PASS,core-typecheck=PASS,web-typecheck=PASS,web-build=PASS,browser-3000=PASS,browser-3010=PASS,docker-health-3010=200,design-facts-sync=COMPLETE,design-facts-check=PASS,federation-check=blocking-false"
```

Expected: the receipt status is `CONVERGED` only when both browser ports are verified; otherwise close the same session as `BLOCKED` with the exact browser-policy or deployment retry trigger. Do not claim completion if any evidence or MCP write is missing.

- [ ] **Step 6: Commit the final evidence records.**

```powershell
git add docs/adr/0037-webgl-data-model-er-workspace.md docs/superpowers/specs/2026-08-20-field-anchored-draggable-er-cards-design.md docs/design-facts/baseline-manifest.json
git commit -m "docs: record field anchored er acceptance"
```

## Plan Self-Review

- Spec coverage: projection and metadata are Task 1; Scope-safe positions and interaction modes are Task 2; field ports and routes are Task 3; Pixi cards and camera behavior are Task 4; inspector, localization, and fallback parity are Task 5; both browser ports, Docker, MCP, and closure are Task 6.
- No database migration is required because authored field and relation facts already exist in the Data Model v2 payload and the graph DTO has extensible metadata.
- No new dependency is required; PixiJS, ELK, Vitest, and the existing browser acceptance tooling are already present.
- No placeholder steps remain; each task names exact files, interfaces, commands, and expected results.
- Type consistency: `ErDiagramProjection` is produced by Task 1, consumed by Tasks 2-5; `ErLayoutResult` gains field-port data in Task 3 and is consumed by Task 4; Task 6 references the focused suites created by Tasks 1-5.
- The browser remains read-only and local positions never enter MCP or PostgreSQL.
