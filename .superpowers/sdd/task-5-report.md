# Task 5 Report: Server-Visible Locale and Unified Web Readers

## Result

- Added the `specforge-locale` request cookie with canonical-English fallback.
- Initialized `LanguageProvider` from the server locale and refreshes Server Components after a language change.
- Localized scoped database assets, Proposals, and Context Packs after scope filtering while retaining technical identifiers.
- Read complete Context Pack payloads when available and retained a safe canonical fallback for legacy rows.
- Localized dashboard, asset list/detail, Proposal, and Context Pack human-facing content.
- Removed visible browser new/edit actions and replaced them with bilingual MCP-managed status text.
- Preserved application-service scope in Proposal, Context Pack, and related-asset navigation.

## Review Follow-up

- Direct asset creation, asset editing, and Proposal creation routes now redirect before rendering or reading data.
- Redirects preserve the complete query string, including the selected application-service scope.
- Scoped asset, Proposal, Proposal-impact validation, and Context Pack API routes resolve a validated `locale` query parameter or the `specforge-locale` cookie and pass it explicitly to localized readers.
- Asset-detail API governance messages use the same resolved locale.
- Client locale effects are isolated behind `applyClientLocale`; the server-visible cookie is written before route refresh.
- Added focused coverage for restricted routes, API locale resolution, locale side-effect ordering, and complete Proposal/Context Pack localization.

## TDD Evidence

The locale helper and localized reader tests were added first and observed failing for missing helpers, canonical-only database reads, cookie serialization, and legacy Context Pack localization. Minimal implementations were then added until all focused tests passed.

## Verification

```text
node node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/vitest.mjs run apps/web/lib/__tests__/locale.test.ts apps/web/lib/__tests__/locale-client.test.ts apps/web/lib/__tests__/mcp-managed-routes.test.tsx apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/scope.test.ts
Test Files  5 passed (5)
Tests       19 passed (19)

pnpm --filter @specforge/web typecheck
exit 0

pnpm --filter @specforge/web build
compiled successfully
```

## Commit

`feat: localize scoped web asset views`

Review follow-up: `fix: enforce mcp-only localized web routes`
