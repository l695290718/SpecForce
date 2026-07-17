# Design Evidence Assets Design

## Goal

Make verification evidence a first-class, queryable SpecForge design fact instead of leaving it only in repository ADR prose and the baseline manifest.

## Scope

Each baseline design decision owns one or more Evidence assets. An Evidence asset records one exact verification command, its recorded result, a status, and the ADR it validates. Evidence is authored through MCP, isolated to the ADR's application-service scope, and is subject to the same English-canonical and Chinese-overlay policy as other human-facing design facts.

This change does not add Web editing, execute arbitrary commands, change the product architecture hierarchy, or alter graph-projection runtimes.

## Data Model

Add `evidence` to the canonical `AssetType` registry and define an `Evidence` asset with these canonical fields:

- `id`, `name`, `description`, `createdAt`, `updatedAt`, `architectureScope`
- `decisionId`: the logical ADR ID that owns the evidence
- `command`: exact command that produced the evidence
- `result`: recorded concise outcome
- `status`: `passed`, `failed`, or `blocked`
- `recordedAt`: ISO timestamp supplied by the synchronization process

`name`, `description`, and `result` are English canonical fields. The Chinese overlay supplies translated `name`, `description`, and `result`. The synchronization workflow must reject an incomplete localized Evidence payload.

## MCP Contract And Relationships

Expose an MCP write tool for upserting Evidence using an explicit `architectureScope`; no implicit scope resolution is allowed. Expose Evidence through existing scoped asset detail/list/graph reads after registering the type in the shared registry.

For every manifest evidence entry, synchronization will upsert a deterministic Evidence ID and create exactly one typed edge:

`Evidence --VALIDATES--> ADR`

The edge must be directional and created in the same application-service scope as both records.

## Synchronization And Reconciliation

`pnpm design-facts:sync` converts every manifest evidence entry to an Evidence asset and writes it through the MCP process after the ADR, Proposal, Context Pack, and existing links are synchronized.

`pnpm design-facts:check` reads each Evidence asset and the scoped graph through MCP. It fails closed when any expected evidence is missing, has a different command/result/status, lacks a Chinese overlay, belongs to another scope, or lacks its `VALIDATES` edge to the owning ADR. A decision enters `verified` only after its ADR, Proposal, Context Pack, existing governance links, and all declared Evidence records are valid.

## Error Handling

An MCP write error stops synchronization and identifies the owning decision. A failed verification command may be recorded as Evidence with `status: failed`, but reconciliation will treat it as blocking completion. An unknown asset type, missing scope, or incomplete localization is rejected before persistence.

## Tests

Tests start at the shared registry and MCP contract boundary, then cover synchronization payloads and reconciliation failures for missing Evidence, mismatched contents, wrong scope, absent Chinese overlay, failed status, and missing `VALIDATES` relations. Existing asset and relationship tests must remain green.

## Completion Criteria

`pnpm design-facts:sync` persists Evidence assets and `VALIDATES` links through MCP. `pnpm design-facts:check` reports no missing, mismatched, out-of-scope, blocked, or failed evidence entries for the baseline manifest.
