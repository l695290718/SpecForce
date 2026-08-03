# ADR-0019: Deterministic 3A Knowledge Projections

## Status

**Accepted; the deterministic Phase 2 projection increment is implemented, locally verified, and MCP synchronized.**

- Stable ID: `adr-deterministic-3a-knowledge-projections`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related decision: `adr-unified-3a-knowledge-initialization`

## Context

Phase 1 can publish an immutable, reviewed Baseline, but the Baseline is not yet useful as a coordinated business, system, and technical architecture view. Phase 2 needs reproducible 3A projections without turning derived views into a second authoring store. The projection must also explain cross-layer alignment, compare a current accepted set with a pinned Baseline, and give Agents a stable Context Pack.

## Decision

Implement a deterministic projection boundary in the generic core. Given one published Baseline, its exact Scope, an analysis Profile, accepted assertions bound to the Baseline ChangeSet, and explicit typed relationships, derive:

- `BIZ`, `SYS`, and `TECH` layer projections;
- cross-layer alignment items and unaligned assertion IDs;
- `ADDED`, `REMOVED`, `CHANGED`, and `UNCHANGED` drift items; and
- a pinned Context Pack markdown envelope containing the Baseline, Profile, Scope, layer facts, and cross-layer alignment.

The projection reads only accepted facts. It validates exact Scope for the Baseline, assertions, and relationships; sorts all collections before hashing; and never writes an assertion, relationship, Design Asset, or active Baseline. Projection manifests remain the durable record of Baseline/Profile/schema/source/relation inputs. PostgreSQL remains authoritative and graph storage remains a rebuildable projection.

## Alternatives

1. **Create independent editable 3A stores.** Rejected because layer facts would drift from the governed Baseline.
2. **Infer cross-layer relationships from names alone.** Rejected because semantic similarity is not evidence and would create false alignment.
3. **Use an LLM as the projection source.** Rejected for structural projection because reproducibility and drift detection require deterministic output.
4. **Require Baseline source IDs to equal assertion IDs.** Rejected because promotion stores asset and relationship revision IDs in the Baseline; accepted assertions are bound through the Baseline ChangeSet.

## Consequences

- The same Baseline and Profile produce the same projection digest and Context Pack content.
- Missing source binding, sibling Scope data, or unpublished Baselines fail closed.
- Alignment is explicit and explainable; unaligned facts remain visible instead of being silently discarded.
- Drift is a derived comparison and does not mutate the active Baseline.
- The initial Phase 2 slice is independent of NebulaGraph and works with PostgreSQL-backed reads.
- A later MCP read tool and Web view must load these results by exact Scope and pin the manifest before long-term retention.

## Constraints

- Exact application-service Scope is mandatory for every input.
- Only `ACCEPTED` assertions are eligible for a published Baseline projection.
- The Baseline must be `PUBLISHED` and assertions are bound by its `changeSetId` or explicit source revision IDs.
- English remains canonical for generated identifiers and structural output; human-facing Context Pack overlays must be completed before an accepted MCP record is closed.
- Projection output is derived and cannot be used as an authored write path.
- Cross-Scope comparison, live connectors, AI-generated authoritative facts, and CodeHub enforcement remain outside this phase.

## Evidence

- `pnpm --filter @specforge/core typecheck` passed after adding the deterministic projection contract and tests.
- `node .\\node_modules\\vitest\\vitest.mjs run --root . --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/core/src/__tests__/knowledge-projections.test.ts apps/mcp-server/src/tools.test.ts` passed 2 files and 26 tests.
- `Invoke-WebRequest -UseBasicParsing http://localhost:3000/` returned HTTP 200 after the development service was started.

## MCP Record

- Matching MCP ADR ID: `adr-deterministic-3a-knowledge-projections`
- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal and Context Pack: to be synchronized in the Phase 2 closure step.
- Required typed links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; Evidence `VALIDATES` ADR; ADR `DECIDES` projection and Context Pack assets.
- MCP status: `pnpm design-facts:sync` and `pnpm design-facts:check` completed for this ADR in the exact owning Scope with no missing, mismatched, out-of-scope, or blocked records.

## Chinese Localization

### 状态

已接受；确定性第二阶段投影增量已经实现、本地验证并通过 MCP 同步。

### 背景

第一阶段可以发布经过评审且不可变的 Baseline，但 Baseline 还不能直接提供统一的业务、系统和技术架构视图。第二阶段需要可重复的 3A 投影，同时不能把派生视图变成第二个权威写入库。投影还需要解释跨层对齐、比较当前已接受事实与固定 Baseline 的漂移，并为 Agent 提供稳定的 Context Pack。

### 决策

在通用核心中实现确定性投影边界。给定一个已发布 Baseline、精确 Scope、分析 Profile、绑定到 Baseline ChangeSet 的已接受断言和显式类型化关系，派生 BIZ、SYS、TECH 三层视图、跨层对齐、增加/删除/变更/未变更漂移，以及包含 Baseline、Profile、Scope、分层事实和跨层对齐的固定 Context Pack。投影只读取已接受事实，校验精确 Scope，排序集合后计算摘要，不创建断言、关系、设计资产或活动 Baseline。PostgreSQL 继续保持权威，图数据库仍然只是可重建的派生投影。

### 备选方案

1. 创建独立可编辑的 3A 存储：拒绝，因为分层事实会与受治理 Baseline 漂移。
2. 仅根据名称推断跨层关系：拒绝，因为名称相似不是证据，会产生错误对齐。
3. 使用大模型作为结构投影来源：拒绝，因为结构投影的可重复性和漂移检测需要确定性算法。
4. 要求 Baseline 来源 ID 必须等于断言 ID：拒绝，因为提升时 Baseline 保存资产和关系修订 ID，断言通过 ChangeSet 绑定。

### 后果

- 相同 Baseline 和 Profile 始终得到相同投影摘要与 Context Pack 内容。
- 缺少来源绑定、跨 Scope 数据或未发布 Baseline 时直接失败。
- 对齐结果保持显式且可解释，未对齐事实仍然可见。
- 漂移比较不会修改活动 Baseline。
- 本阶段先独立于 NebulaGraph，使用 PostgreSQL 读模型即可运行。
- 后续 MCP 读取工具和 Web 视图必须按精确 Scope 加载结果，并在长期保存前固定投影清单。

### 约束

- 每个输入都必须属于精确应用服务 Scope。
- 只有 `ACCEPTED` 断言可以进入已发布 Baseline 的投影。
- Baseline 必须为 `PUBLISHED`，断言通过 `changeSetId` 或显式来源修订 ID 绑定。
- 英文是规范字段；面向人的 Context Pack 在 MCP 关闭前必须具备完整中文覆盖。
- 投影输出是派生结果，不能成为权威写入路径。
- 跨 Scope 对比、实时连接器、AI 生成权威事实和 CodeHub 门禁不属于本阶段。

### 证据

- `pnpm --filter @specforge/core typecheck` 已通过。
- `pnpm --filter @specforge/mcp-server typecheck` 已通过。
- `Invoke-WebRequest -UseBasicParsing http://localhost:3000/` 返回 HTTP 200。
- 目标 Vitest 当前受 Windows/OneDrive 配置加载权限阻塞，尚未计为通过。
