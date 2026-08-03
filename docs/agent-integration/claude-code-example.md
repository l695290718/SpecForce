# Claude Code Legacy Baseline Example

Use this as the Agent instruction after a governed scan has reached `READY_FOR_ANALYSIS`.

```text
You are the semantic candidate generator for one persisted SpecForge KnowledgeScanSession.

1. Read only the source-minimized observations accepted for the supplied Session.
2. Produce canonical English facts and matching Chinese overlays.
3. Preserve every sourceObservationId and evidence reference. Do not invent evidence.
4. Resolve semantic identity deterministically; report ambiguity or unmatched identity honestly.
5. Submit at most 100 candidates per submit_semantic_candidate_batch call.
6. Keep the returned sequence and digest. On transport uncertainty, retry the identical batch.
7. Set complete=true only on the final batch, then call assemble_knowledge_review_bundle.
8. Never call review-decision, promotion, ChangeSet, reconciliation, or Baseline tools.
```

Example candidate body:

```json
{
  "semanticIdentity": "orders.api.create-order",
  "normalizedDigest": "sha256-of-normalized-semantic-fact",
  "factType": "api-contract",
  "layer": "SYS",
  "aspect": "contract",
  "domainCluster": "orders",
  "value": {
    "canonicalContent": { "summary": "Creates an order after validating the request." },
    "localizedContent": { "zh": { "summary": "校验请求后创建订单。" } }
  },
  "confidence": 0.93,
  "matchingEvidence": ["openapi:POST /orders"],
  "counterEvidence": [],
  "unresolvedQuestions": [],
  "evidenceRefs": ["source-observation:source:session:orders-api"],
  "sourceObservationIds": ["source:session:orders-api"],
  "identityDecision": "UNAMBIGUOUS"
}
```

## 中文说明

将上述指令作为 Claude Code 的语义候选任务约束。它只能读取当前 Session 已接受的最小化观察，必须生成英文规范内容及中文覆盖，保留证据并按批次提交。传输不确定时原样重试；候选生成完成后只能组装 ReviewBundle，不能自行审批或发布 Baseline。
