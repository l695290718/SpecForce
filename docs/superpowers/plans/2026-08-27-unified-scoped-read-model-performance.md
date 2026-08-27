# Unified Scoped Read Model Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-Scope in-memory reads with bounded, version-aware Web and MCP reads while preserving exact Scope isolation and PostgreSQL authority.

**Architecture:** A new `@specforge/scoped-read` package owns the shared read contracts, cursor validation, summary projection mapping, and query orchestration. Web and MCP remain separate transports but inject their own Prisma clients into the same service. Authored tables remain authoritative; a rebuildable bilingual search projection serves cross-type search, while graph reads remain separately bounded and on-demand.

**Tech Stack:** TypeScript, pnpm workspaces, Prisma 6, PostgreSQL, Next.js 15, MCP SDK, Vitest.

## Global Constraints

- The owning application service is `com.huawei.celon.desiner`.
- The exact Scope path is `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored assets and relationship events; read projections are derived and rebuildable.
- Every read query must include both `applicationServiceId` and `scopePath` after server-side authorization.
- English is canonical; Chinese is a complete human-facing localized overlay.
- MCP writes remain the governed write boundary and must make the next MCP read observe the committed asset.
- Do not add an unversioned TTL cache or change the existing `.tmp/` worktree content.
- Before code or schema edits, run the exact-Scope `pnpm design-context:preflight` command and record its returned session ID.
- After focused verification and MCP read-back, close that same session with `pnpm design-context:close` and exact evidence.

---

### Task 1: Create the shared scoped-read contracts and cursor primitives

**Files:**
- Create: `packages/scoped-read/package.json`
- Create: `packages/scoped-read/tsconfig.json`
- Create: `packages/scoped-read/src/types.ts`
- Create: `packages/scoped-read/src/cursor.ts`
- Create: `packages/scoped-read/src/index.ts`
- Create: `packages/scoped-read/src/cursor.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces `AuthorizedScopeContext`, `AssetSummaryRow`, `ScopedReadPage<T>`, `ScopedAssetReadQuery`, `ScopedDetailQuery`, and opaque cursor encode/decode functions for Tasks 2-5.
- Consumes only `@specforge/core` asset type definitions and WebCrypto/node crypto-compatible signing primitives; it does not import Prisma.

- [ ] **Step 1: Write the failing contract tests**

Create tests that assert cursor decoding rejects a changed Scope, principal subject, locale, filter digest, or catalog version, and that a valid cursor round-trips without exposing its internal JSON as a caller-readable format.

```ts
it("rejects a cursor when the catalog version changes", () => {
  const cursor = encodeReadCursor({
    version: 1,
    subject: "agent-1",
    architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: DESIGNER_SCOPE_PATH },
    locale: "en",
    queryDigest: "query-1",
    catalogVersion: "7",
    orderKey: ["2026-08-27T00:00:00.000Z", "api-1"]
  });
  expect(() => decodeReadCursor(cursor, { subject: "agent-1", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: DESIGNER_SCOPE_PATH }, locale: "en", queryDigest: "query-1", catalogVersion: "8" })).toThrow("CURSOR_STALE");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run packages/scoped-read/src/cursor.test.ts`

Expected: FAIL because the package and cursor functions do not exist.

- [ ] **Step 3: Implement the package contracts**

Define a structural database-independent contract. The service must receive an authorized scope object, never a raw browser or MCP Scope claim.

```ts
export type AuthorizedScopeContext = {
  subject: string;
  tenantId?: string;
  architectureScope: { applicationServiceId: string; scopePath: string };
  catalogVersion: string;
  projectionVersion: string;
};

export type AssetSummaryRow = {
  id: string;
  type: string;
  name: string;
  summary: string;
  domainId?: string;
  status?: string;
  updatedAt: string;
  contentDigest: string;
  architectureScope: AuthorizedScopeContext["architectureScope"];
};

export type ScopedReadPage<T> = {
  items: T[];
  total?: number;
  hasMore: boolean;
  nextCursor?: string;
  catalogVersion: string;
  projectionVersion: string;
  resultDigest: string;
};

export type ScopedAssetReadQuery = {
  assetTypes?: string[];
  domainId?: string;
  query?: string;
  locale: "en" | "zh";
  pageSize: number;
  cursor?: string;
  sort: "relevance" | "updatedAt";
};
```

Use a server-only secret from `SPECFORGE_READ_CURSOR_SECRET`, with a local fallback matching the existing graph cursor pattern. Encode only signed opaque payloads and validate all query bindings before returning a page.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm exec vitest run packages/scoped-read/src/cursor.test.ts`

Expected: PASS with cursor round-trip, Scope mismatch, query mismatch, and stale-version cases covered.

- [ ] **Step 5: Commit the shared contract**

```bash
git add packages/scoped-read pnpm-lock.yaml
git commit -m "feat: add scoped read contracts and cursors"
```

### Task 2: Add the bilingual search projection and query indexes

**Files:**
- Modify: `prisma/schema.prisma` after `ContextPack`
- Modify: `apps/mcp-server/src/persistence.ts` in `ensureMcpPersistenceSchema` and governed write helpers
- Create: `apps/mcp-server/src/scoped-read-projection.ts`
- Create: `apps/mcp-server/src/scoped-read-projection.test.ts`
- Create: `apps/mcp-server/src/scoped-read-projection.integration.test.ts`

**Interfaces:**
- Consumes `Asset`, `Proposal`, `ContextPack`, `AssetLocale`, and `AuthoredCatalogCursor`.
- Produces `upsertAssetSearchProjection`, `deleteAssetSearchProjection`, `rebuildAssetSearchProjection`, and `readCatalogVersion` for Tasks 3 and 4.

- [ ] **Step 1: Add schema definitions and failing projection tests**

Add an `AssetSearchProjection` model with Scope-qualified uniqueness and fields for canonical English, Chinese overlay, type, domain, status, updated time, content digest, catalog version, and normalized search text. Add composite indexes for `(applicationServiceId, scopePath, assetType, updatedAt, assetId)` and `(applicationServiceId, scopePath, domainId, assetType, updatedAt, assetId)`.

```prisma
model AssetSearchProjection {
  dbId                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  applicationServiceId String
  scopePath            String
  assetType            String
  assetId              String
  canonicalName        String
  canonicalSummary     String
  localizedNameZh      String
  localizedSummaryZh   String
  domainId             String?
  status               String?
  updatedAt            DateTime
  catalogVersion       BigInt
  contentDigest        String
  searchDocument       String
  createdAt            DateTime @default(now())

  @@unique([applicationServiceId, scopePath, assetType, assetId], map: "AssetSearchProjection_scope_asset_key")
  @@index([applicationServiceId, scopePath, assetType, updatedAt, assetId], map: "AssetSearchProjection_scope_type_updated_idx")
  @@index([applicationServiceId, scopePath, domainId, assetType, updatedAt, assetId], map: "AssetSearchProjection_scope_domain_type_updated_idx")
}
```

The failing test must prove projection rows never cross Scope and that the normalized search document contains both English and Chinese human-facing values without storing raw credentials.

- [ ] **Step 2: Run the projection test and verify it fails**

Run: `pnpm exec vitest run apps/mcp-server/src/scoped-read-projection.test.ts`

Expected: FAIL because the model and projection functions do not exist.

- [ ] **Step 3: Implement idempotent projection maintenance**

Implement extraction from the canonical payload and localized overlay. Use a stable digest of the canonical payload and update the projection only when the digest or catalog version changes. The rebuild reads each authoritative table in bounded batches and uses `upsert`, never deletes authored rows.

Add the projection table and indexes to the existing compatibility schema setup so a Docker database can start from empty or legacy state. Do not enable a required PostgreSQL extension in the first implementation; use a bounded indexed prefix/exact fallback for search and leave optional trigram support as a measured capability.

- [ ] **Step 4: Add transactional write hooks and integration coverage**

Call projection maintenance from the same Prisma transaction that persists an MCP asset/proposal/Context Pack and appends its authored revision. Add relationship index creation for Scope-qualified source and target lookups:

```sql
CREATE INDEX IF NOT EXISTS "AssetLink_scope_source_idx"
ON "AssetLink" ("applicationServiceId", "scopePath", "sourceType", "sourceId", "relationType");
CREATE INDEX IF NOT EXISTS "AssetLink_scope_target_idx"
ON "AssetLink" ("applicationServiceId", "scopePath", "targetType", "targetId", "relationType");
```

The integration test must write two Scope records, update one through the MCP persistence path, and assert the next projection read sees the update while the other Scope is unchanged.

- [ ] **Step 5: Run schema and projection checks**

Run: `pnpm db:generate`

Run: `pnpm exec vitest run apps/mcp-server/src/scoped-read-projection.test.ts apps/mcp-server/src/scoped-read-projection.integration.test.ts`

Expected: PASS; on a configured PostgreSQL instance the integration suite proves idempotent backfill, transactional visibility, and Scope isolation.

- [ ] **Step 6: Commit the projection**

```bash
git add prisma/schema.prisma apps/mcp-server/src/persistence.ts apps/mcp-server/src/scoped-read-projection.ts apps/mcp-server/src/scoped-read-projection.test.ts apps/mcp-server/src/scoped-read-projection.integration.test.ts
git commit -m "feat: add scoped bilingual asset search projection"
```

### Task 3: Implement the shared bounded query service and MCP persistence adapter

**Files:**
- Modify: `packages/scoped-read/src/types.ts`
- Create: `packages/scoped-read/src/service.ts`
- Create: `packages/scoped-read/src/service.test.ts`
- Create: `apps/mcp-server/src/scoped-read-repository.ts`
- Modify: `apps/mcp-server/src/persistence.ts`

**Interfaces:**
- Consumes `AssetSearchProjection`, authored tables, `AssetLink`, and `AuthoredCatalogCursor` through an injected repository interface.
- Produces `createScopedAssetReadService`, `searchScopedAssetSummaries`, `getScopedAssetSummary`, and `listScopedAssetRelationships` for Web and MCP adapters.

- [ ] **Step 1: Write failing service tests**

Cover exact Scope predicates, summary-only output, deterministic keyset order, maximum page size, cursor invalidation, and no full-catalog callback. Use a fake repository whose `readFullCatalog` throws if called.

```ts
it("returns only the requested Scope and a continuation cursor", async () => {
  const service = createScopedAssetReadService(fakeRepository({ catalogVersion: "4" }));
  const page = await service.search({
    context: designerContext,
    query: { assetTypes: ["api"], locale: "en", pageSize: 2, sort: "updatedAt" }
  });
  expect(page.items.every((item) => item.architectureScope.applicationServiceId === "com.huawei.celon.desiner")).toBe(true);
  expect(page.items).toHaveLength(2);
  expect(page.nextCursor).toBeDefined();
});
```

- [ ] **Step 2: Run the service test and verify it fails**

Run: `pnpm exec vitest run packages/scoped-read/src/service.test.ts`

Expected: FAIL because the service and repository contract do not exist.

- [ ] **Step 3: Implement service-level validation and keyset orchestration**

The repository interface must expose only bounded operations:

```ts
export interface ScopedAssetReadRepository {
  readCatalogVersion(scope: ArchitectureScopeRef): Promise<{ catalogVersion: string; projectionVersion: string }>;
  searchSummaries(scope: ArchitectureScopeRef, query: NormalizedReadQuery, after?: ReadOrderKey): Promise<{ rows: AssetSummaryRow[]; hasMore: boolean }>;
  findSummary(scope: ArchitectureScopeRef, assetType: string, assetId: string): Promise<AssetSummaryRow | undefined>;
  listRelationships(scope: ArchitectureScopeRef, input: RelationshipReadQuery): Promise<ScopedReadPage<AssetRelationshipRow>>;
}
```

Clamp page sizes to 1-50 for MCP and 1-100 for Web through adapter configuration. Bind cursors to subject, Scope, normalized query, locale, projection version, and catalog version. Return a result digest from stable row identities and content digests.

- [ ] **Step 4: Implement the Prisma adapter**

Use `select` to avoid fetching `payload` for summary queries. Search the projection for cross-type MCP requests, and query `DesignAsset`, `Proposal`, or `ContextPack` directly for typed lists where the top-level summary columns are sufficient. Use Scope-qualified composite indexes and `take: pageSize + 1`; do not call `listPersistedAssets` or `loadScopedAssetCatalog`.

Relationship reads must accept source or target filters and use the new Scope-qualified indexes. Validate both endpoints against the same Scope before returning a relationship row.

- [ ] **Step 5: Run focused service and MCP persistence tests**

Run: `pnpm exec vitest run packages/scoped-read/src/service.test.ts apps/mcp-server/src/persistence.test.ts`

Expected: PASS, with legacy persistence tests retaining their existing response behavior.

- [ ] **Step 6: Commit the bounded query service**

```bash
git add packages/scoped-read apps/mcp-server/src/scoped-read-repository.ts apps/mcp-server/src/persistence.ts
git commit -m "feat: add bounded scoped asset query service"
```

### Task 4: Upgrade MCP reads without breaking existing tools

**Files:**
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/scoped-derived.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/tools.test.ts`
- Modify: `apps/mcp-server/src/scoped-derived.test.ts`
- Create: `apps/mcp-server/src/mcp-read-performance.test.ts`

**Interfaces:**
- Consumes the bounded query service from Task 3.
- Produces additive `search_design_assets` pagination metadata, direct `get_asset_detail` reads, bounded relationship reads, and `query_asset_graph` MCP capability.

- [ ] **Step 1: Add failing MCP contract tests**

Assert that `search_design_assets` accepts `cursor`, `pageSize`, `sort`, and `summaryOnly`, returns `nextCursor`, `hasMore`, `catalogVersion`, `projectionVersion`, `resultDigest`, and `truncated`, and never calls a full catalog loader. Assert that `get_asset_detail` can omit governance and relationships unless included.

- [ ] **Step 2: Run the MCP contract tests and verify they fail**

Run: `pnpm exec vitest run apps/mcp-server/src/mcp-read-performance.test.ts`

Expected: FAIL because the additive schemas and bounded handlers do not exist.

- [ ] **Step 3: Implement additive `search_design_assets` behavior**

Keep `query`, `applicationServiceId`, `assetTypes`, `domainId`, `limit`, and `locale`. Treat `limit` as a compatibility alias for `pageSize`. Return existing `results` item fields and add page metadata. Default to summaries; do not include canonical payloads.

- [ ] **Step 4: Implement direct MCP detail and relationship reads**

Route JSON detail through a Scope-qualified direct row lookup. Route Markdown through the existing direct persistence renderer where possible. Only build a catalog for derived operations that explicitly require it, and expose the result as a degraded path until those operations are migrated. Add bounded options to `list_asset_links` or register `query_asset_links` while preserving the old omitted-argument behavior for compatibility callers.

- [ ] **Step 5: Register bounded graph reads**

Register `query_asset_graph` with focus, `maxNodes`, `maxEdges`, `pageSize`, `cursor`, and traversal budget. Preserve `get_asset_graph` as a compatibility adapter with explicit cap and deprecation metadata. A graph response must state `partial` and the truncation reason rather than silently dropping nodes.

- [ ] **Step 6: Run MCP typecheck and focused suites**

Run: `pnpm --filter @specforge/mcp-server typecheck`

Run: `pnpm exec vitest run apps/mcp-server/src/tools.test.ts apps/mcp-server/src/scoped-derived.test.ts apps/mcp-server/src/mcp-read-performance.test.ts`

Expected: PASS with old tool response fields preserved and new bounded reads verified.

- [ ] **Step 7: Commit the MCP read adapters**

```bash
git add apps/mcp-server/src/tools.ts apps/mcp-server/src/scoped-derived.ts apps/mcp-server/src/persistence.ts apps/mcp-server/src/tools.test.ts apps/mcp-server/src/scoped-derived.test.ts apps/mcp-server/src/mcp-read-performance.test.ts
git commit -m "feat: make MCP asset reads bounded and versioned"
```

### Task 5: Move Web asset lists and details to bounded reads

**Files:**
- Modify: `apps/web/lib/assets.ts`
- Modify: `apps/web/app/api/assets/[type]/route.ts`
- Modify: `apps/web/app/assets/[type]/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/page.tsx`
- Create: `apps/web/lib/scoped-read-adapter.ts`
- Modify: `apps/web/lib/__tests__/scoped-catalog.test.ts`
- Create: `apps/web/lib/__tests__/scoped-read-performance.test.ts`

**Interfaces:**
- Consumes the shared query service and Web Prisma client.
- Produces existing list/detail page shapes plus additive cursor/version metadata; existing URLs with `offset` remain accepted during migration.

- [ ] **Step 1: Write failing Web tests**

Assert that a typed first page does not invoke `getScopedAssetCatalog`, uses a bounded limit, and returns only the requested Scope. Assert that the detail fast path performs one exact asset lookup before optional derived sections.

- [ ] **Step 2: Run the Web tests and verify they fail**

Run: `pnpm exec vitest run apps/web/lib/__tests__/scoped-read-performance.test.ts`

Expected: FAIL because the current functions still build the full catalog.

- [ ] **Step 3: Implement the Web adapter**

Change `searchScopedAssets` to call the shared service. Preserve `items`, `total`, `limit`, and `offset` in the response for existing callers, while adding `nextCursor`, `hasMore`, and `catalogVersion`. Translate an incoming offset only for the compatibility path; new page requests use keyset cursors.

Change typed no-query routes to select summary rows from the authored/projection tables. Change detail to read one exact Scope-qualified asset first, and defer governance, Markdown, and relationship sections to their dedicated loaders where the page architecture allows.

- [ ] **Step 4: Run Web focused tests and typecheck**

Run: `pnpm exec vitest run apps/web/lib/__tests__/scoped-read-performance.test.ts apps/web/lib/__tests__/scoped-catalog.test.ts`

Run: `pnpm --filter @specforge/web typecheck`

Expected: PASS; existing localization, legacy read, and Scope isolation tests remain green.

- [ ] **Step 5: Commit the Web read path**

```bash
git add apps/web/lib/assets.ts apps/web/app/api/assets/[type]/route.ts apps/web/app/assets/[type]/page.tsx apps/web/app/assets/[type]/[id]/page.tsx apps/web/lib/scoped-read-adapter.ts apps/web/lib/__tests__/scoped-read-performance.test.ts apps/web/lib/__tests__/scoped-catalog.test.ts
git commit -m "perf: use bounded scoped reads in Web assets"
```

### Task 6: Make data-model graph reads on-demand and bounded

**Files:**
- Modify: `apps/web/components/asset-detail-sections.tsx`
- Modify: `apps/web/lib/data-model-graph.ts`
- Modify: `apps/web/components/data-model-er/data-model-graph-fetch.ts`
- Modify: `apps/web/app/api/data-model-graph/route.ts`
- Modify: `apps/web/lib/data-model-graph.test.ts`
- Modify: `apps/web/components/data-model-er/data-model-graph-fetch.test.ts`

**Interfaces:**
- Consumes the existing waterline-bound graph query and the Web read adapter.
- Produces lazy graph requests, bounded initial pages, stable cursor continuation, and localized loading/error/truncation states.

- [ ] **Step 1: Add failing lazy-load tests**

Render `DataModelGraphSurface` with `defaultView="list"` and assert no `fetch` occurs. Render it with graph view and assert the initial request uses the declared page and client capacity. Assert that changing the focus resets the cursor.

- [ ] **Step 2: Run the graph tests and verify they fail**

Run: `pnpm exec vitest run apps/web/components/data-model-er/data-model-graph-fetch.test.ts apps/web/lib/data-model-graph.test.ts`

Expected: FAIL because the component currently fetches the graph in every view.

- [ ] **Step 3: Implement lazy graph loading**

Guard the effect with `if (view !== "er") return`, use an initial `pageSize` and `clientCapacity` that are configurable constants, and request subsequent pages only when the workspace needs them. Keep the current waterline/cursor validation and return explicit partial errors. The list page must render its field table without a graph request.

- [ ] **Step 4: Run graph tests and Web typecheck**

Run: `pnpm exec vitest run apps/web/components/data-model-er/data-model-graph-fetch.test.ts apps/web/lib/data-model-graph.test.ts`

Run: `pnpm --filter @specforge/web typecheck`

Expected: PASS; list mode has zero graph requests and graph mode retains snapshot-change rejection.

- [ ] **Step 5: Commit lazy graph loading**

```bash
git add apps/web/components/asset-detail-sections.tsx apps/web/lib/data-model-graph.ts apps/web/components/data-model-er/data-model-graph-fetch.ts apps/web/app/api/data-model-graph/route.ts apps/web/lib/data-model-graph.test.ts apps/web/components/data-model-er/data-model-graph-fetch.test.ts
git commit -m "perf: defer and bound data model graph reads"
```

### Task 7: Add parity, query-plan, and operational evidence

**Files:**
- Create: `apps/web/lib/__tests__/mcp-web-read-parity.test.ts`
- Create: `apps/mcp-server/src/read-isolation.integration.test.ts`
- Create: `scripts/benchmark-scoped-reads.ts`
- Modify: `README.md`
- Modify: `deploy/README.md`
- Modify: the linked ADR for this design
- Modify: the linked Proposal and Context Pack through MCP, not by direct database writes

**Interfaces:**
- Consumes the completed Web/MCP adapters, projection rebuild, and exact Scope preflight session.
- Produces reproducible evidence for read-after-write, Scope isolation, pagination stability, query latency, payload bytes, and MCP token-sized responses.

- [ ] **Step 1: Add parity and isolation tests**

For the same exact Scope and query, compare Web adapter and MCP adapter IDs, types, names, Scope, locale, catalog version, and digest. Attempt cross-Scope detail, cursor reuse, relationship lookup, and graph lookup; each must fail without revealing the other Scope's existence.

- [ ] **Step 2: Add the benchmark command**

The command accepts `--application-service`, `--scope-path`, `--iterations`, and `--page-size`, runs typed list, bilingual search, detail, relationship, and graph-initial-page cases, and prints p50/p95 latency, rows returned, payload bytes, and response byte count. It must not write assets.

- [ ] **Step 3: Run the complete focused verification**

Run: `pnpm --filter @specforge/core typecheck`

Run: `pnpm --filter @specforge/mcp-server typecheck`

Run: `pnpm --filter @specforge/web typecheck`

Run: `pnpm exec vitest run packages/scoped-read/src apps/mcp-server/src apps/web/lib/__tests__ apps/web/components/data-model-er`

Run: `git diff --check`

Run: `pnpm exec prisma validate`

Run: `pnpm tsx scripts/benchmark-scoped-reads.ts --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --iterations 10 --page-size 20`

Expected: all focused checks pass; the benchmark records actual measurements and does not claim the 300 ms target unless the output supports it.

- [ ] **Step 4: Synchronize and read back design facts**

Through MCP in the exact Scope, update the ADR, Proposal, Context Pack, and typed relationships with the implementation status and exact evidence references. Verify repository Spec ID, MCP IDs, English canonical content, Chinese overlays, Scope, relationship direction, projection authority, and deferred items.

- [ ] **Step 5: Close the design-change session**

Run the exact session returned by preflight:

```bash
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session <preflight-session-id> --status CONVERGED --evidence "scoped-read-contract-tests=PASS,mcp-typecheck=PASS,web-typecheck=PASS,scope-isolation=PASS,read-after-write=PASS,query-plan-benchmark=<recorded-result>,git-diff-check=PASS,mcp-readback=PASS"
```

Use the correct exact Scope path from the preflight receipt; if synchronization or verification is blocked, close as `BLOCKED` with the failure reason and retry trigger and record `MCP synchronization blocked` in the repository record.

- [ ] **Step 6: Commit the evidence and docs**

```bash
git add apps/web/lib/__tests__/mcp-web-read-parity.test.ts apps/mcp-server/src/read-isolation.integration.test.ts scripts/benchmark-scoped-reads.ts README.md deploy/README.md docs/adr docs/superpowers/specs docs/superpowers/plans
git commit -m "docs: record scoped read performance evidence"
```

## Plan Self-Review

- Spec coverage: shared Web/MCP boundary is covered by Tasks 1 and 3; PostgreSQL projection and indexes by Task 2; MCP compatibility by Task 4; Web progressive loading by Task 5; graph bounds by Task 6; consistency, evidence, and MCP synchronization by Task 7.
- Placeholder scan: implementation commands use concrete paths and commands; `<preflight-session-id>` is an execution-time value intentionally supplied by the preflight receipt, not an implementation placeholder.
- Type consistency: Task 1 defines `ScopedReadPage` and cursor binding; Task 3 consumes them; Tasks 4-6 consume the service; Task 7 verifies all adapters.
- Known scope boundary: existing derived governance and full graph algorithms are migrated incrementally. The first implementation must remove full-catalog work from list/detail fast paths and must not claim all derived reads are bounded until their focused tests pass.
