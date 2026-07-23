# Single-Host Docker Compose Operations

## First Deployment

Run on the Linux host that will operate SpecForge:

```bash
git clone <your-SpecForge-repository-url> SpecForge
cd SpecForge
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
# Edit deploy/.env and replace POSTGRES_PASSWORD before continuing.
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
curl --fail http://localhost:3000/healthz
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

The bundled PostgreSQL service is private to the Compose network. Do not add a host port mapping merely to let the Web container connect; Web uses `postgres:5432` internally.

## Operations

```bash
# Follow application logs.
docker compose --env-file deploy/.env -f deploy/compose.yaml logs -f web

# Rebuild after pulling a new application revision.
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build

# Stop services while retaining the PostgreSQL volume.
docker compose --env-file deploy/.env -f deploy/compose.yaml down
```

The Web entrypoint runs `prisma db push --skip-generate` before the server starts. It does not run `db:seed`, so starting or upgrading the Web service never writes fixture data or removes existing design facts.

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
curl --fail http://localhost:3000/healthz
```

Before declaring a design change complete, run the repository's MCP read-back checks from an authorized Agent environment using the deployed database connection.

## External PostgreSQL

For an enterprise PostgreSQL service, set `DATABASE_URL`, `SPECFORGE_EXTERNAL_PG_HOST`, and optionally `SPECFORGE_EXTERNAL_PG_PORT` in `deploy/.env`. Then start only Web with the external override:

```bash
docker compose --env-file deploy/.env \
  -f deploy/compose.yaml \
  -f deploy/compose.external-postgres.yaml \
  up -d --build
```

The Web image is unchanged. External database TLS, routing, backups, availability, and credentials are owned by the database platform. Do not run the bundled `postgres` service in this mode.

## Verification

On a Windows development machine, after creating `deploy/.env`, run:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live
```

The live check builds and starts the stack, verifies `/healthz` before and after a Web restart, and confirms the scoped design-asset row count is unchanged across that restart.
