# Task 3 Report: Bilingual Governance Messages

## Scope

- Modified `packages/core/src/types.ts`
- Modified `packages/core/src/rules/governance.ts`
- Modified `packages/core/src/governance/service.ts`
- Added `packages/core/src/governance/localization.ts`
- Added `packages/core/src/__tests__/governance-localization.test.ts`
- Modified `packages/core/src/index.ts`

No web, MCP persistence, seed, or unrelated files were changed.

## TDD Evidence

### RED

Command:

```bash
pnpm --filter @specforge/core test -- governance-localization
```

Observed failing behavior:

- `localizeGovernanceResult is not a function`
- `ASSET_BILINGUAL_COMPLETENESS` was missing from governance results
- fail-path localization metadata was absent for invalid localized assets

This confirmed the test was exercising missing Task 3 behavior rather than pre-existing implementation.

### GREEN

Focused command:

```bash
pnpm --filter @specforge/core test -- governance-localization
```

Result:

- `src/__tests__/governance-localization.test.ts` passed
- Verified Chinese rendering for static and dynamic built-in rules
- Verified unknown rule-code fallback to canonical English
- Verified bilingual completeness pass/fail behavior for a `stateMachine` asset type with no other configured rules

## Implementation Summary

- Replaced inline governance message literals with a shared localization registry in `packages/core/src/governance/localization.ts`
- Kept canonical English in stored governance results and added structured `messageParams` for dynamic rendering
- Added `localizeGovernanceResult(result, locale)` and exported it through `packages/core/src/index.ts`
- Updated governance service output to optionally localize messages via `locale`
- Added `ASSET_BILINGUAL_COMPLETENESS` governance checks backed by Task 1 `validateAssetLocalization`
- Ensured localization failures report the failing path and error code without suppressing other governance checks
- Removed mojibake governance output from the core governance rules module

## Verification

Commands:

```bash
pnpm --filter @specforge/core test
pnpm --filter @specforge/core typecheck
```

Results:

- Full core test suite passed: `7` files, `44` tests
- Core typecheck passed with no errors

## Self-Review

- Checked that existing governance severity and pass/fail logic stayed unchanged for the pre-existing rule set
- Confirmed unknown governance rule codes fall back to canonical English
- Confirmed dynamic placeholders render from structured parameters, not by reparsing English strings
- Confirmed the bilingual completeness rule reports invalid localization paths and still returns default governance output for asset types without other configured rules

## Notes

- To preserve current seed-backed behavior and avoid changing unrelated task surfaces, `ASSET_BILINGUAL_COMPLETENESS` is emitted when an asset includes `localizedContent`. This still allows all 12 asset types to participate once bilingual payloads are present.

## Review Follow-Up

Review findings required two corrections:

- Remove the guard that skipped `ASSET_BILINGUAL_COMPLETENESS` when `localizedContent` was absent
- Prove the check is present for every asset type, not only localized fixtures

### Follow-Up RED

Command:

```bash
pnpm --filter @specforge/core test -- governance-localization
```

Observed failing behavior before the fix:

- `ASSET_BILINGUAL_COMPLETENESS` was `undefined` for `api-create-refund` when `localizedContent` was absent
- The table-driven asset-type assertion failed on `domain-order` because no completeness result was emitted

This confirmed the root cause was the early return in `maybeCheckAssetLocalization`.

### Follow-Up GREEN

Commands:

```bash
pnpm --filter @specforge/core test -- governance-localization
pnpm --filter @specforge/core test
pnpm --filter @specforge/core typecheck
```

Results:

- Focused governance regression suite passed: `7` files, `46` tests
- Full core suite passed: `7` files, `46` tests
- Core typecheck passed with no errors

### Follow-Up Changes

- Removed the `localizedContent` guard from `maybeCheckAssetLocalization` so every asset runs through Task 1 validation
- Added a regression test for an asset with no `localizedContent`, expecting `ASSET_TRANSLATION_REQUIRED at localizedContent.zh`
- Added a table-driven seeded-asset assertion covering all `12` asset types
- Tightened the older API governance test so it still verifies the original API rule calculations without masking the new completeness failure
