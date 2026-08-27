# Unified Scoped Read Model and MCP Read Performance

Status: Proposed

Date: 2026-08-27

Owning application service: `com.huawei.celon.desiner`

Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Problem

The Web asset list, asset detail, and graph paths currently build a complete in-memory catalog for one application-service Scope before filtering or rendering. MCP has the same behavior: `search_design_assets` loads all candidate assets before scoring, while `get_asset_detail` and `get_asset_graph` load the complete scoped catalog. The first visit to API contracts and data models therefore pays for unrelated payloads and relationships. A Web-only optimization would leave Agent reads slow and would create two different read semantics.

The design must preserve exact Scope isolation, English-canonical bilingual content, PostgreSQL authority, immediate read-after-MCP-write behavior, and compatibility for existing MCP clients.

## Goals

- Make Web and MCP use the same scoped read semantics and authorization boundary.
- Make typed asset lists and single-asset details bounded database reads.
- Make MCP search return token-efficient summaries with continuation metadata.
- Load data-model and relationship graphs only on demand and within explicit bounds.
- Make stale pagination detectable through the authored catalog version.
- Keep authored assets and relationship events authoritative in PostgreSQL; derived read projections must be rebuildable.
- Preserve existing MCP tool names and existing response fields while adding optional bounded-read capabilities.

## Non-goals

- Replacing PostgreSQL with a graph database.
- Making the Web UI call the MCP transport for every read.
- Adding a general-purpose distributed cache before baseline measurements exist.
- Changing asset ownership, cross-Scope authorization, or the MCP write boundary.
- Claiming production-scale performance before representative benchmark evidence exists.

## Current evidence

- `apps/web/lib/assets.ts` implements `searchScopedAssets` by calling `getScopedAssetCatalog`, then serializing each in-memory asset for search and pagination.
- `apps/mcp-server/src/persistence.ts` implements `searchPersistedDesignAssets` by loading all typed assets, proposals, and Context Packs before scoring and slicing.
- `apps/mcp-server/src/scoped-derived.ts` loads the full catalog for `getScopedAssetDetail`, `renderScopedAssetMarkdown`, and `buildScopedAssetGraph`.
- `AuthoredCatalogCursor` already provides a per-Scope monotonically increasing catalog version and can bind continuation tokens to a stable read waterline.
- The authored tables have Scope-qualified uniqueness, but the primary asset list indexes are not yet optimized for the common `(applicationServiceId, scopePath, type, ordering)` access pattern. `AssetLink` also lacks Scope-qualified source and target lookup indexes.

## Architecture

### Shared query service

Introduce a persistence-backed `ScopedAssetQueryService` (name may follow the repository's final package convention). It accepts an already authorized `AuthorizedScopeContext`, never a raw browser-provided Scope claim. The Web route adapter and MCP tool adapter call the same service; they do not duplicate catalog assembly or search scoring.

Authorization happens before counts, existence checks, cursors, or error details. Every query includes both `applicationServiceId` and the canonical `scopePath`. A missing or unauthorized Scope has the same non-disclosing failure behavior regardless of whether an asset exists.

The service exposes four read modes:

1. `list/search`: a bounded summary projection for one or more asset types.
2. `detail`: one exact `(Scope, type, id)` lookup, with optional independently requested sections.
3. `relationships`: bounded incoming/outgoing typed links for selected endpoints.
4. `graph`: a bounded, focus-based traversal or published projection read, never an implicit full-catalog read.

### Read projection

Add a rebuildable PostgreSQL `AssetSearchProjection` for cross-type and bilingual MCP search. It contains the exact Scope, asset type and ID, canonical English name and summary, Chinese localized name and summary, domain, status, updated time, catalog version, content digest, and a normalized search document. It is a read model, not a second authority.

Typed Web lists should first use the authored table's indexed summary columns and select only the fields required for a row. Cross-type MCP search uses the projection so it does not parse every JSON payload in application memory. The projection may use PostgreSQL text-search or trigram capability according to deployment capability; the contract must retain a deterministic bounded fallback when an optional extension is unavailable.

MCP writes update the authored row, revision/event record, projection row, and Scope catalog cursor in one PostgreSQL transaction. A guarded, idempotent rebuild is required for existing databases and for recovery. Direct operational changes outside the governed write path are treated as reconciliation drift rather than silently accepted as a second write path.

### Ordering and continuation

Use keyset pagination ordered by a deterministic tuple such as `(relevance desc, updatedAt desc, assetType asc, assetId asc)` for search and `(updatedAt desc, assetId asc)` for a typed list. A cursor is opaque and binds the principal, exact Scope, normalized filters, locale, projection version, and `catalogVersion`.

If the catalog version changes between pages, return `CURSOR_STALE` and require a new first-page read. Never silently mix old and new pages. Every page returns the exact Scope, catalog version, result digest, `hasMore`, and `nextCursor` when present.

### Graph and data-model reads

The data-model list page does not request graph data. Switching to ER or relationship view requests a bounded initial projection using a selected model or focus set. The response must cap nodes, edges, payload bytes, and traversal time, and return explicit continuation or truncation reasons. Field-level edges are read from typed relationships or the graph projection with endpoint validation; a full graph is never synthesized by loading every asset into the Web request.

## MCP contract changes

`search_design_assets` keeps its current required fields and result item fields. Add optional `cursor`, `pageSize`, `sort`, and `summaryOnly`. Keep `limit` as a compatibility alias with the existing maximum. Add `nextCursor`, `hasMore`, `catalogVersion`, `resultDigest`, and `truncated` as additive result fields. Default output is summary-only; full canonical payload is obtained through `get_asset_detail`.

`get_asset_detail` becomes a direct exact-row read. Add optional `include` values for `canonical`, `relationships`, `governance`, and `markdown`; sections not requested are not computed. Existing `asset` and `canonicalSource` fields remain available for current callers.

Add a bounded relationship query capability, either as additive options on `list_asset_links` or as a versioned `query_asset_links` tool. It must support exact Scope, endpoint/type filters, keyset continuation, maximum result size, and a truncation reason. Existing unbounded behavior must not be silently changed for compatibility callers; new Agent Context instructions should use the bounded contract.

Add a bounded `query_asset_graph` capability with focus, asset type/domain filters, node and edge limits, traversal budget, locale, and continuation. Keep `get_asset_graph` temporarily as a compatibility adapter with an explicit safety cap and deprecation metadata.

All MCP read responses include the authorized `applicationServiceId` and canonical `scopePath` (or a non-disclosing authorization error), and never expose database connection details or another Scope's existence.

## Web behavior

- API, data-model, event, and rule lists render from the summary page only.
- Details load the selected asset first; governance, Markdown, and relationships are independently loaded sections.
- Graph requests begin only after the user selects graph view or an asset focus.
- Loading, empty, stale-cursor, timeout, and truncation states are visible and localized.
- Browser cache validators may use `catalogVersion` and `resultDigest`; an unversioned TTL cache is not part of the first implementation.

## Consistency and failure handling

PostgreSQL remains authoritative for authored assets and relationship events. The search projection and graph projection are derived and rebuildable. A failed projection update must fail the governed MCP write transaction or mark the write as blocked; it must not report a successful write that is invisible to the next MCP read.

A missing projection row for an existing authored asset is a reconciliation failure. The read path may use a bounded direct fallback only when explicitly configured and must return a degraded-read marker; it must never rebuild the full Scope synchronously inside a user request.

## Verification

Required focused evidence before implementation is considered converged:

- Unit and integration tests prove Web and MCP summary reads return equivalent IDs, types, Scope, locale, and catalog version.
- Scope isolation tests prove filters, counts, cursors, detail, relationships, and graph endpoints cannot cross application services.
- Read-after-MCP-write tests prove the new asset is visible in the next search/detail read and that an old cursor is rejected.
- Query tests prove list/detail paths do not call full catalog loaders and graph is not requested in default list mode.
- PostgreSQL `EXPLAIN ANALYZE` evidence covers typed lists, bilingual search, endpoint relationships, and keyset continuation.
- Benchmark evidence records dataset size, query shape, p50/p95 latency, rows read, payload bytes, and MCP response tokens.
- Exact commands and results are recorded in the linked ADR, Proposal, Context Pack, and design-change session closure.

Suggested initial target, to be confirmed by baseline: one typed first page should be no more than two bounded SQL reads, should not deserialize unrelated payloads, and should meet a p95 of 300 ms on the local representative dataset. This is a measurement target, not a production claim.

## Delivery order

1. Add the shared query contract and exact-Scope authorization context.
2. Add direct summary/detail/relationship queries and required composite indexes.
3. Add catalog-version-bound cursors and MCP additive contract fields.
4. Add the bilingual search projection, transactional maintenance, and idempotent backfill.
5. Make Web graph loading lazy and bounded; add MCP graph query parity.
6. Run focused tests and query-plan benchmarks, then close the same design-change session with evidence.

## Design records

This Spec requires a linked ADR for the unified read boundary, a user-visible Proposal for progressive loading and MCP read compatibility, and an agent-facing Context Pack describing the bounded read tools. All records must use the exact owning Scope above, English canonical fields, complete Chinese overlays, stable IDs, directional typed links, and the verification evidence required by `AGENTS.md`.

