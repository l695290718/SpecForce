# Task 1 Report: Overview Navigation and Bilingual Copy

## Scope

Implemented the navigation and localization foundation only. No routes,
components, styles, data loaders, design facts, or `docs/TODO.md` were changed.

## Changes

- Added `overviewDestinations(scopeId?)`, delegating scoped URLs to the existing
  `buildScopedHref` helper.
- Added unit coverage for unscoped and scoped destination sets.
- Added `nav.overview`, `nav.workspace`, and a complete bilingual `overview.`
  message set.
- Added a localization regression test requiring more than twelve English
  `overview.` keys and verifying every one has a Chinese counterpart.

## TDD Evidence

### RED

Command:

```powershell
pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts
```

Result: failed as expected before production implementation. Vite could not
load `../overview` because `apps/web/lib/overview.ts` did not exist.

### GREEN

Command:

```powershell
pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts
```

Result: passed. One test file ran with three passing tests.

## Concerns

- This task deliberately establishes copy and destination generation only; the
  routes and navigation surfaces will be updated by later plan tasks.
