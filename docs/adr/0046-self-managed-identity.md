# ADR-0046: Self-Managed Identity And Exact-Scope Authorization

## Status

Accepted design direction with the six review corrections. Written specification awaiting review; implementation has not started. This ADR does not certify production identity or cross-service comparison.

- Stable ADR ID: `adr-self-managed-identity`.
- Proposal: `proposal-self-managed-identity` (`reviewing`).
- Context Pack: `context-pack-self-managed-identity`.
- Owner: SpecForge Security and Platform Governance.
- Scope: `com.huawei.celon.desiner`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Design session: `design-change-session:2032b5dc-2fda-4b35-a35c-decb4c35121d`.
- Specification: `docs/superpowers/specs/2026-08-31-self-managed-identity-design.md`.

## Context

A single-enterprise deployment needs locally administered Web users and individually revocable multi-Scope Agent credentials without requiring an external identity provider. Existing global operation claims, mixed Scope inheritance rules, shared MCP credentials and actor-string review checks are insufficient contracts for this transition. The approved review requires scoped operations, precise revocation semantics, stable delegated identities, protected administration, a reviewed migration and truthful comparison results.

## Decision

1. Deliver local accounts and opaque managed Agent tokens first, within the existing deployment. Separate security administration APIs/local bootstrap commands from MCP-only design-asset writes. PostgreSQL owns identities, grants, sessions, audits and authored facts; graphs remain projections. An administrator has no implicit data-read grant; explicit self-grants require recent authentication and an audit trail.
2. Authorize each exact `(enterprise, application service, operation)` using current owner permissions intersected with the token ceiling and server policy. Do not combine independent unions of services and operations. Keep diagnostic permission explicit. Resolve database authority in server infrastructure and apply a pure shared Core policy at Web, MCP, export, statistics, graph and task-result boundaries.
3. Separate stable user ID, stable Agent ID, owner ID and credential ID. Rotation preserves Agent workspaces and scan-session attribution. Two credentials or same-owner Agents cannot manufacture independent T1 review; T2/T3 still require interactive human approval without adding an implicit two-human requirement. Unknown historical delegation needs human review or audited evidence-backed mapping.
4. Check authoritative credential/grant state on each request, including reused MCP transports; fail closed on database failure. Revocation affects checks after its commit, not already delivered data. Mutation and revocation share deterministic guard-row locking and re-read state inside the guarded transaction. New deferred effects and result reads reauthorize; committed outbox delivery retains original attribution. Bind continuations to credential context, authorization revision, exact Scope, policy and waterlines; forbid production default signing secrets.
5. Bootstrap the first administrator through a deployment-local, one-time, transactionally protected operation with no default password or automatic data grants. Separate Web sessions from Agent tokens; require vetted password/session primitives, HTTPS, CSRF defenses, expiry, throttling, redacted audit and recent authentication for sensitive administration. Protect the last administrator; password reset revokes dependent credentials. Recovery/restart must not revive revoked access.
6. Replace mixed static/inherited registry decisions with one database-backed authority. Migrate parent grants only through an administrator-approved snapshot of current leaves and operations, rejecting stale reports. Preserve assets/history, reject missing Scope, and do not import mock privileges. Production cutover invalidates old sessions/cursors and rejects static/seed/shared-token fallbacks, including unsupported stdio access. Rollback preserves revocations and authority or enters maintenance.
7. Defer multi-service comparison implementation until identity acceptance, then produce a separate specification. Authorize the complete explicit selection before reading bodies; retain per-service provenance, metric semantics, versions, coverage and trust. Inventory counts are not proof of system completeness. Agent system meaning remains readiness-gated per Scope/Profile; missing/unavailable is not zero, and independent snapshots are not a global snapshot.
8. Record this increment as design-only. Before implementation, review the written specification, choose concrete interfaces and vetted libraries in a plan, obtain a fresh exact-Scope preflight and resolve the denied trusted-read credential. Do not interpret this ADR, a reviewing Proposal or its Context Pack as implemented authentication.

## Alternatives

- OIDC-only: deferred because no external identity provider is required for the selected deployment.
- Local and OIDC together: deferred to avoid operating two credential lifecycles before the first is verified.
- Shared static production credentials: rejected because they cannot supply individual ownership, bounded delegation and revocation.
- Per-Token Agent identity or separate global permission/Scope unions: rejected because they undermine review independence and least privilege.
- A new authentication microservice or multi-tenant SaaS redesign: excluded from this increment.

## Consequences

- Local identity removes the enterprise IdP prerequisite but adds password, recovery and audit operational responsibilities.
- Authoritative checks and guard locks favor consistent revocation over unchecked authentication caching; load and deadlock behavior need focused implementation evidence.
- Existing deployments require an explicit reviewed migration, not automatic promotion of mock users and inherited permissions.
- Multi-service comparison remains tracked follow-on work owned by Security and Platform Governance, triggered by verified identity migration and separate design approval.
- Trusted knowledge consumption is currently blocked for the local MCP credential (`PERMISSION_DENIED`). Owner: Security and Platform Governance. Retry with an operator-approved exact-Scope `knowledge:consume` credential; do not self-grant or weaken readiness enforcement.

## Constraints

- All design writes use the exact owning Designer Scope and matching repository/MCP IDs, English canonical content and complete Chinese overlays.
- This record describes target behavior only; no runtime, schema, deployment, token or user grant changes are delivered in this document increment.
- Account management does not create an alternative design-asset write path. Existing design assets and historical actor attribution remain intact.
- Implementation requires the written-spec review, an implementation plan, resolved trusted-read prerequisite and fresh preflight. CodeHub, OIDC, enterprise live connectors and capacity certification remain independent backlog items.
- The current design session must not be described as fully converged while its trusted-read prerequisite is denied; record the failure and retry trigger even if document synchronization succeeds.

## Evidence

- `rg -n 'ScopedPrincipal|ScopeGrant|permissions:|decisionRef|subject|normalizeGrants|authorizePrincipalScope' packages/core/src/architecture/types.ts packages/core/src/architecture/principal.ts apps/mcp-server/src/knowledge-readiness/service.ts`: located global operation permissions and current subject/grant bindings.
- `Get-Content apps/mcp-server/src/knowledge/risk-policy.ts -TotalCount 100`: confirmed T1 actor-ID separation and T2/T3 human-type checks, motivating stable identity and delegation contracts.
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Document the approved single-enterprise self-managed identity design and six review corrections; no runtime implementation" --affected "adr-system-knowledge-readiness-gate,adr-design-context-preflight-gate,api-specforge-mcp-tools" --evidence "identity-design-review,identity-design-doc-check,identity-design-mcp-reconciliation"`: returned the exact-Scope OPEN session above, 449 assets, digest `b865cf31d6804bac8322142d1cfdbc0ffae2eb40d58844be37eee5c237c1b7a5`, latest reconciliation `UNVERIFIED`.
- MCP `evaluate_system_knowledge_readiness` with `knowledgeProfile=ARCHITECTURE_OVERVIEW`, exact Designer Scope and current local credential: `PERMISSION_DENIED`; no trusted knowledge body consumed and no success claimed. Retry as stated in Consequences.
- Runtime authentication tests: not run; no implementation delivered.
- `pnpm exec vitest run scripts/sync-design-facts.test.ts scripts/reconcile-design-facts.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'`: 2 files and 33 tests passed; this verifies the document synchronization/reconciliation machinery, not the proposed authentication runtime.
- `git diff --check`: passed, with Windows line-ending normalization warnings only.
- `$env:SPECFORGE_DESIGN_FACT_IDS = 'self-managed-identity'; node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/sync-design-facts.ts`: returned `complete` for this design record; Proposal remains `reviewing`. Only this manifest decision was selected.
- `$env:SPECFORGE_DESIGN_FACT_IDS = 'self-managed-identity'; node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/reconcile-design-facts.ts`: `missing=[]`, `mismatched=[]`, `outOfScope=[]`, `blocked=[]`, verified `self-managed-identity`. This is authored-record reconciliation, not knowledge-readiness authorization or full system convergence.

## 中文本地化覆盖

### 标题

自托管身份与精确 Scope 授权

### 状态

设计方向及六项审查修正已认可，书面设计等待审阅，尚未开始实现。稳定 ID、精确 Scope、负责人、会话和规格路径与上方一致；Proposal 为 `reviewing`。本记录不证明生产身份或跨服务比较已交付。

### 背景

单企业部署需要本地维护的 Web 用户与独立可撤销、可覆盖多个 Scope 的 Agent 凭据，不要求外部身份提供商。现有全局操作声明、混合 Scope 继承、共享 MCP 凭据与按 actor 字符串判断审批的方式不足以支撑这一迁移。审查要求明确 Scope-operation 授权、撤销语义、稳定委托身份、管理入口保护、审阅迁移与比较结果的可信边界。

### 决策

1. 先在现有部署交付本地账号和不透明托管 Agent Token。安全管理 API/本地初始化命令与 MCP-only 设计资产写入分开；PostgreSQL 对身份、授权、会话、审计和设计事实保持权威，图只是投影。管理员默认无数据读取权，显式自授权需要近期认证与审计。
2. 按精确 `(企业, 应用服务, 操作)` 计算所有者当前权限、Token 上限和服务端策略交集，不能分别合并服务与操作集合。诊断权限独立授予；服务端解析数据库权威，Core 纯策略统一用于 Web、MCP、导出、统计、图和任务结果。
3. 分离稳定用户 ID、Agent ID、所有者 ID 和凭据 ID。轮换不改变工作台和扫描会话归属；两个凭据或同所有者 Agent 不能伪造 T1 独立审批。T2/T3 仍要求交互人审，不隐式新增双人审批；未知历史委托归属转人工或凭证据留痕映射。
4. 每请求从权威库检查凭据和授权，复用 MCP 连接也复查；数据库失败则拒绝。撤销影响其提交后的检查，不追回已送达数据。写入与撤销共用固定顺序保护行锁，在受保护事务内重新读取状态。新延期效果和结果读取重新授权，已提交 Outbox 保留原始归属；续页绑定凭据上下文、授权版本、精确 Scope、策略和水位，生产禁止默认签名密钥。
5. 首管理员通过部署本地、仅一次、事务保护的操作创建，不设默认密码或自动数据授权。Web 会话与 Agent Token 分开，采用成熟密码/会话组件、HTTPS、CSRF、到期、限流、脱敏审计和敏感管理近期认证。保护最后管理员；密码重置撤销依赖凭据，恢复/重启不得复活已撤销权限。
6. 用数据库权威替代混合静态/继承注册表判断。父级授权仅按管理员批准的当前叶子服务和操作快照迁移，过期报告拒绝。保留资产与历史、拒绝缺 Scope、不导入 mock 权限。生产切换使旧会话/游标失效，拒绝 static/seed/共享 Token 回退以及不受支持的 stdio 入口；回滚保留撤销与授权权威，或进入维护。
7. 跨服务比较待身份验收后独立设计实施。显式选择集全部授权后才读正文；逐服务保留来源、指标口径、版本、覆盖和可信状态。库存数量不代表系统完整；Agent 系统语义逐 Scope/Profile 过就绪门禁；缺失/不可用不是零，独立快照不能冒充全局快照。
8. 本增量仅登记设计。实施前审阅书面规格，计划中确定具体接口与成熟库，取得新精确 Scope 预检并解决可信读取凭据拒绝。不得把 ADR、审阅中的 Proposal 或 Context Pack 解释为已实现认证。

### 备选方案

- 仅 OIDC：延期，当前选定部署不依赖外部身份提供商。
- 本地与 OIDC 同时支持：延期，避免第一套机制验证前就运营两套凭据生命周期。
- 生产共享静态凭据：否决，无法支持独立归属、有界委托和撤销。
- 每个 Token 一个 Agent 或全局权限与 Scope 分别合并：否决，破坏审批独立性和最小权限。
- 新认证微服务或多租户 SaaS 重构：不属于本增量。

### 后果

- 本地身份移除企业 IdP 前置条件，但增加密码、恢复和审计运维责任。
- 权威检查和保护锁优先保证撤销一致性，负载与死锁行为仍需实施证据。
- 现有部署需显式审阅迁移，不能自动提升 mock 用户或继承权限。
- 跨服务比较作为后续待办，由安全与平台治理团队负责，触发条件是身份迁移验证通过且独立设计获批。
- 当前本地 MCP 凭据的可信知识消费返回 `PERMISSION_DENIED`。负责人为安全与平台治理团队；管理员提供已批准的精确 Scope `knowledge:consume` 凭据后重试，不自行加权或弱化门禁。

### 约束

- 设计写入使用精确 Designer Scope、匹配的仓库/MCP ID、英文规范内容与完整中文覆盖。
- 本记录仅描述目标行为，没有运行时、Schema、部署、Token 或用户授权变更。
- 账号管理不能成为设计资产写入旁路；保留现有设计资产与历史归属。
- 实施需要书面审阅、实施计划、可信读取前提解决和新预检；CodeHub、OIDC、企业连接器和容量认证独立延期。
- 当前会话的可信读取前提仍被拒绝时，不能宣称完全收敛；即使文档同步成功也需记录失败与重试条件。

### 证据

- 上方 `rg -n 'ScopedPrincipal|ScopeGrant|permissions:|decisionRef|subject|normalizeGrants|authorizePrincipalScope' ...` 命令定位了全局操作权限及当前主体/授权绑定。
- `Get-Content apps/mcp-server/src/knowledge/risk-policy.ts -TotalCount 100` 确认 T1 按 actor ID 隔离、T2/T3 按用户类型人审，需要稳定身份和委托契约。
- 上方完整 `pnpm design-context:preflight` 命令返回精确 Scope OPEN 回执、449 条资产、指定摘要及最近对账 `UNVERIFIED`。
- 当前凭据、精确 Designer Scope、`ARCHITECTURE_OVERVIEW` 调用 MCP `evaluate_system_knowledge_readiness` 返回 `PERMISSION_DENIED`，未消费可信正文，未宣称成功；按后果中的触发条件重试。
- 新认证运行测试未执行，因为尚未交付实现。
- `pnpm exec vitest run scripts/sync-design-facts.test.ts scripts/reconcile-design-facts.test.ts --exclude '**/.worktrees/**' --exclude '**/.pnpm-store/**'`：2 个文件、33 项测试通过，只验证文档同步/对账机制，不代表拟议认证运行功能已通过测试。
- `git diff --check`：通过，只有 Windows 换行规范化提示。
- `$env:SPECFORGE_DESIGN_FACT_IDS = 'self-managed-identity'; node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/sync-design-facts.ts`：本设计记录返回 `complete`，Proposal 仍为 `reviewing`，仅选择本决策同步。
- `$env:SPECFORGE_DESIGN_FACT_IDS = 'self-managed-identity'; node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/reconcile-design-facts.ts`：缺失、内容不匹配、越 Scope、记录阻塞均为零，已验证 `self-managed-identity`；这是已编写记录对账，不代表知识就绪授权通过或全系统收敛。
