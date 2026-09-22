# ADR-0049: System-Owned Full-Asset Repository Discovery

## Status

Implemented for the governed repository-scan increment; production connector delivery remains deferred.

- Stable ADR ID: `adr-system-owned-full-asset-repository-discovery`.
- Proposal: `proposal-system-owned-full-asset-repository-discovery`.
- Context Pack: `context-pack-system-owned-full-asset-repository-discovery`.
- Scope: `com.specforge.designcenter`.
- Design session: `design-change-session:197ab290-ff5b-40d0-950f-55b213a58c9b`.
- Native scanner increment session: `design-change-session:2e8bf691-87dc-4c77-8c0b-5fdee242e9b9`.
- Bounded semantic-read increment session: `design-change-session:d3959824-0a3c-4b49-949a-055791c1b783`.
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

The implemented increment includes system-owned governance records, technology-aware extractor catalogs, deterministic multi-language and contract-neutral extraction, bounded bilingual semantic-candidate validation, resumable governed sessions, signed exact-Scope scan-report cursors, summary-first observation pages, opt-in redacted payload pages, coverage and blocker reports, provider-neutral Skill packaging, signed native Go acceleration with a portable Node fallback, compatible release selection, safe first-scan bootstrap readiness, and governance-version uniqueness protection. Continuous scanning, runtime or CMDB connectors, outbound proposals, external `APPLY`, cross-Scope semantic merging, authorized semantic identity resolution, and formal Baseline promotion remain deferred.

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

`pnpm scan:governed-local` then binds the signed release to an exact `KnowledgeScanSession`, runs the portable scanner, submits hash-chained batches through MCP, and submits provider-neutral bilingual semantic candidates only after finalization. The first governed retry created release `scanner-release:2.1.0-local.2026092101-portable` and session `knowledge-scan:32151ac2-aa21-41a6-841a-4e9b8f20a0db`; it accepted 3,469 observations across 31,522 indexed files but finalized `BLOCKED` with `COVERAGE_PLAN_INCOMPLETE`.

The second governed retry used server-derived coverage from persisted observations. Session `knowledge-scan:1ba4e7db-54f2-4e56-8746-8c0535c62c3c` accepted the same 3,469 observations in 7 hash-chained batches and finalized `READY_FOR_ANALYSIS`. The server ignored the portable client’s self-declared coverage states, verified the exact asset-family set, and derived `SEMANTIC_REVIEW_REQUIRED` for the 16 configured families; this means deterministic source coverage is complete for analysis, not that semantic facts are accepted. The resulting ReviewBundle `knowledge-review:knowledge-scan:1ba4e7db-54f2-4e56-8746-8c0535c62c3c` remains `BLOCKED` at T1 because MockAI candidates have unresolved questions and unresolved identity decisions. No accepted asset, typed relationship, ChangeSet, or Baseline was promoted. Retry trigger: run framework-aware extractors and an authorized semantic Agent/reviewer that resolves identity and questions, then promote and reconcile through the exact Scope.

## Portable Release Increment (2026-09-19)

The default scanner distribution is now a signed Node.js portable script release for Node `>=20 <25`, with `platform=any`, `architecture=any`, and an explicit runtime/entrypoint in the manifest. Native Go releases remain compatible only when the caller explicitly supports the target platform. `start_knowledge_scan` receives bounded runtime capabilities and pins the deterministic compatible release to the session.

The deployment bootstrap can publish the official portable manifest from `SPECFORGE_SCANNER_RELEASE_MANIFEST` and fails closed when a required production release is absent. A readiness denial containing only source-coverage reasons plus `START_FULL_SCAN` may start a governed bootstrap scan after exact-Scope authorization; denied knowledge is never read in that mode. PostgreSQL prevents more than one ACTIVE governance version per kind.

The repository migration for the ACTIVE-governance uniqueness constraint is prepared but not deployed in the current environment. `pnpm exec prisma migrate status` reports 26 pending migrations, and `pnpm exec prisma migrate deploy` returns `P3005` because the existing `specforge_canonical` schema is non-empty without a Prisma migration baseline. This is an environment-owned blocked follow-up, not an MCP synchronization failure; the migration must be baselined and reviewed before deployment.

The verified connection at `localhost:15433` forwards to Docker service `deploy-postgres-1/specforge_canonical`; the separate `specforge-postgres` container is not the application's configured database. A custom-format backup was created at `.specforge/backups/specforge_canonical-20260920.dump` and validated with `pg_restore -l` (608 archive entries). Because historical migrations include data backfills and graph seeding, the backup is a prerequisite for review; it is not evidence that the historical migrations can be marked applied automatically.

## Framework-Aware Native Release Increment (2026-09-21)

The local release provisioner now publishes two independently versioned artifacts under one Ed25519 trust root: a Windows/amd64 native Go scanner and a portable Node fallback. The governed runner reads the active-release pointer, computes the repository snapshot with the selected native binary before opening the MCP session, verifies the server-returned signed manifest locally, and submits the native content-addressed Spool format. Repository policy exclusions are applied identically during snapshot, extraction, and dirty-snapshot verification, including nested dependency, build-cache, worktree, generated-output, and test-fixture directories.

The server preserves a native coverage plan only when every capability belongs to the exact governed asset-family set, every claimed extractor belongs to the signed release catalog, capability semantics are valid, and the Go-compatible plan digest matches. Portable releases remain server-derived and `SEMANTIC_REVIEW_REQUIRED`. Advisory parser-depth, unsupported-file, binary, and credential-file findings remain evidence; unreadable or oversized required source remains blocking.

Release `scanner-release:2.1.20260921095754-windows-amd64` completed governed session `knowledge-scan:4d3513f9-6dd8-4a57-a6f8-150dba321751` in the exact Scope. It accepted 6,078 observations in 13 hash-chained batches and finalized `READY_FOR_ANALYSIS` with snapshot digest `36aeddea57688d8b7b68f9cc0d8e99fe130746245bc7d58d0670a33d5f55e672`. The runner deliberately stopped before semantic-candidate generation. An authorized Agent must consume the bounded observations, resolve bilingual semantics and stable identity, submit candidates through MCP, obtain the required review, and only then promote and reconcile. No accepted asset, typed relationship, ChangeSet, or Baseline was created by this increment.

## Bounded Semantic Observation Read Increment (2026-09-21)

`get_knowledge_scan_report` now exposes deterministic cursor pagination over finalized scan observations. The HMAC-signed cursor is bound to the exact Scope, actor, scan session, and payload mode; malformed, tampered, cross-session, cross-Scope, or cross-mode reuse fails with `SCAN_REPORT_CURSOR_INVALID`. Non-finalized sessions fail with `SCAN_REPORT_NOT_FINALIZED`.

Reports are summary-first with a maximum page size of 500. An Agent must explicitly request `includePayload=true`, which lowers the maximum page size to 50 and returns only the approved already-redacted observation fields. Internal persistence metadata is not exposed. The report uses the same advisory-versus-blocking coverage-gap classification as scan finalization.

Focused tests passed with 81 checks across scanner report, MCP routing, and federation regression coverage. MCP-server typecheck passed. A live read against session `knowledge-scan:4d3513f9-6dd8-4a57-a6f8-150dba321751` returned two consecutive, non-overlapping payload pages from the 6,078 observations, preserved `READY_FOR_ANALYSIS`, and reported zero blocking issues. This completes the bounded read prerequisite only; candidate submission, independent T1 review, promotion, reconciliation, and Baseline publication remain pending.

## Full-Asset Semantic Governance Increment (2026-09-21)

Production semantic batches now require one of the sixteen full asset families, an exact family-to-fact mapping, an immutable evidence-cluster digest, the scan session's prompt-pack and effective-policy digests, typed evidence, canonical English content, a complete Chinese overlay, and a stable identity decision. Evidence clusters contain at most 500 exact-session observations; candidate batches contain at most 100 candidates and remain capped at 1 MiB. Public contracts, business rules, state machines, integrations, and typed relationships require at least two evidence types.

Risk is server-owned: ambiguous identity and security, authorization, privacy, or compliance meaning are T3; public contracts, rules, state, integrations, typed relationships, and breaking change are T2; ordinary semantic facts are T1; T0 is available only to explicitly server-authorized deterministic quality, observability, or evidence facts. The additive `assemble_knowledge_review_bundles` tool partitions review by risk tier and domain cluster; the singular tool remains for compatibility. Promotion mapping now covers all fifteen asset families plus typed relationships.

Core and MCP typechecks passed. Twenty-eight core semantic/risk checks and sixty candidate persistence, review partition, promotion mapping, risk-policy, and MCP routing checks passed. A live dry run against the 6,078-observation session validated one real policy-pinned evidence cluster and rejected the legacy unclustered batch shape. It did not persist candidates. Design session `design-change-session:15373558-985e-4d62-8a1e-e92f5e791ff6` closed as `BLOCKED` because the current promotion API accepts one review decision at a time while a complete scan is partitioned by risk and domain. Retry after all approved partitions can be aggregated into one atomic ChangeSet; publishing one partial Baseline per partition is forbidden.

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

本次已实现增量包括系统级治理记录、技术栈感知提取器目录、多语言与契约中立的确定性提取、双语语义候选校验、可恢复的受治理扫描会话、签名精确 Scope 扫描报告游标、摘要优先观察分页、显式脱敏载荷分页、覆盖与阻断报告、中立 Agent Skill 打包、签名 Go 原生加速与 Node 便携回退、兼容 Release 选择、安全首次扫描门禁和治理版本唯一性保护。持续扫描、运行时或 CMDB 连接器、出站 Proposal、外部 `APPLY`、跨 Scope 语义合并、授权语义身份解析和正式 Baseline 提升仍然延期。

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

本次收尾新增幂等命令 `pnpm scanner:provision-local`：在仓库外的 `~/.specforge/scanner/keys/` 生成一把 Ed25519 开发密钥，根据公钥指纹生成 Key ID，写入本地扫描器信任库，并分别构建和注册独立版本的签名 Go 原生 Release 与 Node 便携回退 Release。私钥、信任库、扫描器制品和扫描 Spool 均不进入提交边界。

随后 `pnpm scan:governed-local` 从本地活动发行指针优先选择原生扫描器，在开启 MCP 会话前用同一二进制计算仓库快照，本地校验服务端返回的签名清单，并提交内容寻址的哈希链批次。快照、提取和脏快照复核统一执行 Scope 仓库忽略策略，排除嵌套依赖、构建缓存、隔离工作区、生成物和测试夹具。

服务端只在资产族集合精确一致、能力语义合法、声明的提取器全部属于签名发行目录且 Go 兼容摘要一致时保留原生覆盖计划；便携发行仍由服务端推导为 `SEMANTIC_REVIEW_REQUIRED`。普通解析深度提示、不支持文件类型、二进制文件和凭据文件保持为证据，不再被误判为致命缺口；不可读或超限的必需源码仍会阻断。

原生发行物 `scanner-release:2.1.20260921095754-windows-amd64` 在精确 Scope 下完成会话 `knowledge-scan:4d3513f9-6dd8-4a57-a6f8-150dba321751`，接收 6,078 条观察、13 个哈希链批次，并最终化为 `READY_FOR_ANALYSIS`。编排器有意停在 Agent 分析边界，不再默认生成 MockAI 候选。下一步由获授权 Agent 消费有界观察，完成英文规范字段与中文本地化、稳定身份判定和未决问题处理，再通过 MCP 提交候选并完成 T1 审核、提升与对账。本增量没有创建正式资产、类型化关系、ChangeSet 或 Baseline。

## 有界语义观察读取增量（2026-09-21）

`get_knowledge_scan_report` 现可对已最终化扫描观察进行确定性游标分页。HMAC 签名游标绑定精确 Scope、Actor、扫描会话和载荷模式；格式错误、篡改、跨会话、跨 Scope 或跨模式复用统一返回 `SCAN_REPORT_CURSOR_INVALID`。未最终化会话返回 `SCAN_REPORT_NOT_FINALIZED`。

报告默认只返回摘要，单页最多 500 条。Agent 必须显式请求 `includePayload=true` 才能读取载荷，此时单页上限降为 50，且仅返回白名单内、已脱敏的观察字段，不暴露内部持久化元数据。报告与扫描最终化复用同一套“告警缺口/阻断缺口”分类。

聚焦验证共通过 81 项扫描报告、MCP 路由与联邦回归测试，MCP Server 类型检查通过。对会话 `knowledge-scan:4d3513f9-6dd8-4a57-a6f8-150dba321751` 的真实数据库读取成功返回两个连续且不重叠的载荷页，总量保持 6,078、状态保持 `READY_FOR_ANALYSIS`、阻断项为 0。本增量仅完成语义分析的有界读取前提；候选提交、独立 T1 审核、提升、对账与 Baseline 发布仍待完成。

## 全资产语义治理增量（2026-09-21）

生产语义批次现在必须声明十六类完整资产族之一、精确的资产族到事实类型映射、不可变证据簇摘要、扫描会话固定的 Prompt Pack 与有效策略摘要、类型化证据、英文规范内容、完整中文覆盖和稳定身份结论。每个证据簇最多 500 条精确会话观察，每个候选批次最多 100 条且保持 1 MiB 上限。公共契约、业务规则、状态机、集成与类型化关系至少需要两种证据类型。

风险由服务端判定：身份歧义以及安全、授权、隐私或合规语义为 T3；公共契约、规则、状态、集成、类型化关系与破坏性变更为 T2；普通语义事实为 T1；只有服务端显式授权的确定性质量、可观测性或证据事实才能进入 T0。新增 `assemble_knowledge_review_bundles` 按风险等级和领域簇拆分审核包，单数工具保留为兼容接口。提升映射现覆盖十五类设计资产及类型化关系。

Core 与 MCP 类型检查通过；核心语义/风险通过 28 项检查，候选持久化、审核拆包、提升映射、风险策略和 MCP 路由通过 60 项检查。针对 6,078 条观察会话的真实只读演练验证了一组策略固定的证据簇，并拒绝旧式无簇批次，未持久化任何候选。设计会话 `design-change-session:15373558-985e-4d62-8a1e-e92f5e791ff6` 已关闭为 `BLOCKED`：当前提升 API 每次只接受一个审核决策，而完整扫描需要按风险和领域拆分。必须先将所有已批准分区原子汇总为一个 ChangeSet 再重试；禁止按分区发布部分 Baseline。

## 跨平台 Release 增量（2026-09-19）

默认扫描器发行物改为 Node `>=20 <25` 的签名跨平台脚本，清单明确记录 `platform=any`、`architecture=any`、运行时和入口文件。原生 Go Release 仍可使用，但只有调用方明确声明目标平台能力时才参与选择。`start_knowledge_scan` 接收有界运行能力，并将确定选择的 Release 固定到扫描会话。

部署引导可从 `SPECFORGE_SCANNER_RELEASE_MANIFEST` 发布官方 portable 清单；生产环境缺少必需 Release 时快速失败。就绪评估只有在原因全部属于来源覆盖问题、同时包含 `START_FULL_SCAN` 且精确 Scope 已授权时，才允许开始受治理的首次扫描；该模式绝不读取被拒绝的知识正文。PostgreSQL 防止同一治理 kind 存在多个 ACTIVE 版本。

用于保证 ACTIVE 治理版本唯一性的仓库迁移已经准备好，但尚未在当前环境部署。`pnpm exec prisma migrate status` 报告 26 个待执行迁移，`pnpm exec prisma migrate deploy` 因现有 `specforge_canonical` Schema 非空且没有 Prisma 迁移基线而返回 `P3005`。这是由部署环境负责的阻断待办，不是 MCP 同步失败；部署前必须完成基线核对和审核。

已核实 `localhost:15433` 转发到 Docker 服务 `deploy-postgres-1/specforge_canonical`；旁边的 `specforge-postgres` 容器不是应用配置使用的数据库。已创建 `.specforge/backups/specforge_canonical-20260920.dump` 格式备份，并用 `pg_restore -l` 校验到 608 个归档目录项。由于历史迁移包含数据回填和图关系种子数据，备份只是审核前提，不能证明可以自动将历史迁移标记为已应用。

## Atomic Review-Set Promotion Increment (2026-09-22)

The risk/domain review partition is now closed by a server-owned aggregate boundary. `promote_knowledge_review_set` requires the exact Scope, finalized scan and DesignChangeSession, Working Stream, complete expected ReviewBundle set, one approved PromotionDecision per bundle, and caller evidence references. The server derives the approved assertion and identity sets, verifies source-observation coverage, bilingual/evidence closure, actor policy, and policy/session binding, then writes all assets, typed relationships, Evidence, relationship outboxes, one ChangeSet, one aggregate receipt, and one federation outbox event in a single serializable PostgreSQL transaction. Missing partitions, partial approval, duplicate targets, incomplete source coverage, changed retries, and cross-Scope/session inputs fail closed before canonical writes.

Aggregate receipts carry `reviewSetId`, sorted ReviewBundle and decision IDs, source-observation IDs, coverage, and the aggregate digest. Same-input retries return the original receipt. Reconciliation treats an aggregate receipt as having no singular PromotionDecision and verifies the single ChangeSet and complete revision sets; publication still requires the converged reconciliation receipt and cannot publish a partition subset. PostgreSQL remains authoritative and graph stores remain derived projections.

The additive migration `20260922000000_add_aggregate_review_set_promotion` was applied with `pnpm exec prisma migrate deploy` to `localhost:15433/specforge_canonical`; `pnpm exec prisma migrate status` reports `Database schema is up to date!`. Automatic `migrate dev --create-only` was not used because the historical brownfield shadow database cannot replay an old data-migration; the checked-in migration contains only nullable receipt metadata and JSON defaults.

Focused evidence passed: Core and MCP typechecks, MCP routing tests (33), and the PostgreSQL promotion integration suite (5 tests), including aggregate two-partition promotion, one-ChangeSet assertion, idempotent retry, aggregate reconciliation, Baseline publication, rollback, and missing-partition rejection. The exact implementation session is `design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de` under `com.specforge.designcenter`. The 6,078-observation production scan remains `READY_FOR_ANALYSIS`; no semantic candidates or production assets were promoted by this increment.

### 原子审核集合提升增量（2026-09-22）

风险/领域审核拆分现在通过服务端聚合边界闭环。`promote_knowledge_review_set` 要求精确 Scope、已最终化的扫描会话和 DesignChangeSession、Working Stream、完整的预期 ReviewBundle 集合、每个 Bundle 恰好一个已批准 PromotionDecision，以及调用方证据引用。服务端推导已批准的断言和身份候选，校验来源观察覆盖、双语/证据闭包、角色策略以及策略/会话绑定，然后在一个可串行化 PostgreSQL 事务中写入全部资产、有类型关系、Evidence、关系 Outbox、一个 ChangeSet、一个聚合回执和一个联邦 Outbox 事件。缺少分区、部分审批、重复目标、来源覆盖不完整、重试输入变化以及跨 Scope/会话输入都会在规范写入前失败关闭。

聚合回执携带 `reviewSetId`、排序后的 ReviewBundle 与决策 ID、来源观察 ID、覆盖率和聚合摘要。相同输入重试返回原回执；聚合回执没有单一 PromotionDecision，对账会校验一个 ChangeSet 和完整修订集合；发布仍必须携带已收敛的对账回执，不能发布分区子集。PostgreSQL 继续作为权威存储，图数据库仍是派生投影。

增量迁移 `20260922000000_add_aggregate_review_set_promotion` 已通过 `pnpm exec prisma migrate deploy` 应用到 `localhost:15433/specforge_canonical`；`pnpm exec prisma migrate status` 报告 `Database schema is up to date!`。由于历史存量影子数据库无法重放旧数据迁移，自动 `migrate dev --create-only` 被棕地基线限制；提交的迁移仅包含可空回执字段和 JSON 默认值。

聚焦证据通过：Core 与 MCP 类型检查、MCP 路由测试（33 项）以及 PostgreSQL 提升集成套件（5 项），覆盖双分区聚合提升、单 ChangeSet、幂等重试、聚合对账、Baseline 发布、回滚和缺失分区拒绝。精确实现会话为 `design-change-session:35824fd1-d0df-4849-a3b1-db0c1ba340de`，归属 `com.specforge.designcenter`。6,078 条观察的生产扫描仍为 `READY_FOR_ANALYSIS`；本增量没有提升语义候选或生产资产。

## MockAI Semantic Candidate Authoring Run (2026-09-22)

The exact-Scope authoring session `design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5` consumed the governed local scan through the MCP boundary with `SPECFORGE_SEMANTIC_PROVIDER=mock`. The run created session `knowledge-scan:0afad255-b0ff-4a5c-b26e-9599fc5806dc`, accepted 6,133 observations in 13 hash-chained batches, persisted 6,133 bilingual semantic candidates, and assembled a complete review set. The review set is `BLOCKED` at T3 because MockAI candidates intentionally remain `UNMATCHED` and retain unresolved questions; no candidate was approved, promoted, reconciled, or published as an authored asset or Baseline.

The MCP boundary was aligned to require the full-asset candidate contract at submission time: asset family, policy and prompt-pack digests, evidence cluster identity/types, English canonical content, and a `localizedContent.zh` overlay. The runner supplies deterministic fallback bilingual content only to satisfy the candidate contract; it does not infer or approve business meaning. The exact retry trigger is independent Agent/reviewer resolution of stable identity and unresolved questions, followed by one approved PromotionDecision per ReviewBundle and `promote_knowledge_review_set` for atomic aggregate promotion.

Evidence: `pnpm scan:governed-local` with the session above returned `GOVERNED_SCAN_READY_FOR_REVIEW`; the result reported `candidateCount=6133`, `batchCount=13`, `observationCount=6133`, review coverage complete, and `status=BLOCKED`. `pnpm --filter @specforge/mcp-server typecheck` passed, and `pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts src/knowledge/candidate-persistence.test.ts` passed 41 tests. `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'; pnpm design-facts:sync` returned `status=complete`; the matching `design-facts:check` returned empty `missing`, `mismatched`, `outOfScope`, and `blocked` arrays. `pnpm design-context:close -- --session design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5 --status CONVERGED --evidence "candidateCount=6133;reviewStatus=BLOCKED;typecheck=exit0;tests=41 passed;design-facts:check=empty"` returned `status=CONVERGED`. The review/publication backlog remains open.

## MockAI 语义候选编写运行（2026-09-22）

精确 Scope 的编写会话 `design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5` 通过 MCP 边界、使用 `SPECFORGE_SEMANTIC_PROVIDER=mock` 消费受治理本地扫描。该运行创建会话 `knowledge-scan:0afad255-b0ff-4a5c-b26e-9599fc5806dc`，在 13 个哈希链批次中接收 6,133 条观察，持久化 6,133 条双语语义候选，并组装出完整审核集合。审核集合在 T3 阶段保持 `BLOCKED`，因为 MockAI 候选按设计保留 `UNMATCHED` 身份结论和未决问题；没有候选被批准、提升、对账，也没有写入正式资产或 Baseline。

MCP 边界现在要求提交时携带完整的全资产候选契约：资产族、策略与 Prompt Pack 摘要、证据簇身份/类型、英文规范内容以及 `localizedContent.zh` 覆盖。运行器提供确定性的双语回退内容只是为了满足候选契约，并不推断或批准业务语义。准确重试触发条件是由独立 Agent/审核人解决稳定身份和未决问题，再为每个 ReviewBundle 形成一个已批准 PromotionDecision，最后调用 `promote_knowledge_review_set` 完成原子聚合提升。

证据：使用上述会话执行 `pnpm scan:governed-local` 返回 `GOVERNED_SCAN_READY_FOR_REVIEW`；结果为 `candidateCount=6133`、`batchCount=13`、`observationCount=6133`，审核覆盖完整且状态为 `BLOCKED`。`pnpm --filter @specforge/mcp-server typecheck` 通过，`pnpm --dir apps/mcp-server exec vitest run src/tools.test.ts src/knowledge/candidate-persistence.test.ts` 通过 41 项。设置 `$env:SPECFORGE_DESIGN_FACT_IDS='adr-system-owned-full-asset-repository-discovery'` 执行 `pnpm design-facts:sync` 返回 `status=complete`；对应 `design-facts:check` 的 `missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空。执行 `pnpm design-context:close -- --session design-change-session:9cf76392-d734-4d82-91de-1fdea1d289c5 --status CONVERGED --evidence "candidateCount=6133;reviewStatus=BLOCKED;typecheck=exit0;tests=41 passed;design-facts:check=empty"` 返回 `status=CONVERGED`。审核/发布待办仍保持开放。
