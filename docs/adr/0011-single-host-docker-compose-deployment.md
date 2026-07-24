# Single-Host Docker Compose Deployment

## Status

**Accepted and locally verified.** The Web console and authoritative PostgreSQL database run as independent Docker Compose services on one host. MCP remains a client-side stdio process.

- Stable ADR/MCP ID: `adr-single-host-docker-compose-deployment`
- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`

## Context

SpecForge needs a repeatable first deployment profile that can run the Web application and its authoritative PostgreSQL store on one Linux host without exposing the database to the host network. The existing development server and local database processes are not a deployment artifact. The profile must support future replacement with an enterprise PostgreSQL connection string without changing application code or the Web image.

## Decision

Use a two-service Docker Compose topology: a Next.js Web container and PostgreSQL 16 container. PostgreSQL persists data in the `specforge_pgdata` named volume and is reachable only through the Compose network. The Web container waits for database TCP availability, applies `prisma db push --skip-generate` idempotently, then starts the standalone Next.js server. It never runs seed or cleanup operations at startup.

The same Web image supports external PostgreSQL through `DATABASE_URL` and a Compose override that removes the bundled database service. MCP is not a network service in this topology; authorized Agents continue to launch it through stdio with the appropriate database connection.

## Alternatives

1. **Run PostgreSQL on the host and expose port 5432.** Rejected because it couples deployment to host state and expands the database network surface.
2. **Deploy MCP as an HTTP container.** Rejected because the current supported MCP transport is stdio and production HTTP authorization is deferred.
3. **Put Web and PostgreSQL in one container.** Rejected because upgrades, backup, persistence, and failure isolation would be unsafe.

## Consequences

- Positive: One Compose command builds and starts the Web and database services.
- Positive: PostgreSQL is private to the Compose network and survives container replacement through a named volume.
- Positive: An external enterprise PostgreSQL migration changes configuration, not the Web image or application code.
- Tradeoff: The entrypoint applies the Prisma schema at startup and exits if schema application fails.
- Tradeoff: TLS termination, production identity, and public MCP transport remain outside this single-host deployment increment.

## Constraints

- `postgres` must not publish a host database port in the bundled deployment profile.
- Runtime secrets are supplied from ignored `deploy/.env`; no credential is committed.
- Startup must not execute `db:seed`, destructive cleanup, or any direct design-fact mutation.
- PostgreSQL remains authoritative; NebulaGraph is not deployed by this profile.
- Completion requires the health endpoint, Web restart persistence check, and MCP design-fact read-back to pass.

## Evidence

- **Verified:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` passed.
- **Verified:** `docker compose --env-file deploy/.env.example -f deploy/compose.yaml build web` produced the standalone Web image.
- **Verified:** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` passed with an isolated stack on port 3010; `/healthz` passed before and after Web restart.

## 中文本地化 / Chinese Localization

### 状态

**已接受并完成本地验证。** Web 控制台和权威 PostgreSQL 数据库以独立 Docker Compose 服务运行在单台主机；MCP 仍保持为 Agent 侧 stdio 进程。

### 背景

SpecForge 需要一个可重复的首个部署形态，在单台 Linux 主机运行 Web 应用和权威 PostgreSQL，并且不向宿主机网络暴露数据库。现有开发服务器和本地数据库进程不是部署产物。该形态必须支持未来通过企业 PostgreSQL 连接串替换数据库，而无需修改应用代码或 Web 镜像。

### 决策

采用双服务 Docker Compose 拓扑：一个 Next.js Web 容器和一个 PostgreSQL 16 容器。PostgreSQL 使用命名卷 `specforge_pgdata` 持久化，仅能通过 Compose 网络访问。Web 容器等待数据库 TCP 可用，幂等执行 `prisma db push --skip-generate`，再启动独立输出的 Next.js 服务；启动时不运行种子或清理操作。

同一 Web 镜像通过 `DATABASE_URL` 和移除内置数据库的 Compose 覆盖文件支持外部 PostgreSQL。MCP 不是此拓扑中的网络服务；授权 Agent 继续使用适当数据库连接通过 stdio 启动 MCP。

### 备选方案

1. **在宿主机运行 PostgreSQL 并暴露 5432 端口。** 拒绝，因为会耦合宿主机状态并扩大数据库网络暴露面。
2. **将 MCP 部署为 HTTP 容器。** 拒绝，因为当前支持的 MCP 传输是 stdio，生产 HTTP 授权仍延期。
3. **把 Web 和 PostgreSQL 放进同一容器。** 拒绝，因为升级、备份、持久化和故障隔离会不安全。

### 后果

- 积极影响：一条 Compose 命令即可构建和启动 Web 与数据库服务。
- 积极影响：PostgreSQL 保持在 Compose 私有网络中，并通过命名卷跨容器替换保留数据。
- 积极影响：迁移到外部企业 PostgreSQL 只需修改配置，不改 Web 镜像或应用代码。
- 权衡：入口脚本在启动时应用 Prisma Schema，Schema 应用失败会使容器退出。
- 权衡：TLS 终结、生产身份和公共 MCP 传输不属于此单机部署增量。

### 约束

- 内置部署形态中的 `postgres` 不得发布宿主机数据库端口。
- 运行时秘密来自被忽略的 `deploy/.env`，不得提交凭据。
- 启动不得执行 `db:seed`、破坏性清理或任何直接设计事实变更。
- PostgreSQL 保持权威；此形态不部署 NebulaGraph。
- 完成要求健康端点、Web 重启持久性检查和 MCP 设计事实回读均通过。

### 证据

- **已验证：** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly` 通过。
- **已验证：** `docker compose --env-file deploy/.env.example -f deploy/compose.yaml build web` 已生成独立输出 Web 镜像。
- **已验证：** `powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live` 在端口 3010 的隔离栈通过；Web 重启前后 `/healthz` 均通过。
