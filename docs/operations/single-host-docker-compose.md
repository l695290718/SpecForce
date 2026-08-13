# Single-Host Docker Compose Operations

The supported operator entrypoints are `deploy/scripts/start.ps1`, `status.ps1`, and `stop.ps1`. They manage Web, PostgreSQL, the one-shot first-startup Bootstrap, and Knowledge Projector as one deployment boundary. The default Web port is `3010`; local development on `3000` is separate.

## First Deployment

Run on the Linux host that will operate SpecForge:

```bash
git clone <your-SpecForge-repository-url> SpecForge
cd SpecForge
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
# Edit deploy/.env and replace POSTGRES_PASSWORD and the 3A cursor secret.
pwsh -File deploy/scripts/start.ps1
pwsh -File deploy/scripts/status.ps1
```

On Windows, run the same scripts in PowerShell as `./deploy/scripts/start.ps1` and `./deploy/scripts/status.ps1`.

The bundled PostgreSQL service is private to the Compose network. Do not add a host port mapping merely to let the Web container connect; Web uses `postgres:5432` internally.

## Operations

```bash
# Follow application logs when investigating a failure.
docker compose --env-file deploy/.env -f deploy/compose.yaml logs -f web

# Rebuild after pulling a new application revision.
git pull --ff-only
pwsh -File deploy/scripts/start.ps1

# Stop services while retaining the PostgreSQL volume.
pwsh -File deploy/scripts/stop.ps1
```

The Web entrypoint runs `prisma db push --skip-generate` before the server starts. The separate direct Bootstrap service runs the versioned database initialization only for a new empty database. The subsequent governed 3A Bootstrap service uses MCP to create the exact-Scope baseline and projection, waits for `READY`, and closes its design-change session. The direct Bootstrap does not run `db:seed` or MCP, and it never repeats after the configured version is `COMPLETED`. A non-empty database without Bootstrap state fails closed.

## Backup And Restore

Load deployment variables into the shell before operating on the private database:

```bash
set -a
. deploy/.env
set +a
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "specforge-$(date +%F).sql"
```

To restore, stop Web writes, restore the dump into the existing bundled PostgreSQL database, start Web, then verify health:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml stop web
cat specforge-YYYY-MM-DD.sql | docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose --env-file deploy/.env -f deploy/compose.yaml start web
curl --fail http://localhost:3010/healthz
```

Before declaring a design change complete, run the repository's MCP read-back checks from an authorized Agent environment using the deployed database connection.

## External PostgreSQL

For an enterprise PostgreSQL service, set `DATABASE_URL`, `SPECFORGE_EXTERNAL_PG_HOST`, and optionally `SPECFORGE_EXTERNAL_PG_PORT` in `deploy/.env`. Then start only Web with the external override:

```bash
pwsh -File deploy/scripts/start.ps1 -ExternalPostgres
```

The Web image is unchanged. External database TLS, routing, backups, availability, and credentials are owned by the database platform. Do not run the bundled `postgres` service in this mode.

## Verification

On a Windows development machine, after creating `deploy/.env`, run:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live
```

The live check builds and starts the stack, verifies `/healthz` before and after a Web restart, and confirms the scoped design-asset row count is unchanged across that restart.

The scripts do not run recurring `db:seed`, cleanup, reset, `down -v`, MCP, or NebulaGraph. PostgreSQL remains authoritative and its named volume is preserved by `stop.ps1`.
