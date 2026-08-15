# 3A Neighborhood Query Identity Repair Design

## Status

Approved for specification on 2026-08-15. Not implemented.

- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Parent decision: `adr-readable-3a-architecture-mapping`
- Affected API: `api-specforge-3a-architecture-query`
- Affected read model: `data-specforge-3a-projection-read-model`
- Written-design session: `design-change-session:bacfc00e-4bfa-40fe-abc0-597138834a9e`

## Problem

Both public 3A unit-neighborhood MCP paths fail against the real PostgreSQL schema when a selected architecture unit has members:

- `get_3a_architecture_unit_neighborhood` uses the direct MCP architecture-map adapter.
- `query_3a_architecture_unit_neighborhood` uses the shared knowledge-query service and `PrismaThreeAQueryRepository`.

The common cause is identity-shape leakage. `ArchitectureMapIdentity` contains `applicationServiceId`, `scopePath`, `generationId`, `baselineId`, and `projectionManifestId`. That complete identity is valid for `ArchitectureUnitProjection`, `ArchitectureUnitMemberProjection`, and `ArchitectureUnitMappingProjection`. It is not valid for every participating table:

- `ProjectionManifest` identifies the manifest with its `id`; it has no `projectionManifestId` column.
- `KnowledgeProjectionEdge` is generation-bound and has no `projectionManifestId` column.

Both implementations currently spread the complete architecture-map identity into one or both incompatible Prisma `where` objects. Mock-based tests accept arbitrary objects and therefore did not detect the schema-invalid field.

## Decision

Preserve both public MCP contracts and repair their internal query construction without changing the database schema, response contracts, budgets, authorization, or UI behavior.

Each query must construct a table-specific identity:

1. **Architecture projection identity** includes exact Scope, generation, Baseline, and Projection Manifest ID. Use it only for architecture unit, member, and mapping projection tables.
2. **Manifest lookup identity** includes exact Scope, manifest `id`, Baseline, generation, and published status. It must not contain `projectionManifestId` as a column filter.
3. **Knowledge-edge identity** includes exact Scope, generation, and Baseline. It must not contain `projectionManifestId`.

The Projection Manifest remains verified before any unit, member, mapping, or edge read. Its returned generation must equal the request generation. Exact Scope authorization remains fail-closed before the manifest lookup.

## Compatibility Boundary

- Keep `get_3a_architecture_unit_neighborhood` operational for existing MCP clients.
- Keep `query_3a_architecture_unit_neighborhood` as the shared query-service path used by newer clients.
- Do not remove, rename, redirect, or change either tool's input or output schema.
- Do not add `projectionManifestId` to `KnowledgeProjectionEdge` or create a migration.
- Do not change depth, mapping, timeout, payload, or continuation budgets.
- Do not broaden reads across Scope, Baseline, generation, or unpublished manifests.

## Implementation Shape

### Direct MCP Adapter

`apps/mcp-server/src/knowledge/architecture-map-adapter.ts` will keep the complete identity for projection tables but construct separate manifest and edge filters. The manifest query will use `id`, not a synthetic `projectionManifestId` column. Same-layer dependency reads will use Scope, generation, and Baseline only.

### Shared Query Repository

`packages/knowledge-query/src/prisma-repository.ts` will remove `projectionManifestId` only when querying `KnowledgeProjectionEdge`. Architecture unit, member, and mapping methods continue using the complete architecture-map identity.

The implementation should use small explicit helper functions or destructuring so future call sites cannot accidentally spread the complete identity into an incompatible table.

### v5 Verification

`scripts/verify-designer-3a-v5.ts` will stop using a direct Prisma member-table fallback. It will call both public MCP neighborhood tools for `unit:sys:specforge-mcp-governance-gateway` and verify that each returns the same 23 members for the published v5 Baseline and generation. The existing complete-map assertions remain: 4 units, 38 total memberships, 3 mappings, `unclassifiedCount=0`, exact Scope, no fixture members, and no deferred members.

## Testing

Focused tests must fail before the fix and pass afterward:

- `packages/knowledge-query/src/prisma-repository.test.ts` asserts that same-layer dependency edge queries contain exact Scope, generation, Baseline, and endpoint filters, and explicitly do not contain `projectionManifestId`.
- `apps/mcp-server/src/tools.test.ts` asserts that the direct adapter's manifest and edge Prisma filters omit `projectionManifestId`, while unit/member/mapping filters retain it.
- Existing query-service tests continue to prove finite neighborhood results and fail-closed Scope isolation.
- Live v5 verification calls both MCP paths and confirms identical 23-member gateway results.

The focused verification set is:

```text
pnpm exec vitest run packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/architecture-map.test.ts apps/mcp-server/src/tools.test.ts
pnpm --filter @specforge/knowledge-query typecheck
pnpm --filter @specforge/mcp-server typecheck
pnpm exec tsx scripts/verify-designer-3a-v5.ts
pnpm design-facts:sync
pnpm design-facts:check
git diff --check
```

## Documentation And Design Facts

- Update `docs/TODO.md` item 7 from the v4 count of 28 memberships to the published v5 count of 38 memberships, while keeping enterprise-wide semantic coverage deferred.
- Update ADR-0025 with the repair decision and exact verification evidence.
- Synchronize the matching ADR, Proposal, Context Pack, API, read-model facts, and typed links through MCP before completion.
- Close the implementation Design Change Session only after both live MCP paths pass against v5.

## Acceptance Criteria

- Both neighborhood MCP tools return successfully against the published v5 projection.
- Both return the same 23 members for the MCP Governance Gateway unit.
- Manifest and edge queries contain no schema-invalid `projectionManifestId` filter.
- Architecture unit/member/mapping queries remain bound to the exact Projection Manifest.
- Unauthorized Scope, mismatched generation, missing manifest, and missing unit remain fail-closed.
- No database migration or data rewrite occurs.
- TODO item 7 reports the current 4-unit, 38-membership, 3-mapping v5 slice.
- Focused tests, type checks, MCP readback, design-fact reconciliation, and diff checks pass.

## Non-Goals

- Changing 3A semantics or publishing a v6 Baseline.
- Adding new architecture units, memberships, mappings, or relationship events.
- Changing graph analysis, layout, Web controls, or navigation behavior.
- Cleaning the nine persisted graph-verification fixtures.
- Adding production identity, CodeHub enforcement, Nebula scaling, or enterprise connectors.

---

# 中文本地化覆盖

## 状态

已于 2026-08-15 批准编写 Spec，尚未实施。

- 所属应用服务：`com.huawei.celon.desiner`
- 所属 Scope：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 父级决策：`adr-readable-3a-architecture-mapping`
- 受影响 API：`api-specforge-3a-architecture-query`
- 受影响读模型：`data-specforge-3a-projection-read-model`
- 书面设计会话：`design-change-session:bacfc00e-4bfa-40fe-abc0-597138834a9e`

## 问题

当选中的架构单元包含成员时，两个公开的 3A 单元邻域 MCP 查询都会在真实 PostgreSQL Schema 上失败。根因是把完整的 `ArchitectureMapIdentity` 直接展开到不兼容的 Prisma 表查询中。

完整身份包含应用服务、Scope 路径、代际、Baseline 和 Projection Manifest ID。它适用于架构单元、成员和映射投影表，但 `ProjectionManifest` 使用自身 `id` 标识 Manifest，`KnowledgeProjectionEdge` 只绑定代际和 Baseline；这两张表都没有 `projectionManifestId` 字段。现有 Mock 测试不会校验 Prisma Schema，因此没有发现非法字段。

## 决策

保留两个公开 MCP 契约，只修复内部查询身份构造，不修改数据库 Schema、响应契约、预算、授权或界面行为。

查询身份分为三类：

1. 架构投影身份包含精确 Scope、代际、Baseline 和 Projection Manifest ID，只用于单元、成员和映射投影表。
2. Manifest 查询身份包含精确 Scope、Manifest `id`、Baseline、代际和已发布状态，禁止把 `projectionManifestId` 当作数据库字段。
3. 知识关系边身份包含精确 Scope、代际和 Baseline，禁止包含 `projectionManifestId`。

任何单元、成员、映射或关系读取前仍必须先验证已发布 Manifest，且返回代际必须与请求一致。Scope 授权继续在 Manifest 查询前失败关闭。

## 兼容边界

- 保留 `get_3a_architecture_unit_neighborhood`，兼容已有 MCP 客户端。
- 保留 `query_3a_architecture_unit_neighborhood`，作为共享查询服务路径。
- 不修改两个工具的名称、输入或输出 Schema。
- 不给 `KnowledgeProjectionEdge` 增加字段，不创建数据库迁移。
- 不修改深度、映射、超时、载荷或继续状态预算。
- 不允许跨 Scope、跨 Baseline、跨代际或读取未发布 Manifest。

## 实施与验证

- 直接 MCP 适配器为 Manifest、架构投影表和知识关系边分别构造查询身份。
- 共享 Prisma 查询仓库在读取 `KnowledgeProjectionEdge` 时移除 `projectionManifestId`，其余架构投影表继续使用完整身份。
- v5 验证脚本移除直接 Prisma 回退，改为同时调用两个 MCP 工具，并确认 MCP 治理网关都返回相同的 23 个成员。
- 定向测试必须证明 Manifest 和关系边查询不含非法字段，单元、成员和映射查询仍绑定精确 Manifest，Scope 隔离继续失败关闭。
- `docs/TODO.md` 第 7 项从旧的 28 个成员更新为 v5 的 38 个成员，但企业级全量语义覆盖仍保持延期。

## 验收标准

- 两个邻域 MCP 工具都能读取已发布 v5 投影，并为 MCP 治理网关返回相同的 23 个成员。
- Manifest 和关系边查询不再包含非法的 `projectionManifestId` 字段。
- 架构单元、成员和映射查询继续绑定精确 Projection Manifest。
- 未授权 Scope、代际不匹配、Manifest 缺失和单元缺失继续失败关闭。
- 不发生数据库迁移或数据重写。
- TODO 第 7 项显示当前 v5 的 4 个单元、38 个成员和 3 条映射。
- 定向测试、类型检查、MCP 回读、设计事实对账和差异检查全部通过。

## 非目标

- 不改变 3A 语义，不发布 v6 Baseline。
- 不新增架构单元、成员、映射或关系事件。
- 不修改图分析、布局、Web 控件或导航行为。
- 不清理 9 条图验证夹具。
- 不实施生产身份、CodeHub 门禁、Nebula 扩容或企业连接器。
