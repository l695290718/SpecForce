# ADR-0040: Provider-Neutral Agent Bootstrap and Layered Governance Context

## Status

Accepted design; implementation has not started. The design was prepared under exact-Scope session `design-change-session:0e4fcc3b-05f0-4358-8cd0-845484229433`. The repository and MCP ADR, Proposal, Context Pack, managed assets, and typed relationships are synchronized and read back; a separate implementation session is still required.

## Context

SpecForge already provides exact-Scope `prepare_design_change` and `close_design_change_session` operations, a standalone Go CLI, `.specforge.yaml` repository mappings, and a signed local change-attestation gate. The repository also contains `AGENTS.md` and provider-specific examples. These pieces do not guarantee that Claude Code, OpenCode, Codex, or a future enterprise Agent discovers the same governance policy and relevant design intent when it opens a repository. Instruction files are cooperative, vendor-specific, and easy to omit or copy out of date. Returning the entire Scope catalog would also waste tokens and make prompt-injection and stale-context risks worse.

## Decision

1. **Reuse `.specforge.yaml` as the provider-neutral repository descriptor.** Add a versioned `agentBootstrap` section that names the server-issued governance profile, default Context Pack, and adapter policy. It may contain server URL, stable IDs, exact application-service mappings, and non-secret preferences. Tokens, credentials, private keys, and policy overrides are forbidden.
2. **Make MCP policy authoritative.** Add a read-only `get_agent_bootstrap_context` operation. Given an authenticated actor and one exact application-service Scope, it returns the active immutable Governance Profile revision, policy digest, instruction precedence, supported adapter contract version, token budgets, offline exemption policy, and references to the default Context Pack. Repository instruction files are caches and launchers, never policy authority.
3. **Use three context levels.** L0 is the mandatory governance envelope and is capped at 32 KiB. L1 is returned by `prepare_design_change` and contains the task-specific Context Pack, affected facts, relevant ADRs, typed relationships, reconciliation status, session ID, and design-context digest; it is capped at 256 KiB, 50 assets, and 200 relationships. L2 is an explicit, session-bound `read_design_context` request for selected referenced assets; each request has the same 256 KiB and 50-asset limit. Truncation returns a continuation cursor and never silently drops blocking rules.
4. **Generate thin, versioned tool adapters.** Extend the standalone `specforge` CLI with an idempotent Agent initialization command and adapter registry. Each adapter writes only the minimum instruction needed by its supported tool to invoke the same bootstrap/preflight lifecycle. Adapter templates are versioned, visibly generated, diagnosable, and replaceable without changing MCP semantics. Unsupported tools use the provider-neutral CLI/MCP protocol directly.
5. **Fail closed for governed work.** A non-trivial change is blocked when the token, MCP service, exact Scope, current Governance Profile revision, Context Pack, reconciliation result, or Design Change Session is missing or invalid. Offline exemption is limited to server-policy-approved deterministic classes: whitespace-only changes, explicitly mapped generated files, documentation outside governance/design records, and comment-only changes only where a registered language-aware classifier proves them. Ambiguous changes are governed.
6. **Bind enforcement to the context actually read.** Extend the existing Change Attestation payload with Governance Profile ID/revision/digest, adapter contract/version, Design Change Session ID, design-context digest, and affected-fact coverage. The local Hook and future CI verification reject stale profiles, mismatched Scope, missing affected facts, unclosed sessions, or changed staged-tree evidence. An Agent claiming it read a prompt is never sufficient evidence.
7. **Separate repository evidence from executable policy.** Source files, README content, and repository prompts are untrusted evidence. They cannot override MCP policy, reduce required permissions, change the owning Scope, or grant an offline exemption. The bootstrap envelope exposes this precedence explicitly so adapters can keep server policy separate from repository content.
8. **Preserve compatibility.** Existing `.specforge.yaml` files and preflight clients continue to work with a server-assigned default Governance Profile. New response fields are additive. A repository is migrated only when `specforge agent init` writes an explicit adapter contract version; rollback removes generated adapters without deleting authored design facts or attestations.

## Alternatives

1. **Copy full governance rules into every provider instruction file:** rejected because copies drift, waste tokens, and cannot be audited as the policy actually used.
2. **Require users to run a preflight command manually:** rejected because discovery remains optional and omission is common.
3. **Return the complete Scope catalog to every Agent:** rejected because it is expensive, leaks irrelevant information, and weakens task-specific reasoning.

## Consequences

- Claude Code, OpenCode, Codex, and future tools can share one lifecycle while retaining small provider adapters.
- Agents receive current design intent before editing, with bounded token use and on-demand expansion.
- Server-owned policy and signed attestations provide enforcement even when a client ignores its instruction file.
- MCP availability becomes a deliberate dependency for non-trivial governed work; cached L0 policy can explain a block but cannot authorize work.
- Adapter maintenance remains necessary as vendors change their instruction discovery conventions, but those changes are isolated from governance semantics.
- Reliable comment-only offline classification is language-specific; unsupported languages remain governed rather than guessed.

## Constraints

- One bootstrap/preflight operation targets exactly one application-service Scope even when a token grants several Scopes.
- PostgreSQL is authoritative for Governance Profile revisions, sessions, Context Packs, attestations, audit, and relationship events; graph stores remain derived.
- MCP remains the only authored design-fact write boundary.
- English canonical fields and complete Chinese overlays are mandatory for human-facing Governance Profiles and Context Packs.
- Tokens use process environment or approved credential storage and never enter repository files, generated adapters, logs, or Context Packs.
- Every response distinguishes unavailable, unauthorized, stale, partial, blocked, and ready states.
- Implementation must update ADR-0016 and ADR-0017 evidence without rewriting their established lifecycle or attestation ownership.

## Evidence

- The user approved a provider-neutral bootstrap, MCP dynamic context, local enforcement, and fail-closed behavior for non-trivial changes; deterministic non-design exemptions remain the only offline path.
- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Design provider-neutral Agent bootstrap and layered governance-context discovery for external coding tools" --affected "adr-design-context-preflight-gate,adr-local-git-hook-change-attestation,api-specforge-mcp-tools,context-pack-design-context-preflight-gate" --evidence "user-approved fail-closed bootstrap direction,existing ADR-0016 and ADR-0017 review"` opened `design-change-session:0e4fcc3b-05f0-4358-8cd0-845484229433` after reading the exact Designer Scope.
- The complete design-fact manifest suite passed after refreshing stale committed 3A wording assertions to the canonical six-mappings and bounded-Overview wording already present on `main`.
- `SPECFORGE_DESIGN_FACT_IDS=adr-provider-neutral-agent-bootstrap-governance pnpm design-facts:sync` completed, and the matching filtered `pnpm design-facts:check` returned empty missing, mismatched, out-of-Scope, and blocked sets.
- This record contains design evidence only. CLI, MCP, Hook, adapter, security, and cross-tool compatibility evidence must be added by a later implementation session.

## MCP Record

- Stable ADR ID: `adr-provider-neutral-agent-bootstrap-governance`.
- Exact Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Matching Proposal: `proposal-agent-bootstrap-governance`.
- Matching Context Pack: `context-pack-agent-bootstrap-governance`.
- Managed design facts: `api-specforge-agent-bootstrap-context`, `data-specforge-agent-bootstrap-envelope`, and `rule-specforge-agent-bootstrap-fail-closed`.
- Related decisions: `adr-design-context-preflight-gate` and `adr-local-git-hook-change-attestation`.

## Chinese Localization

### 标题

供应商无关的 Agent 引导与分层治理上下文

### 背景

SpecForge 已提供精确 Scope 的 `prepare_design_change`、`close_design_change_session`、独立 Go CLI、`.specforge.yaml` 仓库映射和签名的本地变更证明门禁。仓库也有 `AGENTS.md` 及供应商示例，但这些组件不能保证 Claude Code、OpenCode、Codex 或未来企业 Agent 打开仓库时发现同一套治理规则与相关设计理念。指令文件依赖自觉、与供应商绑定、容易缺失或过期；把整个 Scope 目录灌入 Agent 还会浪费 Token，并放大提示注入与陈旧上下文风险。

### 决策

1. **复用 `.specforge.yaml` 作为供应商无关仓库描述符。** 增加版本化 `agentBootstrap` 区段，声明服务端签发的治理档案、默认 Context Pack 与适配器策略。配置只允许服务地址、稳定 ID、精确应用服务映射及非敏感偏好，禁止 Token、凭据、私钥和策略覆盖。
2. **以 MCP 策略为权威。** 新增只读 `get_agent_bootstrap_context`。它在鉴权和精确 Scope 下返回不可变 Governance Profile 修订、策略摘要、指令优先级、适配器契约版本、Token 预算、离线豁免策略及默认 Context Pack 引用。仓库指令文件只是缓存和启动器，不是策略权威。
3. **采用三级上下文。** L0 是必读治理信封，上限 32 KiB；L1 由 `prepare_design_change` 返回本次任务的 Context Pack、受影响事实、相关 ADR、有类型关系、对账状态、会话与摘要，上限 256 KiB、50 个资产和 200 条关系；L2 通过会话绑定的 `read_design_context` 按需读取指定资产，每次同样最多 256 KiB 和 50 个资产。截断必须返回续读游标，绝不能静默丢弃阻断规则。
4. **生成轻量且版本化的工具适配器。** 扩展独立 `specforge` CLI，增加幂等 Agent 初始化命令和适配器注册表。每个适配器只写入对应工具调用同一引导/预检生命周期所需的最少指令。模板具备版本、生成标识、诊断能力且可替换；不支持的工具直接使用供应商无关 CLI/MCP 协议。
5. **治理工作失败关闭。** Token、MCP、精确 Scope、当前治理档案、Context Pack、对账结果或会话缺失/无效时，非平凡变更被阻止。离线豁免仅限服务端策略批准且可确定验证的类别：纯空白、明确映射的生成文件、治理/设计记录之外的文档，以及仅在注册的语言感知分类器能够证明时的纯注释变更。歧义变更按受治理处理。
6. **把执行门禁绑定到实际读取的上下文。** 现有 Change Attestation 增加治理档案 ID/修订/摘要、适配器契约/版本、设计变更会话、设计上下文摘要及受影响事实覆盖。Hook 和未来 CI 拒绝陈旧档案、Scope 不匹配、事实缺失、会话未关闭或暂存树证据变化。Agent 声称读取过 Prompt 不能作为证据。
7. **区分仓库证据和可执行策略。** 源文件、README 和仓库 Prompt 都是不可信证据，不能覆盖 MCP 策略、降低权限、改变所属 Scope 或授予离线豁免。引导信封明确返回该优先级，使适配器将服务端策略与仓库内容隔离。
8. **保持兼容。** 旧 `.specforge.yaml` 和预检客户端继续使用服务端分配的默认治理档案；新增响应字段保持增量兼容。只有执行 `specforge agent init` 并写入明确适配器契约版本后才视为迁移；回滚只移除生成适配器，不删除设计事实或证明。

### 备选方案

1. **把完整治理规则复制到每个供应商指令文件：**否决，因为副本会漂移、浪费 Token，也无法审计实际采用的策略。
2. **要求用户手工运行预检命令：**否决，因为发现流程仍是可选的，容易遗漏。
3. **向每个 Agent 返回完整 Scope 目录：**否决，因为成本高、会泄露无关信息，并削弱任务相关推理。

### 后果

- Claude Code、OpenCode、Codex 和未来工具共享同一生命周期，同时仅保留轻量供应商适配器。
- Agent 在编辑前获得当前设计理念，并通过有界 Token 与按需展开控制上下文规模。
- 即使客户端忽略指令文件，服务端策略和签名证明仍能形成执行约束。
- MCP 可用性成为非平凡治理工作的明确依赖；缓存 L0 只能解释阻塞，不能授权继续。
- 供应商调整指令发现约定时仍需维护适配器，但不会影响治理语义。
- 纯注释离线识别依赖语言；不支持的语言按受治理处理，不进行猜测。

### 约束

- 即使一个 Token 授权多个 Scope，每次引导/预检也只面向一个精确应用服务 Scope。
- PostgreSQL 对治理档案修订、会话、Context Pack、证明、审计和关系事件保持权威；图存储仅为派生投影。
- MCP 仍是已编写设计事实的唯一写入边界。
- 面向人的 Governance Profile 和 Context Pack 必须使用英文规范字段并提供完整中文覆盖。
- Token 只进入进程环境或批准的凭据存储，绝不进入仓库、生成适配器、日志或 Context Pack。
- 每个响应必须区分不可用、未授权、陈旧、部分、阻断和就绪状态。
- 实现必须补充 ADR-0016 和 ADR-0017 的证据，但不得改写其已建立的生命周期或证明归属。

### 证据

- 用户已批准供应商无关引导、MCP 动态上下文、本地门禁与非平凡变更失败关闭；只有可确定验证且不改变设计的类别允许离线。
- 精确 Designer Scope 预检读取现有设计事实并打开 `design-change-session:0e4fcc3b-05f0-4358-8cd0-845484229433`。
- 完整设计事实清单测试通过；已提交的 3A 陈旧断言已刷新为 `main` 规范清单采用的六条映射及有界 Overview 表述。
- 新 ADR、Proposal、Context Pack、三个托管设计资产和有类型关系已通过 MCP 同步；过滤回读未发现缺失、错配、越界或阻塞。
- 当前仅有设计证据；CLI、MCP、Hook、适配器、安全和跨工具兼容性证据必须由后续实现会话补充。
