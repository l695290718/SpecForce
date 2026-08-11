# Implementation Plan: 3A Layered Graph Layout

## Scope

Owning application service: `com.huawei.celon.desiner`

Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

Design change session: `design-change-session:162ef116-c479-4658-ab42-d77ad92594ab`

## Steps

1. Extend the layout worker request with optional architecture-layer metadata and pass it from the Graphology snapshot.
2. Replace unit-scale Overview seeds with a deterministic three-band elliptical layout. Use stable identifier jitter, degree offsets, finite-coordinate guards, and a fallback band for missing layers.
3. Keep meaningful focused-view coordinates and existing bounded attraction/refinement behavior.
4. Add regression coverage for unit-circle seeds, distinct layer bands, deterministic output, and finite positions.
5. Run the focused 3A Vitest suite and package typechecks.
6. Verify the exact Scope in the in-app browser: node/edge counts, fallback source label, coordinate spread, and zero console errors.
7. Update ADR `adr-webgl-3a-graph-exploration`, its Proposal/Context Pack evidence and baseline manifest, synchronize and reconcile the exact Scope, close the session as `CONVERGED`, and commit only task files.

## Acceptance criteria

- Overview nodes no longer collapse when position seeds are near zero or on a unit circle.
- BIZ, SYS, and TECH nodes occupy separate stable bands.
- Existing graph relationships remain present and clickable.
- Focused views do not regress.
- Focused tests, typechecks, browser checks, MCP sync, and exact-Scope reconciliation pass.
