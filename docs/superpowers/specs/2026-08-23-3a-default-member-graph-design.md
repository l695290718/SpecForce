# 3A Default Member Graph Design

## Status

Approved for written specification on 2026-08-23. Implementation has not started.

## Problem

The graph-first 3A workspace now exposes the correct governance measures, but its initial topology still contains only 8 architecture-unit nodes and 6 unit mappings. Direct members are loaded only after selecting one unit, so the visual surface appears sparse even though the published Designer v6 projection contains 42 authoritative memberships.

The browser must not solve this by launching one neighborhood request per unit. That creates N+1 traffic, staggered rendering, partial client races, and unnecessary Scope-transition complexity.

## Goals

- Render all governed units and their direct members in the initial Network view.
- Preserve the readable architecture-unit backbone and unit-to-unit mappings.
- Use one exact-Scope, Baseline-bound, generation-qualified request.
- Keep existing `unitGraph` consumers compatible.
- Bound units, members, mappings, payload size, and execution time independently.
- Let users collapse or expand a unit's members without another server request.
- Keep TRACE-derived coverage assets out of the default topology.

## Non-Goals

- Do not include the 307 TRACE coverage assets or their paths in the default graph.
- Do not expose same-layer assertion dependencies through this increment.
- Do not change authored unit, membership, or mapping facts.
- Do not replace Sigma/WebGL, Graphology, or the PostgreSQL authority boundary.
- Do not claim assertion-level impact analysis is available.

## Query Contract

`UnitGraphQueryInput` gains an optional `includeMembers` boolean. It defaults to `false`, so existing callers continue to receive only governed unit nodes and unit-mapping edges with `fidelity=UNIT`.

When `includeMembers=true`, the response uses the existing `nodes` and `edges` collections:

- each architecture unit is a `cluster` summary node;
- each direct member is a `fact` summary node with its stable assertion ID, semantic label, owning unit `clusterId`, and the owning unit's 3A layer;
- each authored unit mapping remains a summary edge with its mapping family;
- each direct membership becomes a directional `ARCHITECTURE_MEMBERSHIP` summary edge from unit to member;
- `source` remains `ARCHITECTURE_UNIT_PROJECTION`;
- `fidelity` is `UNIT_WITH_MEMBERS`;
- assertion `analysisAvailability` remains independent.

The Web Network view sends `includeMembers=true`. Map, MCP, and other existing callers are unchanged unless they explicitly opt in.

## Bounded Retrieval

Introduce a `UnitGraphBudget` that extends the existing architecture-map budget with `maxMembers`. The service hard limits are:

- 12 units per layer, at most 36 returned units;
- 500 direct members;
- 60 unit mappings;
- 500 membership edges, one per returned member;
- 2,000 milliseconds;
- 524,288 response bytes.

The repository gains a batch member-read operation for a list of unit identities. The PostgreSQL implementation performs one Scope, generation, Baseline, Projection Manifest, and `unitIdentity IN (...)` query ordered by unit identity and assertion identity. It reads at most `maxMembers + 1` rows to determine truncation. It must not issue one query per unit.

If members exceed the bound, the response keeps the complete returned unit backbone, truncates members deterministically, and adds `MEMBER_BUDGET_EXCEEDED` plus `CONTINUATION_REQUIRED` to `partial.reasons`. Unit and mapping partial reasons remain unchanged. A member read failure does not silently fabricate an empty complete result: the response either fails with the existing explicit query error or declares a bounded partial result when the repository can prove the returned prefix.

## Graph Layout and Interaction

The default Designer v6 graph contains 50 nodes and 48 edges:

- 8 governed unit clusters;
- 42 direct member facts;
- 6 unit mappings;
- 42 membership edges.

Units remain visually dominant. Members inherit their unit's layer color family, use a smaller radius, and are seeded near their owning cluster before the force layout starts. Membership edges are visually quieter than unit mappings so the BIZ-to-SYS-to-TECH backbone remains readable.

All units begin expanded. Selecting a cluster toggles its member visibility locally:

- the first selection collapses that unit's member nodes and membership edges;
- selecting it again expands them;
- unit-to-unit mappings are never hidden by member collapse;
- fact-node selection retains the existing detail behavior;
- selecting a collapsed member through search expands its owning unit before focusing the fact;
- Scope, Baseline, Projection, generation, or graph-view changes reset collapse state to fully expanded.

The renderer receives collapsed cluster identities and hides matching fact nodes and membership edges through Sigma reducers. Graphology retains the complete loaded graph, so expanding does not refetch or lose stable positions. Search and the loaded-count status continue to describe the loaded graph; the unit count rail remains 8/42/307/6 for Designer v6.

## Error and Partial States

- A complete member response renders the full unit/member graph.
- A bounded member response renders the deterministic prefix and exposes the existing partial-result treatment with the member-specific reason.
- A failed unit graph request leaves the existing explicit error state; it does not fall back to TRACE coverage or invent member relationships.
- Exact identity mismatches remain rejected by the graph store.
- In-flight requests are cancelled on identity changes.

## Scope and Security

Every unit and member row must match the authorized application-service Scope, full scope path, generation, Baseline, and Projection Manifest. The batch repository query includes every identity column and never accepts client-provided member rows. Cross-Scope or cross-generation results are rejected before graph merge.

## Compatibility

- `includeMembers` is optional and defaults to `false`.
- Existing `UNIT` responses remain byte-compatible in shape and behavior.
- `UNIT_WITH_MEMBERS` is an additive fidelity value.
- Existing map and unit-neighborhood operations remain available.
- No database migration is required because the member projection already exists.

## Verification

- Core tests validate the new fidelity and member budget.
- Repository tests prove one batch member query, deterministic ordering, exact identity predicates, and truncation detection.
- Knowledge-query tests cover compatibility mode, member mode, stable node/edge conversion, 8/42/6 counts, and `MEMBER_BUDGET_EXCEEDED`.
- Web handler tests validate `includeMembers` and reject invalid budgets.
- Graph tests validate default 50-node/48-edge merge semantics, cluster collapse, member edge visibility, reset on identity change, and fact selection.
- Browser verification on ports 3000 and 3010 confirms the default member-rich graph, readable unit backbone, collapse/expand behavior, camera controls, Scope preservation, and no console or request errors.

## Design-Fact Governance

The implementation updates ADR 0025, the linked Proposal and Context Pack, `api-specforge-3a-architecture-query`, and `data-specforge-3a-projection-read-model` through the exact Designer Scope MCP boundary. A new design-change session must be opened after the implementation plan is approved and closed only after focused tests, browser evidence, Docker verification, MCP synchronization, and read-back converge.
