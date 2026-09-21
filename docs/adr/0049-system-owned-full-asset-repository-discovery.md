# ADR-0049: System-Owned Full-Asset Repository Discovery

## Status

Implemented for the governed repository-scan increment; production connector delivery remains deferred.

- Stable ADR ID: `adr-system-owned-full-asset-repository-discovery`.
- Proposal: `proposal-system-owned-full-asset-repository-discovery`.
- Context Pack: `context-pack-system-owned-full-asset-repository-discovery`.
- Scope: `com.specforge.designcenter`.
- Design session: `design-change-session:197ab290-ff5b-40d0-950f-55b213a58c9b`.
- Specification: `docs/superpowers/specs/2026-09-17-governed-repository-scan-skill-design.md`.

## Context

A file-extension scanner cannot correctly discover the complete SpecForge asset model. Data models, APIs, events, states, integrations, quality and observability depend on language and framework semantics, while domains, rules and features require evidence-backed Agent interpretation. Keeping inference and promotion policy inside each application-service Scope would also allow equivalent source to be governed inconsistently.

## Decision

1. Make scanner, asset-inference, T0-T3 risk, promotion, extractor-catalog and semantic-prompt policies immutable versioned system records rather than Scope-owned design assets.
2. Allow Scope runtime configuration only for repository mapping, paths, framework hints, sensitive paths, budgets and stricter review. It cannot weaken system policy or redefine assets and relationships.
3. Detect the technology stack before extraction and select signed first-party extractors by language, framework and version range.
4. Report coverage for every applicable SpecForge asset family with explicit capability states. Unsupported required capabilities block completion; demonstrably inapplicable families do not.
5. Preserve Evidence, Observation, Candidate and Accepted Fact as separate layers. Deterministic extractors produce structural observations; an Agent produces bounded bilingual semantic candidates; MCP performs identity, risk, review and promotion governance.
6. Keep the reusable Agent Skill as an orchestrator. It never directly writes accepted assets, typed relationships or Baselines.

## Alternatives

- A fixed scanner for all semantics was rejected because business meaning cannot be reliably recovered by syntax alone.
- Agent-only scanning was rejected because it lacks deterministic coverage, stable identity and reproducible evidence.
- Scope-owned governance was rejected because it permits policy drift and inconsistent promotion safety.

## Consequences

- Positive: framework-specific extraction can represent APIs and data models correctly while sharing one system governance model.
- Positive: every SpecForge asset family receives an explicit applicability and coverage result.
- Positive: Codex, Claude Code and OpenCode can use the same provider-neutral lifecycle.
- Tradeoff: the work must be delivered in governed slices for system policy, extractor registry, deterministic extraction, Agent semantics, Skill packaging and production proof.
- Deferred: continuous scanning, runtime/CMDB connectors, outbound APPLY and cross-Scope semantic merging.

## Constraints

- Every scan session targets one explicitly authorized application-service Scope.
- PostgreSQL remains authoritative; projections remain derived.
- MCP remains the only persistence and promotion boundary.
- English is canonical and Chinese localization is required for human-facing candidates.
- Partial or blocked scans cannot alter accepted facts, active Baselines or formal dashboard counts.

## Evidence

- `packages/core/src/types.ts` defines sixteen top-level SpecForge asset types that exceed the current six scanner observation categories.
- `packages/core/src/scanner/service.ts` currently classifies files primarily by path and extension, confirming the need for framework-aware extractors.
- `docs/superpowers/specs/2026-08-03-agent-driven-legacy-baseline-production-design.md` already establishes signed static extractors, evidence/observation/candidate/fact separation, T0-T3 review and provider-neutral Agent integration.
- The approved design review selected system-owned governance, framework-aware extraction, per-asset capability coverage and Agent semantic candidates.

## Implementation Boundary

The implemented increment includes system-owned governance records, technology-aware extractor catalogs, deterministic multi-language and contract-neutral extraction, bounded bilingual semantic-candidate validation, resumable governed sessions, coverage and blocker reports, provider-neutral Skill packaging, a signed portable Node scanner release path, compatible release selection, safe first-scan bootstrap readiness, and governance-version uniqueness protection. Continuous scanning, runtime or CMDB connectors, outbound proposals, external `APPLY`, cross-Scope semantic merging, automatic native acceleration, and full historical-baseline reconciliation remain deferred.

## Implementation Evidence

- `pnpm scanner-contract:check` -> passed.
- `pnpm exec vitest run packages/scan-contract/src/contract.test.ts` -> 8 tests passed, including portable/legacy manifest compatibility.
- `Push-Location apps/specforge-cli; go test ./internal/scancontract; Pop-Location` -> passed.
- `pnpm exec vitest run apps/mcp-server/src/scanner/release.test.ts apps/mcp-server/src/scanner/session.test.ts` -> 8 tests passed, including portable preference and incompatible-release denial.
- `node --test apps/specforge-cli/portable/scanner.test.mjs` -> 2 tests passed.
- `node scripts/build-portable-scanner-release.mjs --check` -> passed on Node 24.17.0.
- `node --test skills/specforge-repository-scan/scripts/readiness-gate.test.mjs skills/specforge-repository-scan/scripts/verify-input.test.mjs` -> 5 tests passed.
- `pnpm exec vitest run packages/core/src/knowledge-readiness/policy.test.ts apps/mcp-server/src/scanner/governance-bootstrap.test.ts` -> 6 tests passed.
- `pnpm exec vitest run apps/mcp-server/src/scanner/governance-persistence.integration.test.ts` -> 3 tests skipped because PostgreSQL integration was not enabled; the test now uses unique records and cleanup.
- Focused MCP scanner Vitest suite (session, finalization, report, 100,000-observation scale, provider contract equivalence, bilingual candidate persistence) -> 22 tests passed.
- `Push-Location apps/specforge-cli; go test ./...; Pop-Location` -> passed.
- `node --test skills/specforge-repository-scan/scripts/verify-input.test.mjs` -> 3 tests passed.
- `pnpm typecheck` -> passed.
- `SPECFORGE_NEXT_STANDALONE=0 pnpm build` -> passed. The default standalone build remains blocked only by Windows OneDrive symlink permissions during Next trace copying; the production Docker/Linux path is unchanged.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync` -> complete for this ADR.
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:check` -> `missing=[]`, `mismatched=[]`, `outOfScope=[]`, `blocked=[]`.
- Unscoped `pnpm design-facts:sync` remains blocked by the unrelated historical `adr-3a-architecture-navigation-workspace` record returning `DATA_MODEL_UPGRADE_REQUIRED`. Retry after that historical data-model migration, then rerun full sync and reconciliation.

## Large-Repository Candidate Persistence (2026-09-21)

The current SpecForge repository was scanned into the exact `com.specforge.designcenter` Scope with report digest `d9a86018f8691d4da1764e4a75e57e85c4b69056a7032a628925e1d66a2c856c`. The scan indexed 1,060 observations across repository sources, OpenAPI, AsyncAPI, database metadata, and documents. The first MockAI candidate-generation attempt returned `MCP synchronization blocked` because the compatibility path placed all 1,060 candidate upserts in one database transaction and the transaction expired. The transaction rolled back; retry trigger: persist candidates in bounded idempotent chunks before assembling the ReviewBundle.

The compatibility path now validates candidates before persistence, writes chunks of at most 100 candidates through separate idempotent transactions, and creates the ReviewBundle only after all chunks succeed. `pnpm typecheck` and `pnpm exec vitest run apps/mcp-server/src/knowledge/candidate-persistence.test.ts` passed (8 tests). Retrying the same report produced 1,060 bilingual candidate assertions with complete coverage, zero blocking issues, and ReviewBundle digest `9979fabf241dba8d1a3964d547b81c0022f7e58746dde06ed5a82eca752068a9`. Candidates remain pending review; no accepted asset, relationship, or Baseline was published. The full production path remains the signed `KnowledgeScanSession` plus `submit_semantic_candidate_batch` protocol.

The first complete ReviewBundle was correctly blocked because `totalFiles` included 2,215 explicitly `OUT_OF_POLICY` paths. Candidate coverage now uses indexed, applicable sources (`1,060/1,060`) while preserving the report's policy coverage and out-of-policy counts. Reassembly changed the bundle to `READY` with risk `T1` and no blocking issues. The user-approved MCP decision `knowledge-promotion-decision:d9a86018f8691d4da1764e4a75e57e85c4b69056a7032a628925e1d66a2c856c:user-confirmed` marked the candidate assertions approved for later delivery; formal asset promotion and Baseline publication remain separate governed steps.

Formal promotion was intentionally not attempted from this compatibility report. `promote_knowledge_candidates` requires a finalized `KnowledgeScanSession` in `READY_FOR_ANALYSIS`, while this run produced only a compatibility `ScanReport`; the local `dist/scanner` directory has no signed release and `SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY` is not configured. Retry trigger: configure the trusted signed portable scanner release, rerun `start_knowledge_scan` through `finalize_knowledge_scan`, resubmit provider-neutral candidate batches, then promote and reconcile through the exact Scope.

## Governed Retry and Local Trust Root (2026-09-21)

The local close-out now includes an idempotent `pnpm scanner:provision-local` command. It generates one Ed25519 development key outside the repository at `~/.specforge/scanner/keys/`, derives a fingerprinted Key ID, writes a local scanner trust store, builds a unique signed Portable Scanner Release, and registers the public Trust Bundle plus manifest in PostgreSQL. The private key, trust store, scanner artifact, and scan spool are excluded from the commit boundary.

`pnpm scan:governed-local` then binds the signed release to an exact `KnowledgeScanSession`, runs the portable scanner, submits hash-chained batches through MCP, and submits provider-neutral bilingual semantic candidates only after finalization. The first governed retry created release `scanner-release:2.1.0-local.2026092101-portable` and session `knowledge-scan:32151ac2-aa21-41a6-841a-4e9b8f20a0db`; it accepted 3,469 observations across 31,522 indexed files but finalized `BLOCKED` with `COVERAGE_PLAN_INCOMPLETE`. The portable observer is intentionally not allowed to claim framework-aware full-asset coverage, so no candidates, accepted assets, relationships, ChangeSet, or Baseline were promoted. The remaining backlog is framework-aware extractor coverage and server-derived technology/coverage planning, followed by independent T1 review.

## Portable Release Increment (2026-09-19)

The default scanner distribution is now a signed Node.js portable script release for Node `>=20 <25`, with `platform=any`, `architecture=any`, and an explicit runtime/entrypoint in the manifest. Native Go releases remain compatible only when the caller explicitly supports the target platform. `start_knowledge_scan` receives bounded runtime capabilities and pins the deterministic compatible release to the session.

The deployment bootstrap can publish the official portable manifest from `SPECFORGE_SCANNER_RELEASE_MANIFEST` and fails closed when a required production release is absent. A readiness denial containing only source-coverage reasons plus `START_FULL_SCAN` may start a governed bootstrap scan after exact-Scope authorization; denied knowledge is never read in that mode. PostgreSQL prevents more than one ACTIVE governance version per kind.

The repository migration for the ACTIVE-governance uniqueness constraint is prepared but not deployed in the current environment. `pnpm exec prisma migrate status` reports 26 pending migrations, and `pnpm exec prisma migrate deploy` returns `P3005` because the existing `specforge_canonical` schema is non-empty without a Prisma migration baseline. This is an environment-owned blocked follow-up, not an MCP synchronization failure; the migration must be baselined and reviewed before deployment.

The verified connection at `localhost:15433` forwards to Docker service `deploy-postgres-1/specforge_canonical`; the separate `specforge-postgres` container is not the application's configured database. A custom-format backup was created at `.specforge/backups/specforge_canonical-20260920.dump` and validated with `pg_restore -l` (608 archive entries). Because historical migrations include data backfills and graph seeding, the backup is a prerequisite for review; it is not evidence that the historical migrations can be marked applied automatically.

## 中文本地化覆盖

### 背景

仅按文件扩展名扫描无法正确发现完整的 SpecForge 资产模型。数据模型、API、事件、状态、集成、质量和可观测性依赖语言与框架语义；领域、规则和特性还需要 Agent 基于证据进行解释。若推断与提升策略归属于各应用服务 Scope，同一份代码会产生不一致的治理结果。

### 决策

1. 扫描、资产推断、T0-T3 风险、提升、提取器目录和语义 Prompt 策略使用系统级不可变版本记录，不属于 Scope。
2. Scope 运行配置仅包含仓库映射、路径、框架提示、敏感路径、预算和更严格审核，不能削弱系统策略或重新定义资产和关系。
3. 先识别技术栈，再按语言、框架和版本选择签名的一方提取器。
4. 为每个适用的 SpecForge 资产族返回显式能力覆盖；必需能力不支持时阻断，不适用资产不阻断。
5. 分离 Evidence、Observation、Candidate 和 Accepted Fact。确定性提取器产生结构观察，Agent 产生有界双语语义候选，MCP 负责身份、风险、审核和提升治理。
6. 可复用 Agent Skill 只负责编排，不直接写正式资产、类型化关系或 Baseline。

### 备选方案

- 拒绝由固定扫描器承担全部语义，因为仅靠语法无法可靠恢复业务含义。
- 拒绝完全依赖 Agent，因为缺少确定性覆盖、稳定身份和可复现证据。
- 拒绝 Scope 自有治理，因为会造成策略漂移和不一致的提升安全性。

### 后果

- 正面：框架提取器可以正确表达 API 和数据模型，同时共享统一系统治理。
- 正面：每个 SpecForge 资产族都有明确的适用性和覆盖结论。
- 正面：Codex、Claude Code 和 OpenCode 使用同一套中立流程。
- 权衡：需要分阶段交付系统策略、提取器目录、确定性提取、Agent 语义、Skill 和生产证明。
- 延期：持续扫描、运行时/CMDB 连接器、外部 APPLY 和跨 Scope 语义合并。

### 约束

- 每个扫描会话仅绑定一个显式授权的应用服务 Scope。
- PostgreSQL 保持权威，投影保持派生。
- MCP 是唯一持久化与提升边界。
- 英文为规范字段，面向人的候选必须提供中文本地化。
- 部分或阻断扫描不得改变正式事实、活动 Baseline 或正式仪表盘统计。

### 证据

- `packages/core/src/types.ts` 定义了十六种顶层资产类型，超出现有六类扫描观察。
- `packages/core/src/scanner/service.ts` 当前主要按路径和扩展名分类，证明需要框架感知提取器。
- 既有生产扫描设计已建立签名静态提取器、四层事实模型、T0-T3 审核和 Agent 中立集成。
- 本次设计评审确认采用系统内置治理、框架提取、逐资产能力覆盖与 Agent 语义候选。

### 实施边界

本次已实现增量包括系统级治理记录、技术栈感知提取器目录、多语言与契约中立的确定性提取、双语语义候选校验、可恢复的受治理扫描会话、覆盖与阻断报告、中立 Agent Skill 打包、签名跨平台 Node 扫描器发布路径、兼容 Release 选择、安全首次扫描门禁和治理版本唯一性保护。持续扫描、运行时或 CMDB 连接器、出站 Proposal、外部 `APPLY`、跨 Scope 语义合并、自动原生加速和历史全量基线对账仍然延期。

### 实施证据

- `pnpm scanner-contract:check` -> 通过。
- `pnpm exec vitest run packages/scan-contract/src/contract.test.ts` -> 8 个测试通过，覆盖跨平台与旧版清单兼容。
- `Push-Location apps/specforge-cli; go test ./internal/scancontract; Pop-Location` -> 通过。
- `pnpm exec vitest run apps/mcp-server/src/scanner/release.test.ts apps/mcp-server/src/scanner/session.test.ts` -> 8 个测试通过，覆盖脚本优先和不兼容拒绝。
- `node --test apps/specforge-cli/portable/scanner.test.mjs` -> 2 个测试通过。
- `node scripts/build-portable-scanner-release.mjs --check` -> Node 24.17.0 下通过。
- `node --test skills/specforge-repository-scan/scripts/readiness-gate.test.mjs skills/specforge-repository-scan/scripts/verify-input.test.mjs` -> 5 个测试通过。
- `pnpm exec vitest run packages/core/src/knowledge-readiness/policy.test.ts apps/mcp-server/src/scanner/governance-bootstrap.test.ts` -> 6 个测试通过。
- `pnpm exec vitest run apps/mcp-server/src/scanner/governance-persistence.integration.test.ts` -> 因未启用 PostgreSQL 集成而跳过 3 个测试；测试已改为随机记录并清理。
- MCP 扫描器聚焦 Vitest 套件（会话、终结、报告、十万观察规模、Agent 契约等价性、双语候选持久化）-> 22 个测试通过。
- `Push-Location apps/specforge-cli; go test ./...; Pop-Location` -> 通过。
- `node --test skills/specforge-repository-scan/scripts/verify-input.test.mjs` -> 3 个测试通过。
- `pnpm typecheck` -> 通过。
- `SPECFORGE_NEXT_STANDALONE=0 pnpm build` -> 通过。默认 standalone 构建仅因 Windows OneDrive 在 Next trace 阶段创建符号链接受限；生产 Docker/Linux 路径未改变。
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync` -> 本 ADR 同步完成。
- `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:check` -> `missing=[]`、`mismatched=[]`、`outOfScope=[]`、`blocked=[]`。
- 不带筛选的 `pnpm design-facts:sync` 仍被无关的历史 `adr-3a-architecture-navigation-workspace` 记录阻断，返回 `DATA_MODEL_UPGRADE_REQUIRED`。完成该历史数据模型迁移后，重新执行全量同步和对账。

## 大仓库候选持久化（2026-09-21）

当前 SpecForge 仓库已在精确 `com.specforge.designcenter` Scope 下完成扫描，报告摘要为 `d9a86018f8691d4da1764e4a75e57e85c4b69056a7032a628925e1d66a2c856c`。本次从仓库源码、OpenAPI、AsyncAPI、数据库元数据和文档中索引了 1,060 条观察。第一次 MockAI 候选生成尝试返回 `MCP synchronization blocked`，原因是兼容路径把 1,060 条候选全部放入单个数据库事务，事务超时；事务已回滚。重试触发条件为：在组装 ReviewBundle 前，使用有界且幂等的小批次持久化候选。

兼容路径现已在持久化前校验候选，按不超过 100 条的批次分别执行幂等事务，全部批次成功后才创建 ReviewBundle。`pnpm typecheck` 和 `pnpm exec vitest run apps/mcp-server/src/knowledge/candidate-persistence.test.ts` 已通过（8 个测试）。使用同一报告重试后生成 1,060 条双语候选断言，覆盖完整、阻断项为 0，ReviewBundle 摘要为 `9979fabf241dba8d1a3964d547b81c0022f7e58746dde06ed5a82eca752068a9`。候选仍待审核；没有发布正式资产、关系或 Baseline。完整生产路径仍是签名 `KnowledgeScanSession` 加 `submit_semantic_candidate_batch` 协议。

第一版完整 ReviewBundle 被正确阻断，原因是 `totalFiles` 把 2,215 个明确标记为 `OUT_OF_POLICY` 的路径也计算在内。现在候选覆盖改用扫描策略实际索引的适用来源（`1,060/1,060`），同时保留扫描报告中的策略覆盖和越界路径统计。重新组装后审核包状态为 `READY`、风险为 `T1`、阻断项为 0。用户已通过 MCP 决策 `knowledge-promotion-decision:d9a86018f8691d4da1764e4a75e57e85c4b69056a7032a628925e1d66a2c856c:user-confirmed` 批准候选进入后续交付；正式资产提升和 Baseline 发布仍是独立的受治理步骤。

本次没有直接从兼容性报告执行正式提升。`promote_knowledge_candidates` 要求已完成且状态为 `READY_FOR_ANALYSIS` 的 `KnowledgeScanSession`，而本次只有兼容性 `ScanReport`；本地 `dist/scanner` 没有签名发行物，`SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY` 也未配置。重试条件为：配置受信任的签名跨平台扫描器发行物，重新通过 `start_knowledge_scan` 到 `finalize_knowledge_scan` 完成受治理扫描，再提交中立候选批次，最后在精确 Scope 下执行提升和对账。

## 受治理重试与本地信任根（2026-09-21）

本次收尾新增幂等命令 `pnpm scanner:provision-local`：在仓库外的 `~/.specforge/scanner/keys/` 生成一把 Ed25519 开发密钥，根据公钥指纹生成 Key ID，写入本地扫描器信任库，构建唯一的签名 Portable Scanner Release，并将公钥 Trust Bundle 和清单注册到 PostgreSQL。私钥、信任库、扫描器制品和扫描 Spool 均不进入提交边界。

随后 `pnpm scan:governed-local` 将签名发行物绑定到精确 `KnowledgeScanSession`，运行便携扫描器，通过 MCP 提交哈希链批次，并且仅在最终化后提交中立的双语语义候选。第一次受治理重试创建了发行物 `scanner-release:2.1.0-local.2026092101-portable` 和会话 `knowledge-scan:32151ac2-aa21-41a6-841a-4e9b8f20a0db`，接收 3,469 条观察、覆盖 31,522 个索引文件，但以 `COVERAGE_PLAN_INCOMPLETE` 阻塞。便携观察器不能冒充框架感知的完整资产覆盖，因此没有提升候选、正式资产、关系、ChangeSet 或 Baseline。剩余待办是框架感知提取器覆盖、服务端生成的技术栈与覆盖计划，以及后续 T1 独立评审。

## 跨平台 Release 增量（2026-09-19）

默认扫描器发行物改为 Node `>=20 <25` 的签名跨平台脚本，清单明确记录 `platform=any`、`architecture=any`、运行时和入口文件。原生 Go Release 仍可使用，但只有调用方明确声明目标平台能力时才参与选择。`start_knowledge_scan` 接收有界运行能力，并将确定选择的 Release 固定到扫描会话。

部署引导可从 `SPECFORGE_SCANNER_RELEASE_MANIFEST` 发布官方 portable 清单；生产环境缺少必需 Release 时快速失败。就绪评估只有在原因全部属于来源覆盖问题、同时包含 `START_FULL_SCAN` 且精确 Scope 已授权时，才允许开始受治理的首次扫描；该模式绝不读取被拒绝的知识正文。PostgreSQL 防止同一治理 kind 存在多个 ACTIVE 版本。

用于保证 ACTIVE 治理版本唯一性的仓库迁移已经准备好，但尚未在当前环境部署。`pnpm exec prisma migrate status` 报告 26 个待执行迁移，`pnpm exec prisma migrate deploy` 因现有 `specforge_canonical` Schema 非空且没有 Prisma 迁移基线而返回 `P3005`。这是由部署环境负责的阻断待办，不是 MCP 同步失败；部署前必须完成基线核对和审核。

已核实 `localhost:15433` 转发到 Docker 服务 `deploy-postgres-1/specforge_canonical`；旁边的 `specforge-postgres` 容器不是应用配置使用的数据库。已创建 `.specforge/backups/specforge_canonical-20260920.dump` 格式备份，并用 `pg_restore -l` 校验到 608 个归档目录项。由于历史迁移包含数据回填和图关系种子数据，备份只是审核前提，不能证明可以自动将历史迁移标记为已应用。
