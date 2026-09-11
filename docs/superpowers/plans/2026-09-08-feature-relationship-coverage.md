# Feature Relationship Coverage Implementation Plan

> **For agentic workers:** Execute this plan through the exact-Scope MCP write boundary and verify every relationship after the atomic change set.

**Goal:** Close evidenced Feature-to-asset relationship gaps in the Designer application-service Scope without inventing assets or crossing Scope boundaries.

**Architecture:** Read the current `DESIGN_CATALOG_CURATION` snapshot through MCP after readiness evaluation. Build one bounded relationship-only Change Set for existing Features and existing assets, validate ontology, direction, localization, duplicate identity, and exact Scope, then apply atomically through PostgreSQL-backed MCP persistence. Graph and search projections remain derived.

**Tech Stack:** MCP stdio server, `DESIGN_CATALOG_CURATION`, PostgreSQL authoritative store, typed relationship ontology, `pnpm design-context` governance scripts.

## Global Constraints

- The owning Scope is `com.huawei.celon.desiner` at `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- MCP is the only write boundary for ADRs, Proposals, Context Packs, Features, and typed relationships.
- Existing assets only; do not create new Feature or non-Feature assets in this increment.
- Add only relationships supported by current asset evidence and the registered ontology.
- PostgreSQL remains authoritative; graph and search data remain derived projections.
- Preserve English canonical content and complete Chinese overlays; relationships themselves are language-neutral.

---

### Task 1: Read and validate the current scoped relationship catalog

**Files:**
- Read through MCP: `evaluate_system_knowledge_readiness`, `read_system_knowledge`
- Evidence: `.specforge/design-context/<session>.json`

**Interfaces:**
- Consumes: exact application-service Scope and `DESIGN_CATALOG_CURATION` profile.
- Produces: readiness receipt, complete bounded asset set, relationship set, and a list of candidate missing mappings.

- [x] **Step 1: Open an exact-Scope design change session**

Run `pnpm design-context:preflight` with intent `Complete evidenced Feature relationship coverage` and affected facts `adr-first-class-feature-assets,adr-system-knowledge-readiness-gate,data-specforge-asset-graph`.

- [x] **Step 2: Read all bounded pages**

Evaluate readiness first, then read every continuation page using the returned receipt. Keep only records whose `architectureScope` exactly matches the Designer Scope.

- [x] **Step 3: Classify gaps**

Candidate mappings are limited to existing Feature and asset identities: architecture modeling to existing Domain Models, federated discovery to existing Integrations, governed authoring to existing ADR/Proposal/Context Pack assets, and scope governance to existing identity/authorization assets. Reject any candidate without an explicit evidence path or ontology relation.

### Task 2: Apply the relationship-only Change Set

**Files:**
- MCP Change Set only: `apply_feature_change_set`
- No repository source files or authored asset payloads

**Interfaces:**
- Consumes: Task 1 receipt, exact asset IDs, and validated directional relationship commands.
- Produces: one atomic relationship ledger update, audit record, Outbox event, and derived projection work.

- [x] **Step 1: Dry-run the bounded relationship set**

The full catalog replay was intentionally not used for the increment: `apply_feature_change_set` correctly returned `FEATURE_VERSION_CONFLICT` for an existing Feature asset because the replay plan is an asset upsert, not a relation-only command. The read-back produced no evidence-backed relation delta, so no relation-only Change Set was issued.

- [x] **Step 2: Apply the same validated set atomically**

Not applicable: there was no validated relation delta. Existing unlinked Proposals, Integration, and Context Pack cases remain explicit deferred facts rather than speculative writes.

- [x] **Step 3: Re-read the affected Feature neighborhoods**

The Scope-bound read confirmed 8 Service Features, 23 Functional Features, 461 Feature-linked relationships, complete Domain/ADR coverage, 16 unlinked Proposals without an evidence path, and one Integration with ontology-unsupported direct mapping. No sibling Scope appeared.

### Task 3: Reconcile and close governance

**Files:**
- Modify: `docs/adr/0047-first-class-feature-assets.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Evidence: MCP change-set receipt and exact verification commands

**Interfaces:**
- Consumes: applied Change Set receipt and read-back results.
- Produces: bilingual ADR evidence, synchronized design facts, and a CONVERGED session closure.

- [x] **Step 1: Record exact evidence**

Append the preflight, dry-run, read-back, and explicit no-speculation results to the ADR and manifest; the apply step is recorded as not applicable because no evidence-backed relation delta existed.

- [x] **Step 2: Synchronize canonical design facts through MCP**

Run the scoped design-fact sync and check; require `missing=0`, `mismatched=0`, `outOfScope=0`, and `blocked=0` for the affected decision.

- [x] **Step 3: Close the same design session**

Close the session as `CONVERGED` only when the database read-back and design-fact check both pass. If any candidate remains unproven, record it as a deferred backlog fact instead of creating a speculative relationship.
