# SpecForge Design Center deployment

This directory provides the supported single-host deployment. It manages one Web service, one authoritative PostgreSQL service, a direct first-startup Bootstrap service, a governed one-shot 3A baseline/projection Bootstrap service, the asynchronous Knowledge Projector, the connector Worker, and the exact-Scope Requirement Assessment Worker. The default Web port is `3010` so it does not conflict with a local development server on `3000`.

PostgreSQL is authoritative for authored design facts and relationship events. On a brand-new empty database, the direct one-shot Bootstrap service creates the authored catalog and canonical relationship events. After it succeeds, the governed 3A Bootstrap service invokes the MCP tools `prepare_design_change`, `bootstrap_3a_from_design_assets`, `request_3a_projection_build`, `get_3a_projection_build`, and `close_design_change_session`; it waits for a `READY` projection before the Web service is released. Business design changes continue through MCP. The startup scripts never run a recurring seed, clean, reset, or delete the PostgreSQL volume. NebulaGraph is optional and is not started by this deployment profile. MCP remains an Agent-launched stdio process, not a network container.

## First Startup

Run these commands from the repository root in PowerShell:

```powershell
# Windows: start Docker Desktop and wait for the Docker Engine before continuing.
Copy-Item deploy/.env.example deploy/.env
# Edit deploy/.env. Set a strong unique POSTGRES_PASSWORD.
.\deploy\scripts\start.ps1
```

`start.ps1` does not start Docker Desktop or the Docker daemon. It fails fast with a clear readiness error when Docker is unavailable. The first run validates Docker, the PostgreSQL password, the 3A cursor key JSON, and the active key ID. It then starts PostgreSQL, runs the direct Bootstrap only when the database is empty, builds the governed 3A baseline and PostgreSQL projection, waits for `/healthz`, and prints the Web URL.

If either one-shot initializer fails, the command prints the failure and keeps the PostgreSQL volume intact. Inspect `docker compose --env-file deploy/.env -f deploy/compose.yaml logs bootstrap` or `... logs three-a-bootstrap`; do not delete the volume unless the database is intentionally being retired.

Open [http://localhost:3010](http://localhost:3010).

## Daily Operations

```powershell
# Start or update the stack. Rebuilds the Web and Projector images by default.
.\deploy\scripts\start.ps1

# Start without rebuilding images.
.\deploy\scripts\start.ps1 -NoBuild

# Inspect containers, Web health, and PostgreSQL readiness.
.\deploy\scripts\status.ps1

# Backfill the bounded bilingual search projection for an existing database.
pnpm design-read:rebuild

# Stop containers and preserve the PostgreSQL volume.
.\deploy\scripts\stop.ps1
```

`stop.ps1` is reversible. It does not run `down -v`, remove images, or delete data. There is intentionally no reset script in this deployment directory.

If the database already contains authored rows but has no completed Bootstrap record, startup stops with `NON_EMPTY_UNINITIALIZED`. This protects an existing database from being claimed or overwritten automatically. A completed Bootstrap record makes later starts a no-op for initialization.

For a verified existing SpecForge database, set `SPECFORGE_BOOTSTRAP_ADOPT_EXISTING=1` for one startup. The one-shot service records deployment ownership and repairs canonical relationship projections without reseeding or deleting authored assets. After successful adoption, return the value to `0`.

## External PostgreSQL

Set `DATABASE_URL`, `SPECFORGE_EXTERNAL_PG_HOST`, and optionally `SPECFORGE_EXTERNAL_PG_PORT` in `deploy/.env`, then use the same lifecycle scripts with `-ExternalPostgres`:

```powershell
.\deploy\scripts\start.ps1 -ExternalPostgres
.\deploy\scripts\status.ps1 -ExternalPostgres
.\deploy\scripts\stop.ps1 -ExternalPostgres
```

The external overlay removes the bundled PostgreSQL container and volume. Web and Knowledge Projector use the configured `DATABASE_URL`. This is the intended production replacement path when PostgreSQL is managed by the enterprise platform.

## Environment Contract

Required in `deploy/.env`:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_USER` | Bundled PostgreSQL user; retained for Compose interpolation and bundled mode. |
| `POSTGRES_PASSWORD` | Bundled PostgreSQL password; never use the example placeholder. |
| `POSTGRES_DB` | Bundled PostgreSQL database name. |
| `SPECFORGE_WEB_PORT` | Host port for Web; defaults to `3010`. |
| `SPECFORGE_ASSESSMENT_RECONCILIATION_STATUS` | Assessment governance gate; keep `UNVERIFIED` until the scoped design-fact reconciliation passes, then set `CONVERGED`. |
| `SPECFORGE_ASSESSMENT_WORKER_INTERVAL_MS` | Assessment Worker poll interval; defaults to `5000`. |
| `SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID` | Active key ID used to sign bounded 3A cursors. |
| `SPECFORGE_3A_CURSOR_KEYS` | JSON object of key IDs to base64-encoded secrets. |
| `SPECFORGE_WEB_AUTH_MODE` | `static` for an explicitly configured local/deployment principal, or `production` when an injected WebPrincipalResolver is provided by the host integration. |
| `SPECFORGE_WEB_PRINCIPAL_CLAIMS` | JSON claims for `static` mode. Include only the exact application-service grants the Web user may read; never put raw bearer tokens here. |

Production must replace the example 3A secret and configure the Web authentication provider. The 3A boundary fails closed when cursor keys are missing or invalid.

## Self-Managed Identity Cutover

The deployment profile supports the local-account identity path without a shared Web principal. Set `SPECFORGE_IDENTITY_MODE=local-account`, `SPECFORGE_WEB_AUTH_MODE=local-account`, a unique pepper, an HTTPS Web origin, and an explicit TLS termination boundary. Run the read-only cutover gate before switching traffic:

```powershell
pnpm identity:cutover-check
```

The gate fails when seed identity, static Web claims, a shared MCP bearer, placeholder secrets, HTTP origin, or default cursor keys remain. It does not revoke sessions or apply grants. Create the first administrator with `pnpm identity:bootstrap` from a protected deployment host, then use the Web control plane to create Agents and issue their one-time credentials. Keep the reviewed migration report and its administrator approval as a separate maintenance-window step.

For bundled Compose, the application receives its internal PostgreSQL URL from Compose. Run database-backed identity commands inside the Web image or provide an explicit PostgreSQL `DATABASE_URL`; never place a production password in a command argument.

## Configuration Verification

Render both bundled and external topologies without starting containers:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly
```

For a live deployment check, create `deploy/.env` first and run:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/verify-compose.ps1 -Live
```

The live check validates Web health and design-asset count across a Web restart. It does not seed or mutate design facts.

## What The Scripts Manage

Managed: Docker Web, bundled PostgreSQL, direct first-startup Bootstrap, governed 3A Bootstrap, Knowledge Projector, Connector Worker, Requirement Assessment Worker, health checks, and the named PostgreSQL volume.

Not managed: local Node development on port `3000`, MCP stdio client processes, NebulaGraph, TLS termination, enterprise identity, backups, and external PostgreSQL lifecycle.
