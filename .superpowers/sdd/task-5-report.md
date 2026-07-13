# Task 5 Report: Server-Visible Locale and Unified Web Readers

## Result

- Added the `specforge-locale` request cookie with canonical-English fallback.
- Initialized `LanguageProvider` from the server locale and refreshes Server Components after a language change.
- Localized scoped database assets, Proposals, and Context Packs after scope filtering while retaining technical identifiers.
- Read complete Context Pack payloads when available and retained a safe canonical fallback for legacy rows.
- Localized dashboard, asset list/detail, Proposal, and Context Pack human-facing content.
- Removed visible browser new/edit actions and replaced them with bilingual MCP-managed status text.
- Preserved application-service scope in Proposal, Context Pack, and related-asset navigation.

## TDD Evidence

The locale helper and localized reader tests were added first and observed failing for missing helpers, canonical-only database reads, cookie serialization, and legacy Context Pack localization. Minimal implementations were then added until all focused tests passed.

## Verification

```text
node node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs run apps/web/lib/__tests__/locale.test.ts apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/scope.test.ts
Test Files  3 passed (3)
Tests       12 passed (12)

pnpm --filter @specforge/web typecheck
exit 0

pnpm --filter @specforge/web build
compiled successfully
```

## Commit

`feat: localize scoped web asset views`
