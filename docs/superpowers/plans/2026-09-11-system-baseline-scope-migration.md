# SpecForge System Baseline Scope Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `com.specforge.designcenter` as SpecForge's isolated built-in baseline Scope and migrate the existing SpecForge design catalog into it through the governed MCP boundary.

**Architecture:** Add one product-neutral application-service Scope to the canonical registry and use it for all SpecForge-owned baseline facts. A migration command will read the source catalog through bounded system knowledge, write target assets and typed links through MCP, record an idempotent migration batch, and leave the source Scope read-only until reconciliation completes.

**Tech Stack:** TypeScript, Next.js, MCP SDK, Prisma/PostgreSQL, Docker Compose, Vitest, PowerShell.

## Global Constraints

- Target Scope is exactly `com.specforge.designcenter`.
- Target Scope path is exactly `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- PostgreSQL remains authoritative for authored assets and relationship events; graph stores are derived projections only.
- Every read and write carries the exact target `architectureScope`; implicit cross-Scope fallback is forbidden.
- English remains canonical and human-facing records must include complete Chinese localized overlays.
- The source Scope is never deleted by this change; it becomes read-only/archived only after target reconciliation.
- Migration is idempotent and must be safe to retry with the same batch key.
- Before code or schema changes, run `prepare_design_change` for the exact current owning Scope; after verification, close the same session with exact evidence.

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/core/src/architecture/mock.ts` | Register the product-neutral baseline Scope and its seed actor grants. |
| `packages/core/src/architecture/service.ts` | Expose stable Scope lookup behavior for baseline and enterprise Scopes. |
| `scripts/system-baseline-scope.ts` | Inspect, migrate, reconcile, and report the baseline Scope through MCP. |
| `scripts/system-baseline-scope.test.ts` | Verify deterministic mapping, idempotency, and cross-Scope rejection without live writes. |
| `scripts/design-context.ts` | Accept explicit target/source Scope options for the governed migration session. |
| `.specforge.yaml.example` | Make the baseline Scope the repository's default governed Scope. |
| `deploy/.env.example` | Point bootstrap health and web default configuration at the baseline Scope. |
| `deploy/compose.yaml` | Pass the baseline Scope and migration mode to the bootstrap services. |
| `README.md` | Document deployment bootstrap, migration verification, and source retirement. |
| `docs/adr/` | Record the architectural decision and evidence. |
| `docs/design-facts/` | Record the matching canonical manifest and migration evidence. |

---

### Task 1: Register the Baseline Scope and Governed Migration Contract

**Files:**
- Modify: `packages/core/src/architecture/mock.ts`
- Modify: `packages/core/src/architecture/service.ts`
- Modify: `.specforge.yaml.example`
- Modify: `scripts/design-context.ts`
- Test: `packages/core/src/__tests__/architecture-scope.test.ts`

**Interfaces:**
- Produces `scopeById("com.specforge.designcenter")` with the exact target path.
- Produces explicit `--source-application-service`, `--source-scope-path`, `--target-application-service`, and `--target-scope-path` migration arguments.

- [ ] **Step 1: Add the target Scope to the registry**

Add a product-neutral application-service entry under a dedicated SpecForge product-family/module path. Keep the existing Huawei Scopes unchanged and give the baseline seed actor exact write access only to the new target Scope.

- [ ] **Step 2: Add Scope registry tests**

Assert the target ID, path, application-service level, product purpose, and denial of a sibling enterprise Scope for the baseline actor.

- [ ] **Step 3: Add explicit migration Scope parsing**

Keep existing preflight defaults unchanged for compatibility, but make migration callers pass both source and target Scope values explicitly. Reject missing, duplicate, or mismatched IDs and paths before any MCP call.

- [ ] **Step 4: Run focused checks**

Run `pnpm --filter @specforge/core test -- architecture-scope` and `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/architecture/mock.ts packages/core/src/architecture/service.ts packages/core/src/__tests__/architecture-scope.test.ts .specforge.yaml.example scripts/design-context.ts
git commit -m "feat: register SpecForge baseline scope"
```

### Task 2: Implement the MCP-Mediated Migration and Reconciliation

**Files:**
- Create: `scripts/system-baseline-scope.ts`
- Create: `scripts/system-baseline-scope.test.ts`
- Modify: `package.json`

**Interfaces:**
- Command: `pnpm system-baseline:inspect -- --source-application-service <id> --source-scope-path <path>`.
- Command: `pnpm system-baseline:migrate -- --session <session-id> --source-application-service <id> --source-scope-path <path> --target-application-service com.specforge.designcenter --target-scope-path pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter --batch-key <key>`.
- Command: `pnpm system-baseline:reconcile -- --batch-key <key> --target-application-service com.specforge.designcenter --target-scope-path pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.

- [ ] **Step 1: Write deterministic mapping tests**

Cover stable ID reuse when target IDs are free, deterministic source-to-target mapping when an ID collision exists, typed relationship endpoint rewriting, complete localization preservation, and rejection of any source/target endpoint outside the declared migration boundary.

- [ ] **Step 2: Implement bounded source inspection**

Call `evaluate_system_knowledge_readiness` first, then call `read_system_knowledge` in the exact source Scope. Emit a manifest containing asset IDs/types/digests, relationship identities, localization coverage, counts, and a content digest. Do not use direct database reads or graph reads as the migration source.

- [ ] **Step 3: Implement target writes through MCP**

Provision or verify the target Scope, then write assets, ADRs, Proposals, Context Packs, and typed links with exact target `architectureScope`, stable idempotency keys, English canonical fields, and Chinese overlays. Persist a migration batch receipt containing source/target Scope, mapping digest, counts, and failure details.

- [ ] **Step 4: Implement retry and failure semantics**

On MCP failure, stop without deleting source records, persist `MCP synchronization blocked` with the error and retry trigger, and return a non-zero exit code. A repeated batch key must replay as a no-op when its digest matches and fail closed when its digest differs.

- [ ] **Step 5: Implement reconciliation**

Compare source manifest, target readback, relationship endpoints, localization coverage, and content digests. Report source-only, target-only, mismatched, and out-of-scope records. Do not mark the migration converged while any discrepancy remains.

- [ ] **Step 6: Run focused checks and commit**

Run `pnpm exec vitest run scripts/system-baseline-scope.test.ts`, `pnpm typecheck`, and `git diff --check`.

```bash
git add scripts/system-baseline-scope.ts scripts/system-baseline-scope.test.ts package.json
git commit -m "feat: migrate SpecForge baseline through MCP"
```

### Task 3: Switch Deployment Bootstrap and Runtime Defaults

**Files:**
- Modify: `deploy/.env.example`
- Modify: `deploy/compose.yaml`
- Modify: `deploy/bootstrap.Dockerfile`
- Modify: `deploy/three-a-bootstrap.Dockerfile`
- Modify: `README.md`
- Test: `deploy/scripts/start.ps1`

**Interfaces:**
- Deployment defaults target `com.specforge.designcenter` and its exact Scope path.
- Bootstrap remains idempotent and does not delete the archived source Scope.

- [ ] **Step 1: Update deployment environment defaults**

Replace the old SpecForge-owned default Scope values in deployment examples and health checks. Keep enterprise read grants explicit and do not add target Scope access to unrelated enterprise agents.

- [ ] **Step 2: Make bootstrap target-aware**

Pass the target Scope and baseline version to bootstrap containers. Bootstrap must verify the target registry entry, run the migration/seed batch only once per matching digest, and wait for reconciliation before reporting success.

- [ ] **Step 3: Update deployment documentation**

Document the authoritative PostgreSQL connection, the first-start migration command, the idempotent retry command, the health checks, and the rollback procedure that points defaults back to the source Scope without deleting data.

- [ ] **Step 4: Run configuration checks**

Run `docker compose --env-file deploy/.env.example -f deploy/compose.yaml config`, `pnpm scanner-contract:check`, and `git diff --check`.

- [ ] **Step 5: Commit**

```bash
git add deploy/.env.example deploy/compose.yaml deploy/bootstrap.Dockerfile deploy/three-a-bootstrap.Dockerfile README.md deploy/scripts/start.ps1
git commit -m "feat: bootstrap SpecForge baseline scope"
```

### Task 4: Record, Synchronize, and Verify the Design Facts

**Files:**
- Create: `docs/adr/0050-specforge-system-baseline-scope.md`
- Create: `docs/design-facts/system-baseline-scope-manifest.json`
- Modify: `docs/TODO.md`

**Interfaces:**
- Uses the same governed design-change session opened before implementation.
- MCP records use target `architectureScope` `com.specforge.designcenter` after the target Scope is provisioned.

- [ ] **Step 1: Write bilingual ADR and manifest**

Record the Scope decision, migration batch, source archival policy, PostgreSQL authority, seed idempotency, isolation behavior, exact commands, and results. Include complete Chinese overlays for human-facing decision content.

- [ ] **Step 2: Synchronize matching MCP records**

Through MCP, create or update the ADR, Proposal, Context Pack, typed relationships, and migration backlog fact in the target Scope. If the target Scope cannot yet accept a write, record `MCP synchronization blocked` in the repository record and keep the migration open.

- [ ] **Step 3: Run live migration and readback**

Run the preflight receipt, inspect the source, migrate with a unique batch key, reconcile, and query both source and target with bounded reads. Verify target-only dashboard and graph counts, exact permissions, and repeated migration idempotency.

- [ ] **Step 4: Close the design-change session**

Close the same session with `CONVERGED` only after all exact command results and MCP receipts are available. Use `BLOCKED` with reason and retry trigger if any target write, permission, localization, or reconciliation check fails.

- [ ] **Step 5: Final verification and commit**

Run `pnpm design-facts:check`, `pnpm --filter @specforge/core test`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Commit only the matching ADR, manifest, and backlog record in this task.

```bash
git add docs/adr/0050-specforge-system-baseline-scope.md docs/design-facts/system-baseline-scope-manifest.json docs/TODO.md
git commit -m "docs: record baseline scope migration facts"
```

## Plan Self-Review

- The target ID and path are explicit in every task.
- Source deletion is excluded and rollback is defined.
- PostgreSQL authority, MCP-only writes, bounded reads, localization, and exact Scope isolation are covered.
- Migration, deployment bootstrap, repository records, and runtime defaults are separate testable tasks.
- No task claims enterprise scanners, cross-Scope views, or external APPLY behavior.
