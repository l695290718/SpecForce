# ADR-0040: Agent Governance Briefing and the Orientation Path

## Status

Accepted and implemented under exact-scope design-change-session `design-change-session:987271e5-6d04-4a24-a827-021fdb64acba` in the Designer Scope. The briefing is a generated view over system records; it introduces no new asset type and changes no authorization boundary. Evidence is appended below.

已接受并实现，对应精确 Scope 设计变更会话 `design-change-session:987271e5-6d04-4a24-a827-021fdb64acba`（Designer Scope）。简报是系统记录之上的生成视图：不引入新资产类型，不改变授权边界。证据见文末。

## Context

SpecForge's own system of record held 31+ ADRs and 10+ business rules, but agents (and humans) joining the project learned governance from hand-written AGENTS.md instead of querying the authoritative source. During the integration-atlas increment the implementing agent never read the in-system rule catalog; it complied only because AGENTS.md happened to be a faithful projection. Nothing forces an orientation pass, nothing keeps the human-written summary synchronized with the record, and no single query answers "what rules are in force and what has been decided."

SpecForge 自身系统记录中已有 31 条以上 ADR 与 10 条以上业务规则，但新加入的代理（和人）是通过手写的 AGENTS.md 了解治理的，而不是查询权威源。集成图谱增量期间，实现代理从未读取系统内规则目录；之所以没有违规，只因 AGENTS.md 恰好是忠实的投影。没有任何机制强制入职阅读，没有任何东西保证人工摘要与记录同步，也没有一条查询能回答"当前生效哪些规则、已经决定了什么"。

## Decision

1. **Generated briefing, not another hand-maintained page.** `pnpm governance:briefing` reads business rules and ADRs from SpecForge through MCP (`search_design_assets`, `get_asset_detail`) across all four application-service scopes, compiles them with the shared core function `compileGovernanceBriefing`, and writes `docs/governance-briefing.md` with a content digest. The file is generated output; hand edits will be overwritten.
2. **One compiler, two surfaces.** The same core function powers both the generated markdown document and the live `/governance/briefing` web surface, which renders the identical data server-side via the core service per `rule-specforge-core-service-reuse`.
3. **MCP is the agent read path.** Agent-side catalog reads go through MCP tools (`scripts/design-query.mts`, registered as `pnpm design:query`), not direct database access. Direct SQL during implementation was a diagnosed anti-pattern this increment retires.
4. **The checklist is part of the briefing.** Six orientation steps (read briefing first, preflight before change, MCP-only writes, bilingual completeness, CONVERGED closure evidence, backlog facts for deferrals) ship inside the compiled artifact so the process travels with the facts.
5. **AGENTS.md remains hand-written for now.** Synchronizing its rule prose from the record is explicitly deferred as a backlog fact; this ADR does not claim that synchronization exists.

1. **生成简报，而非再维护一份手工页面。** `pnpm governance:briefing` 经 MCP（`search_design_assets`、`get_asset_detail`）跨四个应用服务 Scope 读取业务规则与 ADR，用共享核心函数 `compileGovernanceBriefing` 编译，写出带内容摘要的 `docs/governance-briefing.md`。该文件是生成产物——手改会被覆盖。
2. **一个编译器，两个表面。** 同一核心函数同时驱动生成的 Markdown 文档与线上 `/governance/briefing` 页面；页面按 `rule-specforge-core-service-reuse` 经 Core 服务在服务端渲染同一数据。
3. **MCP 是代理读路径。** 代理侧目录读取一律走 MCP 工具（`scripts/design-query.mts`，注册为 `pnpm design:query`），不直查数据库。实现期直查 SQL 是本增量明确纠正的反模式。
4. **清单随简报走。** 六步入职步骤（先读简报、改前预检、仅经 MCP 写入、双语完整、CONVERGED 关闭证据、延期登记待办事实）编入产物本身，让流程与事实同行。
5. **AGENTS.md 暂仍手写。** 将其规则段落改为由记录同步生成被显式登记为延期待办事实；本 ADR 不声称该同步已存在。

## Alternatives

- **Hand-written onboarding doc**: rejected — it is exactly the drift-prone duplicate this increment removes.
- **Preflight-time forced briefing**: rejected for V1 — valuable later, but it couples the gate to a broader read than the affected-fact scope requires; orientation stays voluntary-but-easy.

- **手写入职文档**：否决——这正是本增量要移除的易漂移副本。
- **预检时强制简报**：V1 否决——后续有价值，但会把门禁耦合到超出受影响事实范围的宽读取；定向保持"自愿但极易完成"。

## Consequences

- New agents get a single authoritative orientation artifact whose digest proves freshness; staleness becomes visible instead of silent.
- Rule and ADR authors must keep canonical English plus Chinese overlays accurate, because the briefing surfaces them verbatim.
- The deferred AGENTS.md synchronization means two entry points coexist until that backlog fact lands; the digest makes divergence detectable.

- 新代理获得单一权威的定向产物，其摘要可证明新鲜度；陈旧由不可见变为可见。
- 规则与 ADR 作者必须保持英文规范字段与中文覆盖准确，因为简报会原文呈现它们。
- 在延期的 AGENTS.md 同步落地前存在两个入口；摘要机制使分歧可被检测。

## Constraints

- Reads stay within the four readable application-service scopes; no new grants are introduced by the briefing.
- The web surface is read-only and reuses core; the generator script writes only `docs/governance-briefing.md`.
- No new asset type, schema migration, or write path is introduced.

- 读取限于四个可读应用服务 Scope；简报不引入任何新授权。
- Web 界面只读并复用 Core；生成脚本只写 `docs/governance-briefing.md`。
- 不引入新资产类型、模式迁移或写路径。

## Evidence

- `pnpm exec vitest run src/governance/briefing.test.ts` (packages/core) → **3 passed** (dedupe/sort/status split, stable digest, bilingual rendering).
- `pnpm design:query search --type adr --limit 50` → 32 ADR summaries returned through MCP; same CLI returned all business rules — direct-SQL reads retired for agent workflows.
- `pnpm governance:briefing` → wrote `docs/governance-briefing.md`, digest `2aece65dd9384edd`, counts `{rules: 11, adrsAccepted: 32, adrsOther: 0}`.
- `pnpm exec tsc --noEmit -p apps/web` → exit 0; production build and CDP verification of `/governance/briefing` recorded at session close.

- `pnpm exec vitest run src/governance/briefing.test.ts`（packages/core）→ **3 通过**（去重/排序/状态拆分、稳定摘要、双语渲染）。
- `pnpm design:query search --type adr --limit 50` → 经 MCP 返回 32 条 ADR 摘要；同 CLI 返回全部业务规则——代理工作流退役直查 SQL。
- `pnpm governance:briefing` → 写出 `docs/governance-briefing.md`，摘要 `2aece65dd9384edd`，计数 `{rules: 11, adrsAccepted: 32, adrsOther: 0}`。
- `pnpm exec tsc --noEmit -p apps/web` → exit 0；生产构建与 `/governance/briefing` 的 CDP 验证于会话关闭时记录。
- MCP registration close-out: `create_adr adr-agent-governance-briefing` persisted with full EN canonical + zh overlays (title/name/description/context/decision strings; alternatives/consequences/constraints as item-aligned arrays per the localization contract); five typed `GOVERNS` links from `rule-bilingual-asset-completeness`, `rule-specforge-core-service-reuse`, `rule-specforge-mcp-write-audit`, `rule-specforge-seed-through-mcp`, `rule-specforge-relationships-required` to this ADR; Proposal → **17 specChanges**, Context Pack → **53 instructions** (guards SHAPE_DRIFT 16/52 and ALREADY_APPLIED "agent governance briefing increment" enforced on a fresh dump).

## MCP Record

- MCP ADR ID: `adr-agent-governance-briefing` (same stable ID as this repository file)
- Owning architectureScope: `com.huawei.celon.desiner`
- Related records: Proposal `proposal-specforge-self-design` (specChanges entry), Context Pack `ctx-specforge-self-design` (instructions entry), linked to every businessRule surfaced by the first generated briefing where typed links exist.

- MCP ADR ID：`adr-agent-governance-briefing`（与本仓库文件同稳定 ID）
- 所属 architectureScope：`com.huawei.celon.desiner`
- 相关记录：Proposal `proposal-specforge-self-design`（specChanges 条目）、Context Pack `ctx-specforge-self-design`（instructions 条目），并与首份简报所呈现的业务规则建立类型化链接。

## Backlog Facts Registered

- `backlog-agents-md-sync-from-record`: AGENTS.md governance prose is still hand-written. Owner: Designer Scope maintainers. Trigger: next time AGENTS.md rules diverge from a businessRule payload, or at the following governance increment. Rationale: keeping two entry points risks drift; generation from the record closes it.

- `backlog-agents-md-sync-from-record`：AGENTS.md 治理段落仍为手写。负责人：Designer Scope 维护者。触发条件：AGENTS.md 规则再次与业务规则负载出现分歧时，或下一个治理增量时。理由：双入口有漂移风险，从记录生成可消除之。
