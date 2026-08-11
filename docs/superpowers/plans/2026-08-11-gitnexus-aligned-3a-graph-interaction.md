# GitNexus-Aligned 3A Graph Interaction Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Replace the current static-feeling 3A Sigma graph interaction with a bounded GitNexus-style ForceAtlas2 exploration workspace while preserving SpecForge Scope isolation, URL focus, PostgreSQL authority, and WebGL fallback behavior.

Architecture: Keep the server query contracts and ArchitectureGraphStore unchanged as the fact boundary. Add a focused client layout adapter that seeds Graphology from the existing deterministic layout, runs ForceAtlas2 in a Worker, applies Noverlap cleanup, and reports an explicit lifecycle to the renderer. Keep selection, hover, neighborhood, camera, and controls in the Sigma layer, with the workspace owning URL focus and the renderer owning ephemeral visual state.

Tech Stack: Next.js 15, React 19, TypeScript 5.7, Sigma 3.0.2, Graphology 0.26.0, graphology-layout-forceatlas2 0.10.1, graphology-layout-noverlap 0.4.2, @sigma/edge-curve 3.1.0, Vitest 2.1.9, in-app browser acceptance.

## Global Constraints

- Exact application service Scope is com.huawei.celon.desiner with scope path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.
- PostgreSQL remains authoritative for authored assets and relationship events; the graph renderer receives only bounded query results.
- Overview and Explore focus changes must reuse the loaded graph; Impact focus changes remain focus-sensitive.
- Browser budgets remain bounded at 250 nodes / 500 edges for Overview, 2,000 nodes / 5,000 edges in the client store, and the existing request payload and timeout limits.
- WebGL failure, context loss, Worker failure, timeout, and reduced-motion mode must preserve a usable semantic fallback.
- English canonical fields and complete Chinese human-facing overlays remain required for user-visible design facts and documentation.
- Every code or behavior change requires the open exact-Scope DesignChangeSession b4d9e57e-5a45-4b44-b581-dc94e2116752 to be closed with exact verification evidence, then design facts must be synchronized and reconciled.

---

### Task 1: Add the GitNexus-compatible renderer dependencies and layout contracts

Files:
- Modify: apps/web/package.json
- Modify: pnpm-lock.yaml
- Modify: apps/web/components/three-a/architecture-graph-layout-worker.ts
- Create: apps/web/components/three-a/architecture-graph-layout-worker.test.ts additions

Interfaces:
- Preserve LayoutWorkerRequest and LayoutWorkerResponse as the public worker boundary.
- Add LayoutRunMode = force | tree | circles and LayoutLifecycle = seeded | running | settled | stopped | failed.
- Add a response field lifecycle and an optional reason while keeping positions backward-compatible.

- [ ] Step 1: Add the exact visualization packages.

Run:

~~~powershell
pnpm --filter @specforge/web add @sigma/edge-curve@3.1.0 graphology-layout-noverlap@0.4.2
~~~

Expected: apps/web/package.json and pnpm-lock.yaml contain both direct dependencies; existing Sigma and Graphology versions remain unchanged.

- [ ] Step 2: Add failing contract tests for deterministic lifecycle and bounded fallback.

Test in apps/web/components/three-a/architecture-graph-layout-worker.test.ts:

~~~ts
it("returns a seeded fallback when force layout is disabled", () => {
  const result = refineArchitectureGraphLayout({
    type: "refine",
    layout: "force",
    nodes: [{ id: "fact:one", x: 0, y: 0, degree: 1 }],
    edges: [],
    seed: 7,
    maxRuntimeMs: 0,
    reducedMotion: true,
  });
  expect(result.type).toBe("complete");
  expect(result.lifecycle).toBe("stopped");
  expect(result.positions).toHaveLength(1);
});
~~~

- [ ] Step 3: Implement the contract without changing server data loading.

Change the worker request to accept force as a client layout kind, map force to the existing Overview or Explore seed, and return stopped or failed lifecycle for reduced-motion and timeout paths. Keep deterministicLayout as the final fallback and keep every position finite.

- [ ] Step 4: Run the focused worker test.

Run: node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-graph-layout-worker.test.ts

Expected: all worker tests pass, including the existing unit-scale, layer-band, and collision tests.

- [ ] Step 5: Commit.

~~~powershell
git add apps/web/package.json pnpm-lock.yaml apps/web/components/three-a/architecture-graph-layout-worker.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts
git commit -m "feat: add force graph layout contracts"
~~~

### Task 2: Replace bounded refinement with ForceAtlas2 Worker plus Noverlap

Files:
- Modify: apps/web/components/three-a/architecture-graph-layout-worker.ts
- Modify: apps/web/components/three-a/architecture-graph-layout-worker.test.ts
- Create: apps/web/components/three-a/architecture-graph-layout-force.ts
- Create: apps/web/components/three-a/architecture-graph-layout-force.test.ts

Interfaces:
- Create runForceArchitectureLayout(request: ForceLayoutRequest): ForceLayoutResult.
- ForceLayoutRequest contains nodes, edges, seed, maxRuntimeMs, reducedMotion, and runNoverlap.
- ForceLayoutResult contains positions, lifecycle, elapsedMs, and optional reason.
- The Worker wrapper imports graphology-layout-forceatlas2/worker and graphology-layout-noverlap only in the Worker-side module.

- [ ] Step 1: Write failing force layout tests.

Test cases:

~~~ts
it("keeps the deterministic seed stable for the same identity and input");
it("moves connected nodes toward a settled force layout without NaN coordinates");
it("runs Noverlap cleanup without dropping nodes or edges");
it("returns deterministic positions when reduced motion or the time budget disables force");
it("returns failed lifecycle with deterministic positions when the runtime budget expires");
~~~

- [ ] Step 2: Implement the isolated force adapter.

Build a Graphology MultiDirectedGraph from the bounded request, copy x/y/size attributes, run ForceAtlas2 with deterministic seed-derived settings, stop at maxRuntimeMs, then run Noverlap with margin 10, expansion 1.05, and maxIterations 20. Convert positions back in sorted node order. Do not persist positions to PostgreSQL or the design graph.

- [ ] Step 3: Connect the existing Worker entrypoint to the adapter.

The Worker must catch all adapter errors and post deterministic positions with lifecycle failed and reason WORKER_ERROR. The main thread must receive only serializable positions and status, never a Graphology instance.

- [ ] Step 4: Run the layout tests and typecheck.

Run:

~~~powershell
node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-graph-layout-force.test.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts
pnpm --filter @specforge/web typecheck
~~~

Expected: tests and typecheck exit 0; no worker test loads an unbounded graph.

- [ ] Step 5: Commit.

~~~powershell
git add apps/web/components/three-a/architecture-graph-layout-worker.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts apps/web/components/three-a/architecture-graph-layout-force.ts apps/web/components/three-a/architecture-graph-layout-force.test.ts
git commit -m "feat: run bounded forceatlas layout in worker"
~~~

### Task 3: Implement GitNexus-style Sigma reducers and interaction state

Files:
- Modify: apps/web/components/three-a/sigma-architecture-graph.tsx
- Modify: apps/web/components/three-a/sigma-architecture-graph.test.tsx
- Modify: apps/web/components/three-a/architecture-graph-store.ts
- Modify: apps/web/components/three-a/architecture-graph-state.ts

Interfaces:
- Add reducer helpers: createNodeVisualState, createEdgeVisualState, and oneHopNeighborhood.
- Keep createSigmaSettings accepting refs for selected, hovered, semantic state, layout lifecycle, and pulse state.
- Event behavior remains clickNode(id), clickEdge(id), enterNode(id), leaveNode(), and stage click clear.

- [ ] Step 1: Write reducer tests before changing renderer behavior.

Test the exact state transitions:

~~~ts
expect(createNodeVisualState("fact:one", node, { selectedId: "fact:one" }).zIndex).toBe(3);
expect(createNodeVisualState("fact:two", node, { selectedId: "fact:one", neighborhoodIds: new Set(["fact:two"]) }).size).toBeGreaterThan(node.size);
expect(createNodeVisualState("fact:three", node, { selectedId: "fact:one", neighborhoodIds: new Set(["fact:two"]) }).opacity).toBeLessThan(0.5);
expect(createEdgeVisualState(edge, { selectedId: "fact:one" }).size).toBeGreaterThan(createEdgeVisualState(unrelatedEdge, { selectedId: "fact:one" }).size);
~~~

- [ ] Step 2: Implement one-hop neighborhood derivation in the store.

When select receives a stable node id, compute adjacent node ids from Graphology, retain selectedId, and expose neighborhoodIds to the existing semantic snapshot. Clearing selection removes neighborhood emphasis without removing graph data.

- [ ] Step 3: Add curved edge rendering and GitNexus-style hover rendering.

Register EdgeCurveProgram under the curved edge type, set renderEdgeLabels false by default, use custom dark hover labels with a color-matched halo, and keep labels forced for selected and hovered nodes. Use reducers to dim only unrelated nodes and edges.

- [ ] Step 4: Make pointer events stable.

Use callback refs for all event callbacks. A click must update selection before calling workspace onFocus, and the renderer must not clear or recreate Graphology for a URL focus update. Stage click clears selection; leaveNode cancels only transient hover pulse, not selection.

- [ ] Step 5: Run the renderer and store tests.

Run: node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-store.test.ts apps/web/components/three-a/architecture-graph-motion.test.ts

Expected: all visual reducer, neighborhood, pointer-state, and motion tests pass.

- [ ] Step 6: Commit.

~~~powershell
git add apps/web/components/three-a/sigma-architecture-graph.tsx apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-store.ts apps/web/components/three-a/architecture-graph-state.ts
git commit -m "feat: add gitnexus-style graph emphasis"
~~~

### Task 4: Add force/tree/circles controls and layout lifecycle UI

Files:
- Create: apps/web/components/three-a/architecture-graph-controls.tsx
- Modify: apps/web/components/three-a/architecture-graph-workspace.tsx
- Modify: apps/web/components/three-a/architecture-graph-renderer.tsx
- Modify: apps/web/components/three-a/architecture-graph-workspace.test.ts
- Create: apps/web/components/three-a/architecture-graph-controls.test.tsx

Interfaces:
- ArchitectureGraphControls props: view, lifecycle, hasSelection, onViewChange, onZoomIn, onZoomOut, onResetCamera, onFocusSelection, onStartLayout, onStopLayout, onRestartLayout, onClearSelection.
- The controls component emits actions only; Sigma owns camera and layout execution.
- The workspace continues to serialize graphView and focus through serializeThreeAUrlState.

- [ ] Step 1: Write control tests for accessible actions.

Verify that force, tree, and circles buttons expose pressed state; start/stop/restart/focus/reset/clear buttons have accessible labels; and disabled states follow lifecycle and selection.

- [ ] Step 2: Implement icon-first controls with tooltips.

Use lucide-react icons, native buttons, title/aria-label attributes, and no visible instructional paragraphs. Keep controls in a compact toolbar above or over the graph without nesting cards.

- [ ] Step 3: Wire lifecycle actions.

Add explicit start/stop/restart callbacks to SigmaArchitectureGraph. Restart cancels the current Worker and starts from the same bounded seed. Tree and circles use the existing deterministic/refinement paths and do not invoke ForceAtlas2.

- [ ] Step 4: Preserve URL state and focus persistence.

Switching view changes only graphView. Clicking a node updates focus and selection without refetching Overview or Explore. Impact remains focus-sensitive. Reset camera does not change URL focus.

- [ ] Step 5: Run controls and workspace tests.

Run: node .\node_modules\vitest\vitest.mjs run apps/web/components/three-a/architecture-graph-controls.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/lib/3a/workspace-loader.test.ts

Expected: controls, URL focus persistence, and bounded loader tests pass.

- [ ] Step 6: Commit.

~~~powershell
git add apps/web/components/three-a/architecture-graph-controls.tsx apps/web/components/three-a/architecture-graph-controls.test.tsx apps/web/components/three-a/architecture-graph-workspace.tsx apps/web/components/three-a/architecture-graph-renderer.tsx apps/web/components/three-a/architecture-graph-workspace.test.ts
git commit -m "feat: add graph layout controls"
~~~

### Task 5: Integrate the complete interaction lifecycle and fallback

Files:
- Modify: apps/web/components/three-a/sigma-architecture-graph.tsx
- Modify: apps/web/components/three-a/architecture-graph-renderer.tsx
- Modify: apps/web/components/three-a/architecture-graph-workspace.tsx
- Modify: apps/web/components/three-a/architecture-graph-layout-worker.ts
- Modify: apps/web/components/three-a/architecture-graph-layout-force.ts

Interfaces:
- SigmaArchitectureGraph exposes renderer lifecycle through onLayoutLifecycle and preserves onRendererFailure/onRendererReady.
- ArchitectureGraphRenderer maps failure and lifecycle to the semantic fallback without losing the current store snapshot.
- Workspace maps Graph view state to bounded query operations and leaves Impact panel behavior unchanged.

- [ ] Step 1: Add failure and reduced-motion tests.

Cover WebGL unavailable, context loss, Worker failure, timeout, empty graph, and prefers-reduced-motion. Each path must retain nodes and edges in the semantic fallback.

- [ ] Step 2: Implement teardown and recovery.

On context loss, kill Sigma, keep the store, set failure, and show Retry renderer. On Worker failure or timeout, keep deterministic positions, restore edges, set lifecycle failed, and do not blank the graph.

- [ ] Step 3: Implement camera and movement guards.

Use finite camera easing for focus/reset, hide or reduce edges only during movement, call sigma.refresh after lifecycle changes, and restore visible edges after settling. Guard ResizeObserver against zero-sized containers.

- [ ] Step 4: Run the complete focused suite.

Run:

~~~powershell
node .\node_modules\vitest\vitest.mjs run packages/knowledge-query/src/service.test.ts apps/web/lib/3a/workspace-loader.test.ts apps/web/components/three-a/architecture-graph-workspace.test.ts apps/web/components/three-a/architecture-graph-store.test.ts apps/web/components/three-a/architecture-graph-layout-worker.test.ts apps/web/components/three-a/architecture-graph-layout-force.test.ts apps/web/components/three-a/architecture-graph-controls.test.tsx apps/web/components/three-a/architecture-graph-motion.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx
pnpm --filter @specforge/web typecheck
pnpm --filter @specforge/knowledge-query typecheck
git diff --check
~~~

Expected: all focused tests pass, both typechecks exit 0, and git diff --check exits 0.

- [ ] Step 5: Commit.

~~~powershell
git add apps/web/components/three-a/sigma-architecture-graph.tsx apps/web/components/three-a/architecture-graph-renderer.tsx apps/web/components/three-a/architecture-graph-workspace.tsx apps/web/components/three-a/architecture-graph-layout-worker.ts apps/web/components/three-a/architecture-graph-layout-force.ts
git commit -m "feat: complete gitnexus-style graph lifecycle"
~~~

### Task 6: Browser acceptance, design records, and MCP convergence

Files:
- Modify: docs/adr/0024-webgl-3a-graph-exploration.md
- Modify: docs/design-facts/baseline-manifest.json
- Create: docs/superpowers/specs/2026-08-11-gitnexus-aligned-3a-graph-interaction-evidence.md
- Create: docs/superpowers/plans/2026-08-11-gitnexus-aligned-3a-graph-interaction-evidence.md

Interfaces:
- Evidence must reference the same DesignChangeSession b4d9e57e-5a45-4b44-b581-dc94e2116752.
- The ADR, Proposal, Context Pack, and typed links remain the canonical MCP asset set.

- [ ] Step 1: Start or reload the exact Designer Scope graph page.

Use the in-app browser URL:

~~~text
http://localhost:3000/architecture/3a?scope=com.huawei.celon.desiner&tab=architecture&mode=graph&direction=both&graphView=force
~~~

- [ ] Step 2: Verify the interaction envelope.

Record: bounded node and edge counts, visible edges after settling, layout lifecycle changes, hover label and one-hop neighborhood emphasis, node selection and URL focus, stage clear, edge inspector, view switching, reset camera, and no console errors. Verify the graph remains present after click and pointer release.

- [ ] Step 3: Write exact evidence in English and Chinese.

Record commands and browser results in the evidence Spec, update ADR 0024 and the baseline manifest, and distinguish implemented behavior, locally verified behavior, and deferred production-scale capability.

- [ ] Step 4: Close and reconcile the exact MCP session.

Run:

~~~powershell
pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:b4d9e57e-5a45-4b44-b581-dc94e2116752 --status CONVERGED --evidence "forceatlas-focused-tests-PASS,web-typecheck-PASS,knowledge-query-typecheck-PASS,browser-force-settled,browser-hover-selection-persistence,browser-no-console-errors,git-diff-check-PASS"
$env:SPECFORGE_DESIGN_FACT_IDS='adr-webgl-3a-graph-exploration'; pnpm design-facts:sync; pnpm design-facts:check
~~~

Expected: close returns CONVERGED; sync returns complete; reconciliation returns empty missing, mismatched, outOfScope, and blocked lists.

- [ ] Step 5: Commit design evidence.

~~~powershell
git add docs/adr/0024-webgl-3a-graph-exploration.md docs/design-facts/baseline-manifest.json docs/superpowers/specs/2026-08-11-gitnexus-aligned-3a-graph-interaction-evidence.md docs/superpowers/plans/2026-08-11-gitnexus-aligned-3a-graph-interaction-evidence.md
git commit -m "docs: record gitnexus graph convergence"
~~~

## Plan self-review

- Spec coverage: ForceAtlas2 Worker and Noverlap are covered by Tasks 1-2; reducers and pointer behavior by Task 3; controls and three views by Task 4; error handling and reduced motion by Task 5; browser evidence and MCP closure by Task 6.
- Scope coverage: every task keeps the exact Designer Scope and bounded query boundary.
- Placeholder scan: no task depends on deferred or unspecified work; every verification step names an exact command and expected result.
- Type consistency: LayoutWorkerRequest/Response remain the worker boundary; ForceLayoutRequest/Result are internal to the force adapter; ArchitectureGraphControls emits typed callbacks; SigmaArchitectureGraph remains the renderer lifecycle owner.
