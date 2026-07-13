# Task 6A Report: Scoped Localized Derived Asset Views

## Result

- Added backward-compatible `DerivedViewOptions` with optional caller-supplied `catalog` and `locale`.
- Made summaries, Markdown details, search summaries, graphs, impact analysis, Context Pack generation, and governance checks resolve exclusively from the supplied catalog when present.
- Added English/Chinese labels and narrative output while preserving canonical IDs, API paths, event topics, schemas, state/event/transition codes, and graph relation labels.
- Generated Context Packs remain English-canonical and include a complete Chinese overlay; Chinese reads return localized human-facing labels without changing technical identifiers.
- Limited legacy fallback to missing Chinese overlays in the built-in global seed. Explicit catalogs remain strict, and malformed translations still fail.

## Tests

- Added `packages/core/src/__tests__/localized-derived-views.test.ts` with two catalogs using identical IDs and distinct English/Chinese content.
- Covered scoped isolation, localized summaries and Markdown, graph labels, impact tasks/domain names, Context Pack text, governance Context Pack lookup, and technical-value invariants.
- TDD red phase observed: all five original derived functions read the global seed; the Markdown test also failed against the global asset before implementation.

## Verification

- `pnpm --filter @specforge/core test` -> 8 files, 53 tests passed.
- `pnpm --filter @specforge/core typecheck` -> passed.
- `git diff --check -- packages/core` -> passed (line-ending warnings only).
