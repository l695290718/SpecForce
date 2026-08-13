# SpecForge Active Backlog

Only incomplete work is listed here. Completed and superseded records are preserved in `docs/archive/backlog-history.md`. English is canonical; Chinese fields are the human-facing localization.

仅列出尚未完成的工作。已完成和已替代的记录保存在 `docs/archive/backlog-history.md`。英文是规范字段；中文字段用于面向人的本地化展示。

## 1. Governance Operational-State Reconciliation

**Status:** In progress.

**Owner:** SpecForge Architecture and Runtime.

**Rationale:** The operational catalog must distinguish active design-change work from historical or resolved activity. The current dated observation records 5 `OPEN` Design Change Sessions and 65 pending Federation Outbox events. Reconciliation must use MCP commands, preserve audit history, and must not delete sessions, events, payloads, diagnostics, or evidence.

**Trigger:** Start the cleanup when the exact Designer Scope operational snapshot confirms stale `OPEN` sessions or pending outbox records that have exceeded their operational handling window; classify each record before taking a scope-safe MCP action.

**Completion evidence:** A read-only post-check records the final session and outbox status, every changed record has an MCP receipt and exact Scope, unresolved work has an owner and retry trigger, and the reconciliation report is non-blocking. Audit history remains intact; no direct database deletion is permitted.

**Design references:** ADR-0007, ADR-0010, ADR-0016, ADR-0020, ADR-0021, ADR-0022; `docs/archive/backlog-history.md`.

**中文本地化：**

**状态：** 进行中。

**负责人：** SpecForge 架构与运行时团队。

**理由：** 运行设计目录必须区分活跃的设计变更与历史或已解决活动。当前日期快照记录有 5 个 `OPEN` 设计变更会话和 65 条待处理 Federation Outbox 事件。对账必须使用 MCP 命令，保留审计历史，不得删除会话、事件、负载、诊断信息或证据。

**启动条件：** 当精确 Designer Scope 的运行快照确认存在超过运行处理窗口仍未处理的 `OPEN` 会话或 Outbox 事件时启动；任何 Scope 安全的 MCP 操作前必须先对每条记录分类。

**完成证据：** 只读后检查记录最终会话和 Outbox 状态；每条变更记录都具备 MCP 回执和精确 Scope；未解决工作具备负责人和重试触发条件；对账报告为非阻塞。审计历史保持完整，禁止直接删除数据库记录。

**设计引用：** ADR-0007、ADR-0010、ADR-0016、ADR-0020、ADR-0021、ADR-0022；`docs/archive/backlog-history.md`。

## 2. CodeArts/CodeHub Protected-Branch Enforcement

**Status:** Deferred.

**Owner:** SpecForge Enterprise Integration and Repository Governance.

**Rationale:** A local `pre-commit` gate improves normal developer and Agent behavior, but Git permits `--no-verify` and Hooks are not installed automatically by clone. Repository-authoritative enforcement requires CodeArts/CodeHub to independently recompute the committed tree, validate the SpecForge Change Attestation with a CI service identity, and make the result mandatory for protected-branch merge.

**Trigger:** Start the platform-specific adapter only after the standalone Go Hook CLI, provider-neutral remote MCP verification contract, strict `CONVERGED` policy, signing-key lifecycle, and local developer workflow are reviewed for the target CodeHub deployment.

**Completion evidence:** `verify_change_attestation` continues to validate signed repository evidence, exact multi-Scope coverage, session and reconciliation convergence, expiry, signature, trusted and revoked key policy, and deterministic failure codes. A CodeArts/CodeHub protected-branch status check must reject a merge request with missing proof, a bypassed Hook, stale tree, wrong repository or Scope, expired or revoked signature, incomplete multi-Scope coverage, or non-converged design.

**Design references:** ADR-0017, ADR-0021, ADR-0007; local contract evidence dated 2026-08-09.

**中文本地化：**

**状态：** 延期。

**负责人：** SpecForge 企业集成与仓库治理团队。

**理由：** 本地 `pre-commit` 门禁可以约束普通开发者和 Agent 行为，但 Git 允许 `--no-verify`，且 clone 不会自动安装 Hook。仓库权威门禁要求 CodeArts/CodeHub 使用 CI 服务身份重新计算提交 tree，独立验证 SpecForge Change Attestation，并将结果设为受保护分支合入必选状态。

**启动条件：** 目标 CodeHub 部署完成 Go 单文件 Hook CLI、与平台无关的远程 MCP 校验契约、严格 `CONVERGED` 策略、签名密钥生命周期和本地开发流程评审后，再启动平台适配器。

**完成证据：** `verify_change_attestation` 持续校验签名仓库证据、精确多 Scope 覆盖、会话与对账收敛、有效期、签名、密钥信任与撤销策略及确定性失败码。CodeArts/CodeHub 受保护分支状态检查必须拒绝缺少证明、绕过 Hook、tree 过期、仓库或 Scope 错误、签名过期或撤销、多 Scope 覆盖不完整以及设计未收敛的合入请求。

**设计引用：** ADR-0017、ADR-0021、ADR-0007；2026-08-09 本地契约证据。

## 3. Production Identity, Tenant Authorization, And Multi-Service Comparison

**Status:** Deferred.

**Owner:** SpecForge Security and Platform Governance.

**Rationale:** The provider-neutral `ScopedPrincipal` foundation and exact application-service fail-closed boundary are local contracts, not production identity. Agents with explicit grants may eventually compare or aggregate multiple application services, but every participating service must be permission-filtered before any design asset is read, joined, or presented.

**Trigger:** Start after the enterprise identity provider, tenant model, OAuth/RBAC policy, token lifecycle, and auditable cross-service authorization decisions are approved for production; the target grants and cross-service comparison scope must be explicitly authorized.

**Completion evidence:** Authenticated Web and MCP requests enforce tenant and application-service grants in integration tests, including denied cross-service reads and writes. Multi-service comparison proves permission-filtered reads, audit records, exact Scope isolation, and fail-closed behavior for missing or expired grants.

**Design references:** ADR-0001, ADR-0002, ADR-0010, ADR-0021, ADR-0022; local `ScopedPrincipal` contract evidence dated 2026-08-09.

**中文本地化：**

**状态：** 延期。

**负责人：** SpecForge 安全与平台治理团队。

**理由：** 与平台无关的 `ScopedPrincipal` 基础和精确应用服务失败关闭边界只是本地契约，不等同于生产身份体系。未来拥有明确授权的 Agent 可以比较或聚合多个应用服务，但读取、关联或展示任何设计资产前，必须先对每个参与的应用服务执行权限过滤。

**启动条件：** 企业身份提供商、租户模型、OAuth/RBAC 策略、Token 生命周期和可审计的跨服务授权决策完成生产评审后启动；目标授权范围和跨服务比较范围必须获得明确授权。

**完成证据：** 已认证的 Web 和 MCP 请求在集成测试中执行租户及应用服务权限校验，包括拒绝跨服务读写。多服务比较必须证明权限过滤读取、审计记录、精确 Scope 隔离，以及缺少或过期授权时的失败关闭行为。

**设计引用：** ADR-0001、ADR-0002、ADR-0010、ADR-0021、ADR-0022；2026-08-09 `ScopedPrincipal` 本地契约证据。

## 4. Live Enterprise Source Connectors And Continuous Synchronization

**Status:** Deferred.

**Owner:** SpecForge Architecture and Agent Integration.

**Rationale:** Phase 1 baseline discovery, Phase 2 deterministic 3A projections, Phase 3 continuous-observation governance core, and the provider-neutral local-repository connector are implemented. Enterprise systems still need concrete database, API-gateway, CMDB, and runtime adapters so existing product information can be discovered, represented as evidence-backed candidates, and kept current without weakening MCP authorization or human promotion boundaries.

**Trigger:** Start a concrete connector only after its source contract, dedicated ADR, implementation plan, exact-Scope preflight, source minimization policy, and acceptance evidence are approved. Polling, webhook, automatic candidate promotion, outbound proposals, and external `APPLY` require their own reviewed boundaries.

**Completion evidence:** Each adapter emits bounded, resumable, source-versioned MCP-ready pages; PostgreSQL persists durable cursors, hash-chained batch receipts, candidates, reconciliation state, and transactional outbox records. Focused tests prove idempotency, sequence-gap rejection, exact-Scope authorization, semantic review, promotion, retry recovery, and read-back from the authoritative store.

**Design references:** ADR-0015, ADR-0018, ADR-0020, ADR-0021; `docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`.

**中文本地化：**

**状态：** 延期。

**负责人：** SpecForge 架构与 Agent 集成团队。

**理由：** 第一阶段存量基线发现、第二阶段确定性 3A 投影、第三阶段持续观测治理核心和与平台无关的本地仓库连接器已经实现。企业系统仍需要具体的数据库、API 网关、CMDB 和运行时适配器，以发现现有产品信息、形成有证据支撑的候选事实，并在不弱化 MCP 授权和人工提升边界的前提下保持更新。

**启动条件：** 具体连接器的来源契约、独立 ADR、实施计划、精确 Scope 预检、来源最小化策略和验收证据获批后才能启动。轮询、Webhook、自动候选提升、出站 Proposal 和外部 `APPLY` 必须分别完成评审。

**完成证据：** 每个适配器都能输出有界、可恢复、带来源版本的 MCP 页面；PostgreSQL 持久化游标、哈希链批次收据、候选事实、对账状态和事务 Outbox 记录。聚焦测试必须证明幂等、序列缺口拒绝、精确 Scope 授权、语义评审、提升、重试恢复和权威存储回读。

**设计引用：** ADR-0015、ADR-0018、ADR-0020、ADR-0021；`docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`。

## 5. Knowledge-Assertion-Aware Nebula 3A And Production-Scale Certification

**Status:** Deferred; not part of the PostgreSQL-first 3A browser increment.

**Owner:** SpecForge Runtime for projection and Projector health; SpecForge Architecture for MCP synchronization.

**Rationale:** The current NebulaGraph projection stores design-asset identities and current typed relationships. It is not semantically equivalent to Baseline-bound Knowledge Assertions, Profile-pinned projection generations, or historical relationship snapshots. Enterprise multi-node sizing, Kubernetes deployment, secret management, object storage, and billion-scale certification therefore require a separate production increment.

**Trigger:** Start only after the PostgreSQL 3A workspace passes acceptance and query telemetry demonstrates a traversal workload that needs graph acceleration. Open a separate ADR and exact-Scope Design Change Session before implementation.

**Completion evidence:** Define Knowledge Assertion vertices, versioned relationship edges, Baseline membership or as-of semantics, outbox events, checkpoint namespace, rebuild and rollback behavior, PostgreSQL/Nebula result parity, multi-node sizing, Kubernetes and secret-management operations, production object storage, and billion-scale capacity certification. Synchronize the matching ADR, Proposal, Context Pack, Evidence, backlog state, and typed links through MCP.

**Design references:** ADR-0005, ADR-0006, ADR-0012, ADR-0018, ADR-0019, ADR-0022; `deploy/graph/verify-projection.ps1`.

**中文本地化：**

**状态：** 延期，不属于 PostgreSQL-first 3A 浏览器增量。

**负责人：** SpecForge Runtime 负责投影和 Projector 健康；SpecForge Architecture 负责 MCP 同步。

**理由：** 当前 NebulaGraph 投影保存设计资产身份和当前类型关系，与绑定 Baseline 的 Knowledge Assertion、固定 Profile 的投影代次以及历史关系快照并不语义等价。因此，企业多节点容量、Kubernetes 部署、密钥管理、对象存储和亿级规模认证必须作为独立生产增量处理。

**启动条件：** 只有在 PostgreSQL 3A 工作台通过验收，并且查询遥测证明需要图加速后才能启动。实现前必须创建独立 ADR 和精确 Scope 设计变更会话。

**完成证据：** 必须定义 Knowledge Assertion 顶点、版本化关系边、Baseline 成员或 as-of 语义、Outbox 事件、检查点命名空间、重建与回滚行为、PostgreSQL/Nebula 结果一致性、多节点容量、Kubernetes 和密钥管理运维、生产对象存储及亿级容量认证，并通过 MCP 同步匹配的 ADR、Proposal、Context Pack、Evidence、待办状态和有类型关系。

**设计引用：** ADR-0005、ADR-0006、ADR-0012、ADR-0018、ADR-0019、ADR-0022；`deploy/graph/verify-projection.ps1`。

## 6. PostgreSQL/MCP Synchronization Resilience

**Status:** Deferred.

**Owner:** SpecForge Architecture.

**Rationale:** A transient tunnel interruption previously produced `MCP synchronization blocked` while the Docker PostgreSQL authority at `localhost:15433` was unreachable. Synchronization must be diagnosable and recoverable without changing the exact-Scope or PostgreSQL-authority rules, and without weakening the MCP-only write boundary.

**Trigger:** Reproduce or observe another PostgreSQL tunnel outage, or approve the resilience increment during production-readiness review; only then add bounded retry, reachability diagnostics, and an operator-visible failure receipt.

**Completion evidence:** Focused checks prove bounded retry and timeout behavior, actionable reachability diagnostics, deterministic failure receipts, no duplicate writes, exact-Scope enforcement, PostgreSQL authority, and successful MCP read-back after recovery. A blocked attempt remains explicitly recorded with its failure reason and retry trigger.

**Design references:** ADR-0002, ADR-0004, ADR-0007, ADR-0016, ADR-0021; the resolved tunnel incident receipt dated 2026-08-09.

**中文本地化：**

**状态：** 延期。

**负责人：** SpecForge Architecture。

**理由：** Docker PostgreSQL 权威库 `localhost:15433` 不可达时，曾经出现过 `MCP synchronization blocked` 的临时隧道中断。同步必须可诊断、可恢复，同时不能改变精确 Scope 或 PostgreSQL 权威规则，也不能弱化 MCP-only 写入边界。

**启动条件：** 再次复现或观测 PostgreSQL 隧道中断，或在生产就绪评审中批准该韧性增量后，才能增加有界重试、可达性诊断和面向运维的失败收据。

**完成证据：** 聚焦检查证明有界重试和超时行为、可操作的可达性诊断、确定性的失败收据、无重复写入、精确 Scope 强制、PostgreSQL 权威性以及恢复后的 MCP 成功回读。阻塞尝试必须明确记录失败原因和重试触发条件。

**设计引用：** ADR-0002、ADR-0004、ADR-0007、ADR-0016、ADR-0021；2026-08-09 隧道事件解决回执。

## 7. Local Change-Attestation Hook Deployment And Signing Endpoint

**Status:** Deferred (not deployed in the local environment).

**Owner:** SpecForge Architecture and Runtime.

**Rationale:** ADR-0017's local enforcement increment (the Go `specforge` CLI and Ed25519 Change Attestation protocol) is designed and its verification contract is locally tested, but the per-commit gate is not active in this repository clone: the Go CLI is not built (`apps/specforge-cli`), `.specforge.yaml` does not exist, the MCP server runs stdio transport without an authenticated Streamable HTTP `/mcp` endpoint or bearer token, and no Ed25519 signing-key lifecycle is provisioned. Commits (including `db0c832` and `5bfff08`) therefore carry no Change Attestation; the 3A continuous-supervisor session `design-change-session:42c82e52-5b6f-460a-9675-b95c8cde75cc` closed `CONVERGED` and reconciled clean, so the design record is consistent, but the per-commit gate remains a documented gap rather than an enforced control.

**Trigger:** Start when the maintainer approves deploying the local gate: build `specforge.exe` from `apps/specforge-cli`, author `.specforge.yaml` (identity and path mappings only — no credentials), run the MCP server over Streamable HTTP at `/mcp` with bearer authentication and a provisioned Ed25519 signing key, install the idempotent `pre-commit` dispatcher, and verify that an un-attested commit fails closed while an attested commit passes `verify_change_attestation`.

**Completion evidence:** `specforge hook install` is idempotent; a normal commit without an exact-Scope `CONVERGED` session and evidence is rejected with a deterministic failure code; a commit under the closed `CONVERGED` session `42c82e52` (or a later governed change) succeeds only after the CLI verifies the staged tree, signature, scope, and reconciliation; `.specforge.yaml` contains no credentials; the signing-key lifecycle (issue, short expiry, revocation, trusted and revoked key policy) is exercised; CodeArts/CodeHub merge enforcement remains a separate backlog item (TODO item 2).

**Design references:** ADR-0017, ADR-0021, ADR-0007; `docs/operations/local-git-hook-attestation.md`; `apps/specforge-cli/`.

**中文本地化：**

**状态：** 延期（未在当前环境部署）。

**负责人：** SpecForge 架构与运行时团队。

**理由：** ADR-0017 的本地强制增量（Go `specforge` CLI 与 Ed25519 变更证明协议）已完成设计，其校验契约已通过本地测试，但本仓库克隆中每次提交的门禁并未生效：Go CLI 未构建（`apps/specforge-cli`）、`.specforge.yaml` 不存在、MCP 服务仅运行 stdio 传输而没有带 Bearer 鉴权的 Streamable HTTP `/mcp` 端点，也未配置 Ed25519 签名密钥生命周期。因此包括 `db0c832` 与 `5bfff08` 在内的提交均无变更证明；3A 持续 Supervisor 会话 `design-change-session:42c82e52-5b6f-460a-9675-b95c8cde75cc` 已 `CONVERGED` 关闭且对账干净，设计记录一致，但每次提交的门禁仍是文档化缺口而非强制控制。

**启动条件：** 维护者批准部署本地门禁后启动：从 `apps/specforge-cli` 构建 `specforge.exe`，编写 `.specforge.yaml`（仅身份与路径映射，不含凭据），以 Streamable HTTP `/mcp` 运行 MCP 服务并提供 Bearer 鉴权和已配置的 Ed25519 签名密钥，安装幂等 `pre-commit` 分发器，并验证无证明提交失败关闭、有证明提交通过 `verify_change_attestation`。

**完成证据：** `specforge hook install` 幂等；缺少精确 Scope `CONVERGED` 会话与证据的普通提交以确定性失败码被拒绝；在已关闭的 `CONVERGED` 会话 `42c82e52`（或后续受治理变更）下的提交仅在 CLI 验证暂存 tree、签名、Scope 和对账后成功；`.specforge.yaml` 不含凭据；签名密钥生命周期（签发、短有效期、撤销、信任/撤销密钥策略）得到演练；CodeArts/CodeHub 合入门禁仍为独立待办（TODO 第 2 项）。

**设计引用：** ADR-0017、ADR-0021、ADR-0007；`docs/operations/local-git-hook-attestation.md`；`apps/specforge-cli/`。
