# Single-Host Docker Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the SpecForge Next.js Web service and authoritative PostgreSQL database independently on one Linux host with Docker Compose.

**Architecture:** A multi-stage Node 22 image builds `@specforge/web` and runs Next.js in standalone mode. A Web entrypoint waits for the private Compose PostgreSQL service, applies the Prisma schema idempotently, and then serves the application. Compose uses a named volume for PostgreSQL, health checks for both services, and environment-file-driven configuration so the Web image can later target an external PostgreSQL instance.

**Tech Stack:** Docker Compose v2, Docker multi-stage builds, Node.js 22, pnpm 9.15.4, Next.js 15, Prisma 6, PostgreSQL 16.

## Global Constraints

- PostgreSQL remains authoritative for all authored assets and relationship events; no NebulaGraph service is added.
- MCP remains client-side stdio and is not exposed as a Docker network service.
- The bundled PostgreSQL port is private to the Compose network by default.
- Secrets are supplied through an ignored `deploy/.env` file and are never committed.
- Schema initialization must be idempotent and must never seed, delete, or rewrite design facts.
- Every human-facing design record uses canonical English and a complete Chinese overlay.
- Completion requires MCP persistence and read-back of matching design facts in the exact Designer Scope.

---

## File Structure

- Create: `apps/web/app/healthz/route.ts` - process and database health endpoint for Docker and load-balancer probes.
- Create: `apps/web/app/healthz/route.test.ts` - health endpoint behavior tests with a mocked Prisma connection.
- Modify: `apps/web/next.config.mjs` - enable Next standalone production output.
- Create: `deploy/Dockerfile` - reproducible multi-stage Web image.
- Create: `deploy/web-entrypoint.sh` - database wait, idempotent schema application, and Web server startup.
- Create: `deploy/compose.yaml` - private PostgreSQL plus Web production topology.
- Create: `deploy/.env.example` - non-secret deployment configuration contract.
- Create: `deploy/compose.external-postgres.yaml` - optional override that removes the bundled PostgreSQL service when `DATABASE_URL` targets an external database.
- Create: `deploy/scripts/verify-compose.ps1` - local Compose configuration and health verification script.
- Create: `docs/operations/single-host-docker-compose.md` - Linux-host runbook, backup, restore, upgrade, and external PostgreSQL transition.
- Modify: `README.md` - concise deployment entry point and links to the runbook.
- Create: `docs/adr/0011-single-host-docker-compose-deployment.md` - bilingual runtime-topology decision.
- Modify: `docs/design-facts/baseline-manifest.json` - map ADR-0011, Proposal, Context Pack, typed links, and evidence to MCP synchronization.
- Modify: `docs/TODO.md` - mark the single-host deployment item complete only after live evidence passes.

## Task 1: Add a Database-Aware Web Health Endpoint

**Files:**
- Create: `apps/web/app/healthz/route.ts`
- Create: `apps/web/app/healthz/route.test.ts`
- Modify: `apps/web/next.config.mjs`

**Interfaces:**
- Consumes: `DATABASE_URL` and the Prisma client used by Web data access.
- Produces: `GET /healthz`, returning `{ status: "ok" }` with HTTP 200 only when PostgreSQL accepts a query; returns `{ status: "unavailable" }` with HTTP 503 otherwise.

- [ ] **Step 1: Write the failing health-route tests**

```ts
it("returns 200 when PostgreSQL is reachable", async () => {
  mockPrisma.$queryRawUnsafe.mockResolvedValue([{ ok: 1 }]);
  const response = await GET();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});

it("returns 503 when PostgreSQL is unavailable", async () => {
  mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("connection refused"));
  const response = await GET();
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({ status: "unavailable" });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run apps/web/app/healthz/route.test.ts`

Expected: FAIL because `apps/web/app/healthz/route.ts` does not exist.

- [ ] **Step 3: Implement the route and standalone output**

```ts
import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
```

Add `output: "standalone"` to the existing Next configuration without removing `transpilePackages` or `typedRoutes`.

- [ ] **Step 4: Run focused verification**

Run: `pnpm exec vitest run apps/web/app/healthz/route.test.ts && pnpm --filter @specforge/web typecheck`

Expected: health tests pass and the Web typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/healthz/route.ts apps/web/app/healthz/route.test.ts apps/web/next.config.mjs
git commit -m "feat: add deployment health endpoint"
```

## Task 2: Package the Web Service and Bundled PostgreSQL

**Files:**
- Create: `deploy/Dockerfile`
- Create: `deploy/web-entrypoint.sh`
- Create: `deploy/compose.yaml`
- Create: `deploy/.env.example`
- Create: `deploy/compose.external-postgres.yaml`

**Interfaces:**
- Consumes: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SPECFORGE_WEB_PORT`, and optional `DATABASE_URL` from `deploy/.env`.
- Produces: `web` at `${SPECFORGE_WEB_PORT:-3000}`, internal `postgres:5432`, health checks, and named volume `specforge_pgdata`.

- [ ] **Step 1: Write a failing Compose contract check**

Create a small PowerShell check that uses Docker's JSON render output and Node's built-in JSON parser. It must assert the bundled configuration contains `web`, `postgres`, no published `5432` port, a `specforge_pgdata` volume, and health checks for both services. Assert the external override rendered configuration has no `postgres` service.

```powershell
$bundled = docker compose --env-file deploy/.env.example -f deploy/compose.yaml config --format json
$bundled | node -e '
  const config = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!config.services.web.healthcheck || !config.services.postgres.healthcheck) process.exit(1);
  if (config.services.postgres.ports?.length) process.exit(1);
  if (!config.volumes.specforge_pgdata) process.exit(1);
'
```

- [ ] **Step 2: Run the check to verify it fails**

Run: `pwsh -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly`

Expected: FAIL because the deployment files do not exist.

- [ ] **Step 3: Add the multi-stage image, entrypoint, and Compose topology**

`deploy/Dockerfile` must use a Node 22 builder stage, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm db:generate`, and `pnpm --filter @specforge/web build`. The production stage must copy the standalone output, static assets, Prisma schema/client artifacts, and `web-entrypoint.sh`.

`deploy/web-entrypoint.sh` must fail fast and execute only these lifecycle actions:

```sh
until node -e 'const net=require("net"); const socket=net.connect({host:process.env.PGHOST,port:Number(process.env.PGPORT)}); socket.once("connect",()=>process.exit(0)); socket.once("error",()=>process.exit(1)); setTimeout(()=>process.exit(1),1000);' ; do sleep 1; done
pnpm exec prisma db push --skip-generate
exec node apps/web/.next/standalone/apps/web/server.js
```

Adapt the exact paths to the copied standalone layout. It must not invoke `db:seed`.

`deploy/compose.yaml` must define:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
  web:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${SPECFORGE_WEB_PORT:-3000}:3000"
```

Build `DATABASE_URL` for the bundled case with host `postgres`, never `localhost`. Do not define `ports` under `postgres`.

- [ ] **Step 4: Run configuration validation**

Run: `pwsh -File deploy/scripts/verify-compose.ps1 -ConfigurationOnly`

Expected: both bundled and external configuration assertions pass.

- [ ] **Step 5: Commit**

```bash
git add deploy/Dockerfile deploy/web-entrypoint.sh deploy/compose.yaml deploy/compose.external-postgres.yaml deploy/.env.example deploy/scripts/verify-compose.ps1
git commit -m "feat: package single-host Docker deployment"
```

## Task 3: Verify Container Startup, Data Preservation, and Operations

**Files:**
- Modify: `deploy/scripts/verify-compose.ps1`
- Create: `docs/operations/single-host-docker-compose.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `docker compose --env-file deploy/.env -f deploy/compose.yaml`.
- Produces: operator commands for start, logs, health, backup, restore, upgrade, shutdown, and external PostgreSQL deployment.

- [ ] **Step 1: Extend the verification script with live assertions**

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
Invoke-WebRequest "http://localhost:$env:SPECFORGE_WEB_PORT/healthz" -UseBasicParsing | Should -HaveStatusCode 200
docker compose --env-file deploy/.env -f deploy/compose.yaml restart web
Invoke-WebRequest "http://localhost:$env:SPECFORGE_WEB_PORT/healthz" -UseBasicParsing | Should -HaveStatusCode 200
```

Before the restart, insert a scoped disposable test asset through the MCP seed/client boundary, then read it after restart. Clean up only that exact disposable asset through the same authorized boundary.

- [ ] **Step 2: Run live verification to verify failure before documentation is added**

Run: `pwsh -File deploy/scripts/verify-compose.ps1 -Live`

Expected: FAIL before the deployment image and Compose topology exist.

- [ ] **Step 3: Write the runbook and README entry point**

The runbook must include exact Linux commands:

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
curl --fail http://localhost:3000/healthz
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > specforge-backup.sql
```

Document restore by stopping `web`, using `psql` in the `postgres` container, then starting `web` and running health plus design-fact read-back checks. Document external PostgreSQL by setting a complete `DATABASE_URL` and using `compose.external-postgres.yaml`; never publish the bundled PostgreSQL port only to support Web.

- [ ] **Step 4: Run live deployment verification**

Run: `pwsh -File deploy/scripts/verify-compose.ps1 -Live`

Expected: PostgreSQL and Web are healthy, `/healthz` returns 200 before and after a Web restart, and the disposable scoped asset survives restart.

- [ ] **Step 5: Commit**

```bash
git add deploy/scripts/verify-compose.ps1 docs/operations/single-host-docker-compose.md README.md
git commit -m "docs: add Docker deployment operations"
```

## Task 4: Record and Synchronize the Deployment Decision

**Files:**
- Create: `docs/adr/0011-single-host-docker-compose-deployment.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`
- Test: `scripts/design-fact-manifest.test.ts`

**Interfaces:**
- Consumes: verified deployment commands, exact Designer Scope, and the existing manifest-driven MCP synchronization script.
- Produces: bilingual ADR `adr-single-host-docker-compose-deployment`, its matching Proposal, Context Pack, Evidence assets, and typed `VALIDATES` links persisted through MCP.

- [ ] **Step 1: Write the failing manifest regression**

```ts
expect(manifest.decisions.some((decision) => decision.mcpAdrId === "adr-single-host-docker-compose-deployment")).toBe(true);
expect(manifest.decisions).toHaveLength(9);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run scripts/design-fact-manifest.test.ts`

Expected: FAIL because the ninth deployment ADR is absent.

- [ ] **Step 3: Add bilingual design facts and completion evidence**

Create ADR-0011 with English canonical sections and one-to-one Chinese localized sections for Context, Decision, Alternatives, Consequences, Constraints, and Evidence. Record the exact deployment topology, private PostgreSQL, no Dockerized MCP, schema initialization policy, backup/restore boundary, and external PostgreSQL replacement path.

Add a manifest entry with the exact Designer Scope, a matching deployment Proposal and Context Pack, typed links, and evidence commands for container health, restart preservation, `pnpm design-facts:sync`, and `pnpm design-facts:check`. Update `docs/TODO.md` only after those commands pass; do not mark NebulaGraph, multi-service comparison, or production authorization complete.

- [ ] **Step 4: Run design-fact synchronization and read-back**

Run:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'
$env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'
pnpm design-facts:federation:check
```

Expected: nine verified decisions, no missing, mismatched, out-of-scope, or blocked records; federation check returns `blocking: false`.

- [ ] **Step 5: Run final verification and commit**

Run:

```bash
pnpm exec vitest run scripts/design-fact-manifest.test.ts scripts/sync-design-facts.test.ts
pnpm typecheck
pwsh -File deploy/scripts/verify-compose.ps1 -Live
git diff --check
```

Expected: all commands exit 0.

```bash
git add docs/adr/0011-single-host-docker-compose-deployment.md docs/design-facts/baseline-manifest.json docs/TODO.md scripts/design-fact-manifest.test.ts
git commit -m "docs: record Docker deployment design facts"
```
