# Asset Navigation and Relationship Graph Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scoped asset navigation reliable and prevent malformed legacy relationship arrays from taking down the Relationship Graph.

**Architecture:** Keep PostgreSQL as the authoritative authored store and repair only the read/derivation boundary. Use the existing `buildScopedHref` contract for all internal Scope-preserving links, and normalize optional reference arrays inside the core graph builder so a malformed historical asset cannot abort the whole graph.

**Tech Stack:** Next.js 15 App Router, React Server Components, `next/link`, TypeScript, `@specforge/core`, Prisma/PostgreSQL, Vitest, Docker Compose.

## Global Constraints

- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored assets and relationship events; graph data remains a derived projection.
- Missing, null, or invalid optional relationship arrays are read as empty arrays; no authored database payload is rewritten.
- Scope isolation remains fail-closed; no cross-Scope aggregation or permission broadening.
- English remains canonical and human-facing Chinese overlays remain intact.
- Implementation preflight session: `design-change-session:124680b6-c9b7-4a8a-ac13-ce305d806e3a`.

---

### Task 1: Normalize legacy graph references

**Files:**
- Modify: `packages/core/src/graph/build.ts`
- Test: `packages/core/src/__tests__/core.test.ts`

**Interfaces:**
- Produces a graph builder that accepts legacy `BusinessRule`, `Adr`, and `Proposal` objects with omitted or malformed reference arrays without throwing.

- [x] **Step 1: Add regression tests**

Add a test catalog containing one ADR without `relatedAssets`, one business rule with `relatedAssets: null`, and one Proposal without `impactedAssets`; call `buildAssetGraph(undefined, undefined, { catalog })` and assert that it returns nodes and does not throw.

- [x] **Step 2: Run the focused core test and verify the regression fails**

Run: `pnpm exec vitest run packages/core/src/__tests__/core.test.ts`

Expected before implementation: the graph test fails with `Cannot read properties of undefined (reading 'forEach')` or the equivalent null dereference.

- [x] **Step 3: Implement a typed read-boundary normalizer**

In `packages/core/src/graph/build.ts`, add a local helper:

```ts
function referenceArray(value: unknown): AssetRef[] {
  return Array.isArray(value) ? value.filter((item): item is AssetRef => Boolean(item && typeof item === "object" && typeof (item as { type?: unknown }).type === "string" && typeof (item as { id?: unknown }).id === "string")) : [];
}
```

Pass `referenceArray(rule.relatedAssets)`, `referenceArray(adr.relatedAssets)`, and `referenceArray(proposal.impactedAssets)` to `addRefEdges`. Keep the existing resolver responsible for skipping unresolved or out-of-scope targets.

- [x] **Step 4: Run the focused core test and verify it passes**

Run: `pnpm exec vitest run packages/core/src/__tests__/core.test.ts`

Expected: all tests in the file pass, including the legacy graph regression.

- [x] **Step 5: Commit the graph compatibility change**

Run: `git add packages/core/src/graph/build.ts packages/core/src/__tests__/core.test.ts && git commit -m "fix: tolerate legacy graph reference arrays"`

### Task 2: Make scoped navigation contract explicit

**Files:**
- Modify: `apps/web/lib/scope.ts`
- Modify: `apps/web/components/app-shell.tsx`
- Modify: `apps/web/lib/graph-links.ts`
- Test: `apps/web/lib/__tests__/scope-links.test.ts`

**Interfaces:**
- `buildScopedHref(href, scopeId)` remains the single helper for internal links and preserves existing query parameters while replacing a pre-existing `scope` parameter.

- [x] **Step 1: Add route helper tests**

Cover a plain path, a path with existing query parameters, a path with an existing `scope`, and a Scope containing reserved characters. Assert that non-Scope query parameters are preserved and exactly one encoded `scope` parameter remains.

- [x] **Step 2: Run the route helper test and verify the current behavior**

Run: `pnpm exec vitest run apps/web/lib/__tests__/scope-links.test.ts`

Expected: the new replacement case fails if the helper appends a duplicate Scope parameter.

- [x] **Step 3: Implement URL-based Scope replacement**

Update `buildScopedHref` to parse the supplied path with `new URL(href, "http://specforge.local")`, set `searchParams.set("scope", scopeId)`, and return `pathname + search + hash`. Keep relative paths and existing filters intact.

Update `app-shell.tsx` to import and use `buildScopedHref` for `withScope`, including the overview link when a Scope is active. Keep the same-URL scroll behavior only when the full pathname and query string are equal.

- [x] **Step 4: Run the route helper and affected UI tests**

Run: `pnpm exec vitest run apps/web/lib/__tests__/scope-links.test.ts apps/web/components/three-a/architecture-view-actions.test.tsx`

Expected: all route and navigation-related tests pass.

- [x] **Step 5: Commit the scoped navigation change**

Run: `git add apps/web/lib/scope.ts apps/web/components/app-shell.tsx apps/web/lib/graph-links.ts apps/web/lib/__tests__/scope-links.test.ts && git commit -m "fix: preserve scope across asset navigation"`

### Task 3: Verify graph and affected routes in the deployment topology

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-asset-navigation-and-graph-reliability-design.md`
- Modify: matching ADR/Proposal/Context Pack records through MCP after verification.

**Interfaces:**
- No new runtime interface. Evidence closes the exact preflight session and records the verified HTTP endpoints and test commands.

- [x] **Step 1: Run focused tests and type checks**

Run: `pnpm exec vitest run packages/core/src/__tests__/core.test.ts apps/web/lib/__tests__/scope-links.test.ts apps/web/lib/__tests__/derived-routes.test.ts`

Run: `pnpm --filter @specforge/core typecheck && pnpm --filter @specforge/web typecheck`

Expected: all focused tests and both type checks exit 0.

- [x] **Step 2: Rebuild and restart the supported Docker topology**

Run: `powershell -ExecutionPolicy Bypass -File .\deploy\scripts\start.ps1`

Expected: Web is ready at `http://localhost:3010`; PostgreSQL, Web, Knowledge Projector, and Connector Worker report healthy.

- [x] **Step 3: Verify affected pages and graph API**

Request the scoped Workbench, Event Contracts, Business Rules, Quality Requirements, ADRs, Proposals, Context Packs, Relationship Graph, and `/api/graph?scope=com.huawei.celon.desiner`. Expected: HTTP 200, graph response is valid JSON with nodes/edges or a bounded empty result, and no new Web container exception.

- [x] **Step 4: Update design evidence and close the same session**

Record exact passing commands and HTTP results in this spec and the matching design records. Run `pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:124680b6-c9b7-4a8a-ac13-ce305d806e3a --status CONVERGED --evidence "core-graph-legacy-array-tests=passed,scoped-route-tests=passed,core-and-web-typecheck=passed,docker-3010-health=passed,affected-pages-and-graph-api=200,no-new-web-errors,mcp-readback=verified"`.

- [x] **Step 5: Commit the evidence update**

Run: `git add docs/superpowers/specs/2026-08-25-asset-navigation-and-graph-reliability-design.md && git commit -m "docs: record navigation and graph reliability evidence"`

## Self-review checklist

- The graph failure, route preservation, affected user-visible pages, and deployment verification each have a task.
- No task rewrites authored data or expands Scope access.
- Tests use the existing Vitest and TypeScript commands.
- The session ID, exact Scope, and MCP closure evidence are explicit.
