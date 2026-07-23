# Single-Host Docker Compose Deployment Design

## Status

Proposed for review. This design packages the SpecForge Web application and its authoritative PostgreSQL database for one Linux host. MCP remains a client-side stdio process and is not deployed as a network service.

## Goals

- Run the Next.js Web application and PostgreSQL with one `docker compose up -d` command.
- Keep PostgreSQL private to the Compose network and persist its data in a named volume.
- Make the application wait for a healthy database, apply the existing Prisma schema, and serve on a configurable Web port.
- Allow a future external PostgreSQL migration by replacing `DATABASE_URL` without changing the Web image.
- Provide repeatable environment, backup, restore, upgrade, and health-check operations.

## Non-Goals

- Deploy MCP as HTTP, SSE, or another network transport.
- Add NebulaGraph, Kubernetes, TLS termination, identity providers, or production RBAC in this increment.
- Replace Prisma schema management with an unreviewed migration policy.

## Architecture

```text
Browser --> host:${SPECFORGE_WEB_PORT:-3000} --> web container
                                                   |
                                                   | DATABASE_URL=postgresql://...@postgres:5432/specforge
                                                   v
                                            postgres container
                                                   |
                                                   v
                                      named Docker volume: specforge_pgdata
```

The `web` image is a multi-stage Node 22 build. Runtime dependencies are copied into a small production stage. The image starts a small entrypoint that waits for PostgreSQL, runs `prisma db push --skip-generate`, then starts the existing Next.js production server. Schema application is idempotent; it does not seed or erase records.

`postgres` uses PostgreSQL 16 with a named volume. It receives credentials only through a server-side environment file. It has no published database port by default. Docker Compose service discovery lets `web` use `postgres:5432` internally.

## Configuration

`deploy/.env.example` defines the deployment contract:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` configure the bundled database.
- `SPECFORGE_WEB_PORT` configures the host-published Web port.
- `DATABASE_URL` is optional. If unset, Compose constructs the bundled PostgreSQL URL. If set, the Web service uses the supplied external PostgreSQL URL and the `postgres` profile can be omitted.
- `SPECFORGE_MCP_*` variables remain optional client-side configuration and are not used to start a server container.

Secrets are never committed. Operators copy the example to `deploy/.env`, set a strong password, and restrict file permissions.

## Runtime Behavior

1. Docker starts PostgreSQL and waits for `pg_isready` to pass.
2. Docker starts `web` after the database health check passes.
3. The Web entrypoint applies the Prisma schema idempotently and starts `next start`.
4. Web health is exposed through an HTTP endpoint suitable for Docker health checks.
5. Restarting the Web container never seeds, deletes, or rewrites existing design facts.

If the schema application fails, the Web container exits. The failure is visible through `docker compose logs web`; it must not serve with an unknown schema.

## Operations

- Start or upgrade: `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build`.
- Inspect: `docker compose --env-file deploy/.env -f deploy/compose.yaml ps` and `logs`.
- Backup: `docker compose ... exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > specforge-backup.sql`.
- Restore: stop `web`, restore through `psql` into the same database, then start `web` and verify `/healthz` plus the scoped design-fact checks.
- External PostgreSQL: set a complete `DATABASE_URL`, omit the bundled database profile, and run the same Web image. Network access, TLS, backups, and credentials are then owned by the external database platform.

## Verification

- `docker compose ... up -d --build` reaches healthy `postgres` and `web` services.
- `curl http://localhost:${SPECFORGE_WEB_PORT}/healthz` returns success.
- The Web Settings page redacts and displays the configured PostgreSQL connection target.
- A restart preserves an existing design asset and `pnpm design-facts:check` reports no missing, mismatched, out-of-scope, or blocked facts against the deployed database.
- A Compose configuration check validates both bundled PostgreSQL and external-URL modes.

## 中文本地化

### 目标

- 通过一条 `docker compose up -d` 命令在单台 Linux 主机运行 Next.js Web 应用和权威 PostgreSQL。
- PostgreSQL 仅在 Compose 内部网络可见，数据保存在命名卷中。
- Web 等待数据库健康、幂等应用现有 Prisma Schema，并通过可配置端口提供服务。
- 将来迁移到企业 PostgreSQL 时，只替换 `DATABASE_URL`，不修改 Web 镜像。

### 架构与运行

浏览器访问宿主机 Web 端口；Web 容器在内部网络使用 `postgres:5432` 访问 PostgreSQL。PostgreSQL 使用命名卷 `specforge_pgdata` 持久化。MCP 保持在 Agent 侧通过 stdio 启动，不作为网络容器部署。

Web 使用 Node 22 多阶段镜像。启动脚本先等待数据库、执行幂等的 `prisma db push --skip-generate`，再执行现有的 Next.js 生产启动命令。启动过程不会种子写入、删除或重写既有设计事实；Schema 应用失败时 Web 容器退出。

### 配置与运维

部署目录提供环境变量示例：PostgreSQL 凭据、Web 宿主机端口和可选的外部 `DATABASE_URL`。秘密仅保存在服务器 `deploy/.env`，不提交到 Git。默认 PostgreSQL 不发布宿主机端口；需要外部企业 PG 时，只配置完整连接串并停用内置数据库服务。

运维文档必须覆盖启动、升级、日志、备份、恢复、健康检查和外部 PostgreSQL 切换。完成条件包括两个容器健康、`/healthz` 成功、重启后设计资产仍存在，以及针对部署数据库的设计事实回读检查通过。
