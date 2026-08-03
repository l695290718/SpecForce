# Legacy Baseline Agent Protocol

**Status:** Phase 1 production protocol for provider-neutral semantic candidates. English is canonical; the Chinese section is the localized operational view.

## Boundary

The local signed Scanner produces source-minimized observations. An authorized Agent such as Claude Code or OpenCode may interpret only the observations accepted by the persisted `KnowledgeScanSession`. The Agent never receives database credentials and cannot choose the owning Scope: the server derives Scope, actor, connector, DesignChangeSession, and Scanner Release from the Scan Session.

`generate_knowledge_candidates` is retained for compatibility tests only. Production Agents use:

1. `submit_semantic_candidate_batch`
2. `assemble_knowledge_review_bundle`
3. a different authorized reviewer for T1, or an authenticated human reviewer for T2/T3

The generating Agent must not call `decide_knowledge_review_bundle`, promotion, ChangeSet, reconciliation, or Baseline publication tools.

## Candidate Contract

Each candidate carries:

- stable `semanticIdentity` and Agent-computed `normalizedDigest`;
- `factType`, 3A `layer`, `aspect`, and `domainCluster`;
- canonical English content in `value.canonicalContent`;
- the corresponding Chinese overlay in `value.localizedContent.zh`;
- confidence, matching evidence, counter-evidence, and unresolved questions;
- persisted `sourceObservationIds` and explicit `evidenceRefs`;
- one deterministic identity result: `UNMATCHED`, `UNAMBIGUOUS`, or `AMBIGUOUS`.

The server binds `generatedByActorId`, computes candidate IDs, computes T0-T3 risk, and records Agent/model/tool/run provenance. A client-supplied risk or actor identity is never accepted.

## Batching And Recovery

- Maximum 100 candidates and 1 MiB of canonical JSON per batch.
- Sequence starts at `0` and is contiguous.
- Every batch after sequence `0` supplies the previous accepted batch digest.
- `complete` is `true` only on the final semantic batch.
- Keep the returned `acceptedSequence` and `acceptedBatchDigest` as the local semantic checkpoint.
- If a response is lost, retry the exact same batch. The server returns the stored receipt with `idempotent: true`.
- Never reuse a sequence with changed content. The server rejects it as an idempotency conflict.
- Do not assemble a ReviewBundle until the final batch has been accepted.

## Review Policy

Risk is determined per candidate and the bundle uses the maximum tier:

- `T0`: high-confidence, unambiguous, complete documentation-only facts. Eligible for automatic acceptance policy.
- `T1`: ordinary contracts, models, rules, states, relationships, decisions, or uncertain low-risk facts. A different actor must review.
- `T2`: breaking or materially incompatible facts. An authenticated human must review.
- `T3`: security, authorization, privacy, or compliance facts. An authenticated human must review.

Approval is blocked when coverage is incomplete, evidence is missing, English or Chinese content is absent, unresolved questions remain, or identity is missing/ambiguous/unmatched. Current agent-only local authentication therefore fails closed for T2/T3; production identity integration must supply an authenticated `user` actor.

## Failure Rules

- Stop on Scope, Session actor, Session state, observation ownership, chain, or idempotency errors.
- Do not alter candidate identity or evidence merely to bypass a blocker.
- Record unresolved semantics as questions and allow the ReviewBundle to remain blocked.
- Never infer cross-application-service facts from an authorized single-service Session.

## 中文操作说明

本协议用于第一阶段的生产级存量语义候选提交。签名扫描器只生成源码最小化观察；Claude Code、OpenCode 等 Agent 只能解释已被 `KnowledgeScanSession` 接受的观察。Scope、执行者、连接器、设计变更会话和扫描器版本均由服务端从 Session 派生，Agent 不得自行指定。

每个候选必须包含英文规范内容 `value.canonicalContent`、中文覆盖 `value.localizedContent.zh`、证据、来源观察、置信度、领域簇和身份判断。服务端负责绑定生成者、生成稳定 ID、计算 T0-T3 风险并记录来源。每批最多 100 个候选、1 MiB；批次从 0 连续递增，后续批次携带上一批摘要，最后一批才设置 `complete: true`。响应丢失时必须原样重试，禁止用同一序号提交不同内容。

T1 必须由不同执行者审批，T2/T3 必须由已认证的人类审批。覆盖不完整、缺少证据、缺少中英文、存在未决问题或身份不明确都会阻止审批。生成候选的 Agent 不得调用审批、提升、ChangeSet、对账或 Baseline 发布工具。
