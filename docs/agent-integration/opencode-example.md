# OpenCode Legacy Baseline Example

Configure the SpecForge MCP server in OpenCode, authorize the target application-service Scope, and provide the governed `sessionId`. The model provider is an OpenCode concern; SpecForge accepts the same provider-neutral candidate contract regardless of provider.

Recommended task instruction:

```text
Analyze only observations accepted by the provided SpecForge KnowledgeScanSession.
Return evidence-backed semantic candidates using canonical English plus localizedContent.zh.
Use submit_semantic_candidate_batch in contiguous batches of no more than 100 candidates.
Retain each acceptedSequence and acceptedBatchDigest. Retry only byte-equivalent content after an uncertain response.
Mark only the last batch complete, then call assemble_knowledge_review_bundle.
Do not approve the bundle and do not invoke promotion or Baseline publication.
```

Operational sequence:

1. Confirm the physical scan is finalized and the Session is `READY_FOR_ANALYSIS`.
2. Read the accepted local observation spool and keep only IDs acknowledged by the Session.
3. Build candidate batches with explicit evidence and identity decisions.
4. Submit sequence `0`; use its digest as `previousBatchDigest` for sequence `1`.
5. Repeat until the final `complete: true` receipt is accepted.
6. Assemble the ReviewBundle and hand it to the required independent or human reviewer.

## 中文说明

OpenCode 使用与 Claude Code 相同的 provider-neutral 协议。模型供应商由 OpenCode 配置，SpecForge 不绑定供应商。执行时必须限定到已授权 Session 的观察，保留服务端返回的序号和摘要，严格连续提交；最后只组装 ReviewBundle，并交给独立审批者或人类审批者处理。
