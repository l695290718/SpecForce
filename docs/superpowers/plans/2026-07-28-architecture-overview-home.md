# Architecture Overview Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bilingual, scope-safe architecture overview at `/` and move the
current scoped dashboard to `/workspace`.

**Architecture:** Keep all authored design data and scoped data loaders behind
the existing workspace and asset routes. Build the overview from static,
localized concept content only. Extract its destinations into a small pure
navigation helper so exact-scope links can be unit-tested without rendering the
Next application.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS,
Lucide React, Vitest, existing `LanguageProvider` and scope helpers.

## Global Constraints

- English is canonical and every new human-facing message has a Chinese overlay.
- `/` must not query, count, join, or render authored data across scopes.
- PostgreSQL remains the authored-fact authority; graph stores remain derived.
- Operational destinations must carry the exact selected application-service
  `scope` when one is available.
- Motion must honor `prefers-reduced-motion`.
- Complete the matching ADR, Proposal, Context Pack, typed links, and Evidence
  through MCP with `architectureScope=com.huawei.celon.desiner`; a failed write
  must be recorded as `MCP synchronization blocked` rather than marked done.

---

### Task 1: Define overview navigation and bilingual copy

**Files:**
- Create: `apps/web/lib/overview.ts`
- Create: `apps/web/lib/__tests__/overview.test.ts`
- Modify: `apps/web/lib/i18n.ts`

**Interfaces:**
- Consumes: `buildScopedHref(href: string, scopeId: string): string` from
  `apps/web/lib/scope.ts`.
- Produces: `overviewDestinations(scopeId?: string): { workspace: string;
  graph: string; governance: string }`.
- Produces: `MessageKey` entries prefixed `overview.` and the two sidebar labels
  `nav.overview`, `nav.workspace`.

- [ ] **Step 1: Write the failing navigation and localization coverage test**

```ts
import { describe, expect, it } from "vitest";
import { messages } from "../i18n";
import { overviewDestinations } from "../overview";

describe("architecture overview", () => {
  it("keeps overview destinations scoped only when a readable scope is supplied", () => {
    expect(overviewDestinations()).toEqual({
      workspace: "/workspace",
      graph: "/graph",
      governance: "/governance/checks"
    });
    expect(overviewDestinations("com.huawei.celon.policyhub")).toEqual({
      workspace: "/workspace?scope=com.huawei.celon.policyhub",
      graph: "/graph?scope=com.huawei.celon.policyhub",
      governance: "/governance/checks?scope=com.huawei.celon.policyhub"
    });
  });

  it("ships every overview key in English and Chinese", () => {
    const keys = Object.keys(messages.en).filter((key) => key.startsWith("overview."));
    expect(keys.length).toBeGreaterThan(12);
    expect(keys.every((key) => key in messages.zh)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: FAIL because `overview.ts` and the `overview.` catalog entries do not
exist.

- [ ] **Step 3: Implement the pure destination helper**

```ts
import { buildScopedHref } from "./scope";

export function overviewDestinations(scopeId?: string) {
  const withScope = (href: string) => scopeId ? buildScopedHref(href, scopeId) : href;
  return {
    workspace: withScope("/workspace"),
    graph: withScope("/graph"),
    governance: withScope("/governance/checks")
  };
}
```

- [ ] **Step 4: Add complete localized copy**

Add the same keys to both `messages.en` and `messages.zh` in
`apps/web/lib/i18n.ts`:

```ts
"nav.overview": "Overview",
"nav.workspace": "Workspace",
"overview.eyebrow": "Design fact system",
"overview.title": "Architecture knowledge, made operational.",
"overview.description": "SpecForge turns architecture decisions, contracts, and evidence into scoped design facts for people and agents.",
"overview.enterWorkspace": "Enter workspace",
"overview.openGraph": "Open relationship graph",
"overview.runGovernance": "Run governance checks",
"overview.authoring.title": "MCP-first authoring",
"overview.authoring.description": "MCP is the write boundary for Proposals, ADRs, Context Packs, and typed links.",
"overview.authority.title": "Authoritative facts, derived analysis",
"overview.authority.description": "PostgreSQL owns authored facts and relationship events. Graph projections accelerate impact traversal.",
"overview.flow.title": "From intent to verified evidence",
"overview.flow.proposal": "Proposal",
"overview.flow.adr": "ADR",
"overview.flow.assets": "Design assets",
"overview.flow.contracts": "Rules and contracts",
"overview.flow.context": "Context Pack",
"overview.flow.evidence": "Evidence",
"overview.map.title": "Typed design relationships",
"overview.map.description": "APIs, data models, events, rules, state machines, integrations, quality, and observability remain independently scoped.",
"overview.scope.title": "Scope before data",
"overview.scope.description": "Choose an authorized application service before opening operational views."
```

Use faithful Chinese translations, retaining proper nouns such as `MCP`, `ADR`,
`Context Pack`, and `PostgreSQL` where they improve recognition.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: PASS with two tests.

- [ ] **Step 6: Commit the self-contained foundation**

```bash
git add apps/web/lib/overview.ts apps/web/lib/__tests__/overview.test.ts apps/web/lib/i18n.ts
git commit -m "feat: add overview navigation copy"
```

### Task 2: Move the scoped dashboard behind `/workspace`

**Files:**
- Create: `apps/web/app/workspace/page.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/app-shell.tsx`
- Test: `apps/web/lib/__tests__/overview.test.ts`

**Interfaces:**
- Consumes: `overviewDestinations(scopeId?: string)` from
  `apps/web/lib/overview.ts`.
- Consumes: existing `getAgentServiceWorkspace`, `getScopedAssetCatalog`, and
  other dashboard loaders, which are called only in `WorkspaceDashboardPage`.
- Produces: `/` with no authored-data loader imports and `/workspace` as the
  sole dashboard route.

- [ ] **Step 1: Extend the test with a source-boundary assertion**

```ts
import { readFile } from "node:fs/promises";

it("keeps the root route free of scoped data loaders", async () => {
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  expect(source).not.toContain("getScopedAssetCatalog");
  expect(source).not.toContain("getAgentServiceWorkspace");
  expect(source).not.toContain("getScopedGovernanceOverview");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: FAIL because the current root route imports scoped dashboard loaders.

- [ ] **Step 3: Relocate the existing dashboard unchanged in behavior**

Move the current `DashboardPage` body from `apps/web/app/page.tsx` into
`apps/web/app/workspace/page.tsx`, rename the default export to
`WorkspaceDashboardPage`, and adjust relative imports from `../` to `../../`.
Keep its `Promise<{ scope?: string }>` search-param contract. When scope is
absent, redirect with:

```ts
redirect(buildScopedHref("/workspace", initialScope));
```

- [ ] **Step 4: Replace the root route with the static overview page**

Build `apps/web/app/page.tsx` from `Link`, Lucide icons, `T`, `useLanguage`,
and `overviewDestinations`. The component may read selected scope client-side
from `useSearchParams`, but it must not import `assets.ts`, `dashboard.ts`, or
`cookies`. Render the positioning, three architecture layers, six-stage fact
flow, explanatory typed asset map, and three navigation actions defined by the
copy keys from Task 1.

Use semantic landmarks and accessible headings. The destination for the three
actions must come from `overviewDestinations(scope)`. Do not render counts or
asset names from a catalog.

- [ ] **Step 5: Split sidebar navigation into overview and workspace**

In `apps/web/components/app-shell.tsx`, replace the single root dashboard item
with:

```tsx
<NavItem href="/" icon={<Home size={16} />} isActive={pathname === "/"} labelKey="nav.overview" />
<NavItem
  href={withScope("/workspace")}
  icon={<LayoutDashboard size={16} />}
  isActive={pathname === "/workspace"}
  labelKey="nav.workspace"
/>
```

Import `LayoutDashboard` from `lucide-react`. Keep `withScope` for all
data-bearing navigation, including the new workspace link.

- [ ] **Step 6: Run focused route and type verification**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts && pnpm --filter @specforge/web typecheck`

Expected: all overview tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the route boundary**

```bash
git add apps/web/app/page.tsx apps/web/app/workspace/page.tsx apps/web/components/app-shell.tsx apps/web/lib/__tests__/overview.test.ts
git commit -m "feat: add scope-safe architecture overview"
```

### Task 3: Style the concept flow and verify responsive behavior

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/styles/globals.css`
- Test: `apps/web/lib/__tests__/overview.test.ts`

**Interfaces:**
- Consumes: overview translation keys and destinations from Tasks 1-2.
- Produces: `sf-overview-*` styling that remains stable at mobile and desktop
  widths and is disabled under reduced motion.

- [ ] **Step 1: Add a small visual-contract test**

```ts
it("marks the conceptual map as explanatory rather than data-bearing", async () => {
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  expect(source).toContain('aria-label="Architecture concept map"');
  expect(source).toContain('data-testid="architecture-fact-flow"');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts`

Expected: FAIL until the root page declares the accessible concept map and flow.

- [ ] **Step 3: Implement the restrained overview visual system**

Add only page-specific styles to `apps/web/app/styles/globals.css`:

```css
.sf-overview-flow {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.75rem;
}

.sf-overview-flow-step {
  min-height: 7.5rem;
}

@media (max-width: 768px) {
  .sf-overview-flow {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sf-overview-flow [data-motion] {
    animation: none;
    transition: none;
  }
}
```

Use CSS grid and fixed minimum sizing for the flow. Use a single subtle
connector animation marked `data-motion`; do not introduce decorative gradient
orbs, nested cards, or live data visualizations.

- [ ] **Step 4: Run consolidated Web verification**

Run: `pnpm exec vitest run apps/web/lib/__tests__/overview.test.ts apps/web/lib/__tests__/scope.test.ts apps/web/lib/__tests__/dashboard.test.ts && pnpm --filter @specforge/web typecheck && pnpm --filter @specforge/web lint`

Expected: all selected tests pass; typecheck and lint exit 0.

- [ ] **Step 5: Verify in the browser once per stage**

Start the Web development server, then inspect:

```text
http://localhost:3000/
http://localhost:3000/workspace?scope=com.huawei.celon.desiner
http://localhost:3000/?scope=com.huawei.celon.policyhub
```

At desktop and mobile widths, verify English and Chinese text do not overlap,
the root page has no counts, the workspace metrics are scoped, and workspace,
graph, and governance actions preserve `com.huawei.celon.policyhub`.

- [ ] **Step 6: Commit the visual behavior**

```bash
git add apps/web/app/page.tsx apps/web/app/styles/globals.css apps/web/lib/__tests__/overview.test.ts
git commit -m "style: refine architecture overview flow"
```

### Task 4: Record design facts and close the product backlog correctly

**Files:**
- Create: `docs/adr/0013-architecture-overview-home.md`
- Modify: `docs/TODO.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Test: `scripts/sync-design-facts.ts`, `scripts/reconcile-design-facts.ts`

**Interfaces:**
- Consumes: exact scope `com.huawei.celon.desiner` and its architecture path.
- Produces: one repository ADR, matching MCP Proposal and Context Pack,
  directional typed links, and Evidence records for the implementation and
  browser verification.

- [ ] **Step 1: Create the repository ADR with a precise decision**

Document that `/` is a static, bilingual architecture orientation; `/workspace`
is the scoped operational dashboard; and the home page must not aggregate
design facts across application services. Include the exact commands and their
observed results from Task 3.

- [ ] **Step 2: Update the canonical design-fact manifest**

Add canonical English and Chinese overlays for:

```ts
{
  adrId: "adr-architecture-overview-home",
  proposalId: "proposal-architecture-overview-home",
  contextPackId: "ctx-architecture-overview-home",
  architectureScope: "com.huawei.celon.desiner"
}
```

Add directional `IMPLEMENTS_DECISION`, `IMPLEMENTS_CONTEXT_FOR`, `DECIDES`,
and `VALIDATES` links whose targets remain inside that exact scope.

- [ ] **Step 3: Persist and read back facts through MCP**

Run:

```bash
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: the new ADR, Proposal, Context Pack, Evidence, localized fields, and
typed links are written and read back for the exact Designer scope. If either
command cannot reach MCP persistence, record `MCP synchronization blocked` in
the ADR and `docs/TODO.md`, with the error and a retry trigger; do not mark the
backlog item complete.

- [ ] **Step 4: Update the backlog only from evidence**

Mark `Architecture overview home page` complete only after the MCP readback and
all Task 3 verification have passed. Otherwise retain it as pending with the
specific blocked status, owner `SpecForge Product and Architecture`, and retry
trigger.

- [ ] **Step 5: Commit records together with evidence**

```bash
git add docs/adr/0013-architecture-overview-home.md docs/TODO.md docs/design-facts/baseline-manifest.json
git commit -m "docs: record architecture overview design facts"
```

## Plan Self-Review

- Spec coverage: route boundary, static scope safety, bilingual content,
  navigation, responsive motion, browser checks, and MCP design-fact governance
  are each assigned to a task.
- Placeholder scan: no `TBD`, generic testing step, or unassigned error path
  remains.
- Type consistency: `overviewDestinations(scopeId?: string)` is defined in Task
  1 and consumed unchanged by Tasks 2 and 3.
