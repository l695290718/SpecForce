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

**Status:** Provider-neutral CI verifier implemented; CodeHub/CodeArts status registration externally blocked because the target CodeHub service is currently unreachable.

**Owner:** SpecForge Enterprise Integration and Repository Governance.

**Rationale:** The standalone CLI now exposes `verify-commit`, which recomputes committed-tree evidence and delegates read-only signed-attestation verification to MCP. Git still permits `--no-verify`, and Hooks are not installed automatically by clone. Repository-authoritative enforcement still requires CodeArts/CodeHub to register this command as a mandatory protected-branch status check with a CI service identity.

**Trigger:** Retry when CodeHub connectivity and a test repository are available. Then open a new exact-Scope design session, verify the platform-specific status-check or CI integration, and register the gate only after the adapter is reviewed for the target deployment.

**Completion evidence:** `specforge verify-commit --attestation <artifact>` recomputes committed-tree evidence and fails closed for missing/invalid artifacts, stale tree, wrong repository or Scope, expired or revoked signature, incomplete multi-Scope coverage, or non-converged design. `verify_change_attestation` continues to validate the signed evidence server-side. A CodeArts/CodeHub protected-branch status check must still register this command as mandatory and reject the same failure cases.

**Design references:** ADR-0017, ADR-0021, ADR-0007; local contract evidence dated 2026-08-09.

**中文本地化：**

**状态：** 平台无关 CI 校验器已实现；由于当前无法连接目标 CodeHub 服务，CodeHub/CodeArts 状态检查注册暂时受外部条件阻塞。

**负责人：** SpecForge 企业集成与仓库治理团队。

**理由：** 独立 CLI 现已提供 `verify-commit`，重新计算提交 tree 证据，并将只读签名证明校验委托给 MCP。Git 仍允许 `--no-verify`，clone 也不会自动安装 Hook。仓库权威门禁仍要求 CodeArts/CodeHub 使用 CI 服务身份注册该命令为受保护分支必选状态检查。

**启动条件：** CodeHub 恢复连接并提供测试仓库后重试。随后重新开启精确 Scope 设计会话，验证平台状态检查或 CI 集成，并完成目标部署评审后再注册门禁。

**完成证据：** `specforge verify-commit --attestation <artifact>` 重新计算提交 tree 证据，并在证明缺失或无效、tree 过期、仓库或 Scope 错误、签名过期或撤销、多 Scope 覆盖不足以及设计未收敛时失败关闭；服务端 `verify_change_attestation` 继续校验全部签名证据。CodeArts/CodeHub 仍需把该命令注册为必选状态检查并拒绝同类失败。

**设计引用：** ADR-0017、ADR-0021、ADR-0007；2026-08-09 本地契约证据。

## 3. Self-Managed Identity, Exact-Scope Authorization, And Multi-Service Comparison

**Status:** Local-account approach and six review corrections accepted; the local-account implementation increment is delivered and locally verified. Production cutover, reviewed migration application and managed-Token readiness acceptance remain pending. Bounded multi-service comparison is a separately designed dependent increment.

**Owner:** SpecForge Security and Platform Governance.

**Rationale:** A single-enterprise deployment will use administrator-managed accounts and independently revocable Agent tokens. Administrators grant exact Scope-operation tuples; authorized users issue, rotate and revoke credentials only for their own Agents, and the server caps every Token to the user's current tuples. Permissions must intersect per exact Scope and operation, not as separate global unions. Stable Agent identity, owner-aware review separation, transactionally ordered revocation, protected bootstrap/recovery, and a reviewed migration replace shared/static identity assumptions. PostgreSQL remains authoritative. Cross-service inventory is not proof of complete system knowledge.

**Trigger:** During a maintenance window, apply the reviewed migration report, configure HTTPS/TLS and non-default secrets, then issue the first owner-bounded Token through the Web control plane and use it for readiness and bounded-read acceptance. The cutover gate must pass before production identity is certified. Comparison starts only after the identity acceptance matrix passes and its separate specification is approved. OIDC, multi-tenant SaaS and CodeHub are not prerequisites or included deliverables.

**Completion evidence:** Local-account persistence, exact operation policy, MCP resolver, Web sessions/CSRF, administration routes/screens, bootstrap/recovery, migration report/application and read-only deployment cutover gate are implemented. Focused identity/MCP/Web checks pass; `identity:cutover-check` correctly blocks the current legacy environment. Production migration, HTTPS/TLS, owner-issued Token readiness acceptance and final MCP session closure remain open.

**Design references:** ADR-0046, ADR-0045, ADR-0039, ADR-0001, ADR-0002, ADR-0010, ADR-0021, ADR-0022; `docs/superpowers/specs/2026-08-31-self-managed-identity-design.md`. MCP tracking: `proposal-self-managed-identity` (`reviewing`) and `context-pack-self-managed-identity`.

**中文本地化：**

**状态：** 本地账号方案与六项审查修正已认可，本地账号实现增量已交付并通过聚焦验证。生产切换、审阅迁移、Token 就绪验收仍待完成；有界跨服务比较依赖其验收并单独设计。

**负责人：** SpecForge 安全与平台治理团队。

**理由：** 单企业部署采用管理员维护的账号和可独立撤销的 Agent Token；管理员授予精确 Scope-operation 组合，获得授权的用户只能为自己的 Agent 签发、轮换和撤销凭据，服务端将每个 Token 限制在用户当前组合内。权限按精确 Scope 与操作求交，不能分别合并两个全局集合。稳定 Agent 身份、按归属判断审批独立、事务排序撤销、受保护初始化/恢复和审阅迁移取代共享/静态身份假设。PostgreSQL 保持权威，跨服务库存不等于完整系统知识。

**启动条件：** 在维护窗口应用审阅迁移报告，配置 HTTPS/TLS 与非默认密钥，通过前端签发首个所有者有界 Token，并使用该 Token 做就绪和有界读取验收。切换门禁通过后才可声明生产身份完成；身份验收矩阵通过后，才审阅并实施独立比较方案。OIDC、多租户 SaaS 和 CodeHub 不是本次前置条件或交付项。

**完成证据：** 已实现本地身份持久化、精确操作策略、MCP 解析器、Web 会话/CSRF、管理接口和页面、初始化/恢复、迁移报告与应用、只读部署切换门禁；聚焦身份/MCP/Web 检查通过，门禁正确阻止当前旧环境。生产迁移、HTTPS/TLS、所有者 Token 就绪验收和最终 MCP 会话关闭仍待完成。

**设计引用：** ADR-0046、ADR-0045、ADR-0039、ADR-0001、ADR-0002、ADR-0010、ADR-0021、ADR-0022；`docs/superpowers/specs/2026-08-31-self-managed-identity-design.md`。MCP 跟踪记录为 `proposal-self-managed-identity`（`reviewing`）与 `context-pack-self-managed-identity`。

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

**Status:** Target design and implementation plan accepted on 2026-08-20. The semantic projection core increment is locally verified for exact source binding, deterministic materialization, typed Gateway delivery, PostgreSQL ACTIVE resolution, bounded lifecycle, query fallback, and compatibility tests. Live semantic build/publish, Phase 2 production operations, and Phase 3 scale certification remain open.

**Owner:** SpecForge Runtime for projection and Projector health; SpecForge Architecture for MCP synchronization.

**Rationale:** The current NebulaGraph projection stores design-asset identities and current typed relationships. The accepted target uses a shared Space with exact-Scope, Manifest-qualified identities and bounded BUILDING, ACTIVE, and PREVIOUS slots. PostgreSQL controls atomic publication and preserves complete history; NebulaGraph remains a rebuildable online projection. Enterprise multi-node operations and billion-scale certification remain separately evidenced phases.

**Trigger:** Run the semantic verification script against a running exact-Scope build/publish fixture to close the remaining local operational evidence. Phase 2 starts after semantic parity and rollback pass; Phase 3 starts only on a production-representative topology with an approved workload and capacity plan.

**Completion evidence:** The semantic core must implement Knowledge Assertion vertices, explicit source-manifest binding, Manifest-qualified identities, versioned relationship edges, generation-aware checkpoints, bounded publication/rollback/cleanup, semantic query/fallback, and PostgreSQL/Nebula parity. Phase 2 must prove external multi-node configuration, Kubernetes, secrets, backup/restore, object storage, observability, and failure recovery. Phase 3 must publish auditable `10M`, `100M`, and `1B` certification reports before claiming each tier. Synchronize matching ADR, Proposal, Context Pack, Evidence, backlog state, and typed links through MCP for every phase.

**Current evidence:** `pnpm db:generate`, Core/Graph Projector typechecks, 8 focused Vitest files with 27 tests, Gateway `go test ./...`, and the graph configuration check pass. The Gateway resolves ACTIVE from PostgreSQL; local Compose connects it to the canonical database through `deploy_default`. `deploy/graph/verify-semantic-projection.ps1` is a health/query check and explicitly does not claim live build/publish parity. Implementation session `design-change-session:aa74dafc-08bb-4378-990f-ec38cf62d609` closed as `CONVERGED` after MCP synchronization, exact-Scope read-back, and closure evidence.

**Design references:** ADR-0005, ADR-0006, ADR-0012, ADR-0018, ADR-0019, ADR-0022, ADR-0036; `docs/superpowers/specs/2026-08-20-bounded-nebula-knowledge-projection-generations-design.md`; `docs/superpowers/specs/2026-08-20-nebula-3a-semantic-projection-core-design.md`; `docs/superpowers/plans/2026-08-20-nebula-3a-semantic-projection-core.md`; `deploy/graph/verify-projection.ps1`.

**中文本地化：**

**状态：** 目标设计和实施计划已于 2026-08-20 接受。语义投影核心增量已完成精确源绑定、确定性物化、类型化 Gateway 投递、PostgreSQL ACTIVE 解析、有界生命周期、查询回退和兼容性测试的本地验证。运行中的语义构建/发布、第二阶段生产运维和第三阶段规模认证仍待完成。

**负责人：** SpecForge Runtime 负责投影和 Projector 健康；SpecForge Architecture 负责 MCP 同步。

**理由：** 当前 NebulaGraph 投影保存设计资产身份和当前类型关系。已接受的目标是在共享 Space 中采用精确 Scope、包含 Manifest 的图身份以及有界 BUILDING、ACTIVE、PREVIOUS 三槽模型。PostgreSQL 控制原子发布并保存完整历史，NebulaGraph 保持可重建在线投影。企业多节点运维和十亿级规模认证仍作为独立取证阶段处理。

**启动条件：** 运行精确 Scope 的语义构建/发布夹具并完成验证脚本，以补齐当前本地运行证据；第二阶段在语义一致性和回滚通过后启动；第三阶段只能在生产代表性拓扑、工作负载和容量计划获批后启动。

**完成证据：** 语义核心必须实现 Knowledge Assertion 顶点、显式源 Manifest 绑定、包含 Manifest 的身份、版本化关系边、代次感知检查点、有界发布/回滚/清理、语义查询/回退以及 PostgreSQL/Nebula 一致性。第二阶段必须证明外部多节点配置、Kubernetes、密钥、备份恢复、对象存储、可观测性和故障恢复。第三阶段必须发布可审计的 `10M`、`100M`、`1B` 认证报告，未通过的级别不能对外宣称。每个阶段都必须通过 MCP 同步匹配的 ADR、Proposal、Context Pack、Evidence、待办状态和有类型关系。

**当前证据：** `pnpm db:generate`、Core/Graph Projector 类型检查、8 个文件 27 项聚焦 Vitest 测试、Gateway `go test ./...` 和图配置检查通过。Gateway 从 PostgreSQL 解析 ACTIVE；本地 Compose 让 Gateway 连接规范数据库。`deploy/graph/verify-semantic-projection.ps1` 是健康/查询检查，在运行中的语义构建夹具出现前不宣称实时构建/发布一致性。实施会话 `design-change-session:aa74dafc-08bb-4378-990f-ec38cf62d609` 已在 MCP 同步、精确 Scope 回读和关闭证据完成后关闭为 `CONVERGED`。

**设计引用：** ADR-0005、ADR-0006、ADR-0012、ADR-0018、ADR-0019、ADR-0022、ADR-0036；`docs/superpowers/specs/2026-08-20-bounded-nebula-knowledge-projection-generations-design.md`; `docs/superpowers/specs/2026-08-20-nebula-3a-semantic-projection-core-design.md`; `docs/superpowers/plans/2026-08-20-nebula-3a-semantic-projection-core.md`; `deploy/graph/verify-projection.ps1`; `deploy/graph/verify-semantic-projection.ps1`。

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

## 11. Production Certification For The Data Model ER Workspace

**Status:** Deferred; repository implementation is present, but MCP read-back, fresh browser acceptance, and production capacity certification are not claimed.

**Owner:** SpecForge Architecture and Web Runtime.

**Rationale:** The current slice provides exact-Scope reads, PixiJS WebGL rendering, semantic fallback, URL state, and bounded client-capacity semantics. External identity, continuous legacy synchronization, graph-store scale, and fresh visual acceptance require environment-specific evidence.

**Trigger:** Run the exact Designer-Scope design-fact synchronization and read-back, start the canonical Web service, perform desktop and compact browser checks, and certify declared capacity with production telemetry.

**Completion evidence:** MCP records and typed links read back with no missing, mismatched, out-of-scope, or blocked facts; the browser confirms MODEL/SCOPE isolation, filters, selection, bilingual rendering, WebGL fallback, and snapshot recovery; production capacity is measured rather than inferred.

**中文本地化：**

**状态：** 延期；仓库实现已存在，但未声明 MCP 回读、新的浏览器验收和生产容量认证已完成。

**负责人：** SpecForge 架构与 Web 运行时团队。

**理由：** 当前切片提供精确 Scope 读取、PixiJS WebGL 渲染、语义回退、URL 状态和有界客户端容量语义。外部身份、存量系统持续同步、图存储规模和新的视觉验收需要依赖环境的证据。

**启动条件：** 在精确 Designer Scope 执行设计事实同步与回读，启动权威 Web 服务，完成桌面和紧凑视口检查，并用生产遥测认证声明的容量。

**完成证据：** MCP 记录与有类型链接回读时 missing、mismatched、outOfScope、blocked 均为空；浏览器确认 MODEL/SCOPE 隔离、过滤、选择、双语、WebGL 回退和快照恢复；生产容量通过测量得到而非推断。

## 12. Evidence-Driven Requirement Assessment Center Phase 2/3

**Status:** Deferred; Phase 1 is limited to exact-Scope design evidence, durable assessment runs, deterministic coverage, heuristic planning ranges, explicit AI token budgets, and governed implementation handoff.

**Owner:** SpecForge Architecture, AI Governance, and Integration.

**Rationale:** The first release must not fabricate precision or pretend that source-code and runtime semantics are already available. Repository/code ownership mappings, OpenAPI and schema observations, test coverage, deployment topology, selected runtime evidence, calibration samples, and connector delivery require separate evidence and operational ownership.

**Trigger:** Start Phase 2 when approved repository and runtime evidence sources are available for the target Scope. Start Phase 3 only after representative completed work items and actual execution/token records are retained for calibration and backtesting.

**Deferred work:** Phase 2 adds bounded repository/code ownership, API/schema, test, deployment, and selected runtime evidence adapters with provenance and redaction. Phase 3 adds ExecutionActual ingestion, representative-sample thresholds, backtesting, drift monitoring, and calibrated P50/P90 quality reporting. External CodeHub or other connector delivery remains a separately governed increment.

**Completion evidence:** Each phase has a new exact-Scope design session, bilingual MCP assets and typed links, immutable evidence snapshots, source digests, rejection and retry states, focused tests, reconciliation read-back, and updated Context Packs. Calibration must demonstrate error metrics and drift controls before P50/P90 is exposed.

**中文本地化：**

**状态：** 延期；第一阶段仅覆盖精确 Scope 设计证据、持久化评估运行、确定性覆盖、启发式规划区间、明确 AI Token 预算和受治理的实现交接。

**负责人：** SpecForge 架构、AI 治理与集成团队。

**理由：** 第一阶段不能伪造精度，也不能假设代码和运行时语义已经可用。仓库/代码归属、OpenAPI 与 Schema 观测、测试覆盖、部署拓扑、选定运行时证据、校准样本和连接器交付都需要独立证据与运营负责人。

**启动条件：** 目标 Scope 有获批的仓库和运行时证据来源时启动第二阶段；只有在保留足够代表性的已完成工作项、实际执行记录和 Token 记录后，才启动第三阶段校准与回测。

**延期工作：** 第二阶段增加带来源和脱敏能力的有界仓库/代码归属、API/Schema、测试、部署和选定运行时证据适配器。第三阶段增加 ExecutionActual 接入、代表性样本阈值、回测、漂移监控和校准后的 P50/P90 质量报告。CodeHub 或其他外部连接器交付仍是独立治理增量。

**完成证据：** 每个阶段都必须有新的精确 Scope 设计会话、双语 MCP 资产和有类型链接、不可变证据快照、来源摘要、拒绝与重试状态、聚焦测试、对账回读和更新后的 Context Pack。只有校准证明误差指标和漂移控制后，才允许暴露 P50/P90。

## 13. Designer 3A v7 Candidate Set Publication

**Backlog ID:** `backlog-designer-3a-v7-candidate-publication`

**Status:** Deferred. The governed candidate analysis and publication path is implemented, but no concrete v7 Candidate Set is approved for publication yet.

**Owner:** SpecForge Architecture and the authorized Designer Agent for `com.huawei.celon.desiner`.

**Rationale:** Candidate analysis must not invent architectural intent from names, graph proximity, or incomplete evidence. The v6 Baseline remains the last known-good authority until a concrete candidate passes review, promotion, reconciliation, and projection read-back.

**Trigger:** Start when an authorized Agent supplies an evidence-bound Candidate Set against the current published Baseline and all review, promotion, reconciliation, and projection read-back checks pass.

**Completion evidence:** A candidate batch is persisted through MCP in the exact Scope, passes deterministic closure and freshness checks, receives ReviewBundle approval, is promoted and reconciled, and is read back from the published Baseline and derived projection. Update this item and preserve the candidate IDs and evidence references.

**Design references:** ADR-0044, `docs/superpowers/plans/2026-08-30-designer-3a-v7-structural-semantic-expansion.md`, `scripts/analyze-designer-3a-v7.ts`, `scripts/publish-designer-3a-v7.ts`。

**中文本地化：**

**待办标识：** `backlog-designer-3a-v7-candidate-publication`

**状态：** 延期。候选分析与发布治理路径已经实现，但当前还没有获准发布的具体 v7 候选集。

**负责人：** `com.huawei.celon.desiner` 的 SpecForge 架构团队及获授权的 Designer Agent。

**理由：** 候选分析不能从名称、图邻近关系或不完整证据中臆造架构意图。在具体候选集通过审核、晋升、对账和投影回读前，v6 Baseline 仍是最后一个已知可靠的权威版本。

**启动条件：** 获授权 Agent 针对当前已发布 Baseline 提供带证据的候选集，并且审核、晋升、对账和投影回读全部通过后启动。

**完成证据：** 候选批次通过精确 Scope 的 MCP 持久化，确定性闭包和新鲜度校验，ReviewBundle 审批，晋升与对账，并从已发布 Baseline 和派生投影回读。完成后更新此项，并保留候选 ID 和证据引用。

**设计引用：** ADR-0044、`docs/superpowers/plans/2026-08-30-designer-3a-v7-structural-semantic-expansion.md`、`scripts/analyze-designer-3a-v7.ts`、`scripts/publish-designer-3a-v7.ts`。

## 14. System Knowledge Readiness Gate Productionization

**Backlog ID:** `backlog-system-knowledge-readiness-productionization`

**Status:** Deferred. The exact-Scope readiness gate and bounded MCP read path are implemented; production source onboarding and operational completion are intentionally separate increments.

**Owner:** SpecForge platform governance.

**Rationale:** SpecForge may be the sole knowledge source only for a declared Profile when the scoped receipt proves coverage, freshness, authority, reconciliation, authorization, and pagination completeness. It must not imply that a static catalog or local test evidence represents every enterprise system.

**Deferred items and triggers:**

- **Production source onboarding:** register approved repositories, OpenAPI/schema sources, deployment metadata, and runtime telemetry when enterprise source owners and credentials are available.
- **Continuous legacy synchronization:** start after the first approved source connector has a retry, dead-letter, redaction, provenance, and owner acceptance runbook.
- **Cross-Scope readiness aggregation:** start when a governed product-level use case requires comparisons across application services and a non-leaking aggregation contract is approved.
- **Web policy administration:** start when operators need UI management and dashboarding for readiness policies without bypassing MCP governance.
- **External production identity:** start when enterprise identity, service-to-service tokens, rotation, and audit integration are available.
- **Automatic remediation:** start only after typed remediation actions have approval, idempotency, rollback, and audit contracts.
- **Production capacity certification:** start after representative telemetry can certify receipt retention, source scale, pagination, and latency targets.

**Completion evidence:** Each item has an exact-Scope design session, bilingual MCP assets, typed links, immutable evidence, reconciliation read-back, and an updated Context Pack. Until then, `SOURCE_CHECK_REQUIRED` or `BLOCKED` remains a valid result and no complete system claim is made.

### 系统知识可信读取门禁生产化

**待办标识：** `backlog-system-knowledge-readiness-productionization`

**状态：** 延期。精确 Scope 的就绪门禁和有界 MCP 读取路径已经实现；生产来源接入和运营闭环明确拆分为独立增量。

**负责人：** SpecForge 平台治理团队。

**理由：** 只有在声明的 Profile 下，精确 Scope 收据证明覆盖、新鲜度、权威性、对账、授权和分页完整性时，SpecForge 才能作为唯一知识来源。静态目录或本地测试证据不能代表所有企业系统。

**延期事项与启动条件：**

- **生产来源接入：** 企业来源负责人和凭据就绪后，注册获批准的仓库、OpenAPI/Schema、部署元数据和运行时遥测来源。
- **持续存量同步：** 首个获批连接器具备重试、死信、脱敏、来源追溯和负责人验收运行手册后启动。
- **跨 Scope 就绪聚合：** 需要跨应用服务比较的受治理产品场景和防泄漏聚合契约获批后启动。
- **Web 策略管理：** 运维需要 UI 管理和仪表盘，且不会绕过 MCP 治理时启动。
- **外部生产身份：** 企业身份、服务间 Token、轮换和审计集成就绪后启动。
- **自动修复：** 类型化修复动作具备审批、幂等、回滚和审计契约后启动。
- **生产容量认证：** 有代表性的遥测能够认证收据保留、来源规模、分页和延迟目标后启动。

**完成证据：** 每项能力都必须拥有精确 Scope 设计会话、双语 MCP 资产、有类型关系、不可变 Evidence、对账回读和更新后的 Context Pack。在此之前，`SOURCE_CHECK_REQUIRED` 或 `BLOCKED` 都是合法结果，系统不得声明完整系统事实。
