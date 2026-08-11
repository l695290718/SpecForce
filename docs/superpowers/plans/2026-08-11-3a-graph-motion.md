# Implementation Plan: 3A Graph Motion

## Scope

Owning application service: `com.huawei.celon.desiner`

Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

Design change session: `design-change-session:dd17470e-6417-40e1-93fe-e3c41f841a0d`

## Steps

1. Add a small pure interpolation helper for finite position transitions, progress clamping, and reduced-motion behavior.
2. Add a Sigma layout-transition controller using `requestAnimationFrame`; cancel stale frames, interpolate Graphology coordinates, refresh Sigma, and restore edges after settle.
3. Add finite camera reset after layout settle while preserving selected-node focus behavior.
4. Extend node/edge reducers with bounded hover/selection emphasis and a transition-aware edge visibility flag.
5. Add focused tests for interpolation, frame cancellation, camera reset, reducer emphasis, and reduced motion.
6. Run the focused 3A suite and Web/knowledge-query typechecks.
7. Verify the exact Scope in the in-app browser with a reload, DOM/canvas checks, screenshot comparison, interaction check, and zero new console errors.
8. Update ADR `adr-webgl-3a-graph-exploration`, baseline manifest evidence, synchronize/reconcile MCP, close the exact session as `CONVERGED`, and commit only task files.

## Acceptance criteria

- Layout changes visibly animate from current to target positions.
- A second layout change cancels the previous animation without stale frames.
- Edges do not form an unreadable moving wire bundle and return after settling.
- Hover and selection produce clear node/edge emphasis.
- Reduced-motion applies final positions immediately.
- Existing Scope-safe graph data and fallback behavior remain unchanged.
