# ADR-0048: Governed Scan Coverage Policy

## Status

Accepted and locally verified.

- Stable ADR ID: `adr-governed-scan-coverage-policy`.
- Proposal: `proposal-governed-scan-coverage-policy`.
- Context Pack: `context-pack-governed-scan-coverage-policy`.
- Scope: `com.specforge.designcenter`.
- Design session: `design-change-session:177557af-f7fc-4a37-9d60-84aeb120a293`.

## Context

A repository scan previously treated every unindexed file as unsupported, so generated material, editor artifacts, and files outside the scanner contract made an otherwise valid candidate-only scan appear incomplete. The scanner also needs to keep deployment declarations visible without claiming business semantics or replacing authored assets.

## Decision

Adopt a versioned governed coverage policy. Every discovered file is classified as `SUPPORTED`, `EXCLUDED`, `OUT_OF_POLICY`, or `REQUIRED_UNSUPPORTED`. Only `REQUIRED_UNSUPPORTED` blocks scan completeness. The deterministic local scanner indexes recognized source, contract, data, documentation, workflow, Docker, deployment-script, and graph-bootstrap declarations as structural candidate observations. PostgreSQL persists policy metadata, bounded representative entries, and the report digest through the MCP boundary; observation source versions use each normalized observation digest so repeated reports do not collide. Scans remain candidate-only and never overwrite authored design facts or a published baseline.

## Alternatives

- Treat every unrecognized file as a blocking coverage gap. Rejected because repository noise makes the signal unusable.
- Ignore all unrecognized files without recording them. Rejected because policy coverage and future extractor demand would be invisible.
- Promote scanner output directly to authored assets. Rejected because structural evidence is not approved architecture or business meaning.

## Consequences

- Positive: scanner completeness now measures compliance with a declared contract rather than raw repository file count.
- Positive: deployment topology has deterministic structural evidence while remaining candidate-only.
- Tradeoff: policy and extractor changes alter report digests and need explicit governance.
- Deferred: language-specific semantic parsing, connector scheduling, review-bundle promotion, and external APPLY remain separate increments.

## Constraints

- Every report, connector, session, observation, and candidate is owned by one exact application-service Scope.
- PostgreSQL remains authoritative; graph/search projections remain derived.
- MCP is the only persistence boundary for scan reports and design facts.
- English is canonical and human-facing Chinese localization is mandatory.

## Evidence

- `pnpm exec vitest run packages/core/src/__tests__/scanner.test.ts` passed 4 tests.
- `pnpm --filter @specforge/core typecheck` passed.
- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `pnpm exec tsx scripts/rescan-workspace-through-mcp.ts` persisted scan report `scan-report:a1e134f0dfe19cf990d52efc6b4251346fd66b3abb609b7b8e1f064c797e99de` with 1009 candidate observations, zero required unsupported files, and status `RECEIVED` in the exact target Scope.

## 中文本地化覆盖

### 背景

此前仓库扫描会把每个未索引文件都视为不支持，导致生成物、编辑器产物和策略范围外文件让本应有效的仅候选扫描被误判为不完整。扫描器还需要保留部署声明的结构性证据，但不得宣称业务语义或覆盖已编写资产。

### 决策

采用版本化的受治理覆盖策略。每个发现的文件被分类为 `SUPPORTED`、`EXCLUDED`、`OUT_OF_POLICY` 或 `REQUIRED_UNSUPPORTED`；只有 `REQUIRED_UNSUPPORTED` 会阻断扫描完整性。确定性本地扫描器对已识别的源码、契约、数据、文档、工作流、Docker、部署脚本和图初始化声明生成结构化候选观察。PostgreSQL 通过 MCP 边界持久化策略元数据、有界代表性条目和报告摘要；观察的源版本使用各自规范化摘要，避免重复报告冲突。扫描始终只生成候选，不覆盖已编写设计事实或已发布基线。

### 备选方案

- 将所有未识别文件视为阻断覆盖缺口：拒绝，因为仓库噪声会使信号不可用。
- 忽略所有未识别文件且不记录：拒绝，因为策略覆盖与后续提取器需求将不可见。
- 将扫描输出直接提升为已编写资产：拒绝，因为结构性证据不是已批准的架构或业务语义。

### 后果

- 正面：扫描完整性现在衡量的是对声明契约的遵循，而不是原始文件数量。
- 正面：部署拓扑获得确定性结构证据，同时保持仅候选状态。
- 权衡：策略和提取器变更会改变报告摘要，必须显式治理。
- 延期：特定语言语义解析、连接器调度、审查包提升和外部 APPLY 仍是独立增量。

### 约束

- 每个报告、连接器、会话、观察和候选都归属于一个精确应用服务 Scope。
- PostgreSQL 保持权威；图和搜索投影保持派生。
- MCP 是扫描报告与设计事实唯一持久化边界。
- 英文是规范字段，面向人的中文本地化必须完整。

### 证据

- `pnpm exec vitest run packages/core/src/__tests__/scanner.test.ts` 通过 4 个测试。
- `pnpm --filter @specforge/core typecheck` 通过。
- `pnpm --filter @specforge/mcp-server typecheck` 通过。
- `pnpm exec tsx scripts/rescan-workspace-through-mcp.ts` 在精确目标 Scope 持久化了 `scan-report:a1e134f0dfe19cf990d52efc6b4251346fd66b3abb609b7b8e1f064c797e99de`，包含 1009 条候选观察、零必需未支持文件，状态为 `RECEIVED`。
