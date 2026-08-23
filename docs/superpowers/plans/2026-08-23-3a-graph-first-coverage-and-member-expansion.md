# 3A Graph-First Coverage and Member Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the governed 3A graph in the primary working viewport, isolate coverage detail behind a paginated tab, and expand authoritative unit members on demand.

**Architecture:** Keep the existing unit graph and unit-neighborhood query contracts. Add a shareable Coverage page tab, paginate the already bounded coverage report on the client, and convert neighborhood members into graph summary nodes and typed membership edges that can be merged by the existing graph store.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Vitest, Graphology, Sigma/WebGL, Prisma/PostgreSQL, SpecForge MCP design governance.

## Global Constraints

- The exact owning Scope is `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative; graph data remains a read-only projection.
- English design fields are canonical and Chinese human-facing overlays are complete.
- The default graph contains architecture units and mappings only; TRACE coverage is not injected into the default topology.
- Unit member expansion reuses `architectureUnitNeighborhood`; no new backend operation is introduced.
- Coverage detail shows 25 rows per page and resets when its row collection changes.
- The implementation is incomplete until the matching MCP design-change session is closed with exact evidence.

---

### Task 1: Shareable Coverage View and Bounded Detail

**Files:**
- Modify: `apps/web/lib/3a/url-state.ts`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`
- Modify: `apps/web/components/three-a/coverage-detail.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Test: `apps/web/components/three-a/three-a-workspace.test.tsx`
- Create: `apps/web/components/three-a/coverage-detail.test.tsx`

**Interfaces:**
- Consumes: `ThreeAWorkspaceData.coverage` and the existing `ThreeAUrlState` serializer.
- Produces: `ThreeAUrlState.tab = "coverage"` and `CoverageDetail` with local 25-row pagination.

- [ ] **Step 1: Add failing URL and workspace tests**

Add tests proving `tab=coverage` round-trips, the Architecture tab does not render `coverage-detail`, and the Coverage tab does render it.

- [ ] **Step 2: Add a failing pagination component test**

Render 26 coverage rows, assert only rows 1-25 are visible, activate the next icon button, and assert row 26 is visible while row 1 is not.

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `pnpm --filter @specforge/web test -- apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/coverage-detail.test.tsx`

Expected: FAIL because `coverage` is not a valid tab and the detail component has no pagination.

- [ ] **Step 4: Implement the Coverage tab and pagination**

Extend the URL parser and serializer, add the fourth page tab, keep the compact summary above the tabs, render the row list only when `state.tab === "coverage"`, and paginate with `PAGE_SIZE = 25`, accessible icon controls, disabled boundaries, and localized page status.

- [ ] **Step 5: Run the focused tests**

Run: `pnpm --filter @specforge/web test -- apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/coverage-detail.test.tsx`

Expected: PASS.

### Task 2: Governed Unit Member Expansion

**Files:**
- Modify: `apps/web/components/three-a/architecture-graph-workspace.tsx`
- Modify: `apps/web/components/three-a/architecture-graph-workspace.test.ts`

**Interfaces:**
- Consumes: `runArchitectureUnitNeighborhoodQuery(input)` and `ArchitectureUnitNeighborhoodResult`.
- Produces: `unitNeighborhoodOverview(result): OverviewArchitectureResult` and `graphProjectionCounts(result, coveredAssets)`.

- [ ] **Step 1: Add failing conversion and count tests**

Add a neighborhood fixture with one unit and two members. Assert the conversion returns one cluster, two fact nodes, two `ARCHITECTURE_MEMBERSHIP` edges, stable assertion IDs, and the unit layer on member nodes. Add a count test for 8 units, 42 direct members, 307 covered assets, and 6 mappings.

- [ ] **Step 2: Run the focused graph test and verify failure**

Run: `pnpm --filter @specforge/web test -- apps/web/components/three-a/architecture-graph-workspace.test.ts`

Expected: FAIL because the conversion and count helpers do not exist.

- [ ] **Step 3: Implement conversion helpers**

Convert `ArchitectureUnitNeighborhoodResult` to an `OverviewArchitectureResult`: preserve the selected unit as a cluster, create fact nodes from members, create directional membership edges from the unit to each member, and include returned adjacent-unit mappings using their stable identities.

- [ ] **Step 4: Implement click-to-expand**

When a cluster node is selected, resolve its `cluster:` stable ID to the unit identity, call `architectureUnitNeighborhood` with depth 1 and the current exact query identity, merge the converted result, mark the unit loaded, and retain normal fact-node drawer behavior. Clear the loaded-unit set when the graph identity reloads. Surface a localized error while leaving the graph interactive.

- [ ] **Step 5: Add explicit graph measures**

Pass `coveredAssets` from `ThreeAWorkspace` and render the governed unit, direct-member, covered-asset, and mapping counts independently. Keep live loaded-node and loaded-edge counts available after expansion.

- [ ] **Step 6: Run the focused graph tests**

Run: `pnpm --filter @specforge/web test -- apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts`

Expected: PASS.

### Task 3: Design Facts and Focused Verification

**Files:**
- Modify: `docs/adr/0025-readable-3a-architecture-mapping.md`
- Modify: the matching Designer Scope baseline manifest under `docs/design-baselines/`
- Modify: the matching implementation evidence record if required by the current repository pattern

**Interfaces:**
- Consumes: the open `DesignChangeSession` receipt and focused verification results.
- Produces: repository ADR evidence plus matching MCP Proposal, ADR, Context Pack, and typed-link synchronization.

- [ ] **Step 1: Run the complete focused verification batch**

Run: `pnpm --filter @specforge/web test -- apps/web/components/three-a/three-a-workspace.test.tsx apps/web/components/three-a/coverage-detail.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts`

Run: `pnpm --filter @specforge/web typecheck`

Expected: all tests PASS and typecheck exits 0.

- [ ] **Step 2: Update the repository design records**

Record the graph-first information architecture, the 8/42/307/6 measure semantics, bounded coverage pagination, on-demand neighborhood query reuse, exact commands, and results. Keep English canonical content and Chinese localization.

- [ ] **Step 3: Synchronize matching MCP facts**

Run the repository's exact Designer Scope baseline sync command, then check the affected ADR, Proposal, Context Pack, API, and read-model facts and their typed links.

- [ ] **Step 4: Close the design-change session**

Run `pnpm design-context:close -- --session design-change-session:ca477e2d-9fa3-469c-b5af-e5957b357466 --status CONVERGED --evidence "web-focused-tests=passed,web-typecheck=passed,browser-3000-graph-first-and-member-expansion=passed,browser-3010-graph-first-and-member-expansion=passed,mcp-baseline-sync-and-readback=passed"`.

Expected: the session is closed as `CONVERGED` in the exact Designer Scope.

### Task 4: Runtime Validation and Delivery

**Files:**
- Modify: only files required by defects found during focused validation.

**Interfaces:**
- Consumes: the completed web implementation and synced design facts.
- Produces: verified 3000 development behavior and rebuilt 3010 Docker behavior.

- [ ] **Step 1: Validate the development runtime once**

Open the Designer Scope 3A network URL on port 3000. Confirm the graph precedes coverage detail, the four measures show 8/42/307/6, a unit click adds members, camera controls work, Coverage pagination is bounded, and Scope state survives tab changes.

- [ ] **Step 2: Build and replace the 3010 web container**

Run the repository deployment compose build/up command for the web service only, preserving the existing PostgreSQL and projector containers.

Expected: port 3010 reports healthy and serves the new build.

- [ ] **Step 3: Validate the Docker runtime once**

Repeat the graph-first, count, member-expansion, pagination, and Scope checks on port 3010.

- [ ] **Step 4: Commit the implementation**

Stage only the implementation, tests, ADR, baseline, and evidence files. Leave `.tmp/`, `outputs/`, and `scripts/build-design-code-challenge-workbook.mjs` untouched.

Run: `git commit -m "feat: prioritize governed 3a graph"`

Expected: a clean task diff with unrelated untracked files preserved.
