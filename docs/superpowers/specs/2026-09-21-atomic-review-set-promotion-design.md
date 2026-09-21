# Atomic Review-Set Promotion for Complete Scan Baselines

## Status

Accepted as the next implementation design after the full-asset semantic governance increment. The design is owned by `com.specforge.designcenter` and is bound to the exact Scope `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.

## Problem

Large repository scans are partitioned into risk- and domain-homogeneous Review Bundles so that review work can run in bounded units. The current promotion API accepts one PromotionDecision at a time and creates one ChangeSet per decision. Publishing after each partition would produce an incomplete Baseline and would make the visible system appear to contain only the reviewed subset. Candidate authoring therefore must remain blocked until all approved partitions can be promoted as one complete snapshot.

## Decision

Add an aggregate review-set boundary between ReviewBundle decisions and canonical promotion. An aggregate promotion request references the exact scan session, design-change session, Working Stream, and the complete set of expected ReviewBundle IDs. The server loads every bundle and decision inside one transaction and rejects the request unless:

1. every bundle belongs to the exact Scope and same design-change session;
2. every expected bundle is present exactly once and is approved;
3. every approved assertion and identity candidate is included exactly once;
4. the union of approved source observations covers the finalized scan session according to the session coverage policy;
5. all candidates satisfy the server-owned risk, bilingual, identity, evidence, and policy-digest checks; and
6. the aggregate has not already been promoted with a different input digest.

After validation, the transaction materializes all canonical assets, typed relationships, Evidence assets, relationship outbox rows, and one cumulative ChangeSet. It writes one aggregate PromotionReceipt containing the sorted bundle IDs, decision IDs, assertion IDs, identity IDs, source observation IDs, and aggregate digest. Repeating the same request returns the same receipt; any changed set fails with an idempotency conflict.

The existing single-bundle promotion path remains available only for explicitly complete, non-partitioned workflows. It must reject a bundle marked as part of an aggregate review set rather than silently creating a partial Baseline.

## Contract Shape

The new MCP operation is `promote_knowledge_review_set`:

```text
architectureScope
reviewSetId
scanSessionId
designChangeSessionId
streamId
expectedReviewBundleIds[]
promotionDecisionIds[]
evidenceRefs[]
```

The server derives the approved assertion and identity sets from the persisted decisions. Callers cannot supply a partial approved set or override the persisted Scope. The result is an aggregate `KnowledgePromotionReceipt` with `reviewSetId`, `reviewBundleIds`, `promotionDecisionIds`, `coverage`, `sourceObservationIds`, and the single ChangeSet identity.

## Data Flow

```text
finalized Scan Session
        |
paginated semantic candidates
        |
risk/domain Review Bundles
        |
independent Promotion Decisions
        |
aggregate review-set closure
        |
one PostgreSQL transaction
        |
canonical assets + typed links + Evidence + outboxes + one ChangeSet
        |
reconciliation receipt
        |
complete Baseline publication
```

The aggregate closure is not a new source of truth. PostgreSQL remains authoritative for candidate, decision, asset, relationship, ChangeSet, reconciliation, and Baseline records. Graph stores remain derived projections. The aggregate digest binds the exact Scope, scan finalization digest, policy receipt digests, ordered bundle/decision IDs, approved assertion and identity IDs, source observation IDs, and evidence references.

## Failure and Recovery

- Missing, duplicate, rejected, stale, cross-Scope, cross-session, or partially approved bundles fail with a deterministic blocker and produce no canonical writes.
- A source coverage gap blocks aggregate promotion even when every present bundle is approved.
- A transaction or relationship-outbox failure rolls back the complete aggregate; the previous active Baseline remains unchanged.
- Retries with the same aggregate digest return the original receipt. Retries with a changed bundle, decision, evidence, or coverage set fail closed.
- A new scan or changed policy digest requires a new review set and cannot reuse an old aggregate decision.
- Partial Baseline publication is forbidden. Reconciliation and publication accept only the aggregate ChangeSet and its converged receipt.

## Verification

Focused tests must cover exact Scope and session binding, complete coverage, missing and duplicate partitions, T1-T3 reviewer rules, bilingual and evidence closure, idempotent retry, changed-input conflict, atomic rollback, relationship outbox rollback, one ChangeSet sequence, one reconciliation receipt, and complete Baseline source IDs. The MCP routing test must expose the new operation and preserve the existing single-bundle compatibility behavior.

The implementation must close design session `design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de` only after focused checks, exact-Scope MCP synchronization, reconciliation read-back, and evidence for the no-partial-Baseline invariant.

## Deferred

Continuous inbound synchronization, automatic semantic approval, external CodeHub enforcement, and graph-store publication are outside this increment. They may consume the aggregate receipt later but cannot bypass it.

## 中文本地化

### 原子审查集晋升与完整扫描 Baseline

大型代码仓扫描按风险和领域拆成同质 Review Bundle，使审核可以在有界单元中并行执行。当前晋升 API 每次只接收一个 PromotionDecision，并按决策创建一个 ChangeSet。如果每个分区审核后立即发布，就会得到不完整的 Baseline，用户会误以为系统只包含已审核的子集。因此，在全部批准分区能够作为一个完整快照晋升前，候选编写必须保持阻塞。

增加位于 Review Bundle 决策和正式晋升之间的聚合审查集边界。聚合请求必须绑定精确 Scope、同一个扫描会话、同一个设计变更会话、同一个 Working Stream 以及完整的预期 Review Bundle 集合。服务端在一个事务中加载全部 Bundle 和 Decision，并校验分区完整、审批完整、候选和身份无重复、源观察覆盖完整、风险/双语/证据/策略摘要均通过，以及幂等摘要一致。

校验通过后，在一个 PostgreSQL 事务中写入全部正式资产、有类型关系、Evidence、关系 Outbox 和一个完整 ChangeSet，并生成一个包含分区、决策、候选、身份、源观察和聚合摘要的 PromotionReceipt。重复相同请求返回原回执；任何集合变化都失败关闭。旧的单 Bundle 晋升路径仅保留给明确的非分区完整工作流，不得静默产生部分 Baseline。

持续入站同步、自动语义审批、CodeHub 门禁和图数据库发布不属于本增量，后续只能消费聚合回执，不能绕过它。
