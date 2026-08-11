# 3A Graph Edge Loading and PostgreSQL Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3A Graph Overview render bounded relationship edges and clearly fall back to an exact-Scope PostgreSQL relationship view when derived graph analysis is unavailable.

**Architecture:** Extend the existing read-only 3A query service with an optional bounded relationship limit. The server loader fetches bounded layer facts and relationships, passes them into the client graph workspace, and keeps that PostgreSQL view when the derived graph response is unavailable or disconnected. Explore and Impact remain focused, budgeted requests.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Sigma.js/Graphology.

## Global Constraints

- Scope is exactly `com.huawei.celon.desiner` with `scopePath=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for authored assets and relationship events; graph analysis remains a derived projection.
- Initial graph budget is at most 250 nodes and 500 edges.
- Human-facing additions require English canonical strings and complete Chinese localization.
- Implementation session: `design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3`.

---

### Task 1: Add bounded relationship query support

**Files:**
- Modify: `packages/knowledge-query/src/types.ts`
- Modify: `packages/knowledge-query/src/service.ts`
- Modify: `packages/knowledge-query/src/prisma-repository.ts`
- Test: `packages/knowledge-query/src/service.test.ts`

**Interfaces:**
- `ArchitectureAlignmentInput.limit?: number` is optional and applies only when a caller asks for a bounded relationship page.
- `ThreeAQueryRepository.listEdges` accepts `{ assertionId?: string; limit?: number }`.

- [ ] Add the optional limit to the alignment input and repository contract.
- [ ] Validate bounded limits in the service and pass `take: limit` only when provided.
- [ ] Keep calls without `limit` unchanged for the dedicated Alignment page.
- [ ] Add a service test proving `getArchitectureAlignment({ limit: 500 })` forwards the bound and preserves exact Scope.
- [ ] Run `pnpm exec vitest run packages/knowledge-query/src/service.test.ts` and expect PASS.

### Task 2: Load bounded graph catalog and relationships

**Files:**
- Modify: `apps/web/lib/3a/workspace-loader.ts`
- Modify: `apps/web/lib/3a/workspace-loader.test.ts`
- Modify: `apps/web/components/three-a/three-a-workspace.tsx`

**Interfaces:**
- `ThreeAWorkspaceData.initialGraphEdges?: KnowledgeProjectionEdge[]` carries the bounded relationship page for graph Overview fallback.

- [ ] Change graph mode without focus to request `84` facts per layer and one `getArchitectureAlignment` call with `limit: 500`.
- [ ] Return the relationship page as `initialGraphEdges` without changing lane, alignment, or drift loading.
- [ ] Pass `initialGraphEdges` to `ArchitectureGraphWorkspace` and preserve existing focused trace behavior.
- [ ] Update loader tests to assert three `84`-node requests, one bounded relationship request, and returned initial edges.
- [ ] Run `pnpm exec vitest run apps/web/lib/3a/workspace-loader.test.ts` and expect PASS.

### Task 3: Select fallback source and expose its state

**Files:**
- Modify: `apps/web/components/three-a/architecture-graph-workspace.tsx`
- Modify: `apps/web/lib/i18n.ts`
- Test: `apps/web/components/three-a/architecture-graph-workspace.test.tsx` (create)

**Interfaces:**
- Graph workspace state tracks `projection` versus `postgres-fallback` for the current Overview request.

- [ ] Seed the graph store with the bounded PostgreSQL node-and-edge view before requesting derived analysis.
- [ ] Keep the fallback on graph-analysis failure, empty result, or a disconnected result with available fallback edges.
- [ ] Replace it with the derived result only when the response is usable.
- [ ] Add bilingual source labels and render the active source beside the graph counters.
- [ ] Test failure fallback, successful projection replacement, and the disconnected-result guard.
- [ ] Run the focused workspace test and the existing graph-store/renderer tests.

### Task 4: Synchronize design facts and verify

**Files:**
- Modify: `docs/adr/0024-webgl-3a-graph-exploration.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `README.md` only if the runtime behavior statement needs correction.

- [ ] Record the bounded relationship fallback, data-source status, and exact verification commands in the ADR and matching MCP assets.
- [ ] Run focused tests, `pnpm --filter @specforge/web typecheck`, and the manifest JSON check.
- [ ] Restart the development server only after verification if the dev cache requires it, then inspect the browser graph count and source label.
- [ ] Run `pnpm design-context:close -- --session design-change-session:d442616a-078b-4dd0-ba82-6204409fbca3 --status CONVERGED --evidence "knowledge-query-service-test=PASS,workspace-loader-test=PASS,graph-workspace-test=PASS,web-typecheck=PASS,browser-overview-edge-count=verified,browser-source-label=verified"` with the exact command results recorded in the ADR.
- [ ] Run scoped design-fact sync and reconciliation; require `missing=[]`, `mismatched=[]`, `outOfScope=[]`, and `blocked=[]`.
- [ ] Commit the implementation and governance records together, leaving unrelated existing report changes untouched.
