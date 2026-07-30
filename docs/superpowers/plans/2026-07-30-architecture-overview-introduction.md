# Architecture Overview Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into a modern, bilingual product-introduction page that explains SpecForge's governed design-fact lifecycle and guides visitors into scope-safe operational views.

**Architecture:** Keep `ArchitectureOverviewPage` static and scope-data-free. Extend its localized copy and semantic lifecycle/asset renderers, then use overview-specific CSS for the deep-ink canvas, responsive relationship topology, intentional motion, focus treatment, and reduced-motion fallback. Preserve `overviewDestinations(scope)` as the only scoped-navigation boundary.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, existing SpecForge language provider.

## Global Constraints

- English is canonical; every new `overview.*` key must have a complete Chinese overlay.
- `/` must not import scoped data loaders or show counts, alerts, assets, proposals, or relationships from any application-service scope.
- Scoped links must preserve the exact `scope` supplied by `overviewDestinations`.
- Use Lucide icons, keyboard-visible focus, stable responsive dimensions, and `prefers-reduced-motion` fallbacks.
- Do not add editing: authored design facts remain MCP-managed.
- Update the existing architecture overview ADR, Proposal, Context Pack, Evidence, and typed links through MCP in the exact Designer Scope before claiming completion.

---

## File Structure

- Modify: `apps/web/app/page.tsx` - semantic introduction page, lifecycle visual, asset constellation, and scope-preserving entry actions.
- Modify: `apps/web/app/styles/globals.css` - canvas, node, connector, staged-reveal, focus, responsive, and reduced-motion styles.
- Modify: `apps/web/lib/i18n.ts` - English canonical and Chinese localized overview copy.
- Modify: `apps/web/lib/__tests__/overview.test.ts` - localization, static-route isolation, and visual-behavior contracts.
- Modify: `docs/adr/0013-architecture-overview-home.md` - final visual refinement and verification evidence.
- Modify: `docs/design-facts/baseline-manifest.json` - evidence after MCP persistence.

### Task 1: Lock the Static Introduction Contract

**Files:**
- Modify: `apps/web/lib/i18n.ts`
- Modify: `apps/web/lib/__tests__/overview.test.ts`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `overviewDestinations(scope?: string)` from `apps/web/lib/overview.ts`.
- Consumes: `T` from `apps/web/components/language-provider.tsx`.
- Produces: a static `ArchitectureOverviewPage` whose only dynamic input is URL scope.

- [ ] **Step 1: Write the failing localization and structural tests**

Add to `apps/web/lib/__tests__/overview.test.ts`:

```ts
it("keeps the product-introduction copy localized in Chinese", () => {
  const requiredKeys = [
    "overview.change", "overview.governance", "overview.flowCaption",
    "overview.conceptsTitle", "overview.ownershipTitle", "overview.projectionTitle"
  ];

  expect(requiredKeys.every((key) => key in messages.en && key in messages.zh)).toBe(true);
});

it("keeps the overview visual explanatory and scope-data-free", async () => {
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

  expect(source).toContain('data-testid="architecture-introduction-canvas"');
  expect(source).toContain('data-testid="architecture-asset-constellation"');
  expect(source).not.toContain("getScopedAssetCatalog");
  expect(source).not.toContain("getAgentServiceWorkspace");
  expect(source).not.toContain("getScopedGovernanceOverview");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: FAIL because the required keys and test IDs do not yet exist.

- [ ] **Step 3: Add canonical and localized copy plus semantic structure**

Add the same `overview.*` key set to both language catalogs, with Chinese localized values in `messages.zh`. Render a hero with `data-testid="architecture-introduction-canvas"`, include Change and Governance lifecycle stages, add a semantic concept section, and mark the asset topology wrapper with `data-testid="architecture-asset-constellation"`. Render all human-facing labels with `<T k="overview.*" />`; keep `useSearchParams` and all existing `overviewDestinations(scope)` calls.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: PASS with overview destination, localization, isolation, and introduction-structure assertions green.

- [ ] **Step 5: Commit the tested semantic contract**

```bash
git add apps/web/app/page.tsx apps/web/lib/i18n.ts apps/web/lib/__tests__/overview.test.ts
git commit -m "feat: enrich architecture overview narrative"
```

### Task 2: Build the Blueprint Canvas and Accessible Motion

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/styles/globals.css`
- Modify: `apps/web/lib/__tests__/overview.test.ts`

**Interfaces:**
- Consumes: the `architecture-introduction-canvas` and `architecture-asset-constellation` test IDs from Task 1.
- Produces: overview-specific class names prefixed with `sf-overview-`, with a static final state under reduced motion.

- [ ] **Step 1: Write the failing visual-behavior test**

Add to `apps/web/lib/__tests__/overview.test.ts`:

```ts
it("uses staged canvas motion with an explicit reduced-motion fallback", async () => {
  const css = await readFile(new URL("../../app/styles/globals.css", import.meta.url), "utf8");

  expect(css).toContain(".sf-overview-canvas");
  expect(css).toContain(".sf-overview-stage");
  expect(css).toContain(".sf-overview-asset-node");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  expect(css).toContain(".sf-overview-canvas [data-motion]");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: FAIL because the new overview canvas CSS contracts do not exist.

- [ ] **Step 3: Implement the visual system without changing page data behavior**

Apply `sf-overview-canvas` to the hero, `sf-overview-stage` and incrementing `--stage-delay` values to lifecycle stages, and `sf-overview-asset-node` to asset nodes. Keep fixed minimum heights and responsive grid tracks so animation cannot shift layout.

Add overview-only CSS including:

```css
.sf-overview-canvas { position: relative; isolation: isolate; }
.sf-overview-stage { animation: specforge-overview-stage-in 520ms ease-out both; }
.sf-overview-asset-node:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .sf-overview-canvas [data-motion] { animation: none; transition: none; }
}
```

Complete the rules with the deep-ink blueprint surface, low-contrast directional connector signal, local asset-neighbor highlight, mobile stacking, and stable final state. Do not add a dependency or a data query.

- [ ] **Step 4: Run focused test and lint**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts; pnpm --filter @specforge/web lint`

Expected: both commands exit `0`.

- [ ] **Step 5: Commit the visual implementation**

```bash
git add apps/web/app/page.tsx apps/web/app/styles/globals.css apps/web/lib/__tests__/overview.test.ts
git commit -m "feat: modernize architecture overview canvas"
```

### Task 3: Verify the Product Introduction and Synchronize Design Facts

**Files:**
- Modify: `docs/adr/0013-architecture-overview-home.md`
- Modify: `docs/design-facts/baseline-manifest.json`

**Interfaces:**
- Consumes: the static page, scoped links, localization, and verification results from Tasks 1 and 2.
- Produces: synchronized ADR, Proposal, Context Pack, Evidence, and typed links for `adr-architecture-overview-home` in the exact Designer Scope.

- [ ] **Step 1: Verify browser behavior in one consolidated stage**

Run focused tests and lint once, then inspect `/` at desktop and mobile widths in English and Chinese. Verify the canvas, readable reduced-motion final state, no overlap, and actions preserving `?scope=com.huawei.celon.desiner`.

```powershell
pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts
pnpm --filter @specforge/web lint
```

Expected: tests and lint pass; browser checks show a static overview without scoped counts or asset data.

- [ ] **Step 2: Update the repository ADR**

Amend `docs/adr/0013-architecture-overview-home.md` to record the introduction-canvas refinement, exact verification commands and results, browser checks, and static scope-data-free behavior.

- [ ] **Step 3: Synchronize matching facts through MCP**

```powershell
$env:DATABASE_URL='postgresql://specforge:local-deployment-verification-only@localhost:15433/specforge_canonical?schema=public'
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: `adr-architecture-overview-home`, its Proposal, Context Pack, Evidence, and typed links are persisted and read back in `com.huawei.celon.desiner`. Update the manifest with final evidence wording generated by the sync process. On failure, record `MCP synchronization blocked`, reason, and retry trigger; do not claim completion.

- [ ] **Step 4: Commit evidence and synchronized repository record**

```bash
git add docs/adr/0013-architecture-overview-home.md docs/design-facts/baseline-manifest.json
git commit -m "docs: synchronize overview introduction facts"
```

## Plan Self-Review

- Spec coverage: Task 1 covers scope-safe semantics and bilingual copy; Task 2 covers blueprint visual, responsive behavior, focus, and reduced motion; Task 3 covers consolidated verification and dual-record governance.
- Placeholder scan: no incomplete or deferred implementation steps remain.
- Interface consistency: all tasks retain `overviewDestinations(scope)`, `T` translation use, and the two test IDs introduced in Task 1.

