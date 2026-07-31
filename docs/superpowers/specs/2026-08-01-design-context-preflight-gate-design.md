# Design Context Preflight Gate

## Status

Accepted and implemented.

- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Purpose

SpecForge must make design context a prerequisite for non-trivial implementation changes. Agents and engineers must read the authoritative design assets, relationships, governance state, and current reconciliation status through MCP before editing code. After implementation, the change session must be closed with verification evidence and a fresh reconciliation result.

Repository instructions alone are not a sufficient enforcement mechanism. The MCP server therefore exposes an audited preflight operation that reads one exact application-service Scope, captures a deterministic design-context digest, and creates an OPEN Design Change Session. A matching close operation records convergence or blockage.

## Decision

Add `prepare_design_change` and `close_design_change_session` MCP tools.

`prepare_design_change` requires exact Scope authorization, read/write permissions, an intent, affected fact IDs, and expected evidence references. It reads the complete scoped asset catalog, typed links, and latest reconciliation snapshot inside the server, computes a digest, and creates or upserts a Design Change Session in one transactional write. The response is a preflight receipt containing the session ID, Scope, actor, read asset IDs, relationship digest, design-context digest, and reconciliation status.

`close_design_change_session` requires the same exact Scope and writable authorization. It accepts only `CONVERGED` or `BLOCKED`, requires verification evidence references, updates the session and emits a durable Outbox event. A close operation is audited and idempotent for the same session and final status.

The local `design-context:preflight` command calls the MCP tool and writes a JSON receipt under `.specforge/design-context/`. The Agent prompt and `AGENTS.md` require this preflight before non-trivial implementation. The close command is the final evidence step. The gate is strict for code, schema, API, relationship, behavior, or architecture changes; trivial documentation-only corrections may declare an explicit exemption.

## Alternatives

1. **Rely on AGENTS.md instructions only.** Rejected because instructions are not auditable or machine-enforced.
2. **Read design assets only after implementation.** Rejected because it allows implementation to drift before impact analysis.
3. **Require a new preflight database table.** Deferred because the existing scoped Design Change Session and Outbox provide the required durable lifecycle for this increment.

## Consequences

- Positive: Every governed implementation starts from a server-read design baseline and exact Scope.
- Positive: The preflight digest provides a stable comparison point for later reconciliation and CI checks.
- Positive: Agents can use the same MCP protocol as Web and other clients.
- Tradeoff: Non-trivial work cannot start when MCP or PostgreSQL is unavailable.
- Tradeoff: Callers must identify affected design facts and expected evidence before implementation.
- Deferred: Git hook/CI enforcement that rejects commits without a receipt will follow after the local command contract is proven.

## Constraints

- MCP is the only authored design-fact read/write boundary for the preflight context and change session.
- The server derives and validates Scope; caller payloads cannot override it.
- PostgreSQL remains authoritative for sessions, receipts, relationships, and reconciliation snapshots.
- All human-facing design records remain English-canonical with complete Chinese overlays.
- A receipt must include actor, exact Scope, intent, affected facts, read digest, relationship digest, and reconciliation status.
- A blocked close must preserve the reason and evidence; it must never be represented as convergence.

## Evidence

- **MCP preflight read:** `pnpm design-facts:check` completed before implementation planning with empty `missing`, `mismatched`, `outOfScope`, and `blocked` results for all 14 current baseline decisions.
- **Implementation evidence:** The MCP tools, local command, Agent prompt, Prisma migration, and focused suites are complete; typechecks passed and the federation tools/persistence suites passed 101 tests.
- **Live lifecycle evidence:** Designer Scope preflight read 104 assets, returned session `design-change-session:86e2d333-937f-4a88-acbc-813cdf11fb69`, and the matching close operation persisted `CONVERGED` with four verification evidence references.
- **MCP persistence/read-back:** The ADR, Proposal, Context Pack, Evidence, and typed links were synchronized and read back through MCP after implementation evidence was recorded.

## MCP Record

- Matching MCP ADR ID: `adr-design-context-preflight-gate`
- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-design-context-preflight-gate`
- Matching Context Pack: `context-pack-design-context-preflight-gate`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, `adr-design-fact-dual-record-governance`, `adr-federated-design-fact-synchronization`
- Typed links: Proposal `--IMPLEMENTS_DECISION-->` ADR; Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal; ADR `--DECIDES-->` related assets; Evidence `--VALIDATES-->` ADR

## Chinese Localization

### 标题

设计上下文前置门禁

### 背景

SpecForge 必须把设计上下文变成非平凡实现变更的前置条件。Agent 和工程师在修改代码前，必须通过 MCP 读取权威设计资产、关系、治理状态和当前对账状态；实现完成后，必须携带验证证据关闭变更会话并重新对账。

仅依靠仓库指令无法形成可靠的机器门禁，因此 MCP 服务新增审计化的前置操作：读取一个精确应用服务 Scope，生成确定性的设计上下文摘要，并创建 OPEN 的 Design Change Session。匹配的关闭操作记录收敛或阻塞。

### 决策

新增 `prepare_design_change` 和 `close_design_change_session` MCP 工具。前置工具要求精确 Scope 权限、读写权限、变更意图、受影响事实和预期证据，服务端读取完整 Scope 资产目录、类型化关系和最近对账快照，生成摘要，并在事务中创建或更新 Design Change Session。返回收据包含会话 ID、Scope、操作者、读取资产 ID、关系摘要、设计上下文摘要和对账状态。

关闭工具要求同一精确 Scope 和写权限，只接受 `CONVERGED` 或 `BLOCKED`，并要求验证证据引用。它会更新会话并生成持久 Outbox 事件，重复关闭保持幂等。仓库提供 `design-context:preflight` 命令调用 MCP 并将 JSON 收据写入 `.specforge/design-context/`。Agent Prompt 和 `AGENTS.md` 要求非平凡实现先执行前置门禁。代码、Schema、API、关系、行为和架构变化严格执行；纯文档小修可以显式声明豁免。

### 后果与约束

- 每项受治理实现都从服务端读取的设计基线和精确 Scope 开始。
- MCP 或 PostgreSQL 不可用时，非平凡工作不能开始。
- 实现前必须声明受影响设计事实和预期证据。
- PostgreSQL 继续作为会话、收据、关系和对账快照的权威存储。
- 阻塞关闭必须保留原因和证据，不得冒充收敛。
- Git Hook 和 CI 提交拒绝门禁作为后续增量，待本地命令契约验证后实现。

### 证据

- **MCP 前置读取：** 在实现规划前执行 `pnpm design-facts:check`，当前 13 项基线决策的 `missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空。
- **实现证据：** MCP 工具、本地命令、Agent Prompt 和聚焦测试完成后补充。
- **MCP 持久化与回读：** 实现证据产生后同步本 ADR 及其伴随记录并回读。
