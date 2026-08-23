# 3A Graph-First Coverage and Member Expansion Design

## Status

Approved for implementation on 2026-08-23.

## Problem

The 3A architecture page renders every coverage row before the architecture workspace. The current Designer Scope has 307 coverage rows, so the network graph begins roughly 6,800 pixels below the page header. The graph itself correctly renders the governed unit projection, but its initial 8 units and 6 mappings look incomplete because the 42 authoritative direct members are only available through the unit-neighborhood query and are not visible in the network workspace.

## Goals

- Make the architecture graph the primary workspace and keep it within the first working viewport after baseline and projection controls.
- Keep coverage summary visible without rendering all coverage rows in the architecture view.
- Provide a dedicated, shareable Coverage tab with bounded pagination.
- Preserve the governed 8-unit topology as the default graph.
- Expand a selected unit's authoritative direct members on demand through the existing scoped neighborhood query.
- Explain the distinct counts for units, direct members, covered assets, and mappings.

## Non-Goals

- Do not place all 307 TRACE-derived coverage assets in the default topology.
- Do not change the authored architecture-unit or membership data model.
- Do not add graph editing or cross-Scope reads.
- Do not replace the current Sigma/WebGL renderer or its camera controls.
- Do not introduce a new backend query operation when the existing unit-neighborhood operation is sufficient.

## Information Architecture

The page-level tabs become Architecture, Alignment, Drift, and Coverage. Baseline and projection controls remain above the tabs. The compact coverage summary remains available near the controls, but the row list renders only in the Coverage tab.

The Architecture tab renders its selected lanes, map, network, or list workspace immediately after the tabs. Switching to Coverage preserves the exact Scope, baseline, projection, mode, and graph URL state so the user can return without losing context.

## Coverage Detail

The Coverage tab renders the existing summary followed by a bounded detail list. The client displays 25 rows per page and provides icon-based previous and next controls with page and total-row status. Pagination is local because the current workspace loader already returns a bounded report; it prevents a large DOM and long page without changing the coverage contract.

Changing Scope, baseline, projection, or the row collection resets the detail page to the first page. Empty reports retain the existing empty state.

## Graph Semantics

The initial network graph remains a unit projection:

- nodes: governed `ArchitectureUnitProjection` records;
- edges: governed `ArchitectureUnitMappingProjection` records;
- expected Designer v6 baseline: 8 units and 6 mappings.

The graph header reports four separate measures:

- governed units: initial unit nodes;
- direct members: the sum of unit `memberCount` values, currently 42;
- covered assets: the coverage report's covered count, currently 307;
- mappings: initial unit-to-unit edges, currently 6.

These values must not be combined because direct membership and TRACE-derived coverage answer different governance questions.

## On-Demand Member Expansion

Selecting a cluster node invokes the existing `architectureUnitNeighborhood` query for that exact unit, Scope, baseline, projection manifest, and generation. The request uses depth 1 and the existing bounded query budget. The result is transformed into graph summary records and merged into the current graph:

- the selected unit remains a cluster node;
- each returned membership becomes a fact node using its stable assertion ID and the unit's layer;
- each member is connected from the unit by a typed `ARCHITECTURE_MEMBERSHIP` edge;
- returned unit-to-unit mappings may refresh existing summary edges without duplicating them;
- a unit is fetched once per loaded graph identity;
- query failure leaves the existing graph usable and surfaces a localized inline error.

Fact-node selection keeps the existing detail behavior. Unit selection expands and focuses the cluster but does not attempt to open a fact drawer.

## Scope and Security

Every query keeps the existing `ThreeAQueryIdentity` and generation envelope. The client cannot supply a member result from another Scope because the query service authorizes the exact application-service Scope and the graph store rejects identity mismatches. Scope or projection changes clear the graph and the loaded-unit set.

## Accessibility and Motion

Coverage pagination uses accessible names and disabled states. The graph keeps existing keyboard/camera controls and respects `prefers-reduced-motion`. New count labels and error messages receive complete English canonical and Chinese localized strings.

## Verification

- Unit tests cover URL parsing/serialization for the Coverage tab, pagination boundaries, graph count calculation, and unit-neighborhood conversion.
- Component tests prove coverage rows are absent from the Architecture tab and present only in Coverage.
- Focused typecheck and web tests verify the client integration.
- Browser verification at 3000 and the rebuilt 3010 container confirms the graph appears before coverage details, 8/42/307/6 counts are visible, selecting a unit adds its members, camera controls remain usable, and Scope state is preserved.

## Design-Fact Governance

The change updates ADR 0025 and the linked Proposal and Context Pack through the exact Designer Scope MCP boundary. The design-change session must be opened before implementation and closed with focused test and browser evidence. PostgreSQL remains authoritative; the graph is a read-only projection.
