# SpecForge Active Backlog

Only incomplete work is listed here. Completed and superseded records are preserved in `docs/archive/backlog-history.md`. English is canonical; Chinese fields are the human-facing localization.

仅列出尚未完成的工作。已完成和已替代的记录保存在 `docs/archive/backlog-history.md`。英文是规范字段；中文字段用于面向人的本地化展示。

## 2. CodeArts/CodeHub Protected-Branch Enforcement

**Status:** Provider-neutral CI verifier implemented; CodeHub/CodeArts status registration deferred.

**Owner:** SpecForge Enterprise Integration and Repository Governance.

**Rationale:** The standalone CLI now exposes `verify-commit`, which recomputes committed-tree evidence and delegates read-only signed-attestation verification to MCP. Git still permits `--no-verify`, and Hooks are not installed automatically by clone. Repository-authoritative enforcement still requires CodeArts/CodeHub to register this command as a mandatory protected-branch status check with a CI service identity.

**Trigger:** Implement the platform-specific adapter only after the provider-neutral `verify-commit` entrypoint, artifact transport, strict `CONVERGED` policy, signing-key lifecycle, and local developer workflow are reviewed for the target CodeHub deployment.

**Completion evidence:** `specforge verify-commit --attestation <artifact>` recomputes committed-tree evidence and fails closed for missing/invalid artifacts, stale tree, wrong repository or Scope, expired or revoked signature, incomplete multi-Scope coverage, or non-converged design. `verify_change_attestation` continues to validate the signed evidence server-side. A CodeArts/CodeHub protected-branch status check must still register this command as mandatory and reject the same failure cases.

**Design references:** ADR-0017, ADR-0021, ADR-0007; local contract evidence dated 2026-08-09.

**中文本地化：**

**状态：** 平台无关 CI 校验器已实现；CodeHub/CodeArts 状态检查注册仍延期。

**负责人：** SpecForge 企业集成与仓库治理团队。

**理由：** 独立 CLI 现已提供 `verify-commit`，重新计算提交 tree 证据，并将只读签名证明校验委托给 MCP。Git 仍允许 `--no-verify`，clone 也不会自动安装 Hook。仓库权威门禁仍要求 CodeArts/CodeHub 使用 CI 服务身份注册该命令为受保护分支必选状态检查。

**启动条件：** 目标 CodeHub 部署完成平台无关的 `verify-commit` 入口、证明产物传输、严格 `CONVERGED` 策略、签名密钥生命周期和本地开发流程评审后，再实现平台适配器。

**完成证据：** `specforge verify-commit --attestation <artifact>` 重新计算提交 tree 证据，并在证明缺失或无效、tree 过期、仓库或 Scope 错误、签名过期或撤销、多 Scope 覆盖不足以及设计未收敛时失败关闭；服务端 `verify_change_attestation` 继续校验全部签名证据。CodeArts/CodeHub 仍需把该命令注册为必选状态检查并拒绝同类失败。

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

## 7. Enterprise-Wide 3A Coverage And Semantic Classification

**Status:** Deferred after the initial governed Designer slice.

**Owner:** SpecForge Architecture and Agent Integration.

**Rationale:** The first MCP-governed Designer Baseline and one controlled coverage expansion now contain 4 evidence-backed architecture units, 18 memberships, and 3 mappings. Remaining APIs, events, rules, data models, runtime facts, source-owner decisions, and ambiguous semantics must not be mass-classified by naming heuristics or automatic promotion.

**Trigger:** Start after the first slice is accepted and coverage gaps are prioritized with source owners. Each expansion must use a new exact-Scope batch, evidence matrix, bilingual review, converged reconciliation, and Baseline revision.

**Completion evidence:** Every selected source has a stable evidence reference, complete English/Chinese human-facing content, a typed relationship or explicit review rationale, and a read-back projection. Unclassified and rejected facts have an owner, trigger, and rationale.

**中文本地化：**

**状态：** 首批受治理 Designer 切片完成后延期。

**负责人：** SpecForge 架构与 Agent 集成团队。

**理由：** 当前 Designer Baseline 已包含 4 个有证据支撑的架构单元、7 个成员归属和 3 条映射。其余 API、事件、规则、数据模型、运行时事实及含义不明确的内容不能通过命名启发式或自动提升批量分类。

**启动条件：** 首批切片验收并按来源负责人排定覆盖缺口后启动。每次扩展必须使用新的精确 Scope 批次、证据矩阵、双语审核、收敛对账和 Baseline 版本。

**完成证据：** 每个选中的来源都有稳定证据引用、完整中英文面向人内容、有类型关系或明确审核理由，并能在投影中回读。未分类和拒绝事实必须记录负责人、触发条件和理由。

## 8. Local Change-Attestation Hook Deployment And Signing Endpoint

**Status:** Implemented locally; CodeHub merge enforcement remains deferred.

**Owner:** SpecForge Architecture and Runtime.

**Rationale:** The local enforcement increment is now deployable: the standalone Go CLI, repository-only configuration template, user-local Ed25519 key generator, authenticated Streamable HTTP MCP launcher, and idempotent Hook installer are available. `.specforge.yaml` remains ignored and must be authored per checkout with a current governed session ID. CodeHub protected-branch enforcement remains a separate platform backlog item.

**Trigger:** For each checkout, build `specforge.exe`, copy `.specforge.yaml.example` to ignored `.specforge.yaml`, set the current exact-Scope session ID, provision the user-local Ed25519 key, inject the bearer token and authoritative PostgreSQL URL into the MCP process, start `/mcp`, install the Hook, and run the focused local checks.

**Completion evidence:** The repository template maps all current paths to the exact Designer Scope without credentials; `new-attestation-key.ps1` writes only to the user profile; `start-mcp-http.ps1` requires bearer token, exact Scope authorization, PostgreSQL, and an Ed25519 key; `specforge hook install` is idempotent; missing staged changes fail with `NO_STAGED_CHANGES`; Go and PowerShell focused checks pass. A live attested commit remains an operator-run check because it mutates Git history and requires a current MCP token/session. CodeArts/CodeHub merge enforcement remains a separate backlog item (TODO item 2).

**Design references:** ADR-0017, ADR-0021, ADR-0007; `docs/operations/local-git-hook-attestation.md`; `apps/specforge-cli/`.

**中文本地化：**

**状态：** 已在本地实现；CodeHub 合入门禁仍延期。

**负责人：** SpecForge 架构与运行时团队。

**理由：** 本地强制增量现已可部署：独立 Go CLI、仅包含仓库配置的模板、用户目录 Ed25519 密钥生成器、带鉴权的 Streamable HTTP MCP 启动器和幂等 Hook 安装器均已提供。`.specforge.yaml` 仍被忽略，必须在每个检出中写入当前受治理会话 ID。CodeHub 受保护分支门禁仍是独立平台待办。

**启动条件：** 每个检出中构建 `specforge.exe`，复制 `.specforge.yaml.example` 为被忽略的 `.specforge.yaml`，设置精确 Scope 会话 ID，在用户目录生成 Ed25519 密钥，将 Bearer Token 和权威 PostgreSQL URL 注入 MCP 进程，启动 `/mcp`，安装 Hook 并运行聚焦检查。

**完成证据：** 仓库模板将当前路径映射到精确 Designer Scope 且不含凭据；`new-attestation-key.ps1` 只写用户目录；`start-mcp-http.ps1` 强制要求 Bearer Token、精确 Scope 授权、PostgreSQL 和 Ed25519 密钥；`specforge hook install` 幂等；无暂存变更时返回 `NO_STAGED_CHANGES`；Go 与 PowerShell 聚焦检查通过。真实带证明提交需要操作者提供当前 MCP Token/会话，并因会改变 Git 历史保留为操作检查。CodeHub 合入门禁仍是独立待办（TODO 第 2 项）。

**设计引用：** ADR-0017、ADR-0021、ADR-0007；`docs/operations/local-git-hook-attestation.md`；`apps/specforge-cli/`。
