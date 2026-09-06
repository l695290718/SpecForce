# Feature Catalog Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a governed, deterministic MCP workflow that maps the exact Scope's authored design catalog to bilingual Service and Functional Features, then use it to backfill the live catalog.

**Architecture:** A narrow seed-principal fix makes the existing readiness gate usable in local development. A pure planner converts receipt-bound system-knowledge pages into stable Feature assets and only ontology-valid direct links; a CLI orchestrator handles pagination, dry-run, atomic submission, and verification. Existing assets remain authoritative.

**Tech Stack:** TypeScript, Vitest, MCP SDK stdio client, `@specforge/core` Feature validation, PostgreSQL through existing MCP tools.

## Global Constraints

- Operate only in `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- English is canonical and every human-facing Feature field needs a complete Chinese overlay.
- Read only through `evaluate_system_knowledge_readiness` then `read_system_knowledge`; no database or direct asset reads in the backfill.
- Write only through `prepare_design_change`, `apply_feature_change_set`, and `close_design_change_session`.
- Keep PostgreSQL authoritative, graph/search derived, and every endpoint exact-Scope.
- Use a direct link only when the current ontology permits it. Unsupported assets require an evidenced indirect path or explicit exception.
- Do not stage `deploy/three-a-bootstrap.Dockerfile`, `docs/governance-briefing.md`, or `.tmp/`.

---

### Task 1: Restore Local Readiness-Gate Authorization

**Files:**
- Modify: `apps/mcp-server/src/federation/tools.ts:297-322`
- Modify: `apps/mcp-server/src/federation/tools.test.ts:1-230`

**Interfaces:**
- Consumes: `requestActor(extra)`, `SPECFORGE_MCP_SEED=1`, and `SPECFORGE_MCP_SEED_SCOPE`.
- Produces: a seed `ScopedPrincipal` with `knowledge:consume` plus existing exact-Scope grants.

- [ ] **Step 1: Write a seed-readiness regression test**

Mock `evaluateScopedKnowledgeReadiness`, set both seed environment variables, invoke `evaluate_system_knowledge_readiness` with no `authInfo`, and assert the result is not an error and the mocked service was called:

```ts
expect(result.isError).toBeUndefined();
expect(knowledgeReadiness.evaluateScopedKnowledgeReadiness).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ architectureScope: designerScope }),
  expect.anything()
);
```

- [ ] **Step 2: Confirm the failing behavior**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/tools.test.ts --testNamePattern "seeded exact-Scope"`

Expected: FAIL with `PERMISSION_DENIED`.

- [ ] **Step 3: Implement the minimal scope-preserving fix**

Extend only the seed-mode permission list in `requestActor`:

```ts
scopes: ["asset:read", "asset:write", "governance:run", "graph:read", "knowledge:consume"],
```

Do not add wildcards, parent Scope grants, or sibling Scope grants.

- [ ] **Step 4: Run the focused authorization suite**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/tools.test.ts`

Expected: PASS, including the sibling Scope no-leak test.

- [ ] **Step 5: Commit the isolated fix**

```bash
git add apps/mcp-server/src/federation/tools.ts apps/mcp-server/src/federation/tools.test.ts
git commit -m "fix: allow seeded knowledge readiness reads"
```

### Task 2: Add Deterministic Feature-Catalog Planning

**Files:**
- Create: `apps/mcp-server/src/features/catalog-backfill.ts`
- Create: `apps/mcp-server/src/features/catalog-backfill.test.ts`

**Interfaces:**
- Consumes: `SystemKnowledgeAsset[]`, `SystemKnowledgeRelationship[]`, `ArchitectureScopeRef`, and an ISO timestamp.
- Produces: `FeatureCatalogBackfillPlan` with Change Set assets/relationships, direct mappings, indirect mappings, exceptions, and a stable digest.
- Exposes: `buildFeatureCatalogBackfillPlan(input: FeatureCatalogBackfillInput): FeatureCatalogBackfillPlan`.

- [ ] **Step 1: Write a mixed-catalog planner test**

Use API, data model, rule, ADR, Proposal, Context Pack, and Integration fixtures. Assert full Chinese overlays, API `EXPOSES` a Functional Feature, rule `GOVERNS` a Functional Feature, Context Pack follows an existing Proposal path, and orphan Integration becomes an exception:

```ts
expect(plan.relationships).toContainEqual(expect.objectContaining({
  relationType: "EXPOSES",
  source: endpoint("api", "api-catalog"),
  target: expect.objectContaining({ nodeType: "functionalFeature" })
}));
expect(plan.indirectMappings).toContainEqual(expect.objectContaining({
  assetId: "ctx-catalog", viaAssetId: "proposal-catalog"
}));
expect(plan.exceptions).toContainEqual(expect.objectContaining({
  assetId: "integration-orphan",
  reason: "ONTOLOGY_DIRECT_FEATURE_LINK_UNSUPPORTED"
}));
```

- [ ] **Step 2: Confirm the test fails**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/features/catalog-backfill.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement the deterministic planner**

Create eight Service Features with stable IDs:

```ts
[
  "sf-governed-authoring", "sf-design-catalog-contracts",
  "sf-architecture-modeling", "sf-relationship-impact-analysis",
  "sf-system-knowledge", "sf-federated-discovery",
  "sf-requirement-assessment", "sf-scope-governance"
]
```

Classify each non-Feature asset by type plus normalized ID/name keywords; unmatched assets go to `sf-design-catalog-contracts`. Create Functional Features per value-area/type cluster as `ff-<area>-<asset-type>`, with English canonical fields and complete Chinese overlays.

Allow only the following direct Feature links: API/operation `EXPOSES` Functional Feature; Functional Feature `READS` data model; Functional Feature `CONSUMES` event; rule `GOVERNS` Functional Feature; state machine `CONTROLS` Functional Feature; quality `VERIFIES` Functional Feature; observability `OBSERVES` Functional Feature; ADR `DECIDES` Service Feature; Proposal `IMPACTS` Service Feature; Evidence `VALIDATES` Functional Feature; Functional Feature `CONTRIBUTES_TO` Service Feature.

For `contextPack` and `integration`, follow an existing mapped Proposal/API/Integration neighbor. Otherwise record a typed exception. Sort and deduplicate every collection before calculating `contentDigest`; never infer `WRITES`, `EMITS`, `SUBSCRIBES`, or field links.

- [ ] **Step 4: Verify planner correctness**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/features/catalog-backfill.test.ts && pnpm --filter @specforge/mcp-server typecheck`

Expected: PASS with stable digest, valid endpoints, no duplicate links, and no cross-Scope IDs.

- [ ] **Step 5: Commit the planner**

```bash
git add apps/mcp-server/src/features/catalog-backfill.ts apps/mcp-server/src/features/catalog-backfill.test.ts
git commit -m "feat: plan scoped feature catalog backfill"
```

### Task 3: Add a Readiness-Gated MCP Backfill Command

**Files:**
- Create: `scripts/backfill-feature-catalog.ts`
- Create: `scripts/backfill-feature-catalog.test.ts`
- Modify: `package.json:7-46`

**Interfaces:**
- Consumes: `pnpm feature-catalog:backfill -- --dry-run|--apply --session <id>` plus exact Scope flags.
- Produces: `.specforge/feature-catalog/<plan-digest>.json` and structured stdout containing receipt, counts, exceptions, and Change Set result.
- Uses: readiness evaluation, receipt-bound paginated knowledge reads, `apply_feature_change_set`, list/detail/graph/coverage reads.

- [ ] **Step 1: Write orchestrator tests**

Export `runFeatureCatalogBackfill(client, options)`. With a fake MCP caller, assert readiness precedes every read, dry-run sends `dryRun: true`, denial performs no write, and apply sends exactly one stable idempotency key.

```ts
expect(fakeClient.calls.map((call) => call.name)).toEqual([
  "evaluate_system_knowledge_readiness",
  "read_system_knowledge",
  "read_system_knowledge",
  "apply_feature_change_set"
]);
expect(fakeClient.calls.at(-1)?.arguments).toMatchObject({ dryRun: true });
```

- [ ] **Step 2: Confirm tests fail**

Run: `pnpm exec vitest run scripts/backfill-feature-catalog.test.ts`

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement bounded orchestration**

Use this control flow:

```ts
const readiness = await call("evaluate_system_knowledge_readiness", readRequest);
if (readiness.accessDecision !== "ALLOW") {
  throw new Error(`FEATURE_CATALOG_READINESS_DENIED:\${readiness.reasonCodes.join(",")}`);
}
do {
  const page = await call("read_system_knowledge", {
    ...readRequest, receiptId: readiness.receiptId, cursor, pageSize: 200
  });
  if (page.accessDecision !== "ALLOW") throw new Error("FEATURE_CATALOG_READ_DENIED");
  assets.push(...page.assets); relationships.push(...page.relationships); cursor = page.nextCursor;
} while (cursor);
```

Build the plan, write its JSON artifact below `.specforge/feature-catalog/`, and submit one `apply_feature_change_set`. Reject plans over 100 Feature assets or 1,000 relationships. Reject `--apply` when any exception is `NO_EVIDENCED_INDIRECT_PATH`; print ontology-limited exceptions with IDs and reasons. Add:

```json
"feature-catalog:backfill": "tsx scripts/backfill-feature-catalog.ts"
```

- [ ] **Step 4: Verify the command**

Run: `pnpm exec vitest run scripts/backfill-feature-catalog.test.ts && pnpm --filter @specforge/mcp-server typecheck`

Expected: PASS; denial writes nothing, page reads reuse one receipt, dry-run persists no authoritative record, and apply is idempotent.

- [ ] **Step 5: Commit the command**

```bash
git add scripts/backfill-feature-catalog.ts scripts/backfill-feature-catalog.test.ts package.json
git commit -m "feat: add governed feature catalog backfill"
```

### Task 4: Backfill and Verify the Live Exact-Scope Catalog

**Files:**
- Modify through MCP: `proposal-first-class-feature-assets`, `context-pack-first-class-feature-assets`, Feature assets, and their typed links.
- Create locally but do not commit: `.specforge/feature-catalog/<plan-digest>.json`

**Interfaces:**
- Consumes: Task 3 command and a `DesignChangeSession` receipt.
- Produces: active bilingual Features, mapping evidence, MCP audit receipts, and a `CONVERGED` session.

- [ ] **Step 1: Open the governed design session**

```powershell
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Backfill complete bilingual Feature catalog from readiness-gated exact-Scope system knowledge" --affected "adr-first-class-feature-assets,proposal-first-class-feature-assets,context-pack-first-class-feature-assets" --evidence "feature-catalog-backfill-plan=e6b5bcf"
```

Expected: an OPEN exact-Scope session receipt.

- [ ] **Step 2: Produce and inspect the dry run**

```powershell
pnpm feature-catalog:backfill -- --dry-run --session <session-id> --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
```

Expected: readiness ALLOW, receipt-bound pages, plan artifact path, zero committed Feature revisions, and mapping/exception counts. Stop on any `NO_EVIDENCED_INDIRECT_PATH` exception.

- [ ] **Step 3: Commit the atomic Change Set**

```powershell
pnpm feature-catalog:backfill -- --apply --session <session-id> --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
```

Then use MCP to update the existing Feature Proposal and Context Pack with the plan digest, session ID, counts, exceptions, and verification evidence. Do not update PostgreSQL directly.

- [ ] **Step 4: Verify and close**

Read one Service Feature and one Functional Feature in English and Chinese, query their bounded graph and coverage, then close:

```powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session <session-id> --status CONVERGED --evidence "feature-catalog:backfill-dry-run=passed,feature-catalog:backfill-apply=passed,mcp-feature-list-detail-graph-coverage=passed"
```

Expected: `CONVERGED`, no pending synchronization, and no claim that a derived projection is authoritative.

- [ ] **Step 5: Commit matching repository evidence only when changed**

```bash
git add docs/adr/0047-first-class-feature-assets.md docs/design-facts/baseline-manifest.json
git commit -m "docs: record feature catalog backfill evidence"
```

## Plan Self-Review

- Task 1 repairs the mandatory readiness gate without widening scope access.
- Task 2 implements bilingual value/behavior classification and preserves ontology limits.
- Task 3 makes all reads receipt-bound, writes atomic, and dry-run/apply deterministic.
- Task 4 applies only after exact-Scope preflight and records MCP evidence.
- The plan has no placeholder work items; runtime session IDs and plan digests are intentionally command outputs rather than invented values.
