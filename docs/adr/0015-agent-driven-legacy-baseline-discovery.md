# Agent-Driven Legacy Baseline Discovery

## Status

**Accepted. Phase 1 runtime is implemented, locally verified, synchronized through MCP, and read back in the exact Scope. Phases 2-5 remain deferred.**

- Stable ADR/MCP ID: `adr-agent-driven-legacy-baseline-discovery`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Phase 1 Proposal: `proposal-agent-driven-legacy-baseline-discovery`
- Agent Context Pack: `context-pack-agent-driven-legacy-baseline-discovery`

## Context

SpecForge must initialize design knowledge for existing enterprise application services without asking each product team to deploy another daemon. Coding Agents such as Claude Code and OpenCode can already reach source workspaces, but Agent-only reading is nondeterministic, expensive, difficult to resume, and weakly auditable. A fixed scanner is repeatable but cannot recover undocumented business intent by itself. The enterprise hierarchy and token grants already exist, and one token may authorize several application services, while every write must target one exact application-service Scope.

## Decision

Use an authorized coding Agent as the orchestrator and transport for a signed, ephemeral, standalone Go scanner. The scanner verifies a preconfigured Ed25519 trust root, inventories one immutable workspace snapshot without executing repository code, creates source-minimized deterministic observations, and writes resumable hash-chained batches to a private local spool. The Agent transports those batches and evidence-backed bilingual semantic candidates through MCP; scanners and Agents never receive PostgreSQL credentials.

The server creates one exact-Scope Scan Session, validates the signed release and every batch, persists observations idempotently, and rejects Scope overrides, hash-chain gaps, rollback releases, revoked releases, oversized sessions, source excerpts, and unsafe workspace traversal. Review uses T0-T3 risk policy and generator-versus-approver separation. Approved candidates are promoted atomically into canonical assets, typed links, Evidence, outbox events, a monotonic ChangeSet, and an immutable promotion receipt. Baseline publication requires a durable converged reconciliation receipt and never mutates the previous Baseline.

PostgreSQL remains authoritative for releases, sessions, observations, review, canonical assets, relationships, ChangeSets, reconciliation receipts, and Baselines. Graph stores remain derived projections. Phase 1 delivers manual baseline discovery and publication. Continuous CI observation, live database/API-gateway/CMDB/runtime connectors, 3A projections, CodeHub enforcement, outbound proposals, external `APPLY`, and complete billion-scale certification remain Phases 2-5.

## Alternatives

1. **Embed scanning in the Web process.** Rejected because repository analysis competes with interactive traffic and often cannot reach enterprise-local sources.
2. **Deploy a persistent scanner worker per environment.** Rejected for Phase 1 because users should not operate another service.
3. **Let the Agent infer the whole repository without deterministic tooling.** Rejected because results are hard to reproduce, resume, and audit.
4. **Use only a fixed scanner.** Rejected because static structure alone cannot establish business meaning or architectural intent.
5. **Require human approval for every candidate.** Rejected because enterprise volumes require risk-tiered bundles and independent delegated review.
6. **Write accepted facts directly to PostgreSQL.** Rejected because it bypasses MCP authorization, localization, audit, candidate governance, and exact-Scope isolation.

## Consequences

- Existing coding Agents can initialize a repository without scanner infrastructure deployment.
- Deterministic extraction and semantic reasoning remain separately inspectable.
- Interrupted transport resumes from a durable checkpoint without duplicate observations.
- Failed scan, review, promotion, or reconciliation cannot change the active Baseline or dashboard counts.
- Canonical IDs remain stable across rescans, preventing duplicate design assets.
- Signed native release production requires secret-managed signing keys and native CI runners.
- Language coverage is explicit and incomplete extractors produce blocking coverage gaps rather than invented facts.
- T2 and T3 decisions still consume domain-owner attention.
- Remote CI workflow execution is configured but is not claimed as locally verified evidence.

## Constraints

- The enterprise hierarchy must exist before discovery; the scanner cannot create or change it.
- One operation targets one exact stored Scope even when the token grants several application services.
- Scope comes from authenticated server-side binding, never an untrusted payload or UI default.
- The scanner never executes project code, build scripts, package managers, generated binaries, or dynamically discovered plugins.
- Phase 1 persists no source excerpts; observations contain minimized metadata, digests, locations, and evidence references only.
- English is canonical and every accepted human-facing asset requires a complete Chinese overlay.
- T1 generation and approval require different Agent identities; T2 and T3 require human approval by default.
- PostgreSQL is authoritative and graph storage is a rebuildable derived projection.
- A failed MCP write, failed read-back, missing evidence, or Scope mismatch blocks completion.
- Phases 2-5 must not be described as implemented until independently designed, evidenced, synchronized, and reconciled.

## Evidence

- **Implementation commits:** `bf9b7da`, `11cec82`, `95838ae`, `7bda2d5`, `a68dde3`, `49aefe6`, `2ed562a`, `6f3d008`, and `226cae8` implement the Phase 1 contract, ingestion, scanner, extraction, review, promotion, operations, and proof increments.
- **Stage verification:** `pnpm legacy-baseline:verify` exited `0`; `artifacts/legacy-baseline-verification.json` records `PASSED` for contract drift, Go tests/build, 155 Core tests, scanner/knowledge tests, PostgreSQL integration, real signed-binary E2E, 100,000-observation scale, workspace typecheck, and production build.
- **End-to-end behavior:** `apps/mcp-server/src/scanner/legacy-baseline.e2e.test.ts` passed signed scanner execution, three-or-more batches, interruption and exact retry, checkpoint resume, bilingual candidates, T1 actor separation, atomic promotion, reconciliation, immutable Baseline publication, stable rescan IDs, supersession, and sibling-Scope isolation.
- **Scale behavior:** `apps/mcp-server/src/scanner/legacy-baseline.scale.test.ts` passed 100,000 observations in 200 batches of 500, checkpoint recovery at 50,000, overflow rejection, sibling-Scope isolation, zero excerpt rejection, and a process-memory delta below 512 MiB.
- **Build boundary:** The local Windows production build passed with `SPECFORGE_NEXT_STANDALONE=0` to avoid OneDrive/pnpm symlink creation; the default Docker/Linux configuration still produces Next.js standalone output. The GitHub native release workflow is configured but has not been executed by this local evidence.
- **MCP synchronization:** `DATABASE_URL=<canonical> pnpm design-facts:sync` returned all 16 decisions as `complete`, including the Phase 1 Proposal, Agent Context Pack, seven managed facts, Evidence, and directional links in the exact Designer Scope.
- **MCP read-back:** `DATABASE_URL=<canonical> pnpm design-facts:check` returned all 16 decisions in `verified` with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists; the extended checker reads managed assets and links through MCP.
- **Federation reconciliation:** With the exact application service and scope path set, `pnpm design-facts:federation:check` returned `blocking:false`, empty `issueCounts`, and root `f04e3ad0981d2ce6a2e40032e359ab06b07dc4ed2255774b6515ba8cd87987dd` after removing four explicitly test-namespaced stale observations and correcting their cleanup fixture.
- **Design-session closure:** `pnpm design-context:close -- --session design-change-session:5e45b9a8-ca66-4d28-9bf4-757526d5e5b3 --status CONVERGED --evidence <three passed checks>` returned the exact session with status `CONVERGED` and all verification references preserved.

## MCP Record

- Matching ADR: `adr-agent-driven-legacy-baseline-discovery`
- Matching Proposal: `proposal-agent-driven-legacy-baseline-discovery`
- Matching Context Pack: `context-pack-agent-driven-legacy-baseline-discovery`
- Managed facts: `api-specforge-scanner-release-contract`, `data-specforge-scan-session`, `data-specforge-scan-batch`, `data-specforge-source-observation-v2`, `rule-specforge-knowledge-risk-policy`, `rule-specforge-knowledge-promotion-transaction`, and `api-specforge-knowledge-baseline-publication`
- Directional links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; ADR `DECIDES` managed facts; Proposal `IMPACTS` Phase 1 facts; risk and promotion rules `GOVERNS` their targets; MCP API `CONTAINS` child contracts; Baseline publication `WRITES` canonical assets; Evidence `VALIDATES` ADR.

## Chinese Localization

### 标题

Agent 驱动的存量系统基线发现

### 背景

SpecForge 必须在不要求各产品团队额外部署守护进程的情况下，为企业存量应用服务初始化设计知识。Claude Code、OpenCode 等 Coding Agent 已经能够访问源码工作区，但只依赖 Agent 阅读代码会导致结果不确定、成本高、难以断点恢复且审计证据薄弱。固定扫描器具有可重复性，却无法单独恢复未在代码中明确表达的业务意图。企业层级和 Token 授权已事先维护，一个 Token 可以授权多个应用服务，但每次写入必须只面向一个精确的应用服务 Scope。

### 决策

使用已授权的 Coding Agent 作为编排器和传输通道，运行经过签名的临时独立 Go 扫描器。扫描器校验预配置的 Ed25519 信任根，在不执行仓库代码的前提下盘点一个不可变工作区快照，生成源码最小化的确定性观察，并把可恢复的哈希链批次写入私有本地暂存目录。Agent 通过 MCP 传输批次和具有证据支撑的双语语义候选；扫描器和 Agent 都不能获得 PostgreSQL 凭据。

服务端为每次任务创建一个精确 Scope 的扫描会话，校验签名发布版本和每个批次，幂等持久化观察，并拒绝 Scope 覆盖、哈希链缺口、版本回滚、已撤销发布、超限会话、源码摘录和不安全工作区遍历。评审执行 T0-T3 风险策略以及生成者与批准者分离。已批准候选通过一个事务提升为规范资产、有类型关系、Evidence、Outbox 事件、单调 ChangeSet 和不可变提升回执。Baseline 发布必须使用持久化且已收敛的对账回执，并且绝不修改之前的 Baseline。

PostgreSQL 对发布版本、会话、观察、评审、规范资产、关系、ChangeSet、对账回执和 Baseline 保持权威；图存储仅为派生投影。第一阶段交付手动基线发现和发布。持续 CI 观察、实时数据库/API 网关/CMDB/运行时连接器、3A 投影、CodeHub 门禁、出站 Proposal、外部 `APPLY` 和完整亿级容量认证属于第二至第五阶段。

### 备选方案

1. **把扫描嵌入 Web 进程。** 拒绝，因为仓库分析会与交互流量竞争资源，并且通常无法访问企业本地源码。
2. **每个环境部署常驻扫描 Worker。** 第一阶段拒绝，因为用户不应额外运维一个服务。
3. **让 Agent 在没有确定性工具的情况下推断整个仓库。** 拒绝，因为结果难以复现、恢复和审计。
4. **只使用固定扫描器。** 拒绝，因为静态结构无法单独确定业务含义和架构意图。
5. **每个候选都要求人工批准。** 拒绝，因为企业规模需要风险分层、批量评审和独立代理审批。
6. **直接向 PostgreSQL 写入正式事实。** 拒绝，因为这会绕过 MCP 授权、本地化、审计、候选治理和精确 Scope 隔离。

### 后果

- 现有 Coding Agent 无需部署扫描基础设施即可初始化仓库。
- 确定性提取和语义推理可以分别检查。
- 传输中断后可以从持久检查点恢复，不会产生重复观察。
- 扫描、评审、提升或对账失败都不会改变活动 Baseline 或仪表盘数字。
- 重新扫描保持规范 ID 稳定，避免重复设计资产。
- 签名原生制品需要秘密托管签名密钥和原生 CI Runner。
- 语言覆盖必须显式报告；提取器不完整时产生阻塞性覆盖缺口，而不是虚构事实。
- T2 和 T3 仍然需要领域负责人投入。
- 已配置远程 CI 工作流，但本地证据不声称它已经运行成功。

### 约束

- 企业层级必须在发现前存在，扫描器不能创建或修改层级。
- 即使 Token 授权多个应用服务，一次操作也只能面向一个精确的已存储 Scope。
- Scope 必须来自鉴权和服务端绑定，不能来自不可信载荷或 UI 默认值。
- 扫描器绝不能执行项目代码、构建脚本、包管理器、生成的二进制或动态发现插件。
- 第一阶段不持久化任何源码摘录，只保存最小化元数据、摘要、位置和证据引用。
- 英文是规范内容，所有正式面向人的资产必须具有完整中文覆盖。
- T1 生成和批准必须使用不同 Agent 身份；T2 和 T3 默认需要人工批准。
- PostgreSQL 保持权威，图存储是可重建的派生投影。
- MCP 写入失败、回读失败、证据缺失或 Scope 不匹配都会阻止完成。
- 第二至第五阶段在独立设计、取证、同步和对账前不得描述为已实现。

### 证据

- **实现提交：** `bf9b7da`、`11cec82`、`95838ae`、`7bda2d5`、`a68dde3`、`49aefe6`、`2ed562a`、`6f3d008` 和 `226cae8` 完成第一阶段契约、摄取、扫描器、提取、评审、提升、运维和验证增量。
- **阶段验证：** `pnpm legacy-baseline:verify` 退出码为 `0`；`artifacts/legacy-baseline-verification.json` 对契约漂移、Go 测试与构建、155 项 Core 测试、扫描器/知识测试、PostgreSQL 集成、真实签名二进制端到端、10 万条规模、工作区类型检查和生产构建均记录为 `PASSED`。
- **端到端行为：** `legacy-baseline.e2e.test.ts` 已验证签名扫描器、至少三个批次、中断与精确重试、检查点恢复、双语候选、T1 角色分离、原子提升、对账、不可变 Baseline 发布、重扫 ID 稳定、旧基线被取代以及同级 Scope 隔离。
- **规模行为：** `legacy-baseline.scale.test.ts` 已验证 10 万条观察按 200 个批次摄取、5 万条处恢复、超限拒绝、同级 Scope 隔离、零摘录拒绝以及进程内存增量低于 512 MiB。
- **构建边界：** Windows 本地构建使用 `SPECFORGE_NEXT_STANDALONE=0` 规避 OneDrive/pnpm 符号链接创建限制并通过；默认 Docker/Linux 配置仍生成 Next.js standalone 输出。GitHub 原生发布工作流已配置，但本地证据不声称远程执行通过。
- **MCP 同步：** `DATABASE_URL=<canonical> pnpm design-facts:sync` 返回全部 16 项决策为 `complete`，并在精确 Designer Scope 中写入第一阶段 Proposal、Agent Context Pack、七项托管事实、Evidence 和有向关系。
- **MCP 回读：** `DATABASE_URL=<canonical> pnpm design-facts:check` 将全部 16 项决策列入 `verified`，且 `missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空；扩展后的检查器通过 MCP 回读托管资产与关系。
- **联邦对账：** 设置精确应用服务与 Scope 路径后，`pnpm design-facts:federation:check` 返回 `blocking:false`、空 `issueCounts` 和根摘要 `f04e3ad0981d2ce6a2e40032e359ab06b07dc4ed2255774b6515ba8cd87987dd`；四条明确属于测试命名空间的旧观察已清理，其清理 Fixture 已修正。
- **设计会话关闭：** `pnpm design-context:close -- --session design-change-session:5e45b9a8-ca66-4d28-9bf4-757526d5e5b3 --status CONVERGED --evidence <三项已通过检查>` 返回该精确会话，状态为 `CONVERGED`，并保留全部验证引用。

### MCP 记录

- 匹配 ADR：`adr-agent-driven-legacy-baseline-discovery`
- 匹配 Proposal：`proposal-agent-driven-legacy-baseline-discovery`
- 匹配 Context Pack：`context-pack-agent-driven-legacy-baseline-discovery`
- 托管事实：`api-specforge-scanner-release-contract`、`data-specforge-scan-session`、`data-specforge-scan-batch`、`data-specforge-source-observation-v2`、`rule-specforge-knowledge-risk-policy`、`rule-specforge-knowledge-promotion-transaction`、`api-specforge-knowledge-baseline-publication`
- 有向关系：Proposal `IMPLEMENTS_DECISION` ADR；Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal；ADR `DECIDES` 托管事实；Proposal `IMPACTS` 第一阶段事实；风险与提升规则 `GOVERNS` 目标；MCP API `CONTAINS` 子契约；Baseline 发布 `WRITES` 规范资产；Evidence `VALIDATES` ADR。
