# Design Fact Governance

## Purpose

SpecForge is both a codebase and the design system it exposes to people and agents. A change is complete only when its decision, contract, ownership, scope, relationships, operational consequences, and verification evidence are discoverable in both places.

## Decision

Adopt a dual-record design-fact policy.

- Git is the reviewable, immutable engineering record.
- SpecForge, written through its MCP boundary, is the queryable operational design record.
- English fields are canonical. Chinese localized overlays are required for human-facing decision content.
- An implementation is not complete while either record is missing, inconsistent, or explicitly marked pending.

## Fact Model

Every non-trivial change is classified before completion.

| Fact class | Required record |
| --- | --- |
| Architecture boundary, storage choice, runtime topology, consistency model, security/isolation policy, protocol, or compatibility policy | ADR with alternatives, consequences, constraints, and verification evidence |
| New or changed asset, contract, rule, state transition, API, event, data model, or relationship | Canonical design asset, bilingual human-facing content, and typed links |
| User-visible or workflow-level outcome | Proposal linked to its implementing assets and ADRs |
| Agent-facing change | Context Pack update or a linked Context Pack generation requirement |
| Deferred, rejected, or externally blocked work | Backlog fact with owner, trigger, and rationale; never an unrecorded omission |

## Required ADR Content

Each ADR must have a stable ID, English title/context/decision, Chinese localization, status, alternatives, consequences, constraints, related assets, source scope, and verification evidence. ADRs describe the reason for a decision, not a restatement of changed files.

The repository ADR record lives under `docs/adr/`. The corresponding MCP ADR uses the same stable ID and belongs to the exact application-service scope that owns the decision. Cross-scope decisions are represented by a dedicated platform scope and explicit typed links; they are not duplicated as unrelated local decisions.

## Completion Workflow

1. Classify the change and identify its owning architecture scope.
2. Update or create repository ADRs, proposals, contract documents, and Context Pack inputs.
3. Use MCP write tools to persist the matching bilingual assets, links, and backlog facts in SpecForge.
4. Verify IDs, scope, canonical English fields, localized fields, and relationship targets match the repository records.
5. Run focused tests or operational checks and attach the evidence to the ADR/Proposal records.
6. Commit implementation and all accompanying design facts together.

If MCP persistence is unavailable, the change remains incomplete. The repository record must state `MCP synchronization blocked`, include the failure reason and retry trigger, and the work must be represented as a tracked backlog fact. It must not be presented as fully delivered.

## Existing-Fact Baseline

The baseline inventory is complete only when it covers these decisions and their supporting assets:

1. Huawei product family, product, sub-product, module, and application-service hierarchy; exact scope authorization; agent workspace isolation.
2. MCP-first write boundary, scoped read behavior, auditability, and future cross-service read authorization.
3. English-canonical bilingual design assets and localized human-facing views.
4. PostgreSQL as transactional authority for assets, relationships, outbox, checkpoints, and audit records.
5. NebulaGraph as the normal graph traversal runtime, Go gateway ownership of the official client, explicit PostgreSQL compatibility fallback, and local Docker topology.
6. Transactional outbox projection, projector lease/retry behavior, scope-safe graph storage, graph checkpoints, and evidence-preserving impact analysis.
7. Governance validation, proposal lifecycle, ADR lifecycle, Context Pack generation, and deferred enterprise graph operations work.

Each baseline fact must be represented by an ADR when it is an architectural decision, by a Proposal when it describes delivered product behavior, by concrete design assets for its contracts, and by typed relationships that allow impact analysis to trace it.

## Consistency Rules

- A scope may expose only facts owned by that exact enterprise, application service, and scope path, except for an explicitly authorized future cross-service view.
- IDs are stable across repository and MCP records.
- Asset relationships are directional, typed, and scope-safe.
- Graph projections are derived from PostgreSQL relationship events; NebulaGraph is not an independent authoring source.
- Documentation must distinguish implemented behavior, verified local behavior, and deferred production capability.

## Acceptance Criteria

The policy is complete when a project-level `AGENTS.md` enforces it; repository ADRs and design documents exist for all baseline decisions; equivalent bilingual MCP assets and relationships are present; deferred work is visible as backlog facts; and a reconciliation command or test can report missing, mismatched, or out-of-scope facts.
