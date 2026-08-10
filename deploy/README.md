# SpecForge Design Center deployment

The default deployment starts the Web service, PostgreSQL, and the asynchronous Knowledge Projector. The 3A architecture view is PostgreSQL-first; NebulaGraph is optional and is not started by the default Compose file.

## Bundled PostgreSQL

1. Copy `deploy/.env.example` to `deploy/.env` and set a long random `POSTGRES_PASSWORD`.
2. Start the stack:

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

3. Open `http://localhost:3000/` and check `docker compose --env-file deploy/.env -f deploy/compose.yaml ps`.

The Web container runs the Prisma schema push on startup. The Projector consumes queued `3a.v2` builds from the same PostgreSQL database and exposes an internal `/health` endpoint on port `8091`.

## External PostgreSQL

Set `DATABASE_URL` and `SPECFORGE_EXTERNAL_PG_HOST` in `deploy/.env`, then apply the overlay:

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.external-postgres.yaml up -d --build
```

Both Web and Knowledge Projector use the external `DATABASE_URL`. The bundled PostgreSQL service and volume are omitted.

## Configuration verification

Render both topologies without starting containers:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly
```

Keep `deploy/.env` out of source control. Production must also configure the Web authentication provider and `SPECFORGE_3A_CURSOR_KEYS` with `SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID`; the 3A Web boundary fails closed when those are missing.
