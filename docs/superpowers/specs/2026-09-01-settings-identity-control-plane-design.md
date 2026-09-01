# Settings Identity Control Plane

## Status And Ownership

This specification defines the approved consolidation of SpecForge's self-managed identity controls into the Settings workspace. English is canonical; the Chinese section is the complete human-facing localization overlay. The Settings implementation is delivered and locally verified, except for a live managed-token issuance acceptance under local-account authentication.

- Owner: SpecForge Security and Platform Governance.
- Owning Scope: `com.huawei.celon.desiner`.
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- ADR: `adr-self-managed-identity` / `docs/adr/0046-self-managed-identity.md`.
- Proposal: `proposal-self-managed-identity`.
- Context Pack: `context-pack-self-managed-identity`.
- Design session: `design-change-session:004276c3-4549-41d9-8e92-eb09acf06503`.

## 1. Problem And Outcome

The current `/settings` route only exposes a redacted database URL, while the implemented identity controls live at the undiscoverable `/identity` route. Users therefore cannot find the Web control plane for users, exact-Scope grants, Agents, or managed credentials.

`/settings` becomes the single discoverable control-plane workspace. It presents three sections: **Agents and Tokens**, **Users and Permissions**, and **Runtime**. The Agents section opens by default because issuing a bounded credential for an existing development Agent is the primary workflow. `/identity` redirects to `/settings` so the product has one interaction surface and one implementation.

This change does not make security administration an MCP design-asset write path. Identity mutations continue through the same-origin Web identity APIs and authoritative PostgreSQL transactions. ADRs, Proposals, Context Packs, contracts, and typed links remain MCP-authored.

## 2. Information Architecture

The Settings header explains that controls apply to the deployment identity plane and the selected application-service Scope. A tab or segmented-control navigation exposes:

1. **Agents and Tokens**: list owned Agents, create an Agent, issue a bounded Token, rotate a credential, and revoke a credential.
2. **Users and Permissions**: list users, create a user, inspect exact Scope-operation grants, add a grant, and revoke a grant when the supporting API is present.
3. **Runtime**: display redacted database location, authentication mode, deployment health, and configuration warnings as read-only information.

The active tab is represented by a stable URL query such as `?section=agents`, survives the existing `scope` query parameter, and defaults safely when absent or invalid. Identity administration is deployment-scoped, while each permission tuple and Token ceiling is exact-application-service scoped. Changing the architecture Scope updates the grant and ceiling context without mixing data from another Scope.

## 3. Components And Data Flow

The route is a server-rendered Settings shell with focused client components for mutations. Initial lists come from authenticated read APIs; forms call the existing identity mutation APIs with same-origin cookies and the CSRF token. After a successful mutation, the affected list is refreshed from the server rather than treating form state as authoritative.

Reuse the existing identity service and routes for user creation, grant creation, Agent creation, Token issuance, rotation, and revocation. Add bounded read endpoints only where the current API cannot provide the lists needed by the screen. Every read returns only the current user's permitted administrative or owned resources. Every mutation retains server-side ownership, exact-Scope, operation-ceiling, recent-authentication, audit, and transaction checks.

The `/identity` route performs a server redirect to `/settings?section=agents`; it does not retain a second copy of the forms. Existing deep links remain functional.

## 4. Interaction And Secret Handling

Every form has explicit idle, submitting, success, validation-error, authorization-error, and service-error states. Submit controls are disabled while a request is active and display a progress indicator. Errors appear beside the relevant workflow and use safe messages; raw stack traces, SQL errors, password hashes, credential digests, and unauthorized identities are never rendered.

A newly issued or rotated Token is displayed once in a dedicated result panel with a copy command and an acknowledgement that it cannot be recovered. It is never written to a URL, browser storage, analytics, logs, or subsequent list responses. After the user leaves or dismisses the result, the plaintext is gone. Token lists show only safe metadata: credential identifier, Agent, exact ceilings, creation time, expiry, and revocation state.

The first increment does not introduce role-based screen hiding. Server authorization remains mandatory and authoritative; visible controls do not grant permission. Denied operations render a no-leak error and do not expose another user's Agent, Token, or inaccessible Scope identity.

## 5. Localization And Accessibility

All human-facing labels, descriptions, validation messages, empty states, success states, and error summaries have complete Chinese and English messages. Canonical operation names and IDs remain untranslated machine identifiers where translation would change their meaning.

Tabs use semantic controls with selected state, forms have labels and field-level errors, status changes use a polite live region, and secret-reveal/copy controls have accessible names. Keyboard users can reach every action. Responsive layout keeps forms and metadata readable without nested cards or horizontal overflow.

## 6. Failure And Empty States

- No Agents: explain that an Agent identity must be created before issuing a Token and present the creation action.
- No grants for the selected Scope: show an explicit empty state; never infer or inherit a grant from another Scope.
- Expired session or missing CSRF: request reauthentication without retrying a mutation automatically.
- Authorization denied: show a generic denied result without disclosing hidden users, Agents, credentials, or Scopes.
- Identity service unavailable: preserve entered non-secret form data where safe, discard any password or Token plaintext, and offer an explicit retry.
- Runtime probe unavailable: mark the individual runtime signal unavailable; do not make the entire Settings route blank.

## 7. Acceptance Criteria

1. Opening Settings presents useful controls, with Agents and Tokens selected by default.
2. Existing `/identity` links redirect to the Settings Agent section while preserving the selected readable Scope.
3. A user can create an Agent and issue, rotate, and revoke a credential through visible Web workflows backed by the existing identity service.
4. User and exact Scope-operation grant workflows are discoverable in the Permissions section; unsupported mutations are not rendered as working controls.
5. Token plaintext appears only in the immediate issue or rotation response and disappears after dismissal or navigation.
6. Every mutation has loading, success, validation, denial, and unavailable feedback in Chinese and English.
7. Switching Scope cannot combine or leak grant, Agent, credential, or runtime data across application-service boundaries.
8. Runtime information is redacted and read-only; credentials and database passwords never appear.
9. Focused component/API tests cover tab routing, redirect compatibility, secret lifecycle, exact-Scope ceilings, denial behavior, and mutation loading/error states.
10. The production Docker build and the `/settings` route at port 3010 pass a consolidated visual and operational verification.

## 8. Alternatives Rejected

Keeping `/settings` as a database card with a link to `/identity` was rejected because it preserves a fragmented and undiscoverable workflow. Creating a separate administration application was rejected because the single-enterprise deployment does not need another runtime or security boundary. Duplicating the identity forms in both routes was rejected because it would create divergent behavior and verification surfaces.

## 9. Delivery Evidence And Remaining Boundary

Implemented: safe owner/admin read models; authenticated Agent and user/grant read APIs; exact-grant deletion; bilingual Settings sections; one-time in-memory Token display; loading and safe-error states; runtime redaction; and `/identity` compatibility routing. The focused identity/settings tests and both relevant typechecks passed. The Docker Web image was rebuilt and `http://127.0.0.1:3010/healthz` plus the scoped Settings route returned HTTP 200. Browser verification confirmed default Agents content and the Runtime static-auth warning.

Not claimed: issuing a live managed Token. The current deployed `static` authentication mode has no local-account Web session, so mutating controls correctly return the translated authentication denial. Re-run issuance, rotation, revocation, and exact-Scope ceiling acceptance after a local-account authenticated test user and session are intentionally provisioned.

## 中文本地化覆盖

### 状态与归属

本文定义已确认的设置中心身份控制台整合方案。英文为规范内容，本节是完整的中文本地化覆盖。设置实现已经交付并完成本地验证，但尚未在本地账号认证下执行真实受控 Token 签发验收。负责人是 SpecForge 安全与平台治理团队；归属 Scope、ADR、Proposal、Context Pack 和设计会话与上方元数据一致。

### 1. 问题与目标

当前 `/settings` 只显示脱敏数据库连接，而已经实现的身份操作位于没有导航入口的 `/identity`，用户找不到用户、精确 Scope 授权、Agent 和凭据管理能力。

`/settings` 将成为唯一可发现的控制台，包含“Agent 与 Token”“用户与权限”“运行环境”三个区域。默认打开 Agent 与 Token，因为为开发 Agent 签发有边界的凭据是主要流程。`/identity` 重定向到 `/settings`，避免两套界面和两套实现。

身份变更仍通过同源 Web 身份接口和 PostgreSQL 权威事务完成，不会变成设计资产的 MCP 旁路。ADR、Proposal、Context Pack、契约和有类型关系仍只能通过 MCP 编写。

### 2. 信息架构

设置页说明这些控制作用于部署身份平面和当前选择的应用服务 Scope，并提供三个页签或分段控件：

1. **Agent 与 Token**：列出本人 Agent、创建 Agent、签发有边界的 Token、轮换凭据和撤销凭据。
2. **用户与权限**：列出用户、创建用户、查看精确 Scope-operation 授权、添加授权；只有后端已支持时才显示撤销授权。
3. **运行环境**：只读展示脱敏数据库位置、认证模式、部署健康状态和配置警告。

当前页签使用稳定的 `section` 查询参数，并保留现有 `scope` 参数。无效值回退到 Agent 页签。身份管理属于部署级，而权限组合和 Token 上限必须属于精确应用服务 Scope。切换 Scope 只更新当前授权上下文，不能混合其他 Scope 数据。

### 3. 组件与数据流

页面使用服务端渲染设置外壳，具体变更表单使用聚焦的客户端组件。初始列表来自认证读取接口；提交使用同源 Cookie 和 CSRF Token 调用现有身份接口。成功后重新读取受影响列表，不把前端表单状态当成权威状态。

用户创建、授权、Agent 创建、Token 签发、轮换和撤销复用现有身份服务与接口；只有现有接口无法提供页面所需列表时才增加有界读取接口。读取只返回当前用户可管理或拥有的资源。服务端继续强制所有权、精确 Scope、操作上限、近期认证、审计和事务规则。

`/identity` 只做服务端重定向到 `/settings?section=agents`，不保留第二份表单，已有深链接仍可使用。

### 4. 交互与秘密保护

每个表单都有空闲、提交中、成功、校验失败、授权失败和服务失败状态。请求期间禁用提交并显示加载状态。错误就近展示，禁止渲染堆栈、SQL 错误、密码哈希、凭据摘要和未授权身份。

新签发或轮换的 Token 只在专用结果区域展示一次，提供复制命令和不可恢复提示。明文不得进入 URL、浏览器存储、分析、日志或后续列表响应。用户关闭结果或离开页面后，明文立即消失。列表只展示凭据 ID、Agent、精确权限上限、创建时间、到期时间和撤销状态等安全元数据。

首增量暂不根据角色隐藏页面控件，但服务端授权必须保持权威。可见按钮不代表获得权限；拒绝响应不得泄露其他用户的 Agent、Token 或不可访问 Scope。

### 5. 国际化与可访问性

所有标签、说明、校验消息、空状态、成功状态和错误摘要都提供完整中英文。操作名和 ID 属于机器标识，翻译会改变语义时保持原文。

页签使用带选中状态的语义控件；表单有标签和字段错误；状态变化通过礼貌的实时区域通知；秘密展示与复制控件具有可访问名称。键盘可以访问所有操作，响应式布局不得出现嵌套卡片或水平溢出。

### 6. 失败与空状态

- 没有 Agent：说明必须先创建 Agent 才能签发 Token，并直接提供创建操作。
- 当前 Scope 没有授权：显示明确空状态，不从其他 Scope 推断或继承权限。
- 会话过期或缺少 CSRF：要求重新登录，不自动重试变更。
- 无权限：显示不泄露信息的通用拒绝结果。
- 身份服务不可用：安全地保留非秘密输入，丢弃密码和 Token 明文，并提供显式重试。
- 运行探针不可用：只标记对应信号不可用，不能让整个设置页变空。

### 7. 验收标准

1. 打开设置即可看到有效控制，默认选择 Agent 与 Token。
2. `/identity` 重定向到设置页 Agent 区域并保留可读 Scope。
3. 用户可以通过可见流程创建 Agent，并签发、轮换、撤销凭据，后端复用现有身份服务。
4. 用户与精确 Scope-operation 授权在权限页可发现；后端未支持的操作不能伪装成可用按钮。
5. Token 明文只出现在签发或轮换的即时响应，关闭或导航后消失。
6. 每项变更都有中英文的加载、成功、校验、拒绝和不可用反馈。
7. 切换 Scope 不能交叉合并或泄露授权、Agent、凭据或运行数据。
8. 运行信息脱敏且只读，不显示凭据和数据库密码。
9. 聚焦测试覆盖页签路由、重定向兼容、秘密生命周期、精确 Scope 上限、拒绝行为和加载/错误状态。
10. 生产 Docker 构建和 3010 端口设置页通过集中视觉与运行验证。

### 8. 未采用方案

没有采用“设置页只放 `/identity` 跳转”，因为工作流仍然割裂；没有新建独立管理应用，因为单企业部署不需要新增运行时和安全边界；没有在两个路由复制表单，因为这会形成行为和验证分叉。

### 9. 交付证据与剩余边界

已经实现：安全的本人/管理员读取模型、认证 Agent 与用户/授权读取接口、精确授权撤销、双语设置区域、一次性内存 Token 展示、加载与安全错误状态、运行环境脱敏和 `/identity` 兼容路由。聚焦身份/设置测试以及两个相关类型检查均通过。Docker Web 镜像已重建，`http://127.0.0.1:3010/healthz` 与带 Scope 的设置路由都返回 HTTP 200；浏览器验证确认默认 Agent 内容与运行页的 static 认证提示。

未声明通过：真实托管 Token 的签发。当前部署的 `static` 认证模式没有本地账号 Web 会话，因此变更控件会正确返回翻译后的认证拒绝。等明确准备本地账号认证测试用户和会话后，再验证签发、轮换、撤销和精确 Scope 上限。
