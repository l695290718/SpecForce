# Legacy Baseline Discovery Operations / 存量系统基线发现运维手册

This runbook operates Phase 1 from a signed native scanner release to an immutable, exact-Scope Baseline v1. PostgreSQL is authoritative. The scanner and Agent never receive database credentials, and graph storage is not on the publication path.

本手册用于运维第一阶段：从签名的原生扫描器发布物生成精确 Scope 的不可变 Baseline v1。PostgreSQL 是权威存储；扫描器和 Agent 均不得获得数据库凭据；图数据库不在发布链路中。

## 1. Preconditions / 前置条件

- The application service and exact `scopePath` already exist. A token may authorize multiple services, but every operation selects exactly one application service and the server derives Scope from the persisted Scan Session.
- The Agent token has `asset:read`, `knowledge:read`, and `knowledge:write`; review/promotion also requires `governance:run`. T2/T3 approval requires a production human identity and cannot be performed by an Agent-only identity.
- The repository has Git identity and a stable commit, or the Session explicitly permits a dirty manifest.
- Operator, scanner, generator, reviewer, and human approver identities are auditable and distinct where policy requires separation.

- 应用服务及其精确 `scopePath` 已预先维护。一个 Token 可授权多个服务，但每次操作只能选择一个应用服务，服务端从持久化 Scan Session 推导 Scope。
- Agent Token 具备 `asset:read`、`knowledge:read`、`knowledge:write`；评审与提升还需 `governance:run`。T2/T3 必须由生产级人类身份审批，纯 Agent 身份不能审批。
- 仓库具有稳定 Git 提交；如需扫描脏工作区，必须由 Session 显式允许。
- 操作员、扫描器、生成者、评审者及人类审批者身份必须可审计，并按风险策略保持职责分离。

## 2. Release Trust Root / 发布信任根

1. Provision an Ed25519 key pair outside the repository. Keep the PKCS#8 private key in an enterprise secret manager or CI secret; distribute only the 32-byte raw public key in Base64.
2. Install a trust store on each scanner host with pre-approved keys, revoked release IDs, and `minimumScannerVersion`. Never learn a key from a downloaded manifest (no TOFU).
3. Build only on the target native runner:

```powershell
$env:SCANNER_RELEASE_PRIVATE_KEY = '<PKCS8 PEM or Base64 DER from secret manager>'
./scripts/build-scanner-release.ps1 -Version 2.0.0 `
  -SigningKeyId corp-scanner-2026-01 `
  -MinimumScannerVersion 2.0.0 `
  -ArtifactBaseUri https://artifacts.example.com/specforge/scanner `
  -ExpiresAt 2027-02-01T00:00:00Z
```

Trust-store example / 信任库示例:

```json
{
  "keys": { "corp-scanner-2026-01": "<Base64 raw Ed25519 public key>" },
  "revokedReleaseIds": [],
  "minimumScannerVersion": "2.0.0"
}
```

The builder rejects cross-compilation, repository-resident private keys, missing key IDs, expired releases, and non-Ed25519 keys. It emits the artifact, `manifest.json`, RFC-8785-compatible unsigned canonical bytes, `release-metadata.json`, and `SHA256SUMS` under `dist/scanner/<version>/<platform>/`.

构建器会拒绝交叉编译、仓库内私钥、缺失 Key ID、已过期发布和非 Ed25519 密钥。输出包含制品、签名清单、RFC 8785 兼容的未签名规范字节、发布元数据和 SHA-256 校验文件。

## 3. Start a Scan Session / 创建扫描会话

The authorized Agent calls MCP `start_knowledge_scan` with the exact `architectureScope`, connector ID, open Design Change Session ID, signed release ID, repository snapshot identity, repository policy, evidence/parser policy, budgets, and expiry. Persist the returned descriptor as a private file. The raw nonce is returned once; the server stores only its digest.

授权 Agent 通过 MCP `start_knowledge_scan` 提交精确 `architectureScope`、连接器 ID、开放的设计变更会话 ID、签名发布 ID、仓库快照、策略、预算和过期时间。返回的描述符必须私密保存；原始 Nonce 仅返回一次，服务端只保存其摘要。

Call `get_scanner_release` for that Session and store the returned `manifest.json`. Do not substitute a manifest from another Session or Scope.

## 4. Run the Scanner and Resume / 执行与断点续传

```powershell
specforge scan --release .specforge/session/manifest.json `
  --session .specforge/session/session.json `
  --trust C:\ProgramData\SpecForge\scanner-trust.json

specforge scan status --session .specforge/session/session.json
```

The default spool is `.specforge/scan-spool`. Restrict it to the current user (`0700` directory and `0600` files on POSIX; private user ACL on Windows). It contains source-minimized, hash-chained batches, checkpoint state, and finalization data. Do not sync it to source control or shared drives.

默认 Spool 位于 `.specforge/scan-spool`，必须仅当前用户可访问。它包含最小化证据、哈希链批次、Checkpoint 和 Finalization；禁止提交 Git 或同步到共享盘。

The Agent compares local status with MCP `get_scan_checkpoint`, then submits only the next expected batch through `submit_scan_batch`. Identical retries are idempotent. A sequence conflict, digest-chain gap, Session expiry, Scope mismatch, or repository mutation stops transport. After all batches, call `finalize_knowledge_scan` with the exact spooled finalization record.

Agent 将本地状态与 MCP `get_scan_checkpoint` 比对，只通过 `submit_scan_batch` 发送服务端期望的下一批。相同重试是幂等的；序号冲突、摘要链断裂、Session 过期、Scope 不匹配或仓库变化都会中止。全部批次完成后，用 Spool 中的精确 Finalization 调用 `finalize_knowledge_scan`。

## 5. Agent Semantic Flow / Agent 语义流程

1. Read finalized observations and coverage through authorized exact-Scope MCP tools.
2. Use Claude Code, OpenCode, or another enterprise Agent to infer bounded semantic candidates. Keep English canonical fields mandatory and provide complete Chinese overlays for human-facing content.
3. Submit at most 100 candidates per hash-chained batch with `submit_semantic_candidate_batch`; mark only the last batch `complete=true`.
4. Call `assemble_knowledge_review_bundle`. Caller-supplied risk is ignored; the server computes candidate risk and bundle maximum.
5. Resolve all missing evidence, incomplete coverage, bilingual fields, and ambiguous identities before approval.

1. 通过授权的精确 Scope MCP 工具读取已完成的观察与覆盖率。
2. 使用 Claude Code、OpenCode 或企业 Agent 推导有界语义候选；英文规范字段必填，面向人的内容必须具备完整中文覆盖。
3. 通过 `submit_semantic_candidate_batch` 提交哈希链批次，每批最多 100 条，仅最后一批标记 `complete=true`。
4. 调用 `assemble_knowledge_review_bundle`；服务端独立计算候选风险和 Bundle 最大风险，不接受调用方自报风险。
5. 审批前处理所有证据、覆盖率、双语和身份匹配阻塞项。

## 6. T0-T3 Review / T0-T3 评审

| Tier | Required decision / 必需决策 |
| --- | --- |
| T0 | Deterministic low-risk candidate; policy may allow automated acceptance with complete evidence and coverage. / 确定性低风险，可在证据与覆盖完整时按策略自动接受。 |
| T1 | Agent-assisted review; generator and reviewer must be different actors. / Agent 辅助评审，生成者与评审者必须分离。 |
| T2 | Human approval only; Agent-only credentials are rejected. / 仅人类审批，拒绝纯 Agent 凭据。 |
| T3 | Human approval only with highest scrutiny and explicit evidence. / 仅人类高强度审批，并要求明确证据。 |

Use `decide_knowledge_review_bundle` only after the assembled bundle is unblocked. Rejection remains an auditable decision and must not promote facts.

## 7. Promotion, Reconciliation, Baseline / 提升、对账与基线

The governed order is fixed:

1. Record an approved ReviewBundle decision.
2. Create/reopen the exact-Scope Working Stream with `create_working_stream`.
3. Call `promote_knowledge_candidates`. The server atomically materializes immutable asset and relationship revisions, evidence, outbox records, and one monotonic ChangeSet. Never write canonical rows or call `commit_knowledge_changeset` separately for this promotion.
4. Call `reconcile_knowledge_baseline` with the returned promotion receipt. Drift or blocked reconciliation prevents publication; retain the durable reconciliation receipt.
5. Call `publish_knowledge_baseline` with the exact `reconciliationReceiptId`, `changeSetId`, revision IDs, and relationship version from the converged receipts. A caller-supplied status string is never trusted.
6. Record and read back the immutable Baseline ID and manifest.
7. Rescan the same snapshot to verify idempotent identity and no duplicate canonical assets; query a sibling Scope and verify zero Phase 1 records.

治理顺序固定为：审批 ReviewBundle、创建 Working Stream、调用 `promote_knowledge_candidates` 在单一事务内生成不可变修订、证据、Outbox 和 ChangeSet，再调用 `reconcile_knowledge_baseline` 生成持久化对账凭据；仅可携带精确 `reconciliationReceiptId` 发布 Baseline。最后重扫验证幂等性并验证兄弟 Scope 为空。禁止绕过 MCP 直接写规范表，也不得为同一次提升重复调用 `commit_knowledge_changeset`。

## 8. Revocation and Key Rotation / 吊销与密钥轮换

- **Release revocation:** mark the persisted release revoked and add its release ID to distributed trust stores. Open Sessions bound to it must stop accepting writes.
- **Key rotation:** distribute the new public key first, keep old and new keys during a bounded overlap, publish new releases with the new key ID, raise `minimumScannerVersion`, then remove the old key. Never reuse a key ID for different key bytes.
- **Rollback refusal:** lowering `minimumScannerVersion` or running an older binary requires a separate audited emergency policy; the scanner otherwise fails closed.

- **发布吊销：** 持久化发布记录标记吊销，并将 Release ID 加入所有信任库；绑定它的开放 Session 必须停止写入。
- **密钥轮换：** 先分发新公钥，在有限窗口内双 Key 共存，再以新 Key ID 发布并提高最低版本，最后移除旧 Key；不得用同一 Key ID 表示不同密钥。
- **拒绝回滚：** 降低最低版本或运行旧二进制必须走独立、可审计的应急策略；默认失败关闭。

## 9. Cleanup and Audit / 清理与审计

Delete a spool only after MCP checkpoint/finalization and Baseline records have been read back, the Session is no longer resumable, and retention policy permits deletion. Never delete a spool to conceal a failed or conflicting batch. Keep signed manifests, SHA-256 files, Session/actor IDs, decision IDs, ChangeSet/Baseline IDs, commands, and verification reports for the configured audit period.

仅在 MCP Checkpoint、Finalization 和 Baseline 均已回读、Session 不再需要恢复且满足保留策略后清理 Spool。禁止通过删除 Spool 掩盖失败或冲突。签名清单、校验文件、Session/Actor/Decision/ChangeSet/Baseline ID、命令和验证报告必须按审计周期留存。

Operational audit queries must filter by exact `applicationServiceId` and exact `scopePath`, then correlate release, Session, batch sequence/digest, semantic candidate batches, ReviewBundle decision, revisions, ChangeSet, and Baseline. Prefix or application-service-only SQL is not acceptable for authoritative audits.

## 10. Common Failure Codes / 常见错误码

| Code | Operator action / 处理动作 |
| --- | --- |
| `SCANNER_RELEASE_KEY_UNTRUSTED` | Install the pre-approved public key; never trust the manifest key automatically. / 安装预审批公钥，禁止自动信任。 |
| `SCANNER_RELEASE_REVOKED` | Stop and obtain a new Session/release. / 停止并获取新 Session/发布。 |
| `SCANNER_RELEASE_ROLLBACK_BLOCKED` | Use an allowed version or audited emergency policy. / 使用允许版本或应急策略。 |
| `SCANNER_ARTIFACT_DIGEST_MISMATCH` | Quarantine and redownload the artifact. / 隔离并重新下载。 |
| `SCANNER_RELEASE_PLATFORM_MISMATCH` | Download the native platform artifact. / 下载当前原生平台制品。 |
| `SCOPE_MISMATCH` | Stop; recreate the Session for the intended service. / 停止并为目标服务重建 Session。 |
| `SCAN_BATCH_SEQUENCE_CONFLICT` | Compare local and server checkpoints; do not overwrite. / 比对两端 Checkpoint，禁止覆盖。 |
| `SCAN_SESSION_EXPIRED` | Start a new Session and retain the old audit trail. / 新建 Session 并保留旧审计记录。 |
| `SCAN_SESSION_OBSERVATION_LIMIT_EXCEEDED` | Split discovery into policy-approved Sessions. / 按策略拆分扫描会话。 |
| `REVIEW_BUNDLE_BLOCKED` | Resolve evidence, coverage, bilingual, identity, or separation blockers. / 处理证据、覆盖率、双语、身份或职责分离问题。 |
| `BASELINE_RECONCILIATION_REQUIRED` | Reconcile to `CONVERGED`; never force publication. / 对账至 `CONVERGED`，禁止强制发布。 |

## 11. Stage Verification / 阶段验证

```powershell
$env:DATABASE_URL = 'postgresql://...'
pnpm legacy-baseline:verify
```

For a release-sidecar-only dry run without PostgreSQL or a production Web build:

```powershell
pnpm legacy-baseline:verify -SkipDatabaseIntegration -SkipBuild
```

The report is written to `artifacts/legacy-baseline-verification.json`. Skipped database integration or build steps must be recorded as limitations and cannot be used as full production acceptance evidence.

## 12. Explicitly Deferred / 明确延期

The following are outside Phase 1 and must not be represented as delivered: turnkey production Agent connectors, CodeHub gate integration, continuous inbound/outbound bidirectional synchronization, external `APPLY`, BIZ/SYS/TECH 3A projections, production PostgreSQL-to-graph projection, multi-service comparison, production identity/token administration, enterprise deployment profiles, capacity certification, backup/restore drills, and automated spool retention.

以下能力不属于第一阶段，不得宣称已交付：开箱即用的生产 Agent 连接器、CodeHub 门禁、持续双向同步、外部 `APPLY`、BIZ/SYS/TECH 3A 投影、生产图投影、多服务对比、生产身份与 Token 管理、企业部署剖面、容量认证、备份恢复演练和自动 Spool 保留策略。
