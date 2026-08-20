# WebGL Data Model ER Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an exact-Scope, MCP-governed, WebGL-rendered ER workspace for Data Models, including structured field relationships, composite mappings, consistent reads, semantic fallback, and bilingual inspection.

**Architecture:** PostgreSQL remains authoritative for Data Model payloads, authored revisions, and typed relationship events. A dedicated ER query service returns a signed, dual-waterline read binding; a client-owned immutable store feeds an ELK layout Worker and imperative PixiJS renderer. React owns URL state, commands, inspectors, localization, and the semantic fallback.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, MCP server, Next.js/React 19, PixiJS WebGL, ELK.js Worker, Vitest, existing HMAC cursor keyring, existing Scope/principal authorization.

## Global Constraints

- The owning Scope is exactly `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored assets and relationship events; the browser, PixiJS, ELK, and NebulaGraph are consumers or derived projections.
- All Data Model writes use MCP; browser ER views are read-only.
- New Data Models use v2; v1 records are read-compatible but must be upgraded before mutation.
- English canonical fields are required and Chinese human-facing overlays must be complete.
- Entity, field, and relation IDs are stable and independent of display names.
- Cross-model endpoints must be resolved inside the same exact Scope; absent external endpoints are never implicitly created.
- `DataRelation` is authored inside its source Data Model; typed ledger rows are generated atomically from that definition.
- `catalogVersion/catalogDigest` and `relationshipVersion/relationshipDigest` bind every ER page.
- A changed waterline returns `SNAPSHOT_CHANGED`; incomplete pages never present as a complete graph.
- “Expand all” means all topology within the evidence-backed client budget; `CLIENT_CAPACITY_EXCEEDED` is explicit and fail-closed.
- Existing unrelated untracked paths `outputs/` and `scripts/build-design-code-challenge-workbook.mjs` must not be staged.
- The implementation uses the open design session `design-change-session:7becc74f-cdf5-4512-8c6d-49d885c58f20` and must close that same session after evidence and MCP synchronization.

---

### Task 1: Add Data Model v2 Types, Validation, Localization, And Graph Extraction

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/localization/assets.ts`
- Modify: `packages/core/src/relationships/types.ts`
- Modify: `packages/core/src/relationships/ontology.ts`
- Modify: `packages/core/src/relationships/extract.ts`
- Create: `packages/core/src/data-model-v2.ts`
- Create: `packages/core/src/__tests__/data-model-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `DataEntityDefinition`, `DataFieldDefinition`, `DataRelation`, `DataRelationCardinality`, `DataFieldMapping`, `DataModelV2ValidationError`, and `validateDataModelV2(asset: DataModel): void`.
- Produces `isStructuredDataModel(asset: DataModel): boolean` and `upgradeLegacyDataModel(asset: DataModel): DataModel`.
- Extends `extractAssetGraph("dataModel", asset)` to emit `CONTAINS` and typed `REFERENCES` projection records with stable relation metadata.

- [ ] **Step 1: Write failing contract tests**

Add tests covering stable IDs, duplicate ownership rejection, composite mappings, model-type rules, cardinality semantics, referential action validation, v1 compatibility, and deterministic graph extraction.

```ts
it("accepts a physical model with a composite reference", () => {
  expect(() => validateDataModelV2(compositePhysicalModel())).not.toThrow();
  const graph = extractAssetGraph("dataModel", compositePhysicalModel());
  expect(graph.relationships.filter((item) => item.code === "REFERENCES")).toHaveLength(3);
  expect(graph.relationships.find((item) => item.relationId === "rel-order-account")?.metadata).toMatchObject({
    relationId: "rel-order-account",
    mappingIndex: 0,
    mappingCount: 2
  });
});

it("rejects a multi-entity field with an unknown owner", () => {
  expect(() => validateDataModelV2(modelWithUnknownFieldOwner())).toThrow("DATA_FIELD_ENTITY_NOT_FOUND");
});

it("does not infer relations from legacy narrative strings", () => {
  const graph = extractAssetGraph("dataModel", legacyModelWithNarrativeRelationship());
  expect(graph.relationships.filter((item) => item.code === "REFERENCES")).toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm --filter @specforge/core test -- src/__tests__/data-model-v2.test.ts`  
Expected: FAIL because the v2 types, validator, and relation metadata are not implemented.

- [ ] **Step 3: Add the additive v2 types and validators**

Extend `DataField` with optional legacy-compatible `id`, `entityId`, `ordinal`, `primaryKey`, `unique`, and `generated` fields. Add optional `schemaVersion`, `entityDefinitions`, and `dataRelations` to `DataModel`, while keeping the v1 shape readable. Define v2 validation so it requires stable IDs, one field owner, unique ordinals, valid relation endpoints, non-empty mappings for physical references, compatible field types, target key uniqueness, and valid `SET_NULL`/`SET_DEFAULT` actions.

Use this public shape:

```ts
export interface DataModelV2 {
  schemaVersion: 2;
  entityDefinitions: DataEntityDefinition[];
  fields: DataFieldDefinition[];
  dataRelations: DataRelation[];
}

export function validateDataModelV2(asset: DataModel): asserts asset is DataModel & DataModelV2;
export function isStructuredDataModel(asset: DataModel): boolean;
export function upgradeLegacyDataModel(asset: DataModel): DataModel;
```

- [ ] **Step 4: Make localization overlays stable-ID based**

Change `DataModelLocalizedFields.fields` to use stable field IDs for v2 records and add an entity overlay record keyed by entity ID. Keep the legacy field-name adapter only for v1 reads. Reject translations that mutate identity, type, nullability, key flags, or referential actions. Add English and Chinese error messages for missing v2 overlays.

- [ ] **Step 5: Extend relationship ontology and extraction**

Keep `REFERENCES` as the canonical relation code, extend its metadata type with `relationId`, `mappingIndex`, `mappingCount`, cardinalities, and evidence references, and make extraction deterministic by sorting entities, fields, relations, and mappings by stable ID/ordinal. Resolve cross-model targets as explicit external endpoint references for the MCP command; do not fabricate local nodes.

- [ ] **Step 6: Run the focused tests and typecheck**

Run: `pnpm --filter @specforge/core test -- src/__tests__/data-model-v2.test.ts src/__tests__/relationship-extraction.test.ts`  
Expected: PASS.  
Run: `pnpm --filter @specforge/core typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit the contract increment**

```bash
git add packages/core/src/types.ts packages/core/src/localization/assets.ts packages/core/src/relationships/types.ts packages/core/src/relationships/ontology.ts packages/core/src/relationships/extract.ts packages/core/src/data-model-v2.ts packages/core/src/__tests__/data-model-v2.test.ts packages/core/src/index.ts
git commit -m "feat: add structured data model v2 contract"
```

### Task 2: Add Atomic MCP Data Model Change Sets And Legacy Upgrade Gates

**Files:**
- Create: `apps/mcp-server/src/data-models/change-set.ts`
- Create: `apps/mcp-server/src/data-models/change-set.test.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/relationships/command-service.ts`
- Modify: `apps/mcp-server/src/relationships/repository.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`

**Interfaces:**
- Produces `applyDataModelChangeSet(input: DataModelChangeSetInput): Promise<DataModelChangeSetReceipt>`.
- The MCP tool name is `apply_data_model_change_set` with permission `asset:write`.
- The command accepts exact `architectureScope`, a list of v2 Data Model payloads, an idempotency key, correlation ID, and an actor supplied by the MCP request context.
- The receipt returns `catalogVersion`, `graphVersion`, changed asset IDs, changed relation IDs, event IDs, and whether the request was replayed.

- [ ] **Step 1: Write failing transaction tests**

Test that a valid same-Scope multi-model change writes payloads, authored revisions, asset nodes, entity/field containment, entity references, field mapping references, relationship events, and Outbox rows in one transaction.

```ts
it("rolls back all models when a target endpoint is outside the Scope", async () => {
  await expect(applyDataModelChangeSet(changeSetWithCrossScopeTarget())).rejects.toThrow("SCOPE_MISMATCH");
  expect(await countDesignAssets(testScope)).toBe(0);
  expect(await countRelationshipEvents(testScope)).toBe(0);
});

it("rejects deletion while an active field reference remains", async () => {
  await expect(applyDataModelChangeSet(deleteReferencedFieldWithoutRelationRemoval())).rejects.toThrow("ACTIVE_REFERENCE_EXISTS");
});

it("replays an idempotent change set without duplicate revisions or events", async () => {
  const first = await applyDataModelChangeSet(validChangeSet());
  const replay = await applyDataModelChangeSet(validChangeSet());
  expect(replay.replayed).toBe(true);
  expect(replay.catalogVersion).toBe(first.catalogVersion);
  expect(await countRelationshipEvents(testScope)).toBe(first.eventIds.length);
});
```

- [ ] **Step 2: Run MCP tests and verify failure**

Run: `pnpm exec vitest run apps/mcp-server/src/data-models/change-set.test.ts`  
Expected: FAIL because the change-set command is not registered and the atomic relation projection is absent.

- [ ] **Step 3: Implement the transactional command**

Implement `applyDataModelChangeSet` inside the existing Prisma transaction boundary. Validate every payload with `validateDataModelV2`, lock all involved Scope rows in deterministic ID order, resolve every target entity/field inside the exact Scope, reject dangling active references, upsert design assets and revisions, call the relationship command service using the same transaction repository, and append the change-set receipt and Outbox records before commit.

- [ ] **Step 4: Register the MCP tool and enforce mutation gates**

Register `apply_data_model_change_set` with an explicit Zod schema. Change `upsert_design_asset` so a Data Model mutation of an existing v1 record returns `DATA_MODEL_UPGRADE_REQUIRED`; keep v1 reads and seed-only compatibility reads intact. Expose a deterministic `upgrade_data_model` read/prepare operation only for single-entity v1 records; ambiguous multi-entity upgrades return `FIELD_OWNERSHIP_AMBIGUOUS` and do not write.

- [ ] **Step 5: Add relationship projection metadata and rollback coverage**

Persist stable `relationId` and mapping ordinal in ledger metadata, invalidate obsolete parser-owned containment/reference rows on a v2 replacement, retain manual relationship history, and ensure any event or Outbox failure rolls back the design asset and all relationship changes.

- [ ] **Step 6: Run MCP focused verification**

Run: `pnpm exec vitest run apps/mcp-server/src/data-models/change-set.test.ts apps/mcp-server/src/persistence.test.ts apps/mcp-server/src/relationships/command-service.test.ts`  
Expected: PASS.  
Run: `pnpm --filter @specforge/mcp-server typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit the MCP increment**

```bash
git add apps/mcp-server/src/data-models apps/mcp-server/src/persistence.ts apps/mcp-server/src/tools.ts apps/mcp-server/src/relationships/command-service.ts apps/mcp-server/src/relationships/repository.ts apps/mcp-server/src/tools.test.ts
git commit -m "feat: add atomic data model change sets"
```

### Task 3: Implement The Exact-Scope ER Read Contract

**Files:**
- Create: `packages/core/src/data-model-graph/types.ts`
- Create: `packages/core/src/data-model-graph/cursor.ts`
- Create: `packages/core/src/data-model-graph/types.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `apps/web/lib/data-model-graph.ts`
- Create: `apps/web/lib/data-model-graph.test.ts`
- Create: `apps/web/app/api/data-model-graph/route.ts`
- Create: `apps/web/app/api/data-model-graph/route.test.ts`
- Modify: `apps/web/lib/request-principal.ts` only if the existing principal helper needs the graph-read permission.

**Interfaces:**
- Produces `DataModelGraphMode = "MODEL" | "SCOPE"`.
- Produces `DataModelGraphReadRequest`, `DataModelGraphReadBinding`, `DataModelGraphPage`, `DataModelGraphNode`, `DataModelGraphRelation`, `DataModelGraphQualityIssue`, and `DataModelGraphStatus`.
- Produces `createDataModelGraphBinding`, `readDataModelGraphPage`, and `assertDataModelGraphBinding`.
- API contract: `GET /api/data-model-graph?scope=<application-service-id>&mode=MODEL|SCOPE&rootModelId=<id>&cursor=<signed>&binding=<signed>`.

- [ ] **Step 1: Write failing contract and authorization tests**

```ts
it("rejects a cursor signed for another Scope", () => {
  const cursor = signDataModelGraphCursor({ scopePath: designerScope.scopePath, mode: "SCOPE", subject: "agent-a", sortKey: "m-1" }, key);
  expect(() => assertDataModelGraphBinding(cursor, { ...designerScope, scopePath: policyScope.scopePath }, key)).toThrow("CURSOR_INVALID");
});

it("returns a current-model boundary entity without leaking another Scope", async () => {
  const page = await readDataModelGraphPage({ ...modelRequest, mode: "MODEL", rootModelId: "orders" });
  expect(page.nodes.some((node) => node.kind === "BOUNDARY_ENTITY")).toBe(true);
  expect(page.nodes.every((node) => node.architectureScope.applicationServiceId === designerScope.applicationServiceId)).toBe(true);
});
```

- [ ] **Step 2: Run the focused query tests and verify failure**

Run: `pnpm --filter @specforge/core test -- src/data-model-graph/types.test.ts` and `pnpm exec vitest run apps/web/lib/data-model-graph.test.ts`  
Expected: FAIL because the DTO, signed binding, repository, and route are not present.

- [ ] **Step 3: Implement the DTO and signed binding**

Use the existing HMAC cursor keyring pattern from `packages/knowledge-query/src/cursor.ts`. Bind subject, exact Scope, mode, root model, catalog and relationship waterlines, digest, cursor sort key, and expiry. Validate query limits, page size, mode, root model, and relation filters with Zod.

- [ ] **Step 4: Implement the PostgreSQL-first repository**

Read current Data Model payloads, authored catalog waterline, AssetNode containment rows, active RelationshipCurrent rows, and relationship waterline under the exact Scope. Return models/entities first, fields and relation mappings through deterministic keyset pages, and include quality issues for unassigned legacy fields or dangling persisted references. Check both waterlines before and after each page and throw `SNAPSHOT_CHANGED` when either changes.

- [ ] **Step 5: Implement the route boundary**

Resolve the request principal, require `graph:read` or `asset:read` according to the existing authorization policy, reject missing or unauthorized Scope without existence leakage, call the repository, map typed errors to `401/403/409/422/503`, and never accept the returned DTO in a write handler.

- [ ] **Step 6: Verify query behavior**

Run: `pnpm --filter @specforge/core test -- src/data-model-graph/types.test.ts`  
Expected: PASS.  
Run: `pnpm exec vitest run apps/web/lib/data-model-graph.test.ts apps/web/app/api/data-model-graph/route.test.ts`  
Expected: PASS.  
Run: `pnpm --filter @specforge/web typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit the read-contract increment**

```bash
git add packages/core/src/data-model-graph packages/core/src/index.ts apps/web/lib/data-model-graph.ts apps/web/lib/data-model-graph.test.ts apps/web/app/api/data-model-graph
git commit -m "feat: add scoped data model graph query"
```

### Task 4: Build The PixiJS ER Renderer And Deterministic Layout Worker

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/components/data-model-er/er-graph-store.ts`
- Create: `apps/web/components/data-model-er/er-graph-store.test.ts`
- Create: `apps/web/components/data-model-er/er-layout.ts`
- Create: `apps/web/components/data-model-er/er-layout.test.ts`
- Create: `apps/web/components/data-model-er/er-layout-worker.ts`
- Create: `apps/web/components/data-model-er/er-texture-cache.ts`
- Create: `apps/web/components/data-model-er/er-texture-cache.test.ts`
- Create: `apps/web/components/data-model-er/pixi-er-renderer.tsx`
- Create: `apps/web/components/data-model-er/pixi-er-renderer.test.tsx`
- Create: `apps/web/components/data-model-er/er-workspace.tsx`
- Create: `apps/web/components/data-model-er/er-workspace.test.tsx`

**Interfaces:**
- `mergeDataModelGraphPage(state, page): ErGraphState` deduplicates stable nodes and relation groups.
- `computeErLayout(input): ErLayoutResult` sorts stable IDs, partitions components, computes model/entity/card dimensions, routes ports, and returns deterministic integer coordinates.
- `ErTextureCache.acquire(entityId, lod, snapshot): TextureLease` and `release(lease): void` implement viewport-aware LRU eviction.
- `<PixiErRenderer snapshot={snapshot} layout={layout} selection={selection} lod={lod} onSelect={...} onFailure={...} />` owns Pixi lifecycle and WebGL recovery.
- `<ErWorkspace initialMode="MODEL" rootModelId={id} scope={scope} />` owns query, URL state, filters, inspector, progress, and fallback.

- [ ] **Step 1: Add renderer dependencies**

Run: `pnpm --filter @specforge/web add pixi.js elkjs`  
Expected: `apps/web/package.json` and `pnpm-lock.yaml` record the resolved versions and the web package remains installable.

- [ ] **Step 2: Write failing pure store and layout tests**

```ts
it("keeps a composite relation as one group with two field mappings", () => {
  const state = mergeDataModelGraphPage(emptyErGraphState(), compositeGraphPage);
  expect(state.relationGroups.get("rel-order-account")?.mappings).toHaveLength(2);
});

it("produces stable coordinates regardless of input order", () => {
  expect(computeErLayout({ nodes: shuffledNodes, relations: shuffledRelations })).toEqual(
    computeErLayout({ nodes: sortedNodes, relations: sortedRelations })
  );
});
```

- [ ] **Step 3: Run pure tests and verify failure**

Run: `pnpm exec vitest run apps/web/components/data-model-er/er-graph-store.test.ts apps/web/components/data-model-er/er-layout.test.ts`  
Expected: FAIL because the store and layout modules are absent.

- [ ] **Step 4: Implement the immutable store and layout Worker**

Keep relation groups, field mappings, quality state, page cursors, waterline binding, `PARTIAL`, `SNAPSHOT_CHANGED`, `CLIENT_CAPACITY_EXCEEDED`, and selection IDs in the store. Sort stable IDs, partition connected components, lay out model groups then entities, represent fields as rows/ports, route cross-model relations, round coordinates, and use a stable grid fallback when the Worker throws.

- [ ] **Step 5: Implement texture caching and LOD**

Use far, medium, and near LOD. Do not create field text textures at far LOD. Acquire detailed textures only for visible entities, cache by entity ID and LOD plus binding digest, and evict least-recently-used high-detail textures at the configured evidence-backed budget. Keep the semantic graph state even when a texture is evicted.

- [ ] **Step 6: Implement Pixi lifecycle, ports, hit testing, and recovery**

Create the Pixi application only on the client, draw model bands, entity records, field rows, key badges, ports, cardinality markers, and relation paths, and dispose the application, observers, textures, and Worker on unmount. Handle `webglcontextlost`, renderer construction errors, resize, pan, zoom, drag/pin, selection, and retry without refetching valid pages.

- [ ] **Step 7: Implement the semantic fallback and workspace controls**

Render a keyboard-navigable list equivalent for entities, fields, relation groups, quality issues, partial state, and capacity state. Provide mode, search, relation-kind, classification, fit, reset, and layout controls. Keep the selected IDs and view state separate from authored facts.

- [ ] **Step 8: Run renderer verification**

Run: `pnpm exec vitest run apps/web/components/data-model-er`  
Expected: PASS.  
Run: `pnpm --filter @specforge/web typecheck`  
Expected: PASS.

- [ ] **Step 9: Commit the renderer increment**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/components/data-model-er
git commit -m "feat: add webgl data model er renderer"
```

### Task 5: Integrate Pages, Localization, Browser Acceptance, And Governance Records

**Files:**
- Modify: `apps/web/components/asset-detail-sections.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/page.tsx`
- Modify: `apps/web/app/assets/[type]/page.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Create: `apps/web/components/data-model-er/er-inspector.tsx`
- Create: `apps/web/components/data-model-er/er-toolbar.tsx`
- Create: `docs/adr/0037-webgl-data-model-er-workspace.md`
- Modify: `docs/TODO.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `scripts/design-fact-manifest.test.ts`
- Create: `docs/evidence/webgl-data-model-er-acceptance.md`

**Interfaces:**
- Data Model detail renders `<ErWorkspace initialMode="MODEL" rootModelId={asset.id} />` beside the existing Field Catalog.
- Data Model list renders `<ErWorkspace initialMode="SCOPE" />` for the Global ER mode.
- Governance decision IDs are `adr-webgl-data-model-er-workspace`, `proposal-webgl-data-model-er-workspace`, `ctx-webgl-data-model-er-workspace`, and `api-specforge-data-model-graph-query`.

- [ ] **Step 1: Write page and localization tests**

```tsx
it("renders the current-model ER mode on a Data Model detail page", () => {
  render(<ErWorkspace initialMode="MODEL" rootModelId="orders" scope={designerScope.applicationServiceId} />);
  expect(screen.getByRole("region", { name: /ER diagram/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Scope/i })).toBeInTheDocument();
});

it("keeps Chinese labels complete", () => {
  expect(translate("dataModel.erDiagram", "zh")).toBe("ER 图");
  expect(translate("dataModel.compositeMapping", "zh")).toBe("复合字段映射");
});
```

- [ ] **Step 2: Run page tests and verify failure**

Run: `pnpm exec vitest run apps/web/components/data-model-er/er-workspace.test.tsx`  
Expected: FAIL because the page integration and localization keys are not present.

- [ ] **Step 3: Integrate the detail and list pages**

Use a client boundary for `ErWorkspace` so Pixi is never initialized during server rendering. Add URL state for `erMode`, `rootModelId`, filters, and selected IDs. Preserve `scope` on every link and route transition. Keep Field Catalog available as the semantic, searchable table view.

- [ ] **Step 4: Add bilingual toolbar, inspector, quality, and status copy**

Add English canonical and Chinese overlay keys for ER Diagram, Global ER, Current Model, entity, field, relation, composite mapping, cardinality, key flags, snapshot refresh, partial, capacity exceeded, WebGL retry, layout degraded, and legacy unassigned fields. Ensure every human-facing string has both locales and that color is not the only state signal.

- [ ] **Step 5: Add repository ADR and design-fact records**

Create ADR-0037 with the final decision, alternatives, authority rules, v1 migration, consistent reads, Pixi/ELK architecture, acceptance evidence policy, and the explicit distinction between implemented local behavior and unverified production scale. Add the matching decision to `docs/design-facts/baseline-manifest.json` with the exact Scope, related Data Model/API assets, Proposal, Context Pack, Evidence IDs, and typed relationships. Update `docs/TODO.md` so the feature's remaining production certification is tracked rather than silently marked complete.

- [ ] **Step 6: Run design-fact synchronization and verify the exact Scope**

Run: `pnpm design-facts:sync`  
Expected: the ADR, Proposal, Context Pack, Evidence, and links report `complete`.  
Run: `$env:SPECFORGE_DESIGN_FACT_IDS='adr-webgl-data-model-er-workspace'; pnpm design-facts:check`  
Expected: `missing: [], mismatched: [], outOfScope: [], blocked: []`.  
Run: `$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'; $env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'; pnpm design-facts:federation:check`  
Expected: `blocking: false`.

- [ ] **Step 7: Run the complete local verification**

Run: `pnpm --filter @specforge/core typecheck`  
Expected: PASS.  
Run: `pnpm --filter @specforge/mcp-server typecheck`  
Expected: PASS.  
Run: `pnpm --filter @specforge/web typecheck`  
Expected: PASS.  
Run: `pnpm exec vitest run packages/core apps/mcp-server apps/web`  
Expected: PASS.  
Run: `pnpm --filter @specforge/web build`  
Expected: PASS.

- [ ] **Step 8: Perform one browser acceptance pass**

Start the canonical web service on the configured port and verify the exact Designer Scope. Capture desktop and compact screenshots for current-model and Scope modes. Verify nonblank Canvas pixels, model/entity/field search, composite relation highlighting, zoom LOD, drag/pin, reset, language switch, WebGL fallback, Scope switching, and `SNAPSHOT_CHANGED` recovery. Record exact commands and outcomes in `docs/evidence/webgl-data-model-er-acceptance.md`.

- [ ] **Step 9: Close the same design session**

Run:

```bash
pnpm design-context:close -- --session design-change-session:7becc74f-cdf5-4512-8c6d-49d885c58f20 --status CONVERGED --evidence "core-typecheck=PASS,mcp-typecheck=PASS,web-typecheck=PASS,focused-tests=PASS,web-build=PASS,design-facts-check=PASS,browser-er-acceptance=PASS"
```

Expected: the session closes as `CONVERGED`. If any MCP or browser evidence is blocked, record `MCP synchronization blocked` or the exact operational blocker in the ADR, update the backlog fact, and do not claim the feature complete.

- [ ] **Step 10: Commit integration and governance evidence**

```bash
git add apps/web/components/asset-detail-sections.tsx 'apps/web/app/assets/[type]/[id]/page.tsx' 'apps/web/app/assets/[type]/page.tsx' apps/web/lib/i18n.ts docs/adr/0037-webgl-data-model-er-workspace.md docs/TODO.md docs/design-facts/baseline-manifest.json scripts/design-fact-manifest.test.ts docs/evidence/webgl-data-model-er-acceptance.md
git commit -m "feat: integrate data model er workspace governance"
```

## Plan Self-Review

- Data Model v2, stable IDs, composite mappings, model-type validation, bilingual overlays, and v1 migration are covered by Task 1.
- Atomic MCP authoring, exact-Scope endpoint resolution, deletion protection, revisions, events, Outbox, and idempotency are covered by Task 2.
- Dual-waterline reads, signed cursors, MODEL/SCOPE modes, page consistency, quality issues, and error mapping are covered by Task 3.
- PixiJS, ELK Worker, deterministic partitions, LOD, culling, texture LRU, context recovery, capacity failure, and semantic fallback are covered by Task 4.
- Detail/list integration, URL state, bilingual UI, browser verification, ADR/Proposal/Context Pack/Evidence, MCP reconciliation, and session closure are covered by Task 5.
- The plan does not claim a production capacity tier; measured evidence is required before any tier is advertised.
- The only existing untracked paths are preserved and excluded from every commit.
