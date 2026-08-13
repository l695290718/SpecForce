# Single-Host Docker Compose Deployment

## Status

**Accepted and locally verified.** The Web console, authoritative PostgreSQL database, direct first-startup Bootstrap, governed 3A Bootstrap, and Knowledge Projector run as independent Docker Compose services on one host. The direct Bootstrap initializes a fresh empty database once; the governed 3A Bootstrap invokes MCP, waits for a published PostgreSQL projection, and closes its design-change session before Web starts. The supported operator entrypoints are `deploy/scripts/start.ps1`, `status.ps1`, and `stop.ps1`; the default Web host port is 3010.

- Stable ADR/MCP ID: `adr-single-host-docker-compose-deployment`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge needs a repeatable first deployment profile that can run the Web application and its authoritative PostgreSQL store on one Linux host without exposing the database to the host network. The existing development server and local database processes are not a deployment artifact. The profile must support future replacement with an enterprise PostgreSQL connection string without changing application code or the Web image.

## Decision

Use a five-service Docker Compose topology: a Next.js Web container, PostgreSQL 16, a one-shot direct database Bootstrap container, the asynchronous Knowledge Projector, and a one-shot governed 3A Bootstrap MCP client. PostgreSQL persists data in the `specforge_pgdata` named volume and is reachable only through the Compose network. Direct Bootstrap applies the schema, authored catalog, and canonical relationship event seed in one guarded transaction on a fresh database; the governed 3A Bootstrap then calls the MCP design-change, baseline, projection-build, status, and close tools. Web waits for both one-shot services and the `READY` projection before starting. PowerShell lifecycle scripts validate Docker readiness, required credentials, and 3A cursor key configuration before starting; stop preserves the named volume.

The same Web image supports external PostgreSQL through `DATABASE_URL` and a Compose override that removes the bundled database service. MCP is not a network service in this topology; authorized Agents continue to launch it through stdio with the appropriate database connection.

The governed 3A Bootstrap is restart-idempotent for an already-published `legacy-design-assets` baseline in the exact Scope. A full Docker stop/start reuses that published baseline and projection instead of attempting a second `KnowledgeChangeSet` sequence, while a changed source digest remains eligible for a new governed baseline.

## Alternatives

1. **Run PostgreSQL on the host and expose port 5432.** Rejected because it couples deployment to host state and expands the database network surface.
2. **Deploy MCP as an HTTP container.** Rejected because the current supported MCP transport is stdio and production HTTP authorization is deferred.
3. **Put Web and PostgreSQL in one container.** Rejected because upgrades, backup, persistence, and failure isolation would be unsafe.

## Consequences

Existing SpecForge databases are adopted only through the explicit `SPECFORGE_BOOTSTRAP_ADOPT_EXISTING=1` one-shot setting. Adoption records deployment ownership and repairs relationship projections without reseeding authored assets; the default remains fail-closed for unknown non-empty databases.

- Positive: One operator command builds and starts the Web, database, Bootstrap, and projector services.
- Positive: PostgreSQL is private to the Compose network and survives container replacement through a named volume.
- Positive: An external enterprise PostgreSQL migration changes configuration, not the Web image or application code.
- Tradeoff: The entrypoint applies the Prisma schema at startup and exits if schema application fails.
- Tradeoff: TLS termination, production identity, and public MCP transport remain outside this single-host deployment increment.

## Constraints

- `postgres` must not publish a host database port in the bundled deployment profile.
- Runtime secrets are supplied from ignored `deploy/.env`; no credential is committed.
- Direct Startup Bootstrap must not execute `db:seed`, destructive cleanup, or any direct design-fact mutation outside the versioned first-startup initialization transaction. The separate governed 3A Bootstrap is explicitly allowed to invoke the MCP baseline and projection tools after direct Bootstrap succeeds.
- The default host Web port is 3010; port 3000 remains available for local development and is not managed by deployment scripts.
- `SPECFORGE_3A_CURSOR_KEYS` and `SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID` are required for the 3A Web boundary.
- PostgreSQL remains authoritative; NebulaGraph is not deployed by this profile.
- Completion requires the health endpoint, Web restart persistence check, and MCP design-fact read-back to pass.

## Evidence

- Existing local PostgreSQL adoption was verified as a single exact `com.huawei.celon.desiner` Scope with 29 `DesignAsset`, 7 `Proposal`, 4 `ContextPack`, and 58 `AssetLink` rows. `SPECFORGE_BOOTSTRAP_ADOPT_EXISTING=1` is a one-shot, non-destructive relationship-repair and ownership-recording path; default startup remains fail-closed.
- The Knowledge Projector image build and runtime were verified to include `@specforge/knowledge-query` and the workspace package paths required by its compiled ESM imports.
- Deployment configures a five-minute Knowledge Projector lease (`SPECFORGE_KNOWLEDGE_PROJECTOR_LEASE_MS`) for bounded startup projections; the code validates the value between one second and one hour.
- The Projector renews an owned lease before batch persistence, architecture-unit materialization, and publication so long-running batches cannot lose a valid deployment lease between phases.

- **Verified:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed.
- **Verified:** `docker compose --env-file deploy/.env.example -f deploy/compose.yaml build web` produced the standalone Web image.
- **Verified:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` passed with an isolated stack on port 3010; `/healthz` passed before and after Web restart.
- **Added:** `deploy/scripts/start.ps1`, `deploy/scripts/status.ps1`, and `deploy/scripts/stop.ps1` provide the supported lifecycle; they preserve `specforge_pgdata` and do not manage local port 3000, MCP stdio, or NebulaGraph.
- **Verified:** PowerShell parser accepted `deploy/scripts/common.ps1`, `start.ps1`, `status.ps1`, and `stop.ps1`; the environment template check accepted the 3A cursor key JSON.
- **Verified:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed after the default 3010 port and cursor-key environment changes; `git diff --check` passed.
- **Verified:** `pnpm --filter @specforge/knowledge-projector bootstrap:typecheck`, `pnpm --filter @specforge/mcp-server typecheck`, `pnpm exec prisma validate`, and focused Vitest checks passed for the governed relationship-projection bootstrap increment.
- **Verified:** `docker build -f deploy/three-a-bootstrap.Dockerfile -t specforge-three-a-bootstrap:local .` and `docker build -f deploy/bootstrap.Dockerfile -t specforge-bootstrap:local .` completed successfully.
- **Verified:** The governed 3A Bootstrap client now waits for `get_3a_projection_build=READY` and closes the same MCP design-change session as `CONVERGED`; failure closes it as `BLOCKED` with a retry reason.
- **Verified:** Full `deploy/scripts/stop.ps1` followed by `deploy/scripts/start.ps1` preserved the PostgreSQL volume; the restart reused the published exact-Scope baseline, completed 3A bootstrap with `idempotent=true`, returned the existing `READY` projection with 261 nodes and 156 edges, and started Web on port 3010 with `/healthz=200`.

## 中文本地化 / Chinese Localization

### 状态

**已接受并完成本地验证。** Web 控制台和权威 PostgreSQL 数据库以独立 Docker Compose 服务运行在单台主机；MCP 仍保持为 Agent 侧 stdio 进程。

### 背景

SpecForge 需要一个可重复的首个部署形态，在单台 Linux 主机运行 Web 应用和权威 PostgreSQL，并且不向宿主机网络暴露数据库。现有开发服务器和本地数据库进程不是部署产物。该形态必须支持未来通过企业 PostgreSQL 连接串替换数据库，而无需修改应用代码或 Web 镜像。

### 决策

采用双服务 Docker Compose 拓扑：一个 Next.js Web 容器和一个 PostgreSQL 16 容器。PostgreSQL 使用命名卷 `specforge_pgdata` 持久化，仅能通过 Compose 网络访问。Web 容器等待数据库 TCP 可用，幂等执行 `prisma db push --skip-generate`，再启动独立输出的 Next.js 服务；启动时不运行种子或清理操作。

同一 Web 镜像通过 `DATABASE_URL` 和移除内置数据库的 Compose 覆盖文件支持外部 PostgreSQL。MCP 不是此拓扑中的网络服务；授权 Agent 继续使用适当数据库连接通过 stdio 启动 MCP。

对于精确 Scope 中已经发布的 `legacy-design-assets` baseline，受治理的 3A Bootstrap 支持重启幂等。完整停止并重新启动 Docker 后会复用已发布 baseline 和投影，不会再次提交相同的 `KnowledgeChangeSet` sequence；源摘要发生变化时仍可通过新的治理流程生成新 baseline。

### 备选方案

1. **在宿主机运行 PostgreSQL 并暴露 5432 端口。** 拒绝，因为会耦合宿主机状态并扩大数据库网络暴露面。
2. **将 MCP 部署为 HTTP 容器。** 拒绝，因为当前支持的 MCP 传输是 stdio，生产 HTTP 授权仍延期。
3. **把 Web 和 PostgreSQL 放进同一容器。** 拒绝，因为升级、备份、持久化和故障隔离会不安全。

### 后果

现有 SpecForge 数据库只有在显式设置 `SPECFORGE_BOOTSTRAP_ADOPT_EXISTING=1` 的一次性启动中才会被接管；接管会记录部署所有权并修复关系投影，不会重新铺设设计资产；默认启动仍会对未知的非空数据库快速失败。

- 积极影响：一条 Compose 命令即可构建和启动 Web 与数据库服务。
- 积极影响：PostgreSQL 保持在 Compose 私有网络中，并通过命名卷跨容器替换保留数据。
- 积极影响：迁移到外部企业 PostgreSQL 只需修改配置，不改 Web 镜像或应用代码。
- 权衡：入口脚本在启动时应用 Prisma Schema，Schema 应用失败会使容器退出。
- 权衡：TLS 终结、生产身份和公共 MCP 传输不属于此单机部署增量。

### 约束

- 内置部署形态中的 `postgres` 不得发布宿主机数据库端口。
- 运行时秘密来自被忽略的 `deploy/.env`，不得提交凭据。
- 启动不得执行 `db:seed`、破坏性清理或任何直接设计事实变更。
- 默认 Web 宿主机端口为 3010；3000 端口保留给本地开发，部署脚本不管理该端口。
- 3A Web 边界必须配置 `SPECFORGE_3A_CURSOR_KEYS` 和 `SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID`。
- PostgreSQL 保持权威；此形态不部署 NebulaGraph。
- 完成要求健康端点、Web 重启持久性检查和 MCP 设计事实回读均通过。

### 证据

- **已验证：** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` 通过。
- **已验证：** `docker compose --env-file deploy/.env.example -f deploy/compose.yaml build web` 已生成独立输出 Web 镜像。
- **已验证：** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` 在端口 3010 的隔离栈通过；Web 重启前后 `/healthz` 均通过。
- **已验证：** 完整执行 `deploy/scripts/stop.ps1` 后再执行 `deploy/scripts/start.ps1`，PostgreSQL 数据卷保持不变；重启复用了精确 Scope 的已发布 baseline，3A Bootstrap 返回 `idempotent=true`，复用 `READY` 投影（261 个节点、156 条关系），Web 在 3010 端口启动且 `/healthz=200`。
