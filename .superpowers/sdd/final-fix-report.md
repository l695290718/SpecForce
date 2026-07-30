# Final Fix Report

## Scope

Closed the final review findings for the architecture overview introduction without widening the implementation surface.

## Code Changes

- Localized the remaining overview-only visible and ARIA strings in `apps/web/app/page.tsx` with new `overview.*` keys.
- Added English and Chinese translations for those keys in `apps/web/lib/i18n.ts`.
- Corrected the desktop flow topology in `apps/web/app/styles/globals.css` so rightward connectors only appear at the 8-column desktop breakpoint and remain hidden on wrapped/mobile layouts.
- Strengthened `apps/web/lib/__tests__/overview.test.ts` to assert:
  - overview locale parity across English and Chinese,
  - source usage of the new localized overview labels,
  - the 8-column desktop flow contract when connectors are visible.
- Strengthened `scripts/design-fact-manifest.test.ts` to assert overview evidence categories by content instead of evidence-array length.
- Updated `docs/design-facts/baseline-manifest.json` with the new focused-test, lint, browser, and reduced-motion evidence wording.
- Restored `docs/adr/0013-architecture-overview-home.md` from `HEAD`, then updated only the evidence/status lines needed for truthful final-review reporting.

## Browser Evidence

Completed before the user instructed me not to run any additional browser or MCP operations:

- Bundled Playwright using the system Chrome channel checked `http://localhost:3002/?scope=com.huawei.celon.desiner` at:
  - `1440x960` in English and Chinese
  - `390x844` in English and Chinese
- Findings:
  - desktop English and Chinese kept all eight stages on one logical row with only `2px` and `3px` top variance respectively,
  - stage 6 remained directly before stages 7 and 8 instead of pointing into empty space,
  - desktop connectors stayed visible and mobile connectors stayed hidden,
  - action links did not overlap,
  - mobile had no horizontal overflow,
  - `/` showed no dashboard signals,
  - all three action links preserved the exact scoped destinations.

Reduced-motion evidence:

- Bundled Playwright using the system Chrome channel checked `http://localhost:3002/?scope=com.huawei.celon.desiner` at `1440x960` in English with `reducedMotion: 'reduce'`.
- Findings:
  - `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true`,
  - overview motion targets resolved to `animationName: none`, `animationDuration: 0s`, `transitionDuration: 0s`, `transform: none`, and `opacity: 1`,
  - the connector animation also resolved to `none`,
  - sampled stage positions stayed unchanged over `250ms`.

## ADR Restore Incident

The ADR deletion was caused by me. I started a full-file `apply_patch` rewrite to repair the broken localized text display and the delete step landed before the replacement step. When the user flagged it, I restored the ADR from `HEAD` content immediately and then reapplied only the required evidence updates in place.

## Verification

### Tests

Command:

```text
.\node_modules\.bin\vitest.cmd run apps/web/lib/__tests__/overview.test.ts scripts/design-fact-manifest.test.ts
```

Result:

```text
2 test files passed; 14 tests passed.
```

### Lint

Command:

```text
pnpm --filter @specforge/web lint
```

Result:

```text
Exit code 0. No ESLint warnings or errors.
```

## Constraint Followed

After the user’s restore instruction, I did not run any additional browser checks or any MCP operations.

## Concern

- `docs/adr/0013-architecture-overview-home.md` now explicitly states that `pnpm design-facts:sync` and serial `pnpm design-facts:check` were not rerun in this restoration turn. The manifest still carries the previously recorded sync/check evidence because the user instructed me not to run further MCP operations before this commit.
