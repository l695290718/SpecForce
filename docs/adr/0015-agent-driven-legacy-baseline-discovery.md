# Agent-Driven Legacy Baseline Discovery

## Status

**Scanner foundation implemented. MCP design facts are synchronized and read back; signed packaging, semantic extraction, and Agent integration remain pending.**

ADR-0018 refines this discovery boundary with the unified 3A ontology, profile separation, semantic assertions, atomic ChangeSets, immutable Baselines, and derived Knowledge Layer contracts. This ADR remains authoritative for the local-Agent trust boundary, exact-Scope session, deterministic scanner, and ReviewBundle policy.

- Stable ADR/MCP ID: `adr-agent-driven-legacy-baseline-discovery`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge needs to onboard existing enterprise application services without requiring each product team to deploy a scanner daemon. Enterprise users already have coding Agents such as Claude Code and OpenCode inside source workspaces, but an Agent-only repository reading process is non-deterministic, expensive, and difficult to audit. A fixed scanner alone can recover implementation structure but cannot reliably recover undocumented business intent.

The enterprise hierarchy is maintained before discovery. A token may authorize several application services, while the current write dimension remains one exact application service per operation. Large candidate volumes also make per-fact human approval impractical.

## Decision

Adopt the architecture in `docs/superpowers/specs/2026-08-01-agent-driven-legacy-baseline-discovery-design.md`.

Use a remote authenticated MCP control plane and a provider-neutral Agent integration pack. Claude Code, OpenCode, or another compatible Agent starts a Scan Session for one explicitly selected and exactly authorized application service, invokes a signed ephemeral scanner in the current workspace, and submits deterministic observations in idempotent batches. No scanner daemon, persistent worker, or user-managed Docker service is required.

The server resolves the stored Scope and stamps it onto all scan state. Caller payloads cannot override Scope. One token may contain several application-service grants, but every Scan Session, observation batch, semantic proposal, review, promotion, relationship, and baseline publication remains bound to one exact Scope.

The deterministic scanner creates an evidence index and implementation observations. It does not claim business meaning. The Agent derives evidence-backed semantic candidates and explicit unresolved questions. Facts remain separated as Evidence, Observation, Candidate, and Accepted Fact.

Review uses risk-tiered domain `ReviewBundle` records. T0 technical facts may follow explicit automatic-promotion policy; T1 low-risk semantics may be batch-approved by an independent authorized Agent; T2 high-impact semantics require a human domain owner by default; T3 uncertainty, conflict, or cross-Scope implications require individual human resolution. The same Agent identity cannot both generate and independently approve one T1 bundle.

Accepted facts, ADRs, Proposals, Context Packs, Evidence, and typed links remain MCP-governed writes. PostgreSQL remains authoritative and graph storage remains a derived projection. Initial delivery is manual baseline discovery only; continuous CI observation, live runtime connectors, outbound proposals, and external `APPLY` remain deferred.

## Alternatives

1. **Embed scanning in the Web process.** Rejected because repository analysis competes with interactive traffic and cannot reliably reach user-local enterprise sources.
2. **Deploy a persistent Scanner Worker for each enterprise environment.** Rejected for the initial delivery because product teams are unlikely to deploy and operate an additional service.
3. **Let the coding Agent read and infer the entire repository without deterministic tooling.** Rejected because results are non-repeatable, token-intensive, difficult to resume, and weakly evidenced.
4. **Use only a fixed scanner.** Rejected because structural extraction cannot recover missing business meaning or architectural intent.
5. **Require human approval for every semantic fact.** Rejected because enterprise baselines need risk-tiered review, deduplication, bundling, delegated Agent review, and incremental re-review.
6. **Permit scanners or ETL scripts to write accepted facts directly to PostgreSQL.** Rejected because it bypasses MCP authorization, audit, candidate governance, localization, and exact-Scope enforcement.

## Consequences

- Positive: Product teams use existing coding Agents and do not deploy scanner infrastructure.
- Positive: Deterministic evidence extraction and Agent semantic reasoning remain independently inspectable.
- Positive: Exact application-service authorization remains enforceable even when one token grants several services.
- Positive: Review Bundles and risk tiers make large semantic baselines governable without losing per-fact auditability.
- Positive: Failed or partial scans cannot change the active baseline or dashboard counts.
- Tradeoff: A signed cross-platform scanner package and remote authenticated MCP transport must be delivered.
- Tradeoff: Language and framework coverage is incremental and must be reported rather than hidden.
- Tradeoff: T2 and T3 semantic review still requires scarce domain-owner attention.
- Tradeoff: Continuous synchronization and live source connectors require later increments.

## Constraints

- Enterprise hierarchy records must exist before discovery and cannot be authored by the scanner.
- One token may contain multiple exact application-service grants; one operation targets exactly one stored Scope.
- Scope comes from the authenticated session and server-side binding, never from an untrusted payload or UI default.
- Full source code is not uploaded by default; evidence must be minimized, content-addressed, and redacted.
- The scanner is ephemeral, signed, versioned, and non-executing by default with respect to repository build scripts.
- Semantic claims require evidence, confidence, counter-evidence where present, unresolved questions, and extraction identity.
- English is canonical and accepted human-facing facts require complete Chinese overlays.
- T1 generation and independent approval require separate Agent identities; T2 and T3 require human approval by default.
- PostgreSQL remains authoritative; graph stores remain derived projections.
- Initial delivery must not claim continuous CI synchronization, live database or gateway discovery, outbound proposals, or external `APPLY`.

## Evidence

- **Design reviewed:** The user approved Agent-executed baseline discovery, multi-service token grants with one-Scope-per-operation enforcement, hybrid deterministic and semantic extraction, and four-tier ReviewBundle governance on 2026-08-01.
- **Repository consistency check:** `node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts` passed 1 file and 6 tests.
- **MCP persistence:** With `DATABASE_URL` loaded from the repository `.env`, `pnpm design-facts:sync` returned all 13 baseline decisions as complete, including this ADR and its generated Proposal, Context Pack, Evidence, and typed links.
- **MCP read-back:** With the same configured authority, `pnpm design-facts:check` verified all 13 decisions with empty `missing`, `mismatched`, `outOfScope`, and `blocked` results.
- **Implementation evidence:** `pnpm typecheck` passed Core, MCP Server, and Web; the scanner core and MCP tool suites passed; the gated scanner integration test persisted a source-minimized report and idempotent observations in `localhost:15433/specforge_canonical`; and `pnpm scan:workspace -- --root packages/core --application-service-id com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --output <temp-file>` produced 56 manifest entries, 56 structural observations, and a deterministic report digest. The implementation does not yet sign scanner packages, provide remote Agent integration, infer semantic candidates, or publish a baseline.

## MCP Record

- Matching MCP ADR ID: `adr-agent-driven-legacy-baseline-discovery`
- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-agent-driven-legacy-baseline-discovery`
- Matching Context Pack: `context-pack-agent-driven-legacy-baseline-discovery`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, and `adr-federated-design-fact-synchronization`
- Typed links: Proposal `--IMPLEMENTS_DECISION-->` ADR; Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal; ADR `--DECIDES-->` related assets; Evidence `--VALIDATES-->` ADR
- Status: MCP synchronized and read back from the configured canonical PostgreSQL authority; scanner foundation is implemented, while signed packaging, semantic extraction, Agent integration, and baseline publication remain pending.

## Chinese Localization

### 标题

Agent 驱动的存量系统基线发现

### 背景

SpecForge 需要在不要求各产品团队部署扫描服务的情况下接入企业存量应用。企业用户已经在源码工作区中使用 Claude Code、OpenCode 等 Coding Agent，但完全依靠 Agent 阅读仓库会导致结果不稳定、Token 成本高且难以审计；固定扫描工具虽然可以提取实现结构，却无法可靠恢复代码中没有明确表达的业务意图。

企业架构层级在扫描前已经维护。一个 Token 可以授权多个应用服务，但当前写入维度仍是每次操作精确绑定一个应用服务。大规模候选事实也无法依赖逐条人工审批。

ADR-0018 在本 ADR 基础上补充统一 3A 本体、Profile 分离、语义断言、原子 ChangeSet、不可变 Baseline 和派生知识层契约。本 ADR 继续作为本地 Agent 信任边界、精确 Scope Session、确定性扫描器和 ReviewBundle 策略的权威记录。

### 决策

采用远程鉴权 MCP 控制面、Provider 无关的 Agent 集成包、临时确定性扫描工具、Agent 语义提取和分级 ReviewBundle。Claude Code、OpenCode 或兼容 Agent 为一个明确选择且精确授权的应用服务创建 Scan Session，在当前项目目录临时运行签名扫描工具，并按幂等批次提交观察结果。用户不需要部署常驻 Scanner、Worker 或额外 Docker 服务。

服务端解析已维护的 Scope 并写入所有扫描状态，调用方不能覆盖。固定扫描工具只建立证据索引和实现观察，不声明业务含义；Agent 根据证据生成语义候选和未解决问题。Evidence、Observation、Candidate 和 Accepted Fact 必须保持分层。

审核按领域 ReviewBundle 和风险等级执行。T0 技术事实可由明确策略自动提升；T1 低风险语义可由独立且获授权的 Agent 批量批准；T2 高影响语义默认由领域负责人确认；T3 不确定、冲突或跨 Scope 影响必须逐项人工解决。同一 Agent 身份不能生成并独立批准同一个 T1 审核包。

正式事实、ADR、Proposal、Context Pack、Evidence 和类型化关系仍只能通过 MCP 写入。PostgreSQL 保持权威，图数据库仅为派生投影。首期只实现手动基线发现，持续 CI 观察、运行时连接器、出站提案和外部 `APPLY` 保持延期。

### 备选方案

1. 将扫描嵌入 Web 进程：拒绝，因为扫描会与交互流量竞争资源，也无法可靠访问用户本地企业数据源。
2. 为每个企业环境部署常驻 Scanner Worker：首期拒绝，因为产品团队不愿额外部署和运维服务。
3. 完全由 Coding Agent 阅读并推断整个仓库：拒绝，因为结果不可重复、Token 成本高、难以断点恢复且证据薄弱。
4. 只使用固定扫描工具：拒绝，因为结构提取无法恢复缺失的业务语义和架构意图。
5. 每条语义事实都要求人工批准：拒绝，因为企业基线需要风险分层、去重、批量审核和增量复核。
6. 允许扫描器或 ETL 直接写 PostgreSQL：拒绝，因为这会绕过 MCP 授权、审计、候选治理、本地化和精确 Scope 校验。

### 后果

- 积极影响：产品团队复用现有 Coding Agent，无需部署扫描基础设施。
- 积极影响：确定性证据提取和 Agent 语义推理可以独立检查。
- 积极影响：即使一个 Token 授权多个应用服务，仍可执行精确应用服务隔离。
- 积极影响：ReviewBundle 和风险分级使大规模语义基线可治理，并保留逐事实审计。
- 积极影响：失败或部分扫描不会改变活动基线和仪表盘数字。
- 权衡：需要交付签名的跨平台扫描工具和远程鉴权 MCP 传输。
- 权衡：语言和框架覆盖需要逐步增加，并必须显式报告缺口。
- 权衡：T2、T3 语义仍占用领域负责人时间。
- 权衡：持续同步和实时数据源连接器需要后续增量。

### 约束

- 企业架构层级必须在扫描前存在，扫描器不得创建或修改层级。
- 一个 Token 可以包含多个精确应用服务授权，但一次操作只能面向一个已维护 Scope。
- Scope 必须来自鉴权会话和服务端绑定，不能来自不可信请求载荷或 UI 默认值。
- 默认不上传完整源码；证据必须最小化、内容寻址并脱敏。
- 扫描工具必须临时运行、经过签名、具有版本，并且默认不执行项目构建脚本。
- 语义候选必须包含证据、置信度、已有反证、未解决问题和提取身份。
- 英文为规范内容，正式面向人事实必须具有完整中文覆盖。
- T1 候选生成和独立批准必须使用不同 Agent 身份；T2、T3 默认要求人工批准。
- PostgreSQL 保持权威，图数据库仅为派生投影。
- 首期不得声称已实现持续 CI 同步、实时数据库或网关发现、出站提案或外部 `APPLY`。

### 证据

- **设计已评审：** 用户于 2026-08-01 确认 Agent 临时执行、多应用服务 Token 与单 Scope 操作、确定性扫描和语义提取混合模式，以及四级 ReviewBundle 治理。
- **仓库一致性检查：** `node .\node_modules\vitest\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" scripts\design-fact-manifest.test.ts` 已通过 1 个文件和 6 项测试。
- **MCP 持久化：** 从仓库 `.env` 加载 `DATABASE_URL` 后，`pnpm design-facts:sync` 返回全部 13 项基线决策均为完成，其中包含本 ADR 及其生成的 Proposal、Context Pack、Evidence 和类型化关系。
- **MCP 回读：** 使用同一权威库执行 `pnpm design-facts:check`，全部 13 项决策通过验证，`missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空。
- **实现证据：** `pnpm typecheck` 已通过 Core、MCP Server 和 Web；扫描器核心与 MCP 工具定向测试通过；带门控的扫描器集成测试已将最小化源码报告和幂等观察写入 `localhost:15433/specforge_canonical`；`pnpm scan:workspace -- --root packages/core --application-service-id com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --output <临时文件>` 生成 56 个清单条目、56 个结构观察和确定性报告摘要。当前尚未实现扫描器签名包、远程 Agent 集成、语义候选推断和 Baseline 发布。

### MCP 记录

- 匹配 MCP ADR ID：`adr-agent-driven-legacy-baseline-discovery`
- 精确所属 Scope：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 匹配 Proposal：`proposal-agent-driven-legacy-baseline-discovery`
- 匹配 Context Pack：`context-pack-agent-driven-legacy-baseline-discovery`
- 相关资产：`api-specforge-mcp-tools`、`data-specforge-assets`、`adr-federated-design-fact-synchronization`
- 类型化关系：Proposal `--IMPLEMENTS_DECISION-->` ADR；Context Pack `--IMPLEMENTS_CONTEXT_FOR-->` Proposal；ADR `--DECIDES-->` 相关资产；Evidence `--VALIDATES-->` ADR
- 状态：已通过 MCP 写入配置的规范 PostgreSQL 权威库并完成回读；扫描器基础已实现，签名包、语义提取、Agent 集成和 Baseline 发布仍待实现。
