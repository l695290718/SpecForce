# ADR-0036: Bounded Knowledge-Assertion-Aware Nebula Projection Generations

## Status

Accepted design; implementation has not started.

- Stable ID: `adr-bounded-nebula-knowledge-projection-generations`
- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76`
- Proposal: `proposal-bounded-nebula-knowledge-projection-generations`
- Context Pack: `ctx-bounded-nebula-knowledge-projection-generations`
- Spec: `docs/superpowers/specs/2026-08-20-bounded-nebula-knowledge-projection-generations-design.md`

## Context

The current NebulaGraph runtime projects exact-Scope design-asset identities and current typed relationships from authoritative PostgreSQL events. It does not yet preserve the Baseline-bound Knowledge Assertions, Profile-pinned projection identity, versioned relationship snapshot, or publication semantics of the PostgreSQL-first 3A model. Unlimited immutable graph generations would provide history but would multiply online storage, writes, indexes, cache pressure, and cleanup cost.

## Decision

Use one shared Nebula graph schema with physically generation-qualified identities and at most three online slots per exact application-service Scope: BUILDING, ACTIVE, and PREVIOUS. PostgreSQL stores immutable `NebulaProjectionManifest` records and the single mutable `NebulaProjectionHead`. A short PostgreSQL transaction publishes or rolls back by changing slot pointers only after deterministic parity validation.

Project Design Asset, Architecture Unit, and Baseline-bound Knowledge Assertion vertices. Represent asset-to-3A semantics through assertion-subject and assertion-target edges. Keep asset relationships and architecture realizations separate. Include Manifest identity in every VID, use PostgreSQL-assigned stable BIGINT relationship ranks, and reject every cross-Scope or cross-Manifest edge.

Retain PREVIOUS for 72 hours by default, subject to stricter capacity watermarks. Preserve complete authoritative history in PostgreSQL and optional immutable bulk snapshots in production object storage. Deliver semantic projection, production operations, and billion-scale certification as three independently evidenced phases.

## Alternatives

- Keep unlimited generations in one Space: rejected because online cost and cleanup grow without bound and query mistakes can mix generations.
- Create one Space per Scope and generation: rejected as the default because enterprise Scope and release counts make Space lifecycle and resource overhead excessive.
- Keep only ACTIVE in NebulaGraph: rejected as the normal mode because rapid rollback is lost; retained as a capacity-pressure degradation mode.
- Use property-only generation filters: rejected because a missing predicate can traverse false cross-generation adjacency.

## Consequences

- Publication and rollback do not depend on NebulaGraph transactions.
- Zero-downtime rebuild normally requires capacity for ACTIVE, BUILDING, and temporarily PREVIOUS data.
- Every Gateway query and Projector checkpoint becomes Manifest-aware.
- Cleanup requires retained chunk manifests, rate limiting, safety leases, and compaction operations.
- PostgreSQL/Nebula parity must include control totals, deterministic bucket digests, and semantic probes.
- Historical graph access is bounded; full history remains available through PostgreSQL or archived snapshots.
- Production topology and billion-scale claims remain deferred until their separate evidence succeeds.

## Constraints

- PostgreSQL is authoritative for authored assets, Knowledge Assertions, relationships, Baselines, Profiles, Manifest control, and complete history.
- MCP is the only authored-design-fact write boundary.
- Each vertex, edge, checkpoint, continuation, and control operation is bound to the exact application-service Scope and immutable Manifest.
- Ordinary callers cannot select a generation; Gateway resolves ACTIVE from PostgreSQL.
- Failed build or validation cannot alter ACTIVE, and cleanup can never target ACTIVE.
- PREVIOUS retention is bounded and may yield to approved capacity watermarks after the minimum rollback window.
- Existing local single-node compatibility does not certify external multi-node or billion-scale production behavior.

## Evidence

- `pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Formalize the approved Knowledge-Assertion-aware Nebula 3A bounded-generation projection and production-scale certification design." --affected "adr-nebulagraph-production-projection,adr-deterministic-3a-knowledge-projections,data-specforge-asset-graph,api-specforge-3a-projection-build,api-specforge-3a-architecture-query,data-specforge-3a-projection-read-model" --evidence "user-approved-bounded-three-slot-projection-design:2026-08-20"` opened `design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76`, read 307 exact-Scope assets, and returned design-context digest `c93f7c20d7660e52d93301efe0d215c8cdaa8248bf3ac676984c1e1c63b8353e`.
- Product-owner design reviews on 2026-08-19 and 2026-08-20 accepted the bounded three-slot model, server-resolved generation identity, Knowledge-Assertion-aware mapping, 72-hour default PREVIOUS retention, and three independent delivery phases.
- `node .\node_modules\vitest\vitest.mjs run --root . --exclude .worktrees/** --exclude .pnpm-store/** scripts\design-fact-manifest.test.ts scripts\sync-design-facts.test.ts` passed 2 files and 34 tests; `git diff --check` returned no errors.
- With `SPECFORGE_DESIGN_FACT_IDS=adr-bounded-nebula-knowledge-projection-generations`, `pnpm design-facts:sync` returned `complete`; `pnpm design-facts:check` returned the selected ADR in `verified` with empty missing, mismatched, out-of-Scope, and blocked lists.
- Exact Designer-Scope `pnpm design-facts:federation:check` returned root `f04e3ad0981d2ce6a2e40032e359ab06b07dc4ed2255774b6515ba8cd87987dd`, no issue counts, and `blocking=false`.
- `pnpm design-context:close -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --session design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76 --status CONVERGED --evidence "baseline-manifest-json=valid,design-fact-tests=2-files-34-tests-pass,git-diff-check=no-errors,mcp-sync=complete,mcp-readback=verified-no-issues,federation-check=blocking-false"` closed the exact written-design session as `CONVERGED`.
- Implementation evidence is intentionally absent because code has not started. A new exact-Scope Design Change Session is required before implementation.

## MCP Record

- MCP ADR: `adr-bounded-nebula-knowledge-projection-generations`
- Proposal: `proposal-bounded-nebula-knowledge-projection-generations`
- Context Pack: `ctx-bounded-nebula-knowledge-projection-generations`
- Related assets: `api-specforge-nebula-generation-control`, `data-specforge-nebula-generation-projection`, `rule-specforge-nebula-bounded-generation-publication`, `quality-specforge-nebula-scale-certification`, `data-specforge-asset-graph`, `api-specforge-3a-projection-build`, `api-specforge-3a-architecture-query`, `data-specforge-3a-projection-read-model`
- Required typed links: Proposal implements ADR; Context Pack implements Proposal context; ADR decides the managed assets; generation API writes the projection model; publication rule governs the API and model; certification quality validates the API and model.
- MCP synchronization and exact-Scope read-back completed. The written-design session may close after final repository validation; implementation still requires a new session.

## 中文本地化覆盖

### 标题

有界、支持 Knowledge Assertion 的 Nebula 投影代次

### 状态

设计已接受，代码尚未开始。稳定 ID 为 `adr-bounded-nebula-knowledge-projection-generations`，所属应用服务为 `com.huawei.celon.desiner`，所属 Scope 路径为 `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`，设计变更会话为 `design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76`。

### 背景

当前 NebulaGraph 运行时从权威 PostgreSQL 事件投影精确 Scope 的设计资产身份和当前类型关系，但尚未保存 PostgreSQL-first 3A 模型中的 Baseline 绑定 Knowledge Assertion、Profile 固定投影身份、版本化关系快照和发布语义。无限不可变图代次虽然能提供历史，但会持续放大在线存储、写入、索引、缓存压力和清理成本。

### 决策

在共享 Nebula 图 Schema 中使用包含代次身份的物理图身份，每个精确应用服务 Scope 最多保留 BUILDING、ACTIVE 和 PREVIOUS 三个在线槽位。PostgreSQL 保存不可变 `NebulaProjectionManifest` 和唯一可变 `NebulaProjectionHead`。只有确定性一致性校验通过后，才通过短 PostgreSQL 事务修改槽位指针完成发布或回滚。

投影 Design Asset、Architecture Unit 和绑定 Baseline 的 Knowledge Assertion 顶点。设计资产到 3A 的语义通过断言主体和断言目标关系表达，资产关系与架构实现关系保持独立。每个 VID 包含 Manifest 身份，关系 rank 使用 PostgreSQL 分配的稳定 BIGINT，并拒绝所有跨 Scope 或跨 Manifest 关系。

PREVIOUS 默认保留 72 小时，但更严格的容量水位可以优先。完整权威历史保存在 PostgreSQL，生产环境可以把不可变批量快照归档到对象存储。语义投影、生产运维和十亿级认证作为三个独立取证阶段交付。

### 备选方案

- 共享 Space 无限保留代次：在线成本和清理工作无界，并可能因查询遗漏条件而混合代次，因此拒绝。
- 每个 Scope 和代次独立 Space：企业 Scope 和发布数量会造成 Space 生命周期与资源成本过高，因此不作为默认方案。
- Nebula 只保留 ACTIVE：缺少快速回滚，因此只作为容量压力下的降级模式。
- 只使用代次属性过滤：遗漏过滤条件会遍历出错误的跨代邻接，因此拒绝。

### 后果

- 发布和回滚不依赖 NebulaGraph 事务。
- 无停机重建通常需要同时容纳 ACTIVE、BUILDING 和暂时保留的 PREVIOUS。
- Gateway 查询和 Projector 检查点都必须感知 Manifest。
- 清理需要分块清单、限速、安全租约和压缩运维。
- PostgreSQL 与 Nebula 的一致性必须同时核对数量、确定性桶摘要和语义探针。
- 历史图访问保持有界，完整历史由 PostgreSQL 或归档快照提供。
- 生产拓扑和十亿级声明在独立证据通过前保持延期。

### 约束

- PostgreSQL 对设计资产、Knowledge Assertion、关系、Baseline、Profile、Manifest 控制和完整历史保持权威。
- MCP 是唯一设计事实编写边界。
- 每个顶点、关系、检查点、继续令牌和控制操作都绑定精确应用服务 Scope 和不可变 Manifest。
- 普通调用方不能选择代次，Gateway 必须从 PostgreSQL 解析 ACTIVE。
- 失败构建或校验不能改变 ACTIVE，清理永远不能选择 ACTIVE。
- PREVIOUS 保留有界；超过最小回滚窗口并经过批准后，容量水位可以优先。
- 本地单节点兼容验证不能证明外部多节点或十亿级生产能力。

### 证据

- 精确 Scope 预检命令打开 `design-change-session:f0da2e18-daed-4ab4-a211-0e3dabcd5c76`，读取 307 条 Scope 资产，并返回设计上下文摘要 `c93f7c20d7660e52d93301efe0d215c8cdaa8248bf3ac676984c1e1c63b8353e`。
- 2026-08-19 和 2026-08-20 的产品负责人设计评审确认了有界三槽模型、服务端解析代次、支持 Knowledge Assertion 的映射、PREVIOUS 默认保留 72 小时以及三个独立交付阶段。
- 设计事实清单和 MCP 同步契约测试共 2 个文件、34 项测试通过，`git diff --check` 无错误。
- 只选择本 ADR 的 `pnpm design-facts:sync` 返回 `complete`；`pnpm design-facts:check` 将该 ADR 列入 `verified`，缺失、差异、越界和阻塞列表均为空。
- 精确 Designer Scope 的联邦对账返回根摘要 `f04e3ad0981d2ce6a2e40032e359ab06b07dc4ed2255774b6515ba8cd87987dd`，无问题计数，且 `blocking=false`。
- `pnpm design-context:close` 携带清单、34 项测试、差异检查、MCP 同步与回读、联邦对账证据，将同一精确 Scope 书面设计会话关闭为 `CONVERGED`。
- 代码尚未开始，因此有意不记录实施证据。开始实施前必须创建新的精确 Scope 设计变更会话。

### MCP 记录

匹配 MCP ADR 为 `adr-bounded-nebula-knowledge-projection-generations`，Proposal 为 `proposal-bounded-nebula-knowledge-projection-generations`，Context Pack 为 `ctx-bounded-nebula-knowledge-projection-generations`。API、数据模型、发布规则、规模认证质量事实及其有类型关系已经通过 MCP 写入并完成精确 Scope 回读。本次书面设计会话已关闭为 `CONVERGED`；实施仍需新会话。
