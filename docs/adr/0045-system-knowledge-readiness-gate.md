# ADR-0045: System Knowledge Readiness Gate

## Status

Accepted and implemented for the exact Designer Scope. The gate evaluates whether SpecForge can be treated as the sole source for a selected system-knowledge Profile, then permits only bounded reads backed by an immutable PostgreSQL receipt.

- Stable ADR ID: `adr-system-knowledge-readiness-gate`
- Owning application service: `com.huawei.celon.desiner`
- Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Implementation Design Change Session: `design-change-session:214866ac-190d-4182-a7ac-6b0d869b40f9`

## Context

Agents need to understand an existing system from design assets, source observations, schemas, tests, deployment evidence, and runtime telemetry. A catalog that merely contains records is not enough to prove that a Profile is complete, current, conflict-free, reconciled, and safe to use as the only source. Returning partial facts as if they were complete creates silent design and implementation drift.

## Decision

1. Define three closed Profiles: `ARCHITECTURE_OVERVIEW`, `CHANGE_ASSESSMENT`, and `RUNTIME_DIAGNOSIS`. Each Profile has required evidence dimensions, freshness limits, clock-skew rules, full-snapshot requirements, and bounded response budgets.
2. Compose the enterprise minimum with an exact-Scope policy overlay. An overlay may tighten freshness, budgets, TTL, retention, or required sources, but it may not weaken the minimum or remove a required source.
3. Load one exact-Scope PostgreSQL evidence snapshot and evaluate it fail-closed. Missing sources, incomplete snapshots, pending promotions, stale observations, and missing reconciliation return `SOURCE_CHECK_REQUIRED`; unresolved conflicts or blocked reconciliation return `BLOCKED`.
4. Persist an immutable `SystemKnowledgeReadinessReceipt` bound to the caller grant digest, exact Scope, Profile, selector digest, policy version, source waterline digest, `asOf`, and `validUntil`. Identical requests reuse a receipt only inside the same TTL epoch and while waterlines remain current.
5. Expose `evaluate_system_knowledge_readiness` and `read_system_knowledge` through MCP. The first bounded asset and relationship page runs in the same PostgreSQL `REPEATABLE READ` transaction as readiness evaluation. Continuation cursors are signed and bound to the caller, Scope, query, Profile, receipt, catalog version, and waterline digest.
6. Keep PostgreSQL authoritative for authored assets, observations, policies, receipts, and relationship events. Graph stores remain derived projections and cannot authorize a read.
7. Migrate old low-level reads through `SPECFORGE_KNOWLEDGE_READ_ENFORCEMENT=observe|enforce`. Observe preserves payload compatibility and records migration use. Enforce blocks ordinary legacy reads; only an explicit `knowledge:diagnostic` claim can use a diagnostic bypass.

## Alternatives

- Trust the latest catalog row without a readiness proof: rejected because it cannot distinguish incomplete or stale evidence from a complete system view.
- Read all source systems on every Agent request: rejected because it is expensive, non-reproducible, and cannot provide one consistent generation.
- Make a graph database authoritative: rejected because PostgreSQL already owns authored and event data; graphs remain rebuildable projections.
- Silently return partial pages: rejected because Agent conclusions would confuse page completeness with trust completeness.
- Grant diagnostic access through ordinary `asset:read`: rejected because diagnosis can bypass normal readiness and requires explicit governance authorization.

## Consequences

- Agents have an auditable answer to whether SpecForge is sufficient for a specific Profile, Scope, caller, and point in time.
- A denied read returns reason codes and remediation actions but no asset or relationship body.
- Page pagination is independent from trust status: an allowed read can be `PARTIAL` until all signed continuation pages are consumed.
- Source drift, policy changes, grant changes, catalog changes, relationship changes, and TTL expiry invalidate the usable receipt.
- The initial implementation does not include enterprise scanners, live connector rollout, cross-Scope aggregation, Web policy administration, external identity integration, automatic remediation, or production-capacity certification.

## Constraints

- Every operation uses the exact application-service Scope; no implicit parent or sibling Scope is accepted.
- English is canonical and human-facing API, data-model, rule, ADR, Proposal, and Context Pack records require complete Chinese localization.
- Authorization is evaluated before target data is exposed; unauthorized callers receive the same no-leak denial shape.
- `RUNTIME_DIAGNOSIS` remains unready until real policy-approved runtime telemetry is present; no runtime evidence is fabricated.
- Legacy compatibility is transitional. New Agent guidance must evaluate readiness first and retain Profile and `asOf` in conclusions.

## Evidence

- `pnpm exec vitest run packages/core/src/knowledge-readiness/evaluate.test.ts`: 1 file, 7 tests passed.
- `pnpm --filter @specforge/scoped-read test`: 2 files, 11 tests passed.
- `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; $env:SPECFORGE_KNOWLEDGE_READINESS_E2E='1'; pnpm exec vitest run packages/core/src/knowledge-readiness apps/mcp-server/src/knowledge-readiness apps/mcp-server/src/federation/tools.test.ts --exclude "**/.worktrees/**" --exclude "**/.pnpm-store/**"`: 9 files, 60 tests passed.
- `pnpm typecheck` and `pnpm --filter @specforge/web typecheck`: all workspace typechecks passed.
- `git diff --check`: passed.

## MCP Record

- MCP ADR: `adr-system-knowledge-readiness-gate`
- Proposal: `proposal-system-knowledge-readiness-gate`
- Context Pack: `context-pack-system-knowledge-readiness-gate`
- Managed assets: `api-specforge-system-knowledge-readiness`, `data-specforge-system-knowledge-readiness-receipt`, `rule-specforge-system-knowledge-readiness`

## 中文本地化覆盖

### 标题

系统知识就绪门禁

### 背景

Agent 需要从设计资产、源码观察、接口与数据模式、测试、部署证据及运行时遥测中理解存量系统。仅有资产目录不能证明某个 Profile 已经完整、最新、无冲突、已对账并且可以作为唯一来源。把部分事实当成完整事实会造成静默的设计与实现漂移。

### 决策

1. 定义三个封闭 Profile：`ARCHITECTURE_OVERVIEW`、`CHANGE_ASSESSMENT` 和 `RUNTIME_DIAGNOSIS`。每个 Profile 都定义证据维度、新鲜度、时钟偏差、全量快照要求和响应预算。
2. 将企业最低策略与精确 Scope 的策略覆盖组合。覆盖只能收紧新鲜度、预算、TTL、保留期或必需来源，不能弱化最低要求或移除必需来源。
3. 从 PostgreSQL 加载一个精确 Scope 的证据快照并失败关闭评估。来源缺失、快照不完整、待晋级、数据过期和缺少对账返回 `SOURCE_CHECK_REQUIRED`；未解决冲突或阻塞对账返回 `BLOCKED`。
4. 持久化不可变 `SystemKnowledgeReadinessReceipt`，绑定调用者授权摘要、精确 Scope、Profile、选择条件摘要、策略版本、源水位摘要、`asOf` 和 `validUntil`。相同请求只有在同一 TTL 周期且水位仍然有效时复用回执。
5. 通过 MCP 暴露 `evaluate_system_knowledge_readiness` 和 `read_system_knowledge`。第一页资产与关系读取和就绪评估在同一 PostgreSQL `REPEATABLE READ` 事务中执行。续页游标签名并绑定调用者、Scope、查询、Profile、回执、目录版本和水位摘要。
6. PostgreSQL 对设计资产、观察、策略、回执和关系事件保持权威；图数据库只能作为可重建投影，不能授权读取。
7. 通过 `SPECFORGE_KNOWLEDGE_READ_ENFORCEMENT=observe|enforce` 迁移旧读取。Observe 保留响应兼容并记录迁移使用；Enforce 阻止普通旧读取，只有显式 `knowledge:diagnostic` 声明可以使用诊断旁路。

### 备选方案

- 不经就绪证明直接信任最新目录：否决，因为无法区分不完整、过期与完整系统视图。
- 每次 Agent 请求都读取所有源系统：否决，因为成本高、不可复现且无法提供同一代数据。
- 让图数据库成为权威：否决，因为 PostgreSQL 已经拥有设计事实和事件数据，图数据库应保持可重建投影。
- 静默返回部分页面：否决，因为 Agent 会把页面完整性误认为可信完整性。
- 通过普通 `asset:read` 授予诊断能力：否决，因为诊断可以绕过就绪门禁，必须显式授权。

### 后果

- Agent 可以针对具体 Profile、Scope、调用者和时间点获得可审计的 SpecForge 充分性判断。
- 拒绝读取只返回原因码和修复动作，不返回资产或关系正文。
- 分页完整性与可信状态相互独立：允许读取也可能在消费完全部签名续页前处于 `PARTIAL`。
- 源漂移、策略变化、授权变化、目录变化、关系变化和 TTL 到期都会使可用回执失效。
- 首个增量不包括企业扫描器、实时连接器落地、跨 Scope 聚合、Web 策略管理、外部身份接入、自动修复或生产容量认证。

### 约束

- 每个操作都使用精确应用服务 Scope，不接受隐式父 Scope 或兄弟 Scope。
- 英文是规范语言，面向人的 API、数据模型、规则、ADR、Proposal 和 Context Pack 必须完整提供中文覆盖。
- 目标数据暴露前必须先完成授权；未授权调用者收到统一的无泄漏拒绝结构。
- 在真实且经过策略批准的运行时遥测存在前，`RUNTIME_DIAGNOSIS` 保持未就绪；不得伪造运行时证据。
- 旧兼容能力是过渡措施。新的 Agent 指导必须先评估就绪状态，并在结论中保留 Profile 与 `asOf`。

### 证据

- `pnpm exec vitest run packages/core/src/knowledge-readiness/evaluate.test.ts`：1 个文件、7 个测试通过。
- `pnpm --filter @specforge/scoped-read test`：2 个文件、11 个测试通过。
- `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; $env:SPECFORGE_KNOWLEDGE_READINESS_E2E='1'; pnpm exec vitest run packages/core/src/knowledge-readiness apps/mcp-server/src/knowledge-readiness apps/mcp-server/src/federation/tools.test.ts --exclude "**/.worktrees/**" --exclude "**/.pnpm-store/**"`：9 个文件、60 个测试通过。
- `pnpm design-facts:sync`：`system-knowledge-readiness-gate` 返回 `complete`，通过 MCP 写入精确 Designer Scope。
- `pnpm design-facts:check`：`missing=0`、`mismatched=0`、`outOfScope=0`、`blocked=0`。
- `$env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; pnpm exec vitest run packages/core/src/knowledge-readiness apps/mcp-server/src/knowledge-readiness apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/tools.test.ts --exclude "**/.worktrees/**" --exclude "**/.pnpm-store/**"`：9 个文件通过、90 个测试通过，1 个环境端到端测试跳过。
- `pnpm typecheck` 和 `pnpm --filter @specforge/web typecheck`：工作区全部类型检查通过。
- `git diff --check`：通过。
