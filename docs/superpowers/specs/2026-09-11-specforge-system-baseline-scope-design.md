# SpecForge System Baseline Scope Design

**Status:** Approved for implementation planning  
**Date:** 2026-09-11  
**Owning Scope:** `com.specforge.designcenter`

## 1. Decision

SpecForge's own product knowledge will live in a dedicated, product-neutral application-service Scope:

- **Application service ID:** `com.specforge.designcenter`
- **Canonical Scope path:** `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`
- **Role:** built-in system baseline for SpecForge Design Center

The baseline Scope is separate from every enterprise application-service Scope. It is not a Huawei business application, and it must not be used as a fallback for missing user data.

## 2. Scope Boundary

The baseline Scope contains SpecForge's own authored design facts: architecture and 3A mappings, ADRs, Proposals, Context Packs, APIs, events, data models, rules, state transitions, relationships, backlog facts, and their verification evidence.

Enterprise application-service data remains owned by its exact application-service Scope. Read operations, dashboard counts, graph queries, permissions, and impact analysis must receive an explicit Scope and must not merge baseline data with enterprise data implicitly.

The baseline Scope may be selected explicitly in the UI and may be used as the default only when no enterprise Scope is selected. That defaulting behavior does not grant access to any other Scope.

## 3. Migration Strategy

Migration is a governed, MCP-mediated operation:

1. Run design preflight in the source Scope and record the migration session.
2. Register or provision `com.specforge.designcenter` with its canonical Scope path.
3. Read the source catalog through the bounded system-knowledge read path.
4. Copy authored assets into the target Scope using stable logical IDs where the target namespace is available; otherwise create a deterministic source-to-target ID map.
5. Recreate every in-scope typed relationship against target node IDs and preserve direction, relation type, source, and evidence.
6. Copy localized human-facing fields with English as canonical and complete Chinese overlays.
7. Mark the migration batch with source Scope, target Scope, counts, digest, and idempotency key.
8. Reconcile target and source counts, relationship endpoints, permissions, and dashboard/graph query isolation.
9. Switch the repository and deployment seed configuration to the target Scope.
10. Keep the source Scope read-only and archived until the verification window closes; do not delete it as part of the first migration.

PostgreSQL remains authoritative for authored assets and relationship events. Any graph representation is rebuilt as a derived projection after target reconciliation and is never the migration source of truth.

## 4. Bootstrap and Repeatability

The target Scope is shipped as a versioned, idempotent system-baseline seed. Re-running deployment must converge on the same asset and relationship digests without duplicating records. The seed must fail closed if the target Scope path is already owned by a different application service.

Seed metadata must include:

- baseline version;
- target application-service ID and canonical path;
- source migration batch ID, when generated from existing data;
- asset and relationship counts;
- content digest;
- English/Chinese localization coverage;
- verification commands and results.

## 5. Failure and Rollback

No source data is deleted during the first migration. If target creation, MCP persistence, relationship rewriting, localization validation, or reconciliation fails, the migration is marked blocked with the failure reason and retry trigger, and the old Scope remains the active source.

The cutover is a configuration change performed only after target reconciliation succeeds. Rollback points the configuration back to the old Scope and leaves the target batch isolated for diagnosis. A later cleanup is a separate change requiring its own preflight and evidence.

## 6. Verification Requirements

The implementation is complete only when all of the following are evidenced:

- the target Scope exists with the exact ID and canonical path;
- the source and target asset inventories reconcile according to the migration policy;
- every migrated relationship endpoint resolves inside the target Scope or is intentionally classified as an allowed external reference;
- target permissions deny unauthorized cross-Scope reads;
- dashboard totals and design-asset pages are target-Scope-specific;
- target graph projections render only target-Scope nodes and edges;
- repeated seed execution is idempotent;
- the repository configuration, ADR, Proposal, Context Pack, and MCP records agree on the target ID;
- the source Scope is read-only or archived and has not been silently deleted;
- exact commands, MCP receipts, digests, and results are recorded in the matching design records.

## 7. Non-Goals

This change does not introduce cross-application browsing, multi-Scope aggregation, automatic enterprise-data discovery, external connector synchronization, or source-Scope deletion. Those capabilities require separate designs and governance records.
