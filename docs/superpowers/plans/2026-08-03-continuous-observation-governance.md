# Continuous Observation Governance Implementation Plan

## Goal

Deliver the first Phase 3 increment: a resumable, exact-Scope, provider-neutral MCP receiving boundary for continuous observations without promoting observations into authoritative design facts.

## Scope

- Owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- PostgreSQL remains authoritative for observation batches, cursors, SourceObservations, and federation outbox events.
- The graph store, concrete external adapters, automatic promotion, outbound Proposals, and external `APPLY` remain out of scope.

## Delivery Steps

- [x] Define the `continuous-observation/v1` batch contract, digest, sequence, and budget rules.
- [x] Add exact-Scope PostgreSQL cursor and batch receipt models plus migration.
- [x] Persist accepted observations, receipts, cursor advancement, and outbox notification atomically.
- [x] Add MCP submit and read-only cursor tools with exact authorization and audit handling.
- [x] Add focused contract and tool registration tests.
- [x] Synchronize the ADR, Proposal, Context Pack, Evidence, and typed links through MCP.
- [x] Run focused verification, schema sync, Web smoke, and design-fact read-back.
- [x] Commit and push the implementation and matching design facts together.

## Acceptance Criteria

1. A first batch starts at sequence `0` with a null previous digest.
2. A later batch requires the immediate next sequence and the last accepted digest.
3. Identical sequence retries are idempotent; conflicting reuse fails closed.
4. Every write is exact-Scope and requires an active `OBSERVE` connector.
5. Observation, receipt, cursor, and outbox are committed in one PostgreSQL transaction.
6. Accepted observations remain `CANDIDATE` and cannot activate or replace a Baseline.
7. The cursor is readable by authorized Agents without granting write permission.
8. The MCP record is bilingual, linked, read back, and free of out-of-scope or blocked facts.

## Deferred Follow-up

Concrete database, API gateway, CMDB, and runtime adapters; live polling/webhook workers; candidate promotion automation; outbound Proposals; external `APPLY`; graph projection lag SLOs; and billion-scale certification require separate designs and evidence.

## Evidence Policy

Record exact commands and results in ADR-0020 and the MCP Evidence record. Any failed schema check, focused test, MCP write, read-back, or Scope reconciliation blocks completion.
