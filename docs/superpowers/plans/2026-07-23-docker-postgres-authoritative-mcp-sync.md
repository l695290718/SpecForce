# Docker PostgreSQL Authoritative MCP Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `localhost:5433/specforge` the local authority and complete the federated design-fact MCP synchronization/read-back gate for the exact Designer Scope.

**Architecture:** Web, MCP, and reconciliation scripts read `DATABASE_URL` from `.env`; changing that single value moves their local PostgreSQL authority to Docker/WSL port `5433`. The manifest-driven synchronization process writes its ADR, Proposal, Context Pack, Evidence, and typed links through the MCP server; read-only reconciliation validates the persisted facts under the exact Scope.

**Tech Stack:** PostgreSQL 16, Prisma 6, TypeScript, pnpm, MCP SDK, Next.js 15.

## Global Constraints

- Use only `localhost:5433/specforge` for this operation; never reset, copy, or delete `localhost:5432` data.
- Preserve exact Scope: `com.huawei.celon.desiner` and `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- English is canonical and Chinese is a complete human-facing overlay.
- Do not mark a synchronization fact complete unless write, read-back, and reconciliation checks all pass.
- NebulaGraph is not part of this operation and receives no authoring writes.

---

### Task 1: Move the local PostgreSQL authority to Docker/WSL

**Files:**
- Modify: `.env:1`
- Generated: Prisma Client under `node_modules/.pnpm/@prisma+client...`

**Interfaces:**
- Consumes: `DATABASE_URL` in `.env` and `prisma/schema.prisma`.
- Produces: a Prisma Client and running Web service whose database connection is `localhost:5433/specforge`.

- [ ] **Step 1: Verify the target listener before changing configuration**

Run:

```powershell
Test-NetConnection -ComputerName localhost -Port 5433 -InformationLevel Quiet
```

Expected: `True`.

- [ ] **Step 2: Stop the local Web server if it holds Prisma's Windows query engine**

Run:

```powershell
netstat -ano | findstr :3000
```

Expected: identify the listening Node PID, then stop only that PID before Prisma generation.

- [ ] **Step 3: Change the local connection string**

Replace the sole `.env` value with:

```dotenv
DATABASE_URL="postgresql://admin:admin@localhost:5433/specforge?schema=public"
```

- [ ] **Step 4: Generate the client and apply the checked-in schema without data reset**

Run:

```powershell
pnpm db:generate
pnpm db:push
```

Expected: Prisma Client generation succeeds and `db:push` applies the schema without accepting data loss.

- [ ] **Step 5: Verify code against the new generated client**

Run:

```powershell
pnpm typecheck
```

Expected: core, MCP server, and Web type checks pass.

- [ ] **Step 6: Restart and probe the Web service**

Run:

```powershell
pnpm --filter @specforge/web dev --port 3000
```

Expected: `http://localhost:3000/` returns HTTP 200 and the Settings page redacts a URL ending in `:5433/specforge`.

- [ ] **Step 7: Confirm the local-only configuration boundary**

Run:

```powershell
git check-ignore -v .env
git status --short
```

Expected: `.env` is ignored and no database credential or generated Prisma file is staged. The later documentation commit is the auditable repository evidence of this local configuration change.

### Task 2: Synchronize and verify federated design facts through MCP

**Files:**
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/adr/0010-federated-design-fact-synchronization.md`
- Modify: `docs/TODO.md`

**Interfaces:**
- Consumes: `synchronizeDesignFacts()` from `scripts/sync-design-facts.ts`, `reconcileDesignFacts()` from `scripts/reconcile-design-facts.ts`, `reconcilePersistedScope()` through `scripts/reconcile-federated-facts.ts`.
- Produces: persisted MCP facts and a reconciliation report with no blocking issues for the exact Designer Scope.

- [ ] **Step 1: Run the existing manifest regression before live writes**

Run:

```powershell
node .\node_modules\.pnpm\vitest@2.1.9_@types+node@22.20.1\node_modules\vitest\vitest.mjs run scripts\design-fact-manifest.test.ts scripts\sync-design-facts.test.ts scripts\reconcile-design-facts.test.ts scripts\reconcile-federated-facts.test.ts
```

Expected: all selected tests pass before any live MCP write.

- [ ] **Step 2: Write facts through the MCP stdio boundary**

Run:

```powershell
pnpm design-facts:sync
```

Expected: one complete receipt for every manifest decision, including `adr-federated-design-fact-synchronization`.

- [ ] **Step 3: Read back the baseline graph through MCP**

Run:

```powershell
pnpm design-facts:check
```

Expected: JSON report has empty `missing`, `mismatched`, `outOfScope`, and `blocked` arrays.

- [ ] **Step 4: Reconcile federated facts for the fixed exact Scope**

Run:

```powershell
$env:SPECFORGE_APPLICATION_SERVICE_ID = 'com.huawei.celon.desiner'
$env:SPECFORGE_SCOPE_PATH = 'pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'
pnpm design-facts:federation:check
```

Expected: exit code `0`, `blocking: false`, and no issue counts.

- [ ] **Step 5: Replace blocked state with synchronization evidence**

In `docs/design-facts/baseline-manifest.json`, remove the federated decision's `MCP synchronization blocked` status/reason/retry metadata and replace the prior “not run” Evidence item with the actual command and successful result.

In `docs/adr/0010-federated-design-fact-synchronization.md` and `docs/TODO.md`, replace only the two affected blocked items with bilingual completion evidence that includes the three commands above, the exact Scope, and verified read-back results. Do not change the separate NebulaGraph or identity/authorization deferred items.

- [ ] **Step 6: Re-run the completion gate after documentation updates**

Run:

```powershell
pnpm design-facts:sync
pnpm design-facts:check
$env:SPECFORGE_APPLICATION_SERVICE_ID = 'com.huawei.celon.desiner'
$env:SPECFORGE_SCOPE_PATH = 'pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'
pnpm design-facts:federation:check
```

Expected: all commands succeed and the manifest/data record remain aligned after the completion-state documentation change.

- [ ] **Step 7: Commit the verified synchronization evidence**

```powershell
git add docs/design-facts/baseline-manifest.json docs/adr/0010-federated-design-fact-synchronization.md docs/TODO.md
git commit -m "docs: verify federated design fact synchronization"
```

Expected: the commit records only evidence-backed completion of backlog items one and two.
