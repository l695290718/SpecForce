# 3A Graph Flagship UX Polish Design (2026-08-22)

- **Stable ID / 稳定 ID:** `spec-3a-graph-flagship-ux` (repository record; the MCP Proposal `proposal-webgl-3a-graph-exploration` carries this increment as its third `specChanges` entry)
- **Application service:** `com.huawei.celon.desiner`
- **Scope path:** `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- **Design change session:** `design-change-session:50e3e30b-267e-4073-b172-b662bb9b56d0`
- **Parent ADR:** `adr-webgl-3a-graph-exploration` (ADR-0024)
- **Status:** Implemented and locally verified; session closed `CONVERGED`.

## Problem

The 3A graph workspace renders a bounded semantic graph with a continuous ForceAtlas2 supervisor, but its edges are monochrome slate, there is no way to hide relationship types in place, no spatial overview when zoomed into dense regions, and no way to share or restore a workspace view beyond copying the URL manually.

## Design

1. **Relation-code palette (`architecture-graph-relations.ts`).** A fixed ten-hue palette tuned for the dark canvas is indexed by FNV-1a hashing of the edge `relationCode`, so colors are deterministic across sessions without persisting a mapping. The module also exposes relation summaries (distinct codes with counts, capped at 8) and a pure toggle helper used by both the legend and tests.
2. **Relation legend + per-type filtering (`architecture-graph-legend.tsx`).** The workspace summarizes `relationCode`s from the loaded snapshot and renders a collapsible bottom-left overlay. Each row shows the palette chip, mono code, and count; clicking toggles membership in a hidden-codes set passed down to the renderer. The Sigma edge reducer drops matching edges (`hidden: true`) before emphasis logic runs, so selection/neighborhood emphasis cannot resurface filtered edges.
3. **Canvas minimap (`architecture-graph-minimap.tsx`).** Pure helpers compute the live bounding box of node positions and map Sigma's normalized camera state `{x, y, ratio}` to a viewport rectangle. The component redraws at ~6.7 Hz on a 168×112 canvas: layer-colored dots (BIZ amber, SYS blue, TECH emerald) plus the stroked camera rect. Pointer down/move navigates via `camera.animate({x, y})` with clamped normalized coordinates. The draw path no-ops safely where `getContext("2d")` is unavailable.
4. **View actions (`architecture-view-actions.tsx`).** Share copies `window.location.href` to the clipboard with a 2 s "copied" state (prompt fallback). Save stores `{id, label, search}` entries under localStorage key `specforge.threeA.savedViews.v1`: deduplicated by query string, capped at 12, tolerant of corrupt or absent storage. Saved rows apply via `/architecture/3a?<search>` navigation and can be deleted. Reset links to a URL that restores default overview/force state while preserving scope, tab, baseline, and projection parameters.

## Non-goals

- No server-side filter pushdown: relation filtering is visual only and does not change overview/trace queries or budgets.
- No persisted server-side views: saved views remain local to the browser profile.
- No minimap for the fallback list renderer; the minimap mounts only inside the Sigma canvas container.

## Constraints honored

- Exact-Scope behavior unchanged; all graph data remains the bounded in-memory Graphology snapshot merged from PostgreSQL-backed providers.
- `prefers-reduced-motion` still suppresses layout animation; the minimap is informational and does not animate nodes.
- Bilingual labels ship through i18n keys (`threeA.legendTitle`, `threeA.relationFilterAria`, `threeA.minimapLabel`, `threeA.shareView`, `threeA.linkCopied`, `threeA.saveView`, `threeA.savedViews`, `threeA.resetView`, `threeA.noSavedViews`) in both `messages.zh` and `messages.en`.

## Evidence

- `pnpm exec tsc --noEmit -p apps/web` → exit 0.
- Focused 3A suite in `apps/web` (`sigma-architecture-graph`, `architecture-graph-relations`, `architecture-graph-minimap`, `architecture-graph-legend`, `architecture-view-actions`, `architecture-graph-renderer`, `architecture-graph-workspace`): 7 files, 37 tests, all passing.
- Full web suite: 45 files, 198 tests, all passing (includes the previously failing `derived-routes` cases now aligned in commit `2ffe6e0`).
- `$env:SPECFORGE_NEXT_STANDALONE='0'; pnpm build` in `apps/web` → exit 0, emits `/architecture/3a`. Standalone packaging remains blocked by the documented Windows/OneDrive symlink `EPERM`.
- MCP record completion: `upsert_proposal` / `upsert_context_pack` wrote increment content (EN+ZH) in the exact Designer Scope; Prisma read-back verified 3 spec changes and 2 instructions per locale.
