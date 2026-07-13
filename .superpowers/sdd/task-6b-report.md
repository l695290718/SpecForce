# Task 6B Report: Scoped Localized Web Derived Views

## Scope

- Added a database-backed `ScopedAssetCatalog` that loads all design assets, proposals, Context Packs, and asset links for one exact application-service scope.
- Routed Web derived views through Core catalog-aware APIs for graph, summaries, Markdown, governance, proposal impact, Context Pack generation, and bilingual search.
- Removed Web fallbacks to the global seed catalog after scoped database reads.
- Preserved technical IDs, logical IDs, types, methods, paths, and contract fields while localizing human-facing content.

## Isolation

- `scopeDatabaseWhere` now requires exact `applicationServiceId` and exact `scopePath` equality.
- Regression coverage proves list, detail, graph, and catalog readers exclude near-prefix scope paths.
- Duplicate logical IDs in separate application services remain independently readable.
- Restricted-route redirects preserve empty query parameter values.

## Web Integration

- Empty asset searches return the complete scoped collection. Nonempty searches use explicit `limit`/`offset` pagination and return total-count metadata.
- Asset search matches canonical English and Chinese overlays, then renders the request locale.
- Asset detail pages and APIs use one scoped catalog for localized content, summary, Markdown, and governance.
- Proposal pages and impact APIs support database-only proposal IDs without global fallback.
- Context Pack generation derives localized output from the selected scope and request locale.
- Dashboard governance warnings and governance pages/APIs are computed from the selected scope.
- Graph relationship `label` remains the stable canonical code. UI/API localization is carried separately as `displayLabel`.
- Graph detail navigation preserves the selected scope and uses logical IDs.
- Persisted payload scope is normalized from trusted database columns, and rows inconsistent with the requested exact scope are rejected.
- Web proposal impact and Context Pack flows consume the proposal-derived behavior from Core commit `06d22dc` with the scoped catalog and locale.

## TDD Evidence

- Initial catalog/query tests failed because `getScopedAssetCatalog`, `searchScopedAssets`, and derived helpers did not exist.
- Empty-query redirect test failed because empty values were dropped.
- Near-prefix regression failed with a temporary `startsWith` predicate and passed after restoring exact equality.
- Graph relationship localization failed on `provides api` and passed after adding the localized display mapping.
- Review regression tests failed on translated canonical graph codes, the implicit 50-result cap, untrusted payload scope, and inconsistent persisted rows before the fixes were applied.

## Verification

- Web tests: 33/33 passed across 7 files.
- Web TypeScript: passed.
- Next.js production build: passed; 23 app pages/API routes generated.
- Blockers: none.
