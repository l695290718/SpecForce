# Governed Cross-Scope Integration Atlas Design

## Purpose

Define a production-safe V1 for cross-application integration facts and a read-only Atlas without weakening SpecForge's exact-Scope authoring and authorization boundaries.

## Scope

The increment will introduce consumer-owned integration contracts, target identity and resolution state, authorization-projected aggregation, a bounded cursor query, and a semantic integrations surface with a bounded Atlas canvas.

It will not introduce provider-side acknowledgement, dual registration, automated reconciliation, scanner ingestion, external APPLY, or production-scale certification.

## Design

1. A consumer owns exactly one contract for a call. Its stable identity combines consumer Scope, target binding, protocol, and protocol-specific locator.
2. A target is either a resolved SpecForge asset (provider Scope, asset type, stable ID, revision/compatibility label) or an explicit external target. Legacy facts remain unresolved until evidence is supplied.
3. Every consumer Scope has an independent MCP design-change session. The Designer Scope ADR session cannot authorize writes to integrationgateway, specstudio, or policyhub.
4. Atlas reads only consumer contracts in readable scopes. Provider details are enriched only when their Scope and target asset are readable; otherwise the result is a deterministic restricted node.
5. Atlas is a bounded projection, never the authoritative inventory: stable ordering, opaque scope-bound cursor, 50-scope / 500-contract / 100-node / 200-edge / 512-KiB / two-second limits, explicit coverage and partial reasons.
6. The semantic list is paginated and complete within its cursor traversal. The canvas clearly signals partial results, restricted targets, unresolved targets, and unavailable projection states.

## Governance Sequence

1. Register ADR-0039 in the exact Designer Scope through `design-facts:sync` and prove read-back.
2. Open a new exact-Scope preflight for the schema/API work and one per consumer Scope for any authored seed facts.
3. Implement migrations, MCP validation, query behavior, list/canvas UI, and focused tests.
4. Write affected assets, links, proposal/context updates, and evidence through MCP in their owning Scope.
5. Close each session only after reconciliation and evidence prove convergence.

## Acceptance Criteria

- A consumer contract cannot be created without stable identity and protocol locator.
- A resolved target must name a permitted, existing target asset and revision/compatibility label.
- A viewer without provider access cannot infer provider identity or asset details from Atlas.
- Empty, partial, restricted, unresolved, and unavailable are distinct response/UI states.
- Query limits and cursor continuation are deterministic and tested.
- Repository ADR, MCP ADR, Proposal, Context Pack, typed links, and evidence converge in the exact owning Scope.
