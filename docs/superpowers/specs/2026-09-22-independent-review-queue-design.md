# Independent Review Queue Design

## Status

Proposed for the next governed brownfield-scan increment. This design covers read-only review consumption only; it does not approve, promote, reconcile, or publish candidates.

## Goal

Provide an exact-Scope, bounded MCP read path that lets an independent Agent or reviewer inspect persisted semantic ReviewBundles and their candidate evidence without bypassing the existing approval and atomic-promotion gates.

## Scope And Ownership

- Owning application service: `com.specforge.designcenter`.
- Owning Scope path: `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- PostgreSQL remains authoritative for candidates, ReviewBundles, decisions, evidence, and audit events.
- Graph stores remain derived projections and are not used for review authorization or review queue truth.
- The read path accepts only a finalized governed scan session owned by the exact Scope.

## Alternatives

1. **MCP read queue (selected):** one provider-neutral contract for Claude Code, OpenCode, Web, and future reviewers; preserves exact-Scope authorization and cursor semantics at the system boundary.
2. **JSON export:** easy to inspect locally, but duplicates authorization and freshness rules and creates uncontrolled copies of candidate evidence.
3. **Web-only review page:** useful for people, but would force Agents and automation through a second contract and would not solve MCP-native review consumption.

The MCP queue is the foundation. A Web view may consume it later without creating a second source of truth.

## Read Contract

The new read-only MCP operation will accept:

- `architectureScope` with the exact application-service ID and Scope path;
- finalized `scanSessionId`;
- optional signed `cursor`;
- bounded `pageSize`, capped by the server;
- optional `riskTier` and `bundleStatus` filters;
- an explicit projection mode for bundle summaries versus candidate review rows.

Each response will include:

- a server-owned receipt ID and the bound Scope/session identity;
- stable `nextCursor` when more rows remain;
- ReviewBundle ID, risk tier, status, coverage, blocking issues, and evidence references;
- candidate ID, asset family, fact type, semantic identity, confidence, identity decision, unresolved questions, English canonical content, and Chinese localized overlay;
- source observation IDs and bounded evidence metadata, but not unrestricted source payloads;
- a freshness/reconciliation indicator so reviewers can distinguish current data from a stale or blocked queue.

The server derives all returned rows from PostgreSQL under the exact Scope. It never accepts caller-supplied risk, approval, target asset IDs, or promotion status.

## Security And Isolation

- Authorization is checked before any row is returned.
- Scope, session, actor, projection mode, filters, and page size are bound into the signed cursor.
- A cursor from another Scope, session, actor, filter, or projection is rejected.
- Candidate payloads remain candidate-only; the read operation cannot mutate status or create decisions.
- The endpoint must not expose source credentials, internal persistence metadata, or unrestricted repository content.

## Data Flow

1. Reviewer requests readiness and receives the bounded system-knowledge/readiness receipt required by the repository governance policy.
2. Reviewer requests the review queue for the exact Scope and finalized scan session.
3. Server verifies session ownership and finalization, selects ReviewBundles and candidates with keyset pagination, and returns a signed cursor.
4. Reviewer consumes pages, records an independent decision through the existing `decide_knowledge_review_bundle` operation, and supplies reviewer evidence.
5. Only after every required ReviewBundle has a valid decision may the existing `promote_knowledge_review_set` path run.

## Failure Behavior

- Unknown or non-finalized scan session: fail closed with a stable session error.
- Scope mismatch: fail closed without revealing whether the other session or bundle exists.
- Invalid, expired, tampered, or filter-mismatched cursor: return `REVIEW_QUEUE_CURSOR_INVALID`.
- Reconciliation blocked or stale: return the bounded queue with an explicit blocked freshness state; never imply that the candidates are publishable.
- Page-size overflow: reject rather than silently widening the query.

## Verification

Focused tests must prove:

- exact-Scope isolation and actor authorization;
- deterministic ordering and non-overlapping cursor pages;
- cursor binding to session, filters, projection, and page size;
- no raw payload leakage;
- blocked/stale queue behavior;
- read-only behavior with no decision, promotion, relationship, or Baseline writes;
- MCP routing and type-level contract coverage.

The implementation must update ADR-0049, the governed-scan evidence record, the backlog item, and the linked MCP design facts with bilingual human-facing content and exact command evidence.

## Non-Goals

- Automatically resolving semantic identity.
- Approving or rejecting candidates.
- Creating typed relationships from candidate evidence.
- Promoting a partial review set.
- Publishing a Baseline.
- Building a Web UI in this increment.

## 中文说明

本设计为存量扫描候选提供精确 Scope、有界分页、只读且可审计的 MCP 审核队列。它让独立 Agent、Claude Code、OpenCode 和未来 Web 审核界面共享同一个读取契约，但不绕过现有批准、原子提升、对账和发布门禁。PostgreSQL 继续作为权威存储，图数据库只作为派生投影。候选仍然是候选，身份、业务语义和未决问题必须由独立审核者解决；本增量不自动批准、不提升、不发布。
