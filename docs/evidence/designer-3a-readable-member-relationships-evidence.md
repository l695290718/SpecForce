# Designer 3A Readable Member Relationships Evidence

## Scope and Session

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:4db9560e-0497-4f8d-9968-3c9705dca77c`
- Baseline: `knowledge-baseline:designer:3a:v6`
- Projection: `projection-manifest:projection-generation:a5f2d9f6895b032648c4cab7dff81462aa36e2e9a406fffdec94562f7bd092ac:1`

## Implemented Behavior

The `unitGraph` contract now accepts `includeMemberRelations` and applies a separate 120-row member-relationship budget. PostgreSQL returns only relationships whose source and target are both returned direct members. The graph workspace requests that fidelity for Overview, initially exposes a deterministic maximum of 36 direct members, and keeps hidden facts out of both Sigma rendering and layout input. Cluster expansion is explicit and idempotent; a separate control performs collapse.

## Verification

| Command or check | Result |
| --- | --- |
| `pnpm exec vitest run packages/core/src/architecture-map/types.test.ts packages/knowledge-query/src/prisma-repository.test.ts packages/knowledge-query/src/architecture-map.test.ts apps/web/lib/3a/query-handler.test.ts apps/web/components/three-a/architecture-graph-visibility.test.ts apps/web/components/three-a/sigma-architecture-graph.test.tsx apps/web/components/three-a/architecture-graph-workspace.test.ts` | Passed focused contract, repository, service, visibility, renderer, and workspace tests. |
| `pnpm --filter @specforge/core typecheck` | Passed. |
| `pnpm --filter @specforge/knowledge-query typecheck` | Passed. |
| `pnpm --filter @specforge/web typecheck` | Passed. |
| `git diff --check` | Passed. |
| `docker compose -f deploy/compose.yaml build web; docker compose -f deploy/compose.yaml up -d --no-deps web; Invoke-WebRequest http://localhost:3010/healthz` | Web image rebuilt, only `deploy-web-1` was replaced, and health returned HTTP 200. |
| In-app browser: exact Scope / Baseline v6 / Projection Relationship Network | Loaded 50 nodes and 48 edges; governed measures were `8 / 42 / 307 / 6`; browser error log was empty. |
| `SPECFORGE_DESIGN_FACT_IDS=adr-readable-3a-architecture-mapping pnpm design-facts:sync; pnpm design-facts:check` | Synchronization completed; `missing`, `mismatched`, `outOfScope`, and `blocked` were empty. |
| `pnpm design-context:close` for `4db9560e-0497-4f8d-9968-3c9705dca77c` and `3cf4a7fd-afdb-424b-ba22-28d3a19b2fd7` | Both exact-Scope sessions closed as `CONVERGED`. |

## Boundaries and Deferred Work

- The relationship query is a bounded read-only PostgreSQL projection; it does not infer missing architecture semantics.
- TRACE-derived coverage remains outside the default topology.
- Production-scale continuation UX and broader relationship exploration remain separate future increments.

## 中文说明

### 范围与会话

- 应用服务：`com.huawei.celon.desiner`
- 设计变更会话：`design-change-session:4db9560e-0497-4f8d-9968-3c9705dca77c`
- 已发布 Baseline：`knowledge-baseline:designer:3a:v6`

### 已实现行为

`unitGraph` 支持 `includeMemberRelations`，并对成员关系单独施加 120 行上限。PostgreSQL 只返回两端均为已返回直接成员的关系。总览默认请求该完整度，确定性地显示最多 36 个直接成员，并将隐藏事实从 Sigma 渲染和布局输入中同时排除。单元展开是显式且幂等的；折叠由独立控件完成。

### 验证结论

聚焦测试、三个 TypeScript 检查和差异检查均通过。Docker 中的 `3010` Web 服务已使用新镜像并通过 HTTP 200 健康检查。精确 Designer Scope 的浏览器验证加载了 50 个节点和 48 条边，计量为 `8 / 42 / 307 / 6`，无浏览器错误。

`adr-readable-3a-architecture-mapping` 已完成 MCP 同步；对账中的缺失、不匹配、越界和阻塞列表均为空。两个精确 Scope 设计变更会话均已以 `CONVERGED` 关闭。

### 边界与延期

- 查询是有界、只读的 PostgreSQL 投影，不会推断缺失架构语义。
- TRACE 覆盖关系不进入默认拓扑。
- 面向生产规模的继续读取交互和更宽泛的关系探索留待独立增量。
