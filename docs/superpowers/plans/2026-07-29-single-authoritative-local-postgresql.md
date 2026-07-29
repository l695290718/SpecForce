# Single Authoritative Local PostgreSQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the complete authored SpecForge catalog into one canonical local PostgreSQL authority and point every active local process to it.

**Architecture:** `deploy-postgres-1` hosts a fresh `specforge_canonical` database as the canonical target. `specforge-graph-verify-postgres-1` is a protected source for the one-time restore and becomes disposable after cutover. The existing `deploy-postgres-1/specforge` database remains untouched as rollback evidence. Web, MCP, reconciliation, and graph projection receive a single explicit canonical `DATABASE_URL`; PostgreSQL remains authoritative and NebulaGraph remains derived.

**Tech Stack:** Docker Compose, PostgreSQL 16, `pg_dump`/`pg_restore`, Prisma, pnpm, Next.js.

## Global Constraints

- Never run `DROP DATABASE`, `TRUNCATE`, `prisma db push --accept-data-loss`, or a volume delete.
- Back up both databases before importing and preserve the source until every verification passes.
- Validate counts by table, `DesignAsset.type`, and `applicationServiceId`, plus stable IDs and relationship/outbox records.
- Use the exact Designer Scope `com.huawei.celon.desiner` and `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner` for scoped checks.
- Record the completed decision, evidence, Proposal, Context Pack, and typed links through MCP before declaring the cutover complete.

---

### Task 1: Capture a Recoverable Baseline

**Files:**
- Create: `artifacts/db-consolidation/2026-07-29/source-graph-verify.dump`
- Create: `artifacts/db-consolidation/2026-07-29/target-deploy.dump`
- Create: `artifacts/db-consolidation/2026-07-29/pre-import-fingerprint.txt`

**Interfaces:**
- Consumes: running `specforge-graph-verify-postgres-1` source and `deploy-postgres-1` target containers.
- Produces: immutable logical backups and read-only fingerprints for rollback and comparison.

- [ ] **Step 1: Stop local Web writer**

Run:

```powershell
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) { Stop-Process -Id $listener.OwningProcess -Force }
```

Expected: no process listens on port `3000`.

- [ ] **Step 2: Create source and target logical backups**

Run:

```powershell
New-Item -ItemType Directory -Force artifacts/db-consolidation/2026-07-29
docker exec specforge-graph-verify-postgres-1 pg_dump -U specforge -Fc -d specforge > artifacts/db-consolidation/2026-07-29/source-graph-verify.dump
docker exec deploy-postgres-1 pg_dump -U specforge -Fc -d specforge > artifacts/db-consolidation/2026-07-29/target-deploy.dump
```

Expected: both dump files have non-zero length.

- [ ] **Step 3: Capture comparable source and target fingerprints**

Run:

```powershell
@'
SELECT 'DesignAsset' AS table_name, count(*) FROM "DesignAsset";
SELECT type, count(*) FROM "DesignAsset" GROUP BY type ORDER BY type;
SELECT "applicationServiceId", count(*) FROM "DesignAsset" GROUP BY "applicationServiceId" ORDER BY "applicationServiceId";
SELECT 'AssetLink' AS table_name, count(*) FROM "AssetLink";
SELECT 'RelationshipCurrent' AS table_name, count(*) FROM "RelationshipCurrent";
SELECT 'RelationshipEvent' AS table_name, count(*) FROM "RelationshipEvent";
SELECT 'RelationshipOutbox' AS table_name, count(*) FROM "RelationshipOutbox";
SELECT 'Proposal' AS table_name, count(*) FROM "Proposal";
SELECT 'ContextPack' AS table_name, count(*) FROM "ContextPack";
'@ | docker exec -i specforge-graph-verify-postgres-1 psql -U specforge -d specforge | Tee-Object artifacts/db-consolidation/2026-07-29/pre-import-fingerprint.txt
```

Expected: the source fingerprint includes the complete asset catalog, including `api` and `dataModel` rows.

### Task 2: Restore and Verify a Fresh Canonical Target

**Files:**
- Create: `artifacts/db-consolidation/2026-07-29/post-import-fingerprint.txt`

**Interfaces:**
- Consumes: Task 1 backups and source fingerprint.
- Produces: `deploy-postgres-1/specforge_canonical` with the source catalog and a comparison record.

- [ ] **Step 1: Restore the source backup into a fresh canonical database**

Run:

```powershell
docker exec deploy-postgres-1 createdb -U specforge specforge_canonical
docker cp artifacts/db-consolidation/2026-07-29/source-graph-verify.dump deploy-postgres-1:/tmp/source-graph-verify.dump
docker exec deploy-postgres-1 pg_restore -U specforge -d specforge_canonical --no-owner --no-privileges /tmp/source-graph-verify.dump
```

Expected: `specforge_canonical` contains the source catalog; the former `specforge` database remains unchanged.

- [ ] **Step 2: Compare fingerprints after import**

Run the Task 1 fingerprint query against `deploy-postgres-1/specforge_canonical`, writing `post-import-fingerprint.txt`, then compare it with `pre-import-fingerprint.txt`.

Expected: source IDs, asset type counts, scope counts, relationships, outbox rows, proposals, and Context Packs are present in `specforge_canonical` without unintended loss.

- [ ] **Step 3: Validate exact scoped catalogue reads**

Run:

```powershell
$env:DATABASE_URL='postgresql://<target-user>:<target-password>@localhost:<canonical-port>/specforge_canonical?schema=public'
pnpm design-facts:check
```

Expected: no missing, mismatched, out-of-scope, or blocked design facts.

### Task 3: Cut Over Active Local Processes

**Files:**
- Modify: `.env`
- Modify: local Docker Compose environment only when it contains the selected canonical connection.

**Interfaces:**
- Consumes: verified canonical target from Task 2.
- Produces: one active local `DATABASE_URL` used by Web, MCP, reconciliation, and graph projection.

- [ ] **Step 1: Set the sole active connection**

Set `.env` to the canonical `deploy-postgres` connection exposed through one documented local tunnel. Remove temporary graph-verification connection values from active process launch commands.

Expected: `apps/web/app/settings/page.tsx` displays a redacted URL for only the canonical endpoint.

- [ ] **Step 2: Start Web and validate routes**

Run:

```powershell
$env:DATABASE_URL=(Get-Content .env | Select-String '^DATABASE_URL=' | ForEach-Object { $_.Line.Split('=',2)[1].Trim('"') })
pnpm --filter @specforge/web dev --port 3000
```

Expected: `/assets/apis`, `/assets/data-models`, `/graph`, and `/workspace` for the Designer scope return content without Prisma errors.

- [ ] **Step 3: Rebuild projection from the canonical source**

Run the graph-projection compose profile with its PostgreSQL connection set to the canonical database, then verify the projection checkpoint and one scoped impact query.

Expected: graph reads are derived from the same canonical PostgreSQL record set and never introduce an authoring authority.

### Task 4: Synchronize and Record the Completed Decision

**Files:**
- Modify: `docs/adr/0014-single-authoritative-local-postgresql.md`
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md`

**Interfaces:**
- Consumes: Task 2 fingerprints, Task 3 route/projection evidence.
- Produces: scope-safe MCP ADR, Proposal, Context Pack, Evidence, typed links, and completed backlog fact.

- [ ] **Step 1: Add exact evidence**

Record backup locations, import method, source/target counts, route verification, and projection result in ADR-0014. Distinguish implemented local cutover from deferred production topology.

- [ ] **Step 2: Write design facts through MCP**

Run:

```powershell
$env:DATABASE_URL='<canonical connection>'
pnpm design-facts:sync
pnpm design-facts:check
```

Expected: the ADR, Proposal, Context Pack, Evidence, and typed links read back in the exact Designer Scope with no reconciliation discrepancies.

- [ ] **Step 3: Commit complete evidence**

Run:

```powershell
git add docs/adr/0014-single-authoritative-local-postgresql.md docs/design-facts/baseline-manifest.json docs/TODO.md
git commit -m "ops: consolidate local PostgreSQL authority"
```

Expected: the implementation and matching design facts are committed together.

## Plan Self-Review

- Spec coverage: Tasks 1-2 cover safe backup, import, and fingerprints; Task 3 covers single connection and derived projection; Task 4 covers ADR/MCP evidence and backlog completion.
- Placeholder scan: Task 2 intentionally requires inspection before choosing an import command because an unreviewed full restore could overwrite target facts. The required safe import method must be selected from actual source/target key conflicts before execution.
- Scope check: this plan is limited to local PostgreSQL authority convergence; external production PostgreSQL and continuous graph projector deployment remain separate work.
