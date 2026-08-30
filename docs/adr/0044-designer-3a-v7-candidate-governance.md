# ADR-0044: Designer 3A v7 Candidate Governance

## Status

Accepted and implemented for the exact Designer Scope. Candidate analysis is MCP-only, PostgreSQL-backed, snapshot-bound, and separate from authoritative Baseline publication.

- Stable ADR ID: `adr-designer-3a-v7-candidate-governance`
- Owning application service: `com.huawei.celon.desiner`
- Owning Scope: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Implementation Design Change Session: `design-change-session:60dde2b9-1aa8-4b02-9d3e-40ce4974b4cc`

## Context

Designer v6 has a narrow but trusted 3A Baseline. Architecture expansion must help agents and architects evaluate change impact without turning names, graph proximity, or scanner output into authoritative architecture. Candidate results also need to become stale when their source catalog, relationship graph, or Baseline waterline changes.

The known asset-to-3A mismatch between canonical IDs such as `data-specforge-assets` and legacy semantic identities such as `dataModel:specforge-assets` causes false `BLOCKED` mappings. This is an identity adapter defect and must not be “fixed” by fabricating architecture units.

## Decision

1. Add an exact-Scope `analyze_3a_architecture_candidates` MCP operation. An authorized Agent supplies an evidence-bound candidate batch; the service captures the current published Baseline, projection, catalog digest, relationship version, and design-context digest before persisting it.
2. Persist candidate metadata on `ArchitectureFactBatch` in PostgreSQL. Candidate status, snapshot waterlines, counts, exclusions, blocking issues, and revision IDs are durable and idempotent. Candidate revisions remain `CANDIDATE` until ReviewBundle approval, promotion, reconciliation, and immutable Baseline publication.
3. Add `get_3a_architecture_candidate_set` as a bounded exact-Scope read. It returns the candidate revisions and recomputes stale status when the source waterline changes. `READY` candidates become `STALE`; stale candidates cannot be published.
4. Enforce candidate closure: every SYS unit needs a BIZ-to-SYS mapping, every TECH unit needs a SYS-to-TECH mapping, and a primary asset selector cannot resolve to multiple units. Layer ceilings remain BIZ 6, SYS 12, and TECH 5.
5. Keep publication on the existing ReviewBundle, promotion, reconciliation, and Baseline path. The v7 CLI orchestrators call MCP tools only and never write authored facts directly through Prisma.
6. Normalize legacy semantic identity aliases deterministically at asset-to-3A materialization time. Exact `(assetType, assetId)` remains canonical; aliases are read compatibility only and do not change Scope or authored IDs.

## Alternatives

1. Automatically publish 3A units when assets are written: rejected because ordinary asset authoring must not silently change architecture authority.
2. Use graph clustering as the architecture authority: rejected because relationship density is evidence of relatedness, not architectural intent.
3. Require a fixed 6/12/5 structure: rejected because unsupported units would be fabricated to satisfy a quota.
4. Repair mismatches by renaming historical assets or revisions: rejected because immutable history and external references must remain stable.

## Consequences

- Agents can request a reproducible candidate set and receive the exact facts needed for review and context assembly.
- Candidate analysis has explicit freshness and fail-closed behavior, but requires a published source Baseline and projection.
- PostgreSQL remains the authority; graph and 3A views remain derived and rebuildable.
- The v7 rollout can preserve v6 as the last known-good Baseline when candidate evidence, review, or projection publication fails.
- Identity compatibility removes false mapping blocks while preserving distinct diagnostics for missing or ambiguous assets.

## Constraints

- Every operation uses exact application-service Scope; multi-Scope authorization does not permit cross-Scope writes.
- English is canonical and every human-facing unit, review, Proposal, ADR, Context Pack, and managed asset has a Chinese overlay.
- Candidate analysis accepts Agent-produced facts but deterministic validation owns Scope, evidence presence, limits, membership uniqueness, and cross-layer closure.
- Direct database writes, implicit approval, partial publication, and graph-authority writes are forbidden.
- Continuous legacy scanning, connector delivery, cross-Scope aggregate views, and external `APPLY` remain deferred federation increments.

## Evidence

- `pnpm --filter @specforge/core typecheck`: passed.
- `pnpm --filter @specforge/mcp-server typecheck`: passed.
- `pnpm exec vitest run packages/core/src/architecture-authoring/candidate-analysis.test.ts packages/core/src/architecture-map/asset-mapping.test.ts`: 2 files, 9 tests passed.
- `pnpm db:generate`: passed before implementation verification.
- `pnpm db:push`: passed; PostgreSQL at the configured local Docker endpoint is in sync with candidate-set columns and indexes.
- Implementation preflight returned an exact-Scope receipt with design-context digest `865eefd12d68ed7e1bea2dfe0f572128502253009eda7e8cda0b3ef4e9b1dc65` and relationship digest `978c1768ca5821aae0c652346b3a16aceec3ffaf01b148ca9eb23185b712409e`.

## MCP Record

- MCP ADR: `adr-designer-3a-v7-candidate-governance`
- Proposal: `proposal-designer-3a-v7-candidate-governance`
- Context Pack: `context-pack-designer-3a-v7-candidate-governance`
- Managed assets: `api-specforge-3a-candidate-analysis`, `data-specforge-3a-candidate-set`, `rule-specforge-3a-candidate-closure`
- Related assets: `api-specforge-3a-architecture-query`, `api-specforge-3a-projection-build`, `data-specforge-3a-projection-read-model`, `data-specforge-assets`, `rule-specforge-3a-projection-publication`
- Required typed links: Proposal implements ADR; Context Pack implements Proposal; ADR decides managed assets; managed API writes managed data model; closure rule governs managed API.

## 中文本地化覆盖

### 标题

Designer 3A v7 候选治理

### 背景

Designer v6 已经具备范围明确且可信的 3A 基线，但结构仍然偏窄。架构扩充必须帮助 Agent 和架构师评估变更影响，不能把名称、图邻近关系或扫描器输出直接变成权威架构。候选结果还必须在源目录、关系图或 Baseline 水位变化时变为过期。

当前资产到 3A 的映射中，规范 ID `data-specforge-assets` 与历史语义标识 `dataModel:specforge-assets` 的格式差异会造成错误的 `BLOCKED`。这是身份适配缺陷，不能通过伪造架构单元来“修复”。

### 决策

1. 增加精确 Scope 的 `analyze_3a_architecture_candidates` MCP 操作。授权 Agent 提交带证据的候选批次，服务在持久化前记录正式 Baseline、投影、目录摘要、关系版本和设计上下文摘要。
2. 在 PostgreSQL 的 `ArchitectureFactBatch` 中持久化候选元数据。候选状态、水位、数量、排除项、阻塞项和修订 ID 都支持幂等保存；修订在审核、晋升、对账和不可变 Baseline 发布前保持 `CANDIDATE`。
3. 增加精确 Scope 的 `get_3a_architecture_candidate_set` 读取操作，返回候选修订并在源水位变化时重新计算过期状态。`READY` 候选变为 `STALE`，过期候选不能发布。
4. 强制候选闭包：每个 SYS 必须有 BIZ 到 SYS 的映射，每个 TECH 必须有 SYS 到 TECH 的映射，同一主资产不能归属多个单元。候选上限为 BIZ 6、SYS 12、TECH 5。
5. 发布继续使用已有的 ReviewBundle、晋升、对账和 Baseline 流程。v7 CLI 只调用 MCP，不通过 Prisma 直接写设计事实。
6. 在资产到 3A 的物化阶段确定性兼容历史语义别名。规范 `(assetType, assetId)` 仍是唯一真实身份，别名只用于读取兼容，不改变 Scope 和已编写 ID。

### 备选方案

1. 资产写入时自动发布 3A：否决，因为普通资产写入不能静默改变架构权威。
2. 使用图聚类作为架构权威：否决，因为关系密度只能证明相关性，不能证明架构意图。
3. 强制凑齐 6/12/5：否决，因为证据不足的单元不应为满足数量而被创造。
4. 重命名历史资产或修订以修复格式差异：否决，因为不可变历史和外部引用必须稳定。

### 后果

- Agent 可以请求可复现的候选集，并获得审核和上下文组装所需的完整事实。
- 候选分析具备明确的新鲜度和失败关闭语义，但要求存在正式源 Baseline 和投影。
- PostgreSQL 保持权威，图和 3A 视图保持可重建的派生数据。
- v7 失败时可以继续使用 v6 这个最后已知良好的 Baseline。
- 身份兼容会消除错误映射阻塞，同时保留对缺失或歧义资产的独立诊断。

### 约束

- 所有操作使用精确应用服务 Scope；多 Scope 授权不允许跨 Scope 写入。
- 英文是规范语言，每个面向人的单元、审核、Proposal、ADR、Context Pack 和托管资产都必须有中文覆盖。
- 候选由 Agent 提供，但确定性校验负责 Scope、证据、数量、成员唯一性和跨层闭包。
- 禁止直接数据库写入、隐式审批、部分发布和向图数据库写入权威事实。
- 持续存量扫描、连接器交付、跨 Scope 聚合视图和外部 `APPLY` 仍属于延期的联邦增量。

### 证据

- `pnpm --filter @specforge/core typecheck`：通过。
- `pnpm --filter @specforge/mcp-server typecheck`：通过。
- `pnpm exec vitest run packages/core/src/architecture-authoring/candidate-analysis.test.ts packages/core/src/architecture-map/asset-mapping.test.ts`：2 个文件、9 个测试通过。
- `pnpm db:generate`：实现验证前已通过。
- `pnpm db:push`：通过；配置的本地 Docker PostgreSQL 已同步候选集字段和索引。
- 实施预检返回精确 Scope 回执，设计上下文摘要为 `865eefd12d68ed7e1bea2dfe0f572128502253009eda7e8cda0b3ef4e9b1dc65`，关系摘要为 `978c1768ca5821aae0c652346b3a16aceec3ffaf01b148ca9eb23185b712409e`。
