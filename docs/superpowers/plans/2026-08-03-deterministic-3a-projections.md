# Deterministic 3A Knowledge Projections Implementation Plan

## Goal

Deliver the first production-safe Phase 2 increment: reproducible BIZ/SYS/TECH projections, explicit cross-layer alignment, Baseline-pinned drift comparison, and a deterministic Context Pack without creating new authoritative facts.

## Scope

- Owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for Baselines, assertions, assets, relationships, and manifests.
- This increment is read/derive only after Baseline publication. MCP remains the write boundary for the matching Proposal, ADR, Context Pack, Evidence, and typed links.
- NebulaGraph, live connectors, cross-Scope comparison, and AI-authored facts are out of scope.

## Delivery Steps

- [x] Define deterministic core projection types, Scope checks, Baseline binding, stable ordering, and content digests.
- [x] Implement BIZ/SYS/TECH layer projection, cross-layer alignment, drift comparison, and pinned Context Pack generation.
- [x] Add focused core tests for reproducibility, drift classification, Scope isolation, and missing sources.
- [x] Add exact-Scope MCP read/derive operation and projection-manifest closure.
- [x] Add matching bilingual Proposal, Context Pack, Evidence, typed links, and update the design-fact manifest.
- [x] Run focused tests, typecheck, Web smoke, MCP synchronization, read-back, and exact-Scope reconciliation.
- [ ] Commit implementation and synchronized design facts together, then push `main`.

## Acceptance Criteria

1. Unpublished or incomplete Baselines cannot produce a projection.
2. Sibling Scope assertions and relationships fail closed.
3. A repeated run with the same Baseline/Profile/input produces the same digest and markdown.
4. Projection output contains no write side effect and cannot replace a Baseline.
5. Cross-layer alignment is derived only from explicit typed relationships.
6. Drift compares the latest accepted assertion per semantic identity and preserves added, removed, changed, and unchanged states.
7. MCP read-back proves the manifest, Proposal, Context Pack, Evidence, and links belong to the exact owning Scope.

## Evidence Policy

Record exact commands and results in ADR-0019 and the MCP Evidence record. A failed test, MCP write, read-back, or Scope reconciliation blocks completion.
