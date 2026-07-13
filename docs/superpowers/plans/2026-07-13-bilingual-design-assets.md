# Bilingual Design Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every human-facing design-asset field available in canonical English and required Chinese, enforce completeness at MCP writes, and render the selected language consistently across the scoped web workspace.

**Architecture:** Keep one asset and one technical contract. Existing top-level semantic fields are canonical English; a typed `localizedContent.zh` overlay contains Chinese semantics. A core registry validates and localizes every asset type, MCP persistence enforces it atomically, and server-visible locale state drives all web readers.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 2, Next.js 15 App Router, React 19, Prisma 6, PostgreSQL, Model Context Protocol SDK.

## Global Constraints

- English is the canonical source and is required.
- Required Chinese semantic content is also mandatory; incomplete MCP writes are rejected.
- IDs, codes, paths, schema keys, field names, topics, state/event identifiers, enums, and relationship targets are never translated.
- Asset content remains MCP-managed; browser create/edit routes must not bypass MCP.
- Application-service scope isolation and selected scope persistence must remain unchanged.
- Existing unrelated untracked files `.pnpm-store/` and `docs/AI时代设计中心架构证据链.md` must not be staged or changed.

---

### Task 1: Core Localization Types, Registry, and Validator

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/localization/assets.ts`
- Create: `packages/core/src/__tests__/asset-localization.test.ts`
- Modify: `packages/core/src/index.ts`
- Remove after migration: `packages/core/src/proposals/localization.ts`
- Modify: `packages/core/src/__tests__/proposal-localization.test.ts`

**Interfaces:**
- Produces: `AssetLocale`, `LocalizedContent`, `LocalizationIssue`, `AssetLocalizationError`, `localizeAsset(assetType, asset, locale)`, and `validateAssetLocalization(assetType, asset)`.
- Consumes: existing `Asset`, `AssetType`, and per-type interfaces.

- [ ] **Step 1: Write failing core tests**

Cover canonical English rendering, Chinese overlay merging, missing Chinese rejection, forbidden technical fields, narrative-array length mismatch, data-field matching by `fieldName`, state-label matching by state code, and legacy proposal `localizedContent.en` compatibility.

```ts
expect(localizeAsset("api", api, "zh").name).toBe("设计资产写入接口");
expect(() => validateAssetLocalization("api", { ...api, localizedContent: undefined }))
  .toThrowError(expect.objectContaining({ code: "ASSET_TRANSLATION_REQUIRED" }));
expect(() => validateAssetLocalization("api", {
  ...api,
  localizedContent: { zh: { name: "接口", description: "说明", path: "/translated" } }
})).toThrow("TRANSLATION_FIELD_NOT_ALLOWED");
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm --filter @specforge/core test -- asset-localization proposal-localization`

Expected: FAIL because the shared localization module and types do not exist.

- [ ] **Step 3: Implement the typed overlay and registry**

Add `localizedContent?: { zh?: Record<string, unknown>; en?: Record<string, unknown> }` to all asset payloads through a common localizable base, including `ContextPack`. Define explicit allowlists and required paths for all 12 asset types. Use stable-key merge helpers for nested fields and preserve all canonical technical values.

```ts
export function localizeAsset<T extends Asset>(assetType: AssetType, asset: T, locale: AssetLocale): T;
export function validateAssetLocalization(assetType: AssetType, asset: Asset): void;
```

`validateAssetLocalization` throws `AssetLocalizationError` with `code`, `assetType`, `assetId`, and `path`. English uses top-level fields; Chinese merges only registered fields. Legacy `localizedContent.en` is used only to normalize old proposals and is not emitted by new writers.

- [ ] **Step 4: Run core localization tests and full core tests**

Run: `pnpm --filter @specforge/core test -- asset-localization proposal-localization`

Expected: focused tests PASS.

Run: `pnpm --filter @specforge/core test`

Expected: all core suites PASS.

### Task 2: MCP Atomic Enforcement and Locale-Aware Reads

**Files:**
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/src/resources.ts`
- Modify: `apps/mcp-server/src/persistence.test.ts`
- Modify: `packages/core/src/summary/render.ts`
- Modify: `packages/core/src/governance/service.ts`

**Interfaces:**
- Consumes: `validateAssetLocalization`, `localizeAsset`, and `AssetLocale` from Task 1.
- Produces: atomic bilingual enforcement on every MCP asset/proposal write and optional `locale` on rendered read/search tools.

- [ ] **Step 1: Write failing MCP tests**

Add tests proving incomplete payloads are rejected before Prisma upsert, stable error metadata is retained, valid payloads pass, and search indexes both canonical English and Chinese while returning the requested locale.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm exec vitest run apps/mcp-server/src/persistence.test.ts`

Expected: FAIL because MCP persistence does not call bilingual validation.

- [ ] **Step 3: Enforce validation and locale reads**

Call `validateAssetLocalization(input.assetType, input.asset)` immediately before every design-asset upsert. Normalize proposal writes through the same path. Extend read/search Zod schemas with `locale: z.enum(["zh", "en"]).optional()` and localize only rendered names/summaries, while raw resources retain both canonical and overlay data.

- [ ] **Step 4: Verify MCP tests and type checking**

Run: `pnpm exec vitest run apps/mcp-server/src/persistence.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/mcp-server typecheck`

Expected: exit 0.

### Task 3: Bilingual Governance Messages

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/rules/governance.ts`
- Modify: `packages/core/src/governance/service.ts`
- Create: `packages/core/src/__tests__/governance-localization.test.ts`
- Modify: `apps/web/app/governance/checks/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/page.tsx`

**Interfaces:**
- Produces: stable governance message keys and `localizeGovernanceResult(result, locale)`.
- Consumes: `AssetLocale` from Task 1.

- [ ] **Step 1: Write failing governance locale tests**

Assert that one rule code produces readable English and Chinese `ruleName`, `reason`, and `suggestion`, and that dynamic field lists remain intact.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @specforge/core test -- governance-localization`

Expected: FAIL because governance messages are single-language literals.

- [ ] **Step 3: Implement bilingual governance templates**

Represent each result with stable rule code and structured message parameters. Render localized text at the boundary without changing pass/fail calculations. Add `ASSET_BILINGUAL_COMPLETENESS` as an error-level governance result for corrupt legacy assets.

- [ ] **Step 4: Verify focused and core tests**

Run: `pnpm --filter @specforge/core test -- governance-localization`

Expected: PASS.

Run: `pnpm --filter @specforge/core test`

Expected: all tests PASS.

### Task 4: MCP-Based Bilingual Seed and Migration

**Files:**
- Modify: `prisma/data/specforge-self-design.ts`
- Modify: `prisma/data/specforge-self-design.test.ts`
- Modify: `apps/mcp-server/src/seed.ts`
- Create: `apps/mcp-server/src/localization-report.ts`

**Interfaces:**
- Consumes: core localization validator and existing MCP `upsert_design_asset`, `upsert_proposal`, and link tools.
- Produces: complete Chinese overlays for every seeded asset in every application-service scope and an idempotent completeness report.

- [ ] **Step 1: Write failing seed completeness tests**

Iterate over every service seed and every asset collection, call `validateAssetLocalization`, and assert that the new bilingual-design Proposal, ADR, and business rule exist with links.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run prisma/data/specforge-self-design.test.ts`

Expected: FAIL for existing assets without required Chinese overlays.

- [ ] **Step 3: Add complete bilingual seed content**

Add human-authored Chinese overlays keyed by asset ID for all current scopes. Keep technical values untouched. Add these design records:

- Proposal: `proposal-bilingual-design-assets`
- ADR: `adr-canonical-english-localized-overlay`
- Business rule: `rule-bilingual-asset-completeness`
- Asset links from the Proposal and ADR to MCP API, data model, governance, and UI architecture assets.

The seed process must continue to call MCP tools rather than Prisma write methods.

- [ ] **Step 4: Verify seed definitions, run MCP seed, and verify idempotency**

Run: `pnpm exec vitest run prisma/data/specforge-self-design.test.ts`

Expected: PASS.

Run twice: `pnpm db:seed`

Expected: both runs exit 0 with unchanged asset/link counts on the second run.

Run: `pnpm --filter @specforge/mcp-server smoke`

Expected: MCP tools and resources respond successfully.

### Task 5: Server-Visible Locale and Unified Web Readers

**Files:**
- Modify: `apps/web/components/language-provider.tsx`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/lib/locale.ts`
- Create: `apps/web/lib/__tests__/locale.test.ts`
- Modify: `apps/web/lib/assets.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/assets/[type]/page.tsx`
- Modify: `apps/web/app/assets/[type]/[id]/page.tsx`
- Modify: `apps/web/components/asset-detail-sections.tsx`
- Modify: `apps/web/app/proposals/page.tsx`
- Modify: `apps/web/app/proposals/[id]/page.tsx`
- Modify: `apps/web/components/proposal-detail.tsx`
- Modify: `apps/web/app/context-packs/page.tsx`
- Modify: `apps/web/app/context-packs/[id]/page.tsx`

**Interfaces:**
- Produces: `getRequestLocale(): Promise<AssetLocale>` and a `LanguageProvider({ initialLocale })` that writes `specforge-locale` cookie before `router.refresh()`.
- Consumes: `localizeAsset` from Task 1.

- [ ] **Step 1: Write failing locale tests**

Test cookie parsing, invalid-locale fallback, localized database reader results, and query preservation helpers.

- [ ] **Step 2: Confirm RED**

Run: `pnpm exec vitest run apps/web/lib/__tests__/locale.test.ts`

Expected: FAIL because server-visible locale helpers do not exist.

- [ ] **Step 3: Implement locale plumbing and localized reads**

Initialize the provider from the server cookie, persist the cookie for one year, update `document.documentElement.lang`, and refresh the current route. Pass locale into scoped asset readers or localize immediately after reading. Replace direct `name`, `title`, `description`, and narrative-field access across dashboard, asset, proposal, and Context Pack pages.

Hide browser create/edit actions and replace them with localized MCP-managed status text or navigation back to the asset detail.

- [ ] **Step 4: Verify web tests and type checking**

Run: `pnpm exec vitest run apps/web/lib/__tests__/locale.test.ts apps/web/lib/__tests__/assets-scope.test.ts apps/web/lib/__tests__/scope.test.ts`

Expected: PASS.

Run: `pnpm --filter @specforge/web typecheck`

Expected: exit 0.

### Task 6: Localized Graph, Search, Summaries, and Exports

**Files:**
- Modify: `apps/web/lib/assets.ts`
- Modify: `apps/web/app/graph/page.tsx`
- Modify: `apps/web/components/asset-graph.tsx`
- Modify: `packages/core/src/summary/render.ts`
- Modify: `packages/core/src/context-pack/generate.ts`
- Modify: `packages/core/src/graph/build.ts`
- Modify: `packages/core/src/impact/analyze.ts`
- Modify: `apps/web/lib/i18n.ts`
- Create: `packages/core/src/__tests__/localized-derived-views.test.ts`

**Interfaces:**
- Consumes: localized assets and locale-aware governance messages.
- Produces: localized graph labels/summaries, search, Markdown summary/export, impact narratives, and Context Pack previews.

- [ ] **Step 1: Write failing derived-view tests**

Assert Chinese graph labels with unchanged node IDs, bilingual search matching, localized summary text, unchanged technical values, and locale-specific Context Pack Markdown.

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @specforge/core test -- localized-derived-views`

Expected: FAIL because derived views use canonical values directly.

- [ ] **Step 3: Route derived views through localization**

Localize assets before graph-node construction and summary generation. Keep relation types as stable codes and translate their display labels through UI messages. Make graph links preserve `scope`. Add missing Chinese and English UI labels for node details, filters, empty states, MCP-managed content, and translation fallback diagnostics.

- [ ] **Step 4: Verify focused, web, and core tests**

Run: `pnpm --filter @specforge/core test -- localized-derived-views`

Expected: PASS.

Run: `pnpm --filter @specforge/core test`

Expected: all tests PASS.

Run: `pnpm --filter @specforge/web typecheck`

Expected: exit 0.

### Task 7: End-to-End Verification and Release Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/specforge-design-center-spec.md`
- Verify: `docs/superpowers/specs/2026-07-13-bilingual-design-assets-design.md`
- Verify: all files changed in Tasks 1-6

**Interfaces:**
- Consumes: all completed tasks.
- Produces: documented MCP bilingual contract and verified running application.

- [ ] **Step 1: Update documentation**

Document canonical English semantics, required Chinese overlay, MCP rejection codes, locale-aware reads, the absence of browser asset editing, migration usage, and the bilingual design records created in the system.

- [ ] **Step 2: Run full automated verification**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm test`

Expected: all core tests PASS.

Run: `pnpm exec vitest run apps/mcp-server/src/persistence.test.ts prisma/data/specforge-self-design.test.ts apps/web/lib/__tests__`

Expected: all selected integration tests PASS.

Run: `pnpm build`

Expected: production build exits 0.

- [ ] **Step 3: Browser regression**

Start or reuse the dev server. Verify at least two application-service scopes in English and Chinese on dashboard, asset list, asset detail, Proposal, Context Pack, graph, governance, and search. Confirm locale switching preserves scope and technical fields are identical.

- [ ] **Step 4: MCP system-record verification**

Read `proposal-bilingual-design-assets`, `adr-canonical-english-localized-overlay`, and `rule-bilingual-asset-completeness` through MCP in both locales. Confirm their scoped relationships appear in the graph and the bilingual completeness governance check passes.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended implementation and documentation changes plus the two pre-existing unrelated untracked paths.
