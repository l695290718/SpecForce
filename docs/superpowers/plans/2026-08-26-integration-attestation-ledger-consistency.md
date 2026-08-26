# Integration Attestation Ledger Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Integration Atlas verification Scope-safe and snapshot-consistent by canonicalizing `VALIDATES` relationships, binding cursors to per-Scope catalog/relationship waterlines, and adding regression coverage.

**Architecture:** PostgreSQL remains authoritative. The existing `AssetLink` row is retained as a compatibility projection, while `RelationshipCurrent` and `RelationshipEvent` become the authoritative read/version source for `evidence --VALIDATES--> integration`. Atlas reads a repeatable snapshot and signs a sorted per-Scope version vector. No new database model or graph database is introduced.

**Tech Stack:** TypeScript, Prisma, PostgreSQL, Vitest, Next.js Web, existing MCP relationship command service.

## Global Constraints

- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- All authored assets and typed links continue to be written through MCP persistence.
- `enterpriseId` must use `SPECFORGE_ENTERPRISE_ID` with the existing `legacy-enterprise` compatibility default.
- No unqualified logical-ID lookup may cross an application-service Scope.
- Existing Atlas limits remain: 50 readable Scopes, 500 contracts, 100 nodes, 200 edges, 512 KiB payload, 2 seconds.
- Existing user changes and the unrelated 3A impact-analysis commit `7dbf061` must remain intact.
- A successful code test without MCP synchronization and session closure is incomplete.

---

### Task 1: Canonicalize integration attestation writes

**Files:**
- Modify: `apps/mcp-server/src/persistence.ts:1262-1324,1658-1747`
- Modify: `apps/mcp-server/src/persistence.test.ts` in the legacy AssetLink synchronization suite
- Test: `apps/mcp-server/src/relationships/command-service.test.ts`

**Interfaces:**
- Preserve `upsertAssetLink(input: AssetLinkInput): Promise<PersistedAssetLink>`.
- Add an internal predicate that returns true only for `sourceType=evidence`, `targetType=integration`, and normalized `relationType=VALIDATES`.
- Return the existing `RelationshipCommandReceipt` result through the existing persistence transaction; do not create a second write path.

- [ ] **Step 1: Add failing persistence tests**

Add tests proving an integration attestation link writes both the scoped `AssetLink` and one `legacy-asset-link` relationship current/event sequence, while a replay with the same effective payload is a no-op. Add a test proving a non-integration design-fact link keeps its current behavior.

- [ ] **Step 2: Run the focused persistence tests and confirm the new assertion fails**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/persistence.test.ts src/relationships/command-service.test.ts`

Expected: the new `VALIDATES -> integration` ledger assertion fails before the implementation change.

- [ ] **Step 3: Implement the exact integration-attestation predicate**

Keep `isDesignFactRelation` for existing design-fact compatibility behavior, but route only the exact integration-attestation shape through `resolveLegacyRelationshipScope` and `synchronizeLegacyAssetLinkUpsert`. Keep the existing transaction lock, AssetLink upsert, idempotency key, and cleanup behavior.

- [ ] **Step 4: Run the focused persistence tests**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/persistence.test.ts src/relationships/command-service.test.ts`

Expected: all focused tests pass, including no-op replay and scoped deletion behavior.

- [ ] **Step 5: Commit the task**

Run: `git add apps/mcp-server/src/persistence.ts apps/mcp-server/src/persistence.test.ts apps/mcp-server/src/relationships/command-service.test.ts` then `git commit -m "fix: canonicalize integration attestation relationships"`.

---

### Task 2: Add exact-Scope attestation backfill and parity check

**Files:**
- Create: `scripts/backfill-integration-attestations.ts`
- Create: `scripts/backfill-integration-attestations.test.ts`
- Modify: `package.json` to add `integration-attestations:backfill`
- Modify: `apps/mcp-server/src/persistence.ts` only if a reusable scoped list helper is needed

**Interfaces:**
- CLI inputs: `--application-service`, `--scope-path`, `--mode dry-run|apply`, optional `--batch-size`.
- Report fields: `scanned`, `eligible`, `upserted`, `noOp`, `failed`, `parity`, `architectureScope`.
- `apply` must call the existing `upsertAssetLink`/relationship service path and must never insert directly into `RelationshipCurrent` or `RelationshipEvent`.

- [ ] **Step 1: Add failing backfill tests**

Cover exact Scope filtering, dry-run non-mutation, apply idempotency, unsupported relation exclusion, ambiguous enterprise detection, and parity failure when an eligible AssetLink has no active canonical relationship.

- [ ] **Step 2: Run the backfill unit tests and confirm they fail**

Run: `pnpm exec vitest run scripts/backfill-integration-attestations.test.ts`

Expected: the new CLI module and report assertions fail before implementation.

- [ ] **Step 3: Implement the bounded backfill**

Read only `AssetLink` rows in the exact Scope where `sourceType=evidence`, `targetType=integration`, and normalized `relationType=VALIDATES`. Use batches of at most 500 rows, call the production write path with each row’s exact source/target IDs and description, and verify each eligible row by `sourceReference=legacy-asset-link:<id>` plus active relation identity. Stop on Scope mismatch or enterprise ambiguity.

- [ ] **Step 4: Run unit tests and a dry-run against the configured database**

Run: `pnpm exec vitest run scripts/backfill-integration-attestations.test.ts` and `pnpm integration-attestations:backfill -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --mode dry-run`.

Expected: tests pass; the dry-run reports the exact Scope and does not change counts.

- [ ] **Step 5: Commit the task**

Run: `git add scripts/backfill-integration-attestations.ts scripts/backfill-integration-attestations.test.ts package.json` then `git commit -m "feat: backfill integration attestation relationships"`.

---

### Task 3: Refactor Atlas identity, waterlines, and snapshot reads

**Files:**
- Modify: `apps/web/lib/integrations/atlas.ts`
- Modify: `apps/web/lib/integrations/atlas.test.ts`
- Modify: `apps/web/lib/db.ts` only if the transaction client type needs an existing shared helper

**Interfaces:**
- Preserve `loadIntegrationAtlas(readableScopes, activeScopeId, options): Promise<IntegrationAtlasPage>`.
- Add internal `ScopedLogicalIdentity`, `AtlasScopeWaterline`, and `scopeIdentityKey` helpers.
- Cursor payload remains signed and backward-invalidates version 2 cursors by advancing the payload version if its waterline semantics change.

- [ ] **Step 1: Add failing Atlas tests**

Add tests for same contract IDs across Scopes, same evidence IDs across Scopes, unreadable evidence isolation, catalog-version stale cursors, relationship-version stale cursors, vector changes hidden by a larger sibling version, offset-equivalent timestamp ordering, and repeatable-read transaction usage.

- [ ] **Step 2: Run the Atlas tests and confirm the new tests fail**

Run: `pnpm exec vitest run apps/web/lib/integrations/atlas.test.ts --exclude .worktrees/** --exclude .pnpm-store/**`

Expected: the current unscoped map and integration-only waterline fail the new cases.

- [ ] **Step 3: Implement per-Scope waterline reads**

Within a Prisma `REPEATABLE READ` transaction, read `AuthoredCatalogCursor.nextVersion` and the maximum `RelationshipEvent.graphVersion` for each readable Scope and configured enterprise. Sort the vector by enterprise ID, application-service ID, and Scope path, then hash it. Validate the signed cursor against this digest before continuing.

- [ ] **Step 4: Implement canonical relationship and Evidence reads**

Read active `RelationshipCurrent` rows with relation `VALIDATES`, joining or selecting source and target `AssetNode` identities. Group contract targets and evidence sources by exact Scope. Read Evidence assets with Scope-qualified predicates and build maps using `enterpriseId|applicationServiceId|scopePath|logicalId`.

- [ ] **Step 5: Implement deterministic time precedence and failure handling**

Compare `Date.parse(recordedAt)` values, use scoped Evidence ID as the tie-breaker, ignore malformed legacy timestamps with a diagnostic, and keep database/transaction failures as `ATLAS_UNAVAILABLE` rather than converting them to `UNATTESTED`.

- [ ] **Step 6: Run the Atlas tests and Web typecheck**

Run: `pnpm exec vitest run apps/web/lib/integrations/atlas.test.ts --exclude .worktrees/** --exclude .pnpm-store/**` and `pnpm --filter @specforge/web typecheck`.

Expected: all Atlas tests pass and Web typecheck exits with code 0.

- [ ] **Step 7: Commit the task**

Run: `git add apps/web/lib/integrations/atlas.ts apps/web/lib/integrations/atlas.test.ts apps/web/lib/db.ts` then `git commit -m "fix: make integration atlas scope and snapshot safe"`.

---

### Task 4: Complete the bilingual verification UI

**Files:**
- Modify: `apps/web/components/integration-atlas-canvas.tsx`
- Modify: `apps/web/app/assets/integrations/page.tsx` only if badge state labels need a shared helper
- Modify: `apps/web/lib/i18n.ts` only if an existing verification key is insufficient
- Create: `apps/web/components/integration-atlas-canvas.test.tsx`

**Interfaces:**
- Keep machine-readable `verificationState` enum values unchanged.
- Use `T`/localized labels for the drawer and badges.

- [ ] **Step 1: Add a failing Chinese-render test**

Assert that the verification drawer uses the localized verification-state label and does not render the literal `verification:` label in Chinese mode.

- [ ] **Step 2: Replace the hard-coded drawer label**

Use the existing `integrations.verificationState` message key and preserve the `data-testid` for machine verification.

- [ ] **Step 3: Run the focused UI test and typecheck**

Run: `pnpm exec vitest run apps/web/components/integration-atlas-canvas.test.tsx --exclude .worktrees/** --exclude .pnpm-store/**` and `pnpm --filter @specforge/web typecheck`.

Expected: localized UI assertions and typecheck pass.

- [ ] **Step 4: Commit the task**

Run: `git add apps/web/components/integration-atlas-canvas.tsx apps/web/app/assets/integrations/page.tsx apps/web/lib/i18n.ts apps/web/components/integration-atlas-canvas.test.tsx` then `git commit -m "fix: localize integration verification state"`.

---

### Task 5: Backfill, parity-check, deploy, and close governance records

**Files:**
- Modify: `docs/adr/0041-integration-verification-states.md`
- Modify: `docs/superpowers/specs/2026-08-26-integration-contract-verification-states-design.md` if the superseded design needs a correction link
- Modify: `docs/design-facts/baseline-manifest.json`
- Modify: `docs/TODO.md` only if a deferred item changes
- Test: repository governance and design-fact scripts

**Interfaces:**
- MCP design session: `design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2`.
- Final closure must be `CONVERGED` only with exact command/result evidence.

- [ ] **Step 1: Run the exact-Scope backfill in apply mode**

Run: `pnpm integration-attestations:backfill -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --mode apply`.

Expected: parity is complete for the exact Scope; no out-of-Scope row is modified.

- [ ] **Step 2: Run focused tests and full relevant typechecks**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/persistence.test.ts src/relationships/command-service.test.ts`; `pnpm exec vitest run apps/web/lib/integrations/atlas.test.ts --exclude .worktrees/** --exclude .pnpm-store/**`; `pnpm --filter @specforge/mcp-server typecheck`; `pnpm --filter @specforge/web typecheck`; `git diff --check`.

Expected: all commands pass.

- [ ] **Step 3: Synchronize and reconcile design facts through MCP**

Run: `SPECFORGE_DESIGN_FACT_IDS=adr-integration-verification-states pnpm design-facts:sync` followed by `SPECFORGE_DESIGN_FACT_IDS=adr-integration-verification-states pnpm design-facts:check`. Read back the exact ADR, Proposal, Context Pack, Evidence, links, Scope, bilingual fields, and command evidence.

Expected: `missing`, `mismatched`, `outOfScope`, and `blocked` are empty.

- [ ] **Step 4: Reconcile the exact Scope and deploy the Web service**

Run: `$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'; $env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'; pnpm design-facts:federation:check`; then use the repository deployment script to rebuild and verify `http://127.0.0.1:3010/healthz` and `GET /api/integrations/atlas?scope=com.huawei.celon.desiner`.

Expected: federation reconciliation is non-blocking and the deployed Atlas returns HTTP 200 without cross-Scope leakage.

- [ ] **Step 5: Close the same MCP design session**

Run: `pnpm design-context:close -- --session design-change-session:ba5c8d00-ad33-46cc-befd-1f93dcb0a5c2 --status CONVERGED --evidence "backfill=parity,focused-tests=passed,typechecks=passed,design-facts-check=passed,federation-check=non-blocking,3010-atlas=200"`.

Expected: the returned closure receipt references the same Scope and session ID.

- [ ] **Step 6: Commit governance evidence**

Run: `git add apps/mcp-server/src/persistence.ts apps/mcp-server/src/persistence.test.ts apps/mcp-server/src/relationships/command-service.test.ts scripts/backfill-integration-attestations.ts scripts/backfill-integration-attestations.test.ts apps/web/lib/integrations/atlas.ts apps/web/lib/integrations/atlas.test.ts apps/web/components/integration-atlas-canvas.tsx docs/adr/0041-integration-verification-states.md docs/design-facts/baseline-manifest.json` then `git commit -m "docs: close integration attestation consistency"`.

## Self-Review

- All design requirements map to Tasks 1-5.
- No task introduces a new database model or graph database dependency.
- All IDs used by relationship and Evidence queries are Scope-qualified.
- The plan distinguishes the compatibility `AssetLink` projection from the canonical relationship ledger.
- The plan includes a real PostgreSQL integration path; Mock tests alone do not close the isolation requirement.
- No placeholder, `TBD`, or unspecified verification command remains.
