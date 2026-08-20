# SpecForge Active Backlog

Only incomplete work is listed here. Completed and superseded records are preserved in `docs/archive/backlog-history.md`. English is canonical; Chinese fields are the human-facing localization.

仅列出尚未完成的工作。已完成和已替代的记录保存在 `docs/archive/backlog-history.md`。英文是规范字段；中文字段用于面向人的本地化展示。

## P1 Closure Status

### 3A Semantic Unit Expansion v6

**Status:** Implemented and synchronized for the exact Designer Scope. The full authored catalog has current coverage; structural 3A meaning remains governed by the published v6 baseline.

**Owner:** SpecForge Architecture and Agent Integration.

**Evidence:** `coverage-generation:designer:3a:v13` is `CURRENT` with `307/307 COVERED`, `0 BLOCKED`, `0 NOT_EVALUATED`, maximum path `3`; the asset-to-3A read-back is `DIRECT 38 / TRACE 255 / BLOCKED 14 / EXEMPT 0`; `knowledge-baseline:designer:3a:v6` remains `READY` with 8 units, 42 memberships, 6 mappings, and the v5 regression is READY.

### 3A 语义单元扩充 v6

**状态：** 精确 Designer Scope 的全量已实现并通过 MCP 同步；覆盖投影与结构化 3A 语义保持分层治理。

**证据：** `coverage-generation:designer:3a:v13` 为 `CURRENT`，307/307 条记录 `COVERED`，0 条 `BLOCKED`，0 条 `NOT_EVALUATED`，最大路径 3 跳；资产到 3A 回读为 `DIRECT 38 / TRACE 255 / BLOCKED 14 / EXEMPT 0`；v6 结构基线仍为 8 个单元、42 个成员、6 个映射，v5 回归 READY。

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

**Status:** Connector governance foundation implemented and synchronized; live enterprise rollout remains deferred.

**Owner:** SpecForge Architecture and Agent Integration.

**Implemented foundation:** The v2 contract, exact-Scope PostgreSQL persistence, durable cursors and leases, Worker runtime, PostgreSQL Schema/OpenAPI/CMDB/runtime Catalog adapters, candidate classification, scoped MCP operations, Docker packaging, DELTA terminal completion, and design-fact synchronization are implemented and locally verified.

**Remaining scope:** A real enterprise source still needs connector registration, source credentials, mapping approval, operational scheduling, retry/dead-letter replay, live acceptance, and source-owner review. Semantic promotion, outbound Proposals, and external `APPLY` remain separately governed capabilities.

**Trigger:** Select the first enterprise source and approve its source contract, dedicated ADR, implementation plan, exact-Scope preflight, source minimization policy, credentials, and acceptance evidence. Polling, webhook, automatic candidate promotion, outbound Proposals, and external `APPLY` require their own reviewed boundaries.

**Completion evidence:** For the selected live source, the adapter emits bounded, resumable, source-versioned MCP-ready pages; PostgreSQL persists durable cursors, hash-chained batch receipts, candidates, reconciliation state, and transactional outbox records; operations prove retry recovery, dead-letter handling, exact-Scope authorization, source-owner review, and read-back from the authoritative store. Local foundation evidence is recorded in ADR-0027 through ADR-0034.

**Design references:** ADR-0015, ADR-0018, ADR-0020, ADR-0021; `docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`.

**中文本地化：**

**状态：** 连接器治理基础已经实现并同步；企业真实数据源接入仍延期。

**负责人：** SpecForge 架构与 Agent 集成团队。

**已实现基础：** v2 契约、精确 Scope 的 PostgreSQL 持久化、可恢复游标和租约、Worker 运行时、PostgreSQL Schema/OpenAPI/CMDB/运行时 Catalog 适配器、候选分类、Scope 安全的 MCP 操作、Docker 部署、DELTA 终态闭环以及设计事实同步均已实现并完成本地验证。

**剩余范围：** 真实企业数据源仍需要连接器注册、来源凭据、映射审核、运维调度、重试/死信重放、现场验收和来源负责人审核。语义提升、出站 Proposal 和外部 `APPLY` 仍是独立治理能力。

**启动条件：** 选定首个企业数据源，并完成来源契约、独立 ADR、实施计划、精确 Scope 预检、来源最小化策略、凭据和验收证据评审后启动。轮询、Webhook、自动候选提升、出站 Proposal 和外部 `APPLY` 必须分别完成评审。

**完成证据：** 对选定的真实数据源，适配器能够输出有界、可恢复、带来源版本的 MCP 页面；PostgreSQL 持久化游标、哈希链批次收据、候选事实、对账状态和事务 Outbox 记录；运维验证重试恢复、死信处理、精确 Scope 授权、来源负责人审核和权威存储回读。基础能力证据记录在 ADR-0027 至 ADR-0034。

**设计引用：** ADR-0015、ADR-0018、ADR-0020、ADR-0021；`docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`。

## 5. Knowledge-Assertion-Aware Nebula 3A And Production-Scale Certification

**Status:** Target design accepted on 2026-08-20. Phase 1 bounded-generation control, generation-qualified Gateway/Projector delivery, and parity primitives are implemented locally; MCP closure is pending. Full semantic Knowledge Assertion projection, Phase 2 production operations, and Phase 3 scale certification remain open.

**Owner:** SpecForge Runtime for projection and Projector health; SpecForge Architecture for MCP synchronization.

**Rationale:** The current NebulaGraph projection stores design-asset identities and current typed relationships. The accepted target uses a shared Space with exact-Scope, Manifest-qualified identities and bounded BUILDING, ACTIVE, and PREVIOUS slots. PostgreSQL controls atomic publication and preserves complete history; NebulaGraph remains a rebuildable online projection. Enterprise multi-node operations and billion-scale certification remain separately evidenced phases.

**Trigger:** Phase 1 MCP closure requires successful scoped synchronization and read-back of the implementation evidence. Phase 2 starts after semantic parity and rollback pass; Phase 3 starts only on a production-representative topology with an approved workload and capacity plan.

**Completion evidence:** Phase 1 must implement Knowledge Assertion vertices, Manifest-qualified identities, versioned relationship edges, generation-aware Outbox checkpoints, bounded publication/rollback/cleanup, and PostgreSQL/Nebula parity. Phase 2 must prove external multi-node configuration, Kubernetes, secrets, backup/restore, object storage, observability, and failure recovery. Phase 3 must publish auditable `10M`, `100M`, and `1B` certification reports before claiming each tier. Synchronize matching ADR, Proposal, Context Pack, Evidence, backlog state, and typed links through MCP for every phase.

**Design references:** ADR-0005, ADR-0006, ADR-0012, ADR-0018, ADR-0019, ADR-0022, ADR-0036; `docs/superpowers/specs/2026-08-20-bounded-nebula-knowledge-projection-generations-design.md`; `deploy/graph/verify-projection.ps1`.

**中文本地化：**

**状态：** 目标设计已于 2026-08-20 接受。第一阶段有界代次控制、带代次 Gateway/Projector 投递和一致性比对基础能力已在本地实现，MCP 关闭仍待完成；完整 Knowledge Assertion 语义投影、第二阶段生产运维和第三阶段规模认证仍待实施。

**负责人：** SpecForge Runtime 负责投影和 Projector 健康；SpecForge Architecture 负责 MCP 同步。

**理由：** 当前 NebulaGraph 投影保存设计资产身份和当前类型关系。已接受的目标是在共享 Space 中采用精确 Scope、包含 Manifest 的图身份以及有界 BUILDING、ACTIVE、PREVIOUS 三槽模型。PostgreSQL 控制原子发布并保存完整历史，NebulaGraph 保持可重建在线投影。企业多节点运维和十亿级规模认证仍作为独立取证阶段处理。

**启动条件：** 第一阶段必须完成精确 Scope 的 MCP 同步、回读和实施会话关闭；第二阶段在语义一致性和回滚通过后启动；第三阶段只能在生产代表性拓扑、工作负载和容量计划获批后启动。

**完成证据：** 第一阶段必须实现 Knowledge Assertion 顶点、包含 Manifest 的身份、版本化关系边、代次感知 Outbox 检查点、有界发布/回滚/清理及 PostgreSQL/Nebula 一致性。第二阶段必须证明外部多节点配置、Kubernetes、密钥、备份恢复、对象存储、可观测性和故障恢复。第三阶段必须发布可审计的 `10M`、`100M`、`1B` 认证报告，未通过的级别不能对外宣称。每个阶段都必须通过 MCP 同步匹配的 ADR、Proposal、Context Pack、Evidence、待办状态和有类型关系。

**设计引用：** ADR-0005、ADR-0006、ADR-0012、ADR-0018、ADR-0019、ADR-0022、ADR-0036；`docs/superpowers/specs/2026-08-20-bounded-nebula-knowledge-projection-generations-design.md`；`deploy/graph/verify-projection.ps1`。

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

**Status:** Exact-Scope authored-record coverage implemented and synchronized. Further structural semantic expansion remains governed and deferred.

**Owner:** SpecForge Architecture and Agent Integration.

**Rationale:** The exact Designer Scope now has an immutable, reproducible coverage row for every authored record: v13 is `CURRENT` with `307/307 COVERED`, `0 BLOCKED`, `0 NOT_EVALUATED`, and maximum path `3`. Asset-to-3A mapping is separately derived as 38 DIRECT, 255 TRACE, 14 BLOCKED, and 0 EXEMPT. This is coverage and classification of authored facts, not automatic promotion of every record into a new architecture unit. The accepted structural baseline remains 8 units, 42 memberships, and 6 mappings; ambiguous business meaning must still be governed explicitly.

**Trigger:** Start only when additional structural semantic units are prioritized with source owners. Each expansion must use a new exact-Scope batch, evidence matrix, bilingual review, converged reconciliation, and Baseline revision.

**Completion evidence:** The current full-catalog coverage is evidenced by `coverage-generation:designer:3a:v13`, exact-Scope MCP read-back, the asset mapping mode counts, and the v6 3A regression. Any future structural expansion must add stable evidence references, complete English/Chinese human-facing content, typed relationships or explicit review rationale, and a read-back projection. Unclassified and rejected facts must have an owner, trigger, and rationale.

**中文本地化：**

**状态：** 精确 Scope 的设计记录覆盖已实现并同步；进一步的结构化语义扩充继续受治理并延期。

**负责人：** SpecForge 架构与 Agent 集成团队。

**理由：** 当前精确 Designer Scope 已为每条设计记录生成不可变且可复现的覆盖行：v13 为 `CURRENT`，307/307 条记录 `COVERED`，0 条 `BLOCKED`，0 条 `NOT_EVALUATED`，最大路径为 3 跳。资产到 3A 的派生映射为 DIRECT 38、TRACE 255、BLOCKED 14、EXEMPT 0。这表示设计事实和追溯关系已覆盖，不表示把每条记录通过自动推断提升为新的架构单元。已接受的结构基线仍为 8 个单元、42 个成员和 6 条映射，含义不明确的业务语义仍必须显式治理。

**启动条件：** 只有在来源负责人排定新的结构化语义单元后启动。每次扩展必须使用新的精确 Scope 批次、证据矩阵、双语审核、收敛对账和 Baseline 版本。

**完成证据：** 当前全目录覆盖由 `coverage-generation:designer:3a:v13`、精确 Scope 的 MCP 回读、资产到 3A 映射模式统计和 v6 3A 回归共同证明。未来结构化扩充仍必须提供稳定证据引用、完整中英文面向人内容、有类型关系或明确审核理由，并能在投影中回读；未分类和拒绝事实必须记录负责人、触发条件和理由。

## 8. Persistent High-Volume Asset-to-3A Materializer

**Status:** Deferred; the compatibility read path is bounded at 1,000 persisted coverage source rows and fails closed above that limit.

**Owner:** SpecForge Architecture and Data Platform.

**Rationale:** The current increment composes PostgreSQL-authoritative coverage, membership, and unit projections at read time. A dedicated immutable materialized mapping table, partitioning strategy, generation publication protocol, replay controls, and high-volume keyset indexes are intentionally not added until production catalog volume and query telemetry justify the extra storage lifecycle.

**Trigger:** Start when an approved enterprise Scope exceeds 1,000 coverage source rows or mapping query latency/IO telemetry requires a durable materialized read model. Open a new exact-Scope Design Change Session and preserve the current read model as the compatibility oracle during migration.

**Completion evidence:** Additive schema and migration reviewed; generation-bound rows are persisted transactionally with count/digest closure, exact-Scope indexes and keyset pagination are proven at target volume, replay and rollback are tested, PostgreSQL remains authoritative, and MCP read-back matches the compatibility oracle for DIRECT/TRACE/EXEMPT/BLOCKED outcomes.

**中文本地化：**

**状态：** 延期；当前兼容读取路径最多处理 1,000 条持久化覆盖源记录，超过后失败关闭。

**负责人：** SpecForge 架构与数据平台团队。

**理由：** 当前增量在读取时组合 PostgreSQL 权威覆盖、成员和单元投影。专用不可变映射表、分区策略、代次发布协议、重放控制和大规模 Keyset 索引暂不增加，等生产目录规模与查询遥测证明额外存储生命周期确有必要后再实施。

**启动条件：** 某个获批企业 Scope 的覆盖源记录超过 1,000 条，或映射查询延迟/IO 遥测证明需要持久化读模型时启动。必须新建精确 Scope 设计变更会话，并在迁移期间保留当前读取模型作为兼容基准。

**完成证据：** 完成增量 Schema 和迁移评审；绑定代次的行以事务方式持久化并具备数量/摘要闭包；目标规模下精确 Scope 索引和 Keyset 分页通过验证；重放和回滚通过测试；PostgreSQL 保持权威；MCP 回读与兼容模型在 DIRECT/TRACE/EXEMPT/BLOCKED 结果上保持一致。

## 9. Local Change-Attestation Hook Deployment And Signing Endpoint

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

## 10. Remove Persisted Graph Verification Fixtures From The Designer Catalog

**Status:** Deferred; explicitly excluded from Designer 3A v5.

**Owner:** SpecForge Runtime and Test Infrastructure.

**Rationale:** Nine `specforge-graph-verification-*` API assets were persisted in the authoritative Designer catalog by graph verification workflows. They have bilingual payloads but represent test fixtures rather than production design facts. Classifying them would corrupt architecture coverage, while deleting them inside the v5 membership operation would mix data repair with governed architecture authoring.

**Trigger:** Start after the fixture-producing verification path is identified and changed to use an isolated test Scope or transactional cleanup. Open a dedicated exact-Scope session before removing authoritative records.

**Completion evidence:** The producer no longer writes verification fixtures into the Designer Scope; focused tests use an isolated Scope and clean up deterministically; all nine known records are removed through an approved, audited path; MCP catalog read-back confirms their absence without changing production design assets or v5 architecture memberships.

**Design references:** ADR-0025; `docs/superpowers/specs/2026-08-15-designer-3a-v5-membership-expansion-design.md`.

**中文本地化：**

**状态：** 延期，并明确排除在 Designer 3A v5 之外。

**负责人：** SpecForge 运行时与测试基础设施团队。

**理由：** 图投影验证流程把 9 条 `specforge-graph-verification-*` API 资产写入了 Designer 权威目录。它们虽然包含双语内容，但属于测试数据，不是生产设计事实。把它们分类会污染架构覆盖；在 v5 成员操作中直接删除又会混合数据修复与受治理架构编写。

**启动条件：** 找到产生这些数据的验证路径，并改为使用隔离测试 Scope 或事务清理后启动。删除权威记录前必须创建独立的精确 Scope 会话。

**完成证据：** 生产者不再向 Designer Scope 写入验证数据；聚焦测试使用隔离 Scope 并确定性清理；9 条已知记录通过获批且可审计的路径删除；MCP 目录回读确认记录消失，同时不改变生产设计资产或 v5 架构成员。

**设计引用：** ADR-0025；`docs/superpowers/specs/2026-08-15-designer-3a-v5-membership-expansion-design.md`。
