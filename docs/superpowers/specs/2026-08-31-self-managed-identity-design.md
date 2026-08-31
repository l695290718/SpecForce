# Self-Managed Identity And Exact-Scope Authorization

## Status And Delivery Boundary

Design revision following the approved six-point review. English is canonical; the Chinese overlay below covers all decision sections. This is a design-only delivery, not an implemented authentication system or production certification. Review this written specification before creating the implementation plan.

- Owner: SpecForge Security and Platform Governance.
- ADR: `adr-self-managed-identity`, repository `docs/adr/0046-self-managed-identity.md`.
- Proposal: `proposal-self-managed-identity`, status `reviewing`.
- Context Pack: `context-pack-self-managed-identity`.
- Design session: `design-change-session:2032b5dc-2fda-4b35-a35c-decb4c35121d`.
- Owning Scope: `com.huawei.celon.desiner`.
- Exact path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.

### Delivery Update

The current implementation session is `design-change-session:887d3af4-98ca-44c1-83de-a97eb5d6c9bc`. The local-account increment is delivered and locally verified. It includes additive Prisma identity persistence, Argon2id password hashing, opaque managed credentials, exact operation checks, MCP resolution, Web sessions/CSRF, administration routes and screens, bootstrap/recovery, migration reporting/application, and a read-only deployment cutover gate. Production migration, HTTPS/TLS configuration, and managed-Token knowledge-readiness acceptance remain pending.

The first implementation increment is local accounts, stable Agent identities, managed credentials, a shared authorization boundary, and safe migration. Multi-service comparison is a dependent, separately planned increment; section 9 constrains that future design rather than declaring it implemented.

## 1. Deployment And Alternatives

One deployment serves one enterprise. Resolve the enterprise identifier on the server; callers cannot choose a tenant. Existing `tenantId` fields are not proof of multi-tenant row isolation. Retain the existing Web, MCP, PostgreSQL and derived graph topology; do not add an authentication microservice.

Selected: administrator-managed local accounts and revocable opaque Agent tokens. This works without an enterprise identity provider but requires password, credential and recovery operations. OIDC-only is deferred because the deployment does not currently require an available identity provider. Supporting local accounts and OIDC simultaneously is deferred to avoid implementing two lifecycle systems before the first is verified. Shared static credentials are not a production substitute.

## 2. Control Plane And Data Plane

Security administration creates, disables and recovers accounts, grants exact Scope-operation tuples, and audits those actions through authenticated same-origin Web administration APIs and a deployment-local bootstrap/recovery command. An authorized user then creates, rotates and revokes credentials only for their own stable Agent identities through the same Web control plane. The server intersects the requested Token ceiling with that user's current grants before issuing a Token. Its PostgreSQL transactions must not depend on an MCP token that has not yet been created.

Authored ADRs, Proposals, Context Packs, contracts and typed design links still enter through MCP. A security administration API is not an alternative design-asset write endpoint. PostgreSQL remains authoritative; a graph projection cannot authenticate, grant access or approve a write.

Platform administration is distinct from application-service permissions. An administrator can provision an explicit grant, including an audited self-grant, but being an administrator alone does not expose design bodies or grant ordinary Agent tokens account-management authority. Grant changes require recent interactive authentication and record the initiating user, affected subject, Scope, operation and reason. Initial grants are empty.

## 3. Identity And Persistence Contracts

These are conceptual records, not a claim that the Prisma tables already exist. Reuse and migrate existing actor/grant records where compatible; do not create competing grant authorities.

| Record | Responsibility and invariants |
| --- | --- |
| User account | Stable subject ID, login identifier, password hash, enabled state, credential and authorization versions. Disable does not delete historical attribution. |
| Agent identity | Stable Agent subject ID and owner user ID. Token rotation preserves Agent ID, workspace ownership and scan-session attribution. Changing owner is not supported in the first increment. |
| Agent credential | Public lookup ID, secret digest, Agent ID, token ceiling, expiry, revoked timestamp and version. A credential cannot choose its actor type or owner. |
| Scope-operation grant | One subject, one existing application service and one operation. Exact leaf grants only; no wildcard or inherited grant at request time. |
| Web session | Opaque random session digest, user ID, credential version, idle and absolute expiry, revocation state. No Agent tokens in browser session state. |
| Security audit | Actor, credential/session identifier, owner, action, target, outcome and request correlation. No raw credentials, passwords or unauthorized asset bodies. |

Each Agent token is minted by its authorized owner for an existing Agent identity they own. Several tools may use distinct credentials for the same Agent; distinct Agents are explicitly registered, not inferred from token count. Token creation accepts only requested exact Scope-operation tuples that are already held by the user, and always records the owner, requested ceiling, expiry and issuance audit. User disable invalidates all their sessions and owned Agent credentials. Rotation replaces the secret without changing the stable subject.

Approval independence follows stable authorship and delegation, not credential count: an Agent cannot approve its own generated candidate; two Agents under the same owner do not count as independent for a T1 review. T2/T3 continue to require an interactive human identity. This does not introduce a two-human rule for T2/T3: a human owner may explicitly review an Agent draft unless a separately governed policy requires a different human. An Agent token must never present itself as a human session.

Historical assertions lacking delegated-owner provenance cannot establish independent Agent review merely from different actor strings. Require an explicit human review or an audited, evidence-backed identity mapping; never invent an owner or silently rewrite historical authorship.

## 4. Exact-Scope Authorization

For an Agent request, authorize the specific tuple `(enterprise, applicationServiceId, operation)` only if all of the following hold:

1. The credential, Agent and owner are active and unexpired; the request authentically binds all three.
2. The service exists in the authoritative registry, and the supplied path, if present, matches its current exact path.
3. The owner has this operation on this service now.
4. The credential ceiling includes this operation on this same service.
5. Server policy, resource rules and required knowledge-readiness checks allow the operation.

Web requests use the current user's grants and session validity without an Agent ceiling. Operations such as `asset:read`, `asset:write`, `governance:run`, `knowledge:consume` and `knowledge:diagnostic` remain separate. Diagnostic access is explicit and must not follow automatically from ordinary read access. Write does not silently imply read or grant administration. UI role presets may select explicit tuples but are not another runtime authorization source.

Do not compute the union of all Scopes separately from the union of all operations. For example, governance on A plus asset editing on B must never allow governance on B. Token issuance validates the complete requested ceiling against the user's current tuples and rejects unsupported entries; later user grants cannot enlarge an already issued ceiling.

Resolve credentials and registry snapshots in the server infrastructure layer. Keep a pure shared policy evaluator in Core; do not open database connections inside synchronous Core helpers. Web pages, server actions, APIs, MCP HTTP tools, exports, statistics, graph reads and task-result downloads all invoke the same policy boundary. Authorization runs before body reads or shared-cache delivery. Unknown and unauthorized explicit targets have the same no-leak denial shape; discovery returns only readable services.

## 5. Revocation, Transactions And Continuations

The first increment uses authoritative PostgreSQL credential/grant checks on every request, including each MCP request on a reused transport. No cross-request positive authorization cache. Within a request, resolved claims may be reused. Database/authentication failure denies access; it never falls back to static or seed identity.

After a revocation transaction commits, a subsequent authorization check rejects the credential. Responses already delivered cannot be recalled, and an already authorized read may finish. Do not promise retroactive cancellation of all in-flight work.

For mutating transactions, authorization and revocation share a serialization boundary: take locks on the relevant owner/subject/credential guard rows in a documented deterministic order, re-read current state and grants, authorize, and commit the mutation and audit while holding those locks. All grant-reduction, account-disable and credential-revoke paths must acquire the same guards. If revocation commits first the mutation fails; if the mutation wins, it commits before revocation can complete. A second unprotected check alone does not meet this contract.

Already accepted outbox delivery is completion of a committed operation, not new user authorization. Deferred user actions must authorize again before committing new effects; result polling, downloading and export access authorize afresh. Retain the original actor and credential in audit history.

Bind cursors and readiness receipts to stable subject, owner/delegation context, credential/session identity or generation, authorization revision, selected Scopes, query, locale, policy and per-Scope waterlines as applicable. Every continuation authenticates again. Permission change, credential change, expired receipt or changed waterline invalidates reuse. A cursor or receipt is never a bearer authorization grant. Production signing keys must be explicit and rotatable; development default secrets are forbidden in local-account production mode.

## 6. Bootstrap, Login And Recovery

First administrator initialization is deployment-local, guarded by a database singleton lock/constraint, and succeeds once. There is no public first-user-wins endpoint and no default password. Read secrets from a protected input channel, not command-line arguments or logs. The first administrator receives control-plane access and zero automatic design-data grants.

Accounts are created by administrators; public registration is out of scope. Use a vetted authentication/password library with a password-specific hash and maintained security parameters, not the fast digest used for high-entropy random tokens. Token plaintext is shown once, never placed in URLs or browser local storage. Session cookies use HttpOnly, Secure under production HTTPS, SameSite and explicit CSRF/origin validation for mutations. Define idle and absolute session expiry; require recent authentication for grant, password and token administration. Login and recovery failures are generic and rate-limited with deployment-shared state.

Recovery uses a local operator command with database access, not an unauthenticated HTTP reset path. A password reset invalidates all Web sessions and owned Agent credentials. Prevent deletion/demotion/disable of the last enabled administrator under a common lock. Recovery preserves audit history and does not create implicit data grants. Restart/bootstrap must not resurrect revoked credentials, disabled users or removed grants. Successful security mutations and their audit records commit atomically; audit write failure aborts the mutation.

## 7. Migration And Compatibility

Inventory every authentication entry point, registry lookup, Scope inheritance helper, cache, cursor, background job and legacy actor before implementation. Cover the inconsistent exact-only and parent-inheritance paths found in review, including absent-Scope data handling. Missing Scope is a rejection/quarantine condition for protected design assets, not universal visibility.

Prepare an additive schema and a read-only migration report. Preserve existing Scopes, design assets and history. Replace hard-coded registry decisions with the authoritative registry; retain hierarchy only for navigation and explicit batch selection. Translating a legacy parent grant requires an administrator-approved snapshot of the current leaf services and operations. Freeze grant/registry changes during application of the approved report or reject a stale report by version. New services receive no inherited privileges. Do not import mock grants or shared actor identities as real users automatically.

The cutover is explicit and audited. Use a maintenance window for the authority switch; terminate old sessions/transports, invalidate legacy cursors and refuse startup with mixed production identity sources. The old environment shared token, static principal and seed fallback cannot remain active in local-account production mode. Local stdio clients must use a supported managed-credential path or be rejected in that mode; direct database-backed seed stdio remains a development-only administrative mechanism, not a distributed production client.

Rollback restores a compatible application while preserving credential revocations and the active authorization authority, or leaves the service in maintenance. It must not restore old shared credentials or stale grants to recover availability. Existing static deployments remain explicitly transitional until operators perform this reviewed cutover; this design document does not change a running deployment.

## 8. Focused Acceptance Matrix

One consolidated verification pass per completed implementation increment must demonstrate:

| Case | Required result |
| --- | --- |
| Scope-operation cross product | A-governance plus B-edit cannot govern B; denied body is empty. |
| Revocation | Reused MCP transport, old Cookie, cursor, export and task download fail subsequent authorization after revocation. |
| Write/revoke race | Transaction ordering satisfies section 5 for both race orders. |
| Agent rotation and review | Rotation preserves workspace/session identity; same owner with two Agent credentials cannot manufacture independent T1 approval. |
| Bootstrap/recovery races | One initial administrator; last-admin protection; reset revokes dependent credentials; restart does not restore grants. |
| Registry migration | Reviewed parent-to-leaf mapping only; new leaves inaccessible; missing and stale paths denied; existing design history preserved. |
| Complete entry-point coverage | Web/MCP/export/statistics/graphs/actions use the shared policy; seed/static/stdio production bypass rejected. |
| Credential hygiene | Secret not logged or cached in browser; CSRF, expiry, throttling and audit failures reject correctly. |
| Governance delivery | Matching bilingual ADR/Proposal/Context Pack and typed links, exact-Scope MCP reconciliation, and the same design-session closure. |

No runtime tests for this new identity system have been run because implementation has not started. An implementation plan must choose the vetted libraries and concrete endpoints before editing runtime code and must not expand to an independent identity service or multi-tenant platform. After the first front-end-issued managed Token exists, the acceptance suite must use it to test `knowledge:consume`; this is not a bootstrap prerequisite for implementing local identity.

## 9. Dependent Multi-Service Comparison Boundary

Owner: SpecForge Security and Platform Governance. Status: deferred implementation, dependency on the verified identity increment. Trigger: identity migration and the matrix above pass, then approve a separate comparison specification and implementation plan.

Comparison is read-only over a user-selected bounded set of authorized services. Validate the entire explicit selection before reading any design bodies; reject an unauthorized member without revealing its existence. Discovery only lists readable services. Repeat authorization for continuation and download. Preserve provenance, metric definition, `asOf`, catalog/projection/source waterlines, coverage and trust status per service. Never merge same-name assets into one identity or create cross-Scope write authority.

Catalog inventory counts measure stored records, not system completeness, complexity or readiness. They may be compared with explicit freshness/coverage limits; they are not a way to bypass `read_system_knowledge`. Any Agent consumption of system meaning remains separately gated per Scope and Profile. A failed/unscanned service is unavailable/unknown, not zero; pagination and trust completeness are different. Do not declare one globally consistent snapshot from independently read service versions. Reuse bounded Atlas and scoped-read mechanisms, but define concrete budgets and comparison-specific continuation bindings in the separate specification. No unbounded join or unrestricted enterprise dashboard.

## 10. Evidence And Current Limitation

### Current Implementation Evidence

- `pnpm --filter @specforge/identity test`: PASS, 4 tests.
- `pnpm exec vitest run apps/web/lib/3a/principal.test.ts apps/mcp-server/src/auth.test.ts`: PASS, 9 tests.
- `pnpm --filter @specforge/web typecheck`: PASS.
- `SPECFORGE_NEXT_STANDALONE=0 pnpm --filter @specforge/web build`: PASS; all 36 routes generated, including `/login` and `/identity`. The default standalone trace is blocked only by symlink creation permissions in the Windows OneDrive workspace (`EPERM`), not by application compilation.
- `pnpm identity:cutover-check`: BLOCKED as expected for the current legacy deployment environment; it is read-only and does not disclose secret values.
- The first front-end-issued managed Token must still be used for `evaluate_system_knowledge_readiness` and bounded reading before production identity is certified.

- Repository review located the global `ScopedPrincipal.permissions`, inherited `hasScopeAccess`, exact `authorizePrincipalScope`, actor-based candidate approval, environment MCP token and optional cursor grant binding. These support the six corrections, not a claim that the corrections are implemented.
- Exact-Scope preflight returned the session above, `readAssetCount=449`, `designContextDigest=b865cf31d6804bac8322142d1cfdbc0ffae2eb40d58844be37eee5c237c1b7a5`, and reconciliation `UNVERIFIED` (not `CONVERGED`).
- `evaluate_system_knowledge_readiness` using the current local design-context seed credential returned `PERMISSION_DENIED` because that seed fixture deliberately omits `knowledge:consume`; the old HTTP static-claims fixture includes it. Neither fixture is a managed user credential. This is evidence for removing the circular bootstrap prerequisite, not a reason to weaken readiness. After the identity increment issues a bounded Token through the Web control plane, rerun evaluation and bounded reading with that Token as acceptance evidence.
- Design synchronization and written-spec review cannot certify production identity, a complete source inventory or live enterprise connectivity. CodeHub remains a separate externally blocked backlog item.

Security references: [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). These inform least privilege, repeated authorization and session lifecycle requirements; they are not a certification of this project.

## 中文本地化覆盖

### 状态与交付范围

这是吸收六项审查修正后的设计文档，不是已经实现的认证系统，也不是生产认证。英文为规范字段。本次只登记设计，书面设计通过审阅后再写实施计划。负责人为 SpecForge 安全与平台治理团队；ADR、Proposal、Context Pack、精确 Scope 和会话 ID 与上方元数据一致。Proposal 保持 `reviewing`。第一增量只实现身份、凭据、统一授权和安全迁移；跨服务比较是依赖它的独立增量。

### 1. 部署与备选方案

一个部署服务一家企业，企业标识由服务端确定，调用者不能选择租户；现有 `tenantId` 不代表已经实现多租户行隔离。保留现有 Web、MCP、PostgreSQL 和派生图拓扑，不增加认证微服务。采用管理员维护本地账号与可撤销的不透明 Agent Token，承担相应密码与恢复运维成本。OIDC-only、同时支持本地与 OIDC 均延期；共享静态凭据不能代替生产身份。

### 2. 管理接口与设计资产接口

账号创建、禁用、恢复和精确 Scope-operation 授权通过已认证的同源 Web 管理接口及部署本地初始化/恢复命令维护，不能依赖尚未创建的 MCP Token。获得授权的用户可以在前端只为自己拥有的稳定 Agent 创建、轮换和撤销 Token；服务端把用户当前授权与请求上限求交后才签发。ADR、Proposal、Context Pack、契约与有类型设计关系仍只能通过 MCP 写入。PostgreSQL 保持权威，图投影不能授予权限。平台管理员默认没有设计资产读取权；可显式授权，包括留痕的自授权，但需近期交互认证并记录发起人、目标、Scope、操作与原因。初始数据授权为空，普通 Agent Token 不具备账号管理能力。

### 3. 身份与持久化契约

概念记录包括用户、Agent、Agent 凭据、Scope-operation 授权、Web 会话和安全审计，不宣称已有对应 Prisma 表。优先迁移兼容记录，不能形成两套授权权威。用户保存稳定 ID、密码哈希、启用状态和凭据/授权版本；Agent 保存稳定 ID 与所属用户，首增量不支持更换所有者。凭据保存公开定位 ID、密文摘要、Agent ID、权限上限、期限、撤销状态和版本。Web 会话独立保存摘要、期限和撤销状态，不存 Agent Token。审计不得包含密码、原始 Token 或未授权正文。

一个 Agent 可有多个 Token，授权用户只能为自己拥有的 Agent 创建 Token；轮换不改变工作台和扫描会话归属；创建 Token 不等于创建 Agent。Token 请求只能包含用户当前拥有的精确 Scope-operation 组合，并记录所有者、上限、期限和签发审计。用户禁用后，所有会话与所属 Agent 凭据失效。Agent 自审不允许；同一所有者的两个 Agent 不算 T1 独立审批。T2/T3 必须由交互登录的人审批；本增量不新增双人审批规则，所有者仍可显式审核自己的 Agent 草稿，除非另有更严格策略。Token 不得伪装成人。历史断言缺少委托归属时，不能靠不同字符串证明独立，应转人工审核或依据证据登记身份映射，不伪造或静默重写作者。

### 4. 精确 Scope 授权

Agent 请求按 `(企业, 应用服务, 操作)` 判断：凭据、Agent、所有者有效；服务存在且路径准确；所有者当前拥有该服务的该操作；Token 上限也包含同一组合；服务端资源与知识就绪策略允许。Web 使用当前用户授权与有效会话。读取、写入、治理、知识消费、诊断分别授权，写入不自动包含读取或授权管理；角色模板只能生成显式组合。不得把全局操作集合与 Scope 集合分别合并后做交叉授权。签发时校验完整上限，不合规则拒绝；后续用户授权增加不扩大旧 Token 上限。

服务端基础设施解析凭据、注册表及授权；Core 保持纯策略判断，不在同步辅助函数中访问数据库。页面、Server Action、API、MCP HTTP、导出、统计、图查询与任务下载全部走同一边界，在读取正文或返回缓存前检查权限。未知与未授权的显式目标使用同一拒绝结构，发现接口仅列出可读服务。

### 5. 撤销、事务与续页

第一增量每个请求都从 PostgreSQL 检查凭据和授权，包括复用 MCP 连接上的每次调用，不跨请求缓存允许结果；单请求可复用解析结果。认证数据库失败就拒绝，不能回退 seed/static。撤销事务提交后，后续检查必须拒绝；已送达内容无法追回，先前已授权的读取可能完成，不承诺追溯取消一切在途操作。

写入与撤销按固定顺序锁定相关所有者、主体、凭据保护行，并在锁内重新读取授权、执行写入和审计、提交。所有减权、禁用、撤销路径使用相同锁。撤销先提交则写入失败；写入先获得锁则先提交，撤销随后完成。无锁的二次检查不足以保证此语义。已经提交的 Outbox 投递属于原操作完成；延期用户动作若产生新效果必须重新授权，轮询与下载也必须复查，历史审计保持原主体。

游标与就绪回执按需要绑定主体、委托归属、凭据/会话身份或代次、授权版本、Scope 集合、查询、语言、策略和各 Scope 水位，每次续页重新认证。变更、到期或水位变化使复用失效。游标和回执本身不授予权限。生产本地账号模式禁止开发默认签名密钥，密钥必须显式配置且支持轮换。

### 6. 初始化、登录与恢复

首管理员只能通过部署本地命令创建，以数据库单例锁/约束保证只成功一次，不提供公开抢注接口，不提供默认密码。秘密通过受保护输入传递，不放命令参数或日志。首管理员只有管理权限，没有自动设计授权。管理员创建用户，不开放自注册。采用成熟认证/密码库与专用密码哈希；高熵 Token 的摘要方式不能用于用户密码。Token 明文仅展示一次，不进入 URL 或浏览器本地存储。

生产使用 HTTPS、HttpOnly/Secure/SameSite Cookie、明确 CSRF/Origin 检查、空闲及绝对会话到期；授权、密码和 Token 管理需要近期认证。登录与恢复错误不泄露账号状态，限流状态在部署实例间共享。恢复通过有数据库访问权的本地运维命令，不提供匿名 HTTP 重置；密码重置撤销全部 Web 会话及所属 Agent 凭据。同一锁保护最后管理员；恢复保留审计，不自动加数据权限。重启不能恢复已撤销凭据或删除的授权；安全变更与成功审计原子提交，审计失败则操作失败。

### 7. 迁移与兼容

实施前清点所有身份入口、Scope 查找/继承、缓存、游标、任务和历史主体，覆盖已有精确授权与继承授权冲突；受保护资产缺 Scope 必须拒绝或隔离，不能默认全员可见。采用增量 Schema 与只读迁移报告，保留资产和历史；数据库注册表为权威，层级仅用于导航与明确批量选择。

父级授权只能按管理员批准的当前叶子服务及操作快照迁移；应用报告期间冻结注册表/授权变更，或通过版本拒绝过期报告。新服务不继承权限；不把 mock 授权或共享主体自动变成真实账号。维护窗口内显式切换权威、终止旧连接/会话、失效旧游标，并拒绝混合生产身份源。生产本地账号模式不能继续接受环境共享 Token、static、seed；stdio 必须走受支持的托管凭据入口，否则拒绝，数据库 seed stdio 仅属于开发管理机制。

回滚只能恢复兼容应用并保留撤销与授权权威，或保持维护状态，不能为恢复可用性而重启旧共享凭据。现有静态部署在正式切换前仍是明确的过渡模式，设计文档不改变运行服务。

### 8. 验收矩阵

每个实施增量完成后集中验证：Scope 与操作不交叉提权；撤销覆盖长连接、Cookie、游标、导出和下载；写入/撤销两种竞态顺序符合事务契约；轮换身份稳定且同所有者多凭据不能伪造独立审批；首次初始化、最后管理员、密码重置和重启安全；授权迁移经批准、新服务默认无权且历史资产保留；Web/MCP/派生读取入口统一；秘密保护、CSRF、到期、限流与审计失败均生效；双语 MCP 设计记录及关系对账和原会话关闭完整。

新身份功能尚未编码，因此没有相应运行测试证据。实施计划须先确定成熟库和具体接口，不扩大成独立身份服务或多租户平台。首个前端签发的受控 Token 产生后，验收套件必须使用它测试 `knowledge:consume`；该测试不是实现本地身份的初始化前置条件。

### 9. 后续跨服务比较边界

负责人仍为安全与平台治理团队，状态为延期实施；身份迁移与上述矩阵通过后，单独审阅比较设计及计划。比较只读、有界且由用户显式选服务；整个选择集授权通过后才读正文，任一未授权成员则整体拒绝且不泄露其是否存在。发现列表只显示可读服务，续页与下载重验权限。

每个服务保留来源、统计口径、时间、目录/投影/来源水位、覆盖度和可信状态。同名资产不自动合并身份，不产生跨 Scope 写权。目录数量只代表已存记录，不代表系统完整度、复杂度或知识就绪；允许明确标注限制的库存比较，但不能旁路可信知识读取。Agent 对系统语义的消费仍逐 Scope、逐 Profile 过门禁。失败或未扫描是不可用/未知，不是零；分页与可信完整性分别表达；独立版本不能冒充全局一致快照。复用 Atlas 和 scoped-read，在独立设计中规定具体预算与游标绑定，不做无界联查或无权限企业大盘。

### 10. 证据与当前限制

仓库审查定位了全局操作权限、父 Scope 继承、精确授权、按 actor 审批隔离、环境 MCP Token 和可选游标授权绑定，支持六项设计修正，但不证明已经修复。精确 Scope 预检返回上述会话、449 条读取资产和摘要，最近对账为 `UNVERIFIED`，不是已收敛。

当前本地 design-context seed 凭据调用 `evaluate_system_knowledge_readiness` 返回 `PERMISSION_DENIED`，因为该夹具特意不含 `knowledge:consume`；旧 HTTP static-claims 夹具则含有该权限，两者都不是真实用户凭据。此现象说明不能把尚未签发的受控 Token 当成身份实现的初始化前置条件，也不能因此弱化可信读取。前端签发首个受控 Token 后，使用该 Token 重新评估和有界读取作为验收证据。设计同步和书面审阅不能证明生产身份、完整来源目录或企业连接可用；CodeHub 继续单独受外部阻塞。上方 OWASP 引用用于授权与会话要求，不是项目安全认证。
