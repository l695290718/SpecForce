# Evidence: Graph Verification Fixture Isolation and Cleanup

English is canonical. Chinese is the human-facing localization.

## Scope and sessions

- Parent Designer Scope: `com.huawei.celon.desiner`
- Verification application service: `com.huawei.celon.desiner.graph-verification`
- Verification Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`
- Registration session: `design-change-session:fc5f7fb2-f714-4b4a-82d1-2875928d3503`
- Exact verification preflight: `design-change-session:e84bb591-73dc-4b05-b30d-8c3175f01333`
- Verification preflight read 4 scoped design facts and relationship digest `c8fc45b25da7713ce2f6ca74e85362a96a6d312ab8e298b05aa7884e170f9aa8`.
- MCP ADR: `adr-graph-verification-fixture-isolation`; Proposal: `proposal-graph-verification-fixture-isolation`; Context Pack: `ctx-graph-verification-fixture-isolation`; Evidence: `evidence-graph-verification-fixture-isolation`

## Implemented behavior

The verification Scope has purpose `verification`, exact read/write grants, and no inheritance from the product Scope. Normal Web Scope selection excludes it. Fixture creation and cleanup use the MCP boundary and explicit run IDs. Historical cleanup validates nine exact fixture fingerprints before deleting them. The live gate now manages a unique Compose project containing only the six graph verification services, uses Docker-assigned loopback ports, separates host and container PostgreSQL URLs, and cleans the run in an outer failure-safe path.

## Exact evidence

| Command | Result |
| --- | --- |
| `pnpm exec vitest run deploy/graph/live-projection-config.test.ts scripts/cleanup-graph-verification-fixtures.test.ts packages/core/src/__tests__/architecture-scope.test.ts apps/web/lib/__tests__/scope.test.ts` | focused targets passed; workspace discovery reported 37 files / 202 tests |
| `pnpm --filter @specforge/core typecheck` | exit 0 |
| `pnpm --filter @specforge/mcp-server typecheck` | exit 0 |
| `pnpm db:push` | exit 0; `ArchitectureScope.purpose` persisted |
| historical cleanup dry-run before delete | 9 fingerprint matches, 0 already absent |
| historical cleanup delete | exactly 9 validated records deleted through MCP |
| historical cleanup dry-run after delete | 0 fingerprint matches, 9 already absent |
| `powershell -ExecutionPolicy Bypass -File deploy/graph/verify-projection.ps1 -ConfigurationOnly` | passed; local/external topology and loopback port assertions passed |
| `pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts scripts/cleanup-graph-verification-fixtures.test.ts deploy/graph/live-projection-config.test.ts` | 3 files; 10 tests passed |
| `pnpm exec vitest run scripts/verify-graph-lifecycle.test.ts scripts/cleanup-graph-verification-fixtures.test.ts apps/graph-projector/src/repository-sql.test.ts apps/mcp-server/src/tools.test.ts` | workspace discovery passed 19 files / 301 tests; the Projector and MCP boundary tests passed |
| `pnpm exec tsc -p apps/graph-projector/tsconfig.json --noEmit; pnpm exec tsc -p apps/mcp-server/tsconfig.json --noEmit` | exit 0 |
| managed live gate `-Live`, `prepare` | fixed images built; exact verification Scope; both relationships `COMPLETED`; graphVersion/checkpoint `44/44`; traversal `3 nodes/2 edges`; `deadLetterCount=0`; idempotent first relationship event count `1` |
| managed live gate `-Live`, Projector recreation and `verify` | project-scoped `up --force-recreate --no-deps graph-projector`; dynamic port rediscovered; same `44/44` watermark; exact two-hop traversal and singular first-hop edge passed |
| managed live gate `-Live`, MCP cleanup and Compose teardown | `assetIds=3`, `status=deleted`, `remainingLinks=0`; managed containers, network, and ephemeral volumes removed |

The graph verification lifecycle is complete for the local single-node compatibility topology. Historical verification outbox rows are retained as `ARCHIVED` through MCP, and the live gate passed after the pinned images were made available locally.

## 证据：图验证夹具隔离与清理

英文是规范字段，中文用于面向人的本地化展示。

### Scope 与会话

- 父 Designer Scope：`com.huawei.celon.desiner`
- 验证应用服务：`com.huawei.celon.desiner.graph-verification`
- 验证 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`
- 注册会话：`design-change-session:fc5f7fb2-f714-4b4a-82d1-2875928d3503`
- 精确验证预检：`design-change-session:e84bb591-73dc-4b05-b30d-8c3175f01333`
- MCP ADR：`adr-graph-verification-fixture-isolation`；Proposal：`proposal-graph-verification-fixture-isolation`；Context Pack：`ctx-graph-verification-fixture-isolation`；Evidence：`evidence-graph-verification-fixture-isolation`

### 已实现行为与边界

验证 Scope 的用途是 `verification`，只授予精确读写权限，不继承产品 Scope；普通 Web Scope 选择器会排除它。夹具创建和清理均通过 MCP 边界并绑定显式运行 ID。历史清理在删除前校验 9 条精确夹具指纹。实时门禁现在使用独立 Compose 项目，仅管理 6 个图验证服务，使用 Docker 动态回环端口，分离主机和容器 PostgreSQL 连接，并在失败外层 finally 中清理。

实时端到端门禁已通过：两条关系均为 `COMPLETED`，图水位和 checkpoint 均为 `44`，两跳结果为 3 个节点和 2 条边，Projector 重建后验证与幂等检查通过，死信数为 `0`；MCP 清理删除 3 个运行资产且 `remainingLinks=0`，托管图服务、网络和临时卷均已删除。此前的 Docker Hub 拉取阻塞已通过本地固定镜像解决。
