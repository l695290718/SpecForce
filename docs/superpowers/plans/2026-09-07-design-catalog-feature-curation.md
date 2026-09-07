# Design-Catalog Feature Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit deterministic bilingual Feature catalog backfill from a healthy exact-Scope authored design catalog without weakening source-dependent system-knowledge Profiles.

**Architecture:** Add `DESIGN_CATALOG_CURATION` as a closed readiness Profile with one required `DESIGN_CATALOG` source and profile-specific baseline/reconciliation guards. Keep source-dependent profiles untouched. The existing MCP backfill command changes only its requested Profile and retains its receipt-bound reads, bounded plan, atomic Change Set, and no-write-on-denial behavior.

**Tech Stack:** TypeScript, Vitest, `@specforge/core` readiness policy/evaluator, MCP SDK stdio, PostgreSQL-backed MCP persistence.

## Global Constraints

- Operate only in `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- `ARCHITECTURE_OVERVIEW`, `CHANGE_ASSESSMENT`, and `RUNTIME_DIAGNOSIS` must retain their present evidence requirements and fail-closed semantics.
- Curation reads must evaluate readiness first and consume receipt-bound `read_system_knowledge` pages only.
- Feature writes and typed links must use only `apply_feature_change_set` through MCP.
- English is canonical and Feature Chinese overlays are complete; PostgreSQL is authoritative and graph/search remain derived.
- Do not stage `deploy/three-a-bootstrap.Dockerfile`, `docs/governance-briefing.md`, or `.tmp/`.

---

### Task 1: Model Profile-Specific Curation Guards

**Files:**
- Modify: `packages/core/src/knowledge-readiness/types.ts`
- Modify: `packages/core/src/knowledge-readiness/policy.ts`
- Modify: `packages/core/src/knowledge-readiness/evaluate.ts`
- Test: `packages/core/src/knowledge-readiness/evaluate.test.ts`

**Interfaces:**
- Produces `KnowledgeProfileId` value `DESIGN_CATALOG_CURATION`.
- Produces `profileGuards: Record<KnowledgeProfileId, { requirePublishedBaseline: boolean; reconciliation: "CONVERGED" | "NOT_BLOCKED" }>` on `KnowledgeReadinessPolicy`.
- Keeps `profileRequirements` as the source-requirement map so overlays remain tightening-only.

- [ ] **Step 1: Add failing policy/evaluator cases**

Create one healthy snapshot with only a current, complete `DESIGN_CATALOG` source, no baseline, and no reconciliation. Assert curation is `SELF_CONTAINED`, while `ARCHITECTURE_OVERVIEW` on the same snapshot includes `KNOWLEDGE_SOURCE_NOT_CONFIGURED`. Add a `BLOCKED` reconciliation variant and assert curation is `BLOCKED` with `KNOWLEDGE_RECONCILIATION_BLOCKED`.

```ts
expect(evaluateKnowledgeReadiness({ profileId: "DESIGN_CATALOG_CURATION", policy: enterpriseMinimumPolicy, snapshot: catalogOnly, now }).trustStatus).toBe("SELF_CONTAINED");
expect(evaluateKnowledgeReadiness({ profileId: "ARCHITECTURE_OVERVIEW", policy: enterpriseMinimumPolicy, snapshot: catalogOnly, now }).reasonCodes).toContain("KNOWLEDGE_SOURCE_NOT_CONFIGURED");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec vitest run packages/core/src/knowledge-readiness/evaluate.test.ts`

Expected: failure because the curation Profile and guards do not exist.

- [ ] **Step 3: Add the minimal guarded Profile model**

Add `DESIGN_CATALOG_CURATION` to `KnowledgeProfileId`. Add the `profileGuards` map, configured as:

```ts
DESIGN_CATALOG_CURATION: {
  requirePublishedBaseline: false,
  reconciliation: "NOT_BLOCKED"
}
```

Configure its source requirements as `[designCatalog]`. Configure all existing Profiles with `{ requirePublishedBaseline: true, reconciliation: "CONVERGED" }`. In `evaluateKnowledgeReadiness`, evaluate baseline/reconciliation only through the selected guard; any persisted `BLOCKED` reconciliation must remain `BLOCKED` for every Profile. Keep unresolved conflicts and pending candidate checks fail-closed for every Profile.

- [ ] **Step 4: Verify core behavior**

Run: `pnpm exec vitest run packages/core/src/knowledge-readiness/evaluate.test.ts && pnpm --filter @specforge/core typecheck`

Expected: pass; catalog curation accepts catalog-only healthy evidence, all source-dependent Profiles remain denied without source code.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/knowledge-readiness/types.ts packages/core/src/knowledge-readiness/policy.ts packages/core/src/knowledge-readiness/evaluate.ts packages/core/src/knowledge-readiness/evaluate.test.ts
git commit -m "feat: add design catalog curation readiness"
```

### Task 2: Expose the Curation Profile Through Exact-Scope MCP Reads

**Files:**
- Modify: `apps/mcp-server/src/federation/tools.ts`
- Modify: `apps/mcp-server/src/federation/tools.test.ts`
- Test: `apps/mcp-server/src/knowledge-readiness/service.test.ts`

**Interfaces:**
- `evaluate_system_knowledge_readiness` and `read_system_knowledge` accept `knowledgeProfile: "DESIGN_CATALOG_CURATION"`.
- Receipts remain bound to Profile, exact Scope, caller grants, selectors, policy version, and waterlines.

- [ ] **Step 1: Add failing MCP-schema and receipt-binding tests**

Invoke both tools with `DESIGN_CATALOG_CURATION` through the seeded exact Scope. Assert the mocked readiness service receives that Profile and a later page must use the matching receipt/Profile. Assert sibling Scope still returns the no-leak denial envelope.

- [ ] **Step 2: Run the focused MCP suite and confirm failure**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/tools.test.ts src/knowledge-readiness/service.test.ts`

Expected: failure because Zod accepts only three Profiles.

- [ ] **Step 3: Extend the closed MCP enum only**

Add `DESIGN_CATALOG_CURATION` to `knowledgeProfileSchema` in `apps/mcp-server/src/federation/tools.ts`. Do not add compatibility bypasses, new permissions, wildcard grants, or direct catalog reads.

- [ ] **Step 4: Verify MCP behavior**

Run: `pnpm --filter @specforge/mcp-server exec vitest run src/federation/tools.test.ts src/knowledge-readiness/service.test.ts && pnpm --filter @specforge/mcp-server typecheck`

Expected: pass; curation is exact-Scope and receipt-bound, and architecture overview behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/federation/tools.ts apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/knowledge-readiness/service.test.ts
git commit -m "feat: expose design catalog curation reads"
```

### Task 3: Rebind Feature Backfill to Curation Knowledge

**Files:**
- Modify: `scripts/backfill-feature-catalog.ts`
- Modify: `scripts/backfill-feature-catalog.test.ts`

**Interfaces:**
- `runFeatureCatalogBackfill` requests `DESIGN_CATALOG_CURATION` for readiness and every page.
- It preserves one receipt, the existing plan digest/idempotency key, dry-run no persistence, and atomic MCP-only writes.

- [ ] **Step 1: Add a failing command test**

Assert the first fake MCP call contains `knowledgeProfile: "DESIGN_CATALOG_CURATION"`, and every `read_system_knowledge` call preserves the same profile plus receipt ID.

- [ ] **Step 2: Run the command test and confirm failure**

Run: `pnpm exec vitest run scripts/backfill-feature-catalog.test.ts`

Expected: failure because the command requests `ARCHITECTURE_OVERVIEW`.

- [ ] **Step 3: Change only the command Profile constant**

```ts
const knowledgeProfile = "DESIGN_CATALOG_CURATION";
```

Keep all other request fields and denial handling unchanged.

- [ ] **Step 4: Verify command behavior**

Run: `pnpm exec vitest run scripts/backfill-feature-catalog.test.ts apps/mcp-server/src/features/catalog-backfill.test.ts`

Expected: pass; no write follows any denied evaluation and dry-run uses one curation receipt across pages.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-feature-catalog.ts scripts/backfill-feature-catalog.test.ts
git commit -m "fix: use curation readiness for feature backfill"
```

### Task 4: Synchronize the Decision and Backfill the Exact Scope

**Files:**
- Modify: `docs/adr/0045-system-knowledge-readiness-gate.md`
- Modify: `docs/adr/0047-first-class-feature-assets.md`
- Modify: `docs/design-facts/system-knowledge-readiness-manifest.json`
- Modify: `docs/design-facts/baseline-manifest.json`
- Create locally, do not commit: `.specforge/feature-catalog/<plan-digest>.json`

**Interfaces:**
- Uses a new exact-Scope `prepare_design_change` session.
- MCP sync updates ADR-0045, ADR-0047, their Proposal/Context Pack records, managed API/rule documentation, and evidence.

- [ ] **Step 1: Update bilingual repository records**

Record that curation is catalog-only and source-dependent Profiles are unchanged. Update the readiness API contract request schema/profile description and both retry conditions. Include exact focused test commands and live dry-run/apply evidence.

- [ ] **Step 2: Synchronize both decision manifests through MCP**

Run:

```powershell
$env:SPECFORGE_DESIGN_FACT_MANIFEST='docs/design-facts/system-knowledge-readiness-manifest.json'
$env:SPECFORGE_DESIGN_FACT_IDS='system-knowledge-readiness-gate'
pnpm design-facts:sync
$env:SPECFORGE_DESIGN_FACT_MANIFEST='docs/design-facts/baseline-manifest.json'
$env:SPECFORGE_DESIGN_FACT_IDS='first-class-feature-assets'
pnpm design-facts:sync
```

Expected: both ADR/Proposal/Context Pack sets complete in the exact Scope.

- [ ] **Step 3: Run the live curation dry run**

Open a new session with affected IDs `adr-system-knowledge-readiness-gate`, `adr-first-class-feature-assets`, and `api-specforge-mcp-tools`, then run:

```powershell
pnpm feature-catalog:backfill -- --dry-run --session <new-session-id> --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
```

Expected: `ALLOW`, a local plan artifact, no authoritative Feature revisions, and no `NO_EVIDENCED_INDIRECT_PATH` exception.

- [ ] **Step 4: Apply, read back, and close**

Run the same command with `--apply`. Through MCP, read one Service Feature and one Functional Feature in English and Chinese, query their bounded graph and coverage, then close the new session `CONVERGED` with exact command results. If a plan has an unproven mapping, close `BLOCKED` with IDs and retry trigger; do not partially apply.

- [ ] **Step 5: Reconcile, commit, and report**

Run both manifest-specific `design-facts:check` commands, `git diff --check`, and the focused tests. Commit only the four repository record files:

```bash
git add docs/adr/0045-system-knowledge-readiness-gate.md docs/adr/0047-first-class-feature-assets.md docs/design-facts/system-knowledge-readiness-manifest.json docs/design-facts/baseline-manifest.json
git commit -m "docs: record design catalog feature curation"
```

## Plan Self-Review

- Task 1 gives curation a narrow, policy-data-driven exception without weakening source-dependent Profiles.
- Task 2 keeps authorization, exact Scope, and receipt binding unchanged at the MCP boundary.
- Task 3 changes only the caller intent, preserving the existing bounded atomic write path.
- Task 4 supplies the required bilingual repository/MCP records and treats unmapped facts as a visible blocker rather than inventing links.
- No task assumes a scanner release, connector, source-code evidence, or graph projection is present.
