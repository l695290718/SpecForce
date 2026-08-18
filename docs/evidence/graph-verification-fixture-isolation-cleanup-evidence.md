# Evidence: Graph Verification Fixture Isolation and Cleanup

English is canonical. Chinese is the human-facing localization.

## Scope and sessions

- Parent Designer Scope: `com.huawei.celon.desiner`
- Verification application service: `com.huawei.celon.desiner.graph-verification`
- Verification Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`
- Registration session: `design-change-session:fc5f7fb2-f714-4b4a-82d1-2875928d3503`
- Exact verification preflight: `design-change-session:3d4eb219-5c97-4cab-a410-13ab9d969041`
- Verification preflight read `readAssetCount=0` and used anchor `verification-scope:graph-fixture-lifecycle`.
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
| managed live gate build | blocked while Docker Hub failed to fetch the pinned Go base image with `failed to fetch anonymous token` / `unexpected EOF`; no managed containers remained |
| managed live gate failure cleanup | run-scoped MCP cleanup executed after Compose failure; `assetIds=3`, `status=deleted`, `remainingLinks=0`; no stopped containers remained |
| live projection `--phase cleanup`, run `lifecycle-cleanup-check` | exact verification Scope; `assetIds=3`, `status=deleted`, `remainingLinks=0` |

The lifecycle implementation is complete locally. The live end-to-end gate remains externally blocked by Docker Hub image retrieval, not by an application or Scope error. Retry the same managed command after the pinned base images are available locally or the configured registry mirror is reachable.

## 证据：图验证夹具隔离与清理

英文是规范字段，中文用于面向人的本地化展示。

### Scope 与会话

- 父 Designer Scope：`com.huawei.celon.desiner`
- 验证应用服务：`com.huawei.celon.desiner.graph-verification`
- 验证 Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification`
- 注册会话：`design-change-session:fc5f7fb2-f714-4b4a-82d1-2875928d3503`
- 精确验证预检：`design-change-session:3d4eb219-5c97-4cab-a410-13ab9d969041`
- MCP ADR：`adr-graph-verification-fixture-isolation`；Proposal：`proposal-graph-verification-fixture-isolation`；Context Pack：`ctx-graph-verification-fixture-isolation`；Evidence：`evidence-graph-verification-fixture-isolation`

### 已实现行为与边界

验证 Scope 的用途是 `verification`，只授予精确读写权限，不继承产品 Scope；普通 Web Scope 选择器会排除它。夹具创建和清理均通过 MCP 边界并绑定显式运行 ID。历史清理在删除前校验 9 条精确夹具指纹。实时门禁现在使用独立 Compose 项目，仅管理 6 个图验证服务，使用 Docker 动态回环端口，分离主机和容器 PostgreSQL 连接，并在失败外层 finally 中清理。

实时端到端门禁目前受 Docker Hub 基础镜像拉取阻塞，错误为 `failed to fetch anonymous token` / `unexpected EOF`，不是应用或 Scope 错误。配置门禁和静态回归已通过；失败清理已验证成功，结果为 3 个资产被删除、状态 `deleted`、剩余关系 `0`。镜像可用或配置镜像代理后，必须重跑同一个托管 Live 命令。
