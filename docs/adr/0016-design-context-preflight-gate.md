# Design Context Preflight Gate

## Status

**Accepted and implemented.**

- Stable ADR/MCP ID: `adr-design-context-preflight-gate`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

The existing governance policy requires MCP synchronization before completion, but it does not yet require an Agent to read the current design facts before editing code. This allows an implementation to drift before its matching ADR, Proposal, Context Pack, relationships, and evidence are updated.

## Decision

Introduce an audited MCP preflight and close lifecycle around non-trivial implementation work. `prepare_design_change` reads the exact authorized Scope, computes a design-context digest from the scoped assets, links, and latest reconciliation state, and creates an OPEN Design Change Session. `close_design_change_session` records `CONVERGED` or `BLOCKED` with verification evidence and a durable Outbox event.

Provide a local `design-context:preflight` command and Agent prompt that call the MCP operation. Update `AGENTS.md` so agents must present the preflight receipt before non-trivial edits and must close or block the session after verification. Keep git hook/CI commit enforcement as a follow-up after the command contract is proven.

## Alternatives

1. AGENTS.md only: rejected because it is not machine-audited.
2. Post-change design synchronization only: rejected because it detects drift after implementation.
3. A new independent lifecycle store: deferred because the existing Design Change Session and transactional Outbox already provide the required Scope-safe persistence.

## Consequences

- Agents receive a server-generated, Scope-safe design baseline before implementation.
- PostgreSQL or MCP outage blocks governed work instead of allowing untracked changes.
- Every close decision has evidence and an audit trail.
- Callers must identify affected facts before editing, and later CI enforcement is still required for full repository-level blocking.

## Constraints

- Exact application-service Scope is derived and checked server-side.
- MCP is the authored boundary; PostgreSQL is authoritative and graph stores are derived.
- Receipts include actor, Scope, intent, affected facts, digests, reconciliation status, and session ID.
- English is canonical and human-facing records require complete Chinese localization.

## Evidence

- **Pre-implementation MCP read:** `pnpm design-facts:check` passed before implementation with empty `missing`, `mismatched`, `outOfScope`, and `blocked` results for all 14 baseline decisions.
- **Typecheck:** `pnpm --filter @specforge/mcp-server typecheck` and `pnpm --filter @specforge/core typecheck` passed.
- **Focused tests:** `vitest run apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/federation/persistence.test.ts --exclude .worktrees/** --exclude .pnpm-store/**` passed 2 files and 101 tests.
- **Schema:** `pnpm db:push` synchronized the additive DesignChangeSession fields to the canonical PostgreSQL database at `localhost:15433/specforge_canonical`.
- **Live MCP gate:** `pnpm design-context:preflight -- --intent "Validate the implementation preflight gate." --affected "proposal-specforge-self-design" --evidence "pnpm --filter @specforge/mcp-server typecheck=passed"` read 104 scoped assets and returned session `design-change-session:86e2d333-937f-4a88-acbc-813cdf11fb69`; `pnpm design-context:close -- --session design-change-session:86e2d333-937f-4a88-acbc-813cdf11fb69 --status CONVERGED --evidence "pnpm --filter @specforge/mcp-server typecheck=passed,vitest federation tools and persistence suites=101 tests passed,pnpm db:push=passed,prepare_design_change MCP smoke=passed"` closed it as `CONVERGED`.
- **MCP record:** Synchronized and read back through `pnpm design-facts:sync` and `pnpm design-facts:check` after implementation evidence was recorded.

## MCP Record

- Matching MCP ADR ID: `adr-design-context-preflight-gate`
- Exact Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-design-context-preflight-gate`
- Matching Context Pack: `context-pack-design-context-preflight-gate`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, `adr-design-fact-dual-record-governance`, `adr-federated-design-fact-synchronization`
- Typed links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` related assets; Evidence `VALIDATES` ADR

## Chinese Localization

### 标题

设计上下文前置门禁

### 背景

现有治理规则要求在完成前通过 MCP 同步，但尚未要求 Agent 在修改代码前读取当前设计事实。这会导致实现先发生漂移，之后才补 ADR、Proposal、Context Pack、关系和证据。

### 决策

为非平凡实现建立经过审计的 MCP 前置和关闭生命周期。`prepare_design_change` 读取精确授权 Scope，根据 Scope 资产、关系和最近对账状态生成设计上下文摘要，并创建 OPEN 的 Design Change Session。`close_design_change_session` 携带验证证据记录 `CONVERGED` 或 `BLOCKED`，并生成持久 Outbox 事件。

提供本地 `design-context:preflight` 命令和 Agent Prompt 调用 MCP。更新 `AGENTS.md`，要求 Agent 在非平凡编辑前提供前置收据，并在验证后关闭或阻塞会话。Git Hook 和 CI 提交门禁作为命令契约验证后的后续增量。

### 备选方案

1. 只依赖 AGENTS.md：拒绝，因为它不能形成机器审计。
2. 只在变更后同步设计：拒绝，因为它只能在实现发生后发现漂移。
3. 新建独立生命周期存储：延期，因为现有 Design Change Session 和事务 Outbox 已经提供所需的 Scope 安全持久化。

### 后果

- Agent 在实现前获得服务端生成且 Scope 安全的设计基线。
- MCP 或 PostgreSQL 不可用时，受治理工作会被阻止。
- 每次关闭都有证据和审计记录。
- 调用方必须在编辑前声明受影响事实，后续仍需 CI 完成仓库级强制阻断。

### 约束

- 精确应用服务 Scope 必须由服务端解析和校验。
- MCP 是设计事实写入边界，PostgreSQL 是权威存储，图数据库只能是派生投影。
- 收据必须包含操作者、Scope、意图、受影响事实、摘要、对账状态和会话 ID。
- 英文为规范内容，面向人的记录必须具有完整中文覆盖。

### 证据

- **实现前 MCP 读取：** `pnpm design-facts:check` 已通过当前全部 13 项基线决策，未发现缺失、不匹配、越界或阻塞。
- **实现证据：** 等待 MCP 工具、本地命令、Prompt 和门禁聚焦测试完成。
- **MCP 记录：** 实现证据记录后完成最终同步和回读。
