# Complete System Baseline Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every governed fact from `com.huawei.celon.desiner` to the isolated `com.specforge.designcenter` baseline without changing the source.

**Architecture:** Extend the receipt-bound system knowledge protocol with a canonical snapshot page, then apply the assembled snapshot using a target-Scope MCP change set. The change set uses stable IDs, validates and rewrites links locally, deletes target-only residue, records an idempotent receipt, and rebuilds derived target projections.

**Tech Stack:** TypeScript, MCP SDK, Zod, Prisma/PostgreSQL behind MCP, Vitest, Docker Compose.

## Global Constraints

- Source: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`.
- Target: `com.specforge.designcenter` / `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- All authored reads and writes go through MCP, never a direct SQL migration.
- Preserve canonical English and Chinese localized overlays.
- Leave source records unchanged and readable.
- The same `batchKey` and source digest is idempotent; a changed digest fails closed.

## File Structure

| Path | Responsibility |
| --- | --- |
| `apps/mcp-server/src/knowledge-readiness/read.ts` | Receipt-bound canonical snapshot pages. |
| `apps/mcp-server/src/federation/tools.ts` | Snapshot read tool registration. |
| `apps/mcp-server/src/system-baseline-migration.ts` | Deterministic plan and reconciliation. |
| `apps/mcp-server/src/persistence.ts` | Atomic migration persistence and durable receipt. |
| `apps/mcp-server/src/tools.ts` | Migration write tool registration. |
| `scripts/system-baseline-scope.ts` | Inspect, migrate, and reconcile CLI. |
| `scripts/system-baseline-scope.test.ts` | CLI order and idempotency tests. |
| `docs/adr/0050-specforge-system-baseline-scope.md` | Bilingual decision and evidence. |

---

### Task 1: Add A Canonical Snapshot Read

**Files:**
- Modify: `apps/mcp-server/src/knowledge-readiness/read.ts`
- Modify: `apps/mcp-server/src/federation/tools.ts`
- Create: `apps/mcp-server/src/knowledge-readiness/snapshot.test.ts`

**Interfaces:**
- `read_system_knowledge_snapshot({ architectureScope, receiptId, pageSize, cursor })` returns full payloads for assets, Proposals, Context Packs, Evidence, and typed links.

- [ ] **Step 1: Write the failing test**

```ts
it("returns full payloads only under a valid receipt", async () => {
  const page = await readSystemKnowledgeSnapshot(prisma, requestWithReceipt, principal);
  expect(page.accessDecision).toBe("ALLOW");
  expect(page.assets[0]).toMatchObject({ id: "api-design", payload: { id: "api-design" } });
  expect(page.assets[0]?.architectureScope).toEqual(sourceScope);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/snapshot.test.ts`  
Expected: FAIL because `readSystemKnowledgeSnapshot` is absent.

- [ ] **Step 3: Implement bounded snapshot pages**

```ts
export interface SystemKnowledgeSnapshotPage {
  accessDecision: "ALLOW" | "DENY";
  receiptId?: string;
  assets: Array<{ id: string; type: string; payload: Record<string, unknown>; contentDigest: string; architectureScope: ArchitectureScopeRef }>;
  proposals: Array<{ id: string; payload: Record<string, unknown>; contentDigest: string; architectureScope: ArchitectureScopeRef }>;
  contextPacks: Array<{ id: string; payload: Record<string, unknown>; contentDigest: string; architectureScope: ArchitectureScopeRef }>;
  assetLinks: Array<{ id: string; sourceType: string; sourceId: string; targetType: string; targetId: string; relationType: string; description?: string; architectureScope: ArchitectureScopeRef }>;
  manifestDigest: string;
  nextCursor?: string;
}
```

Reuse receipt revalidation, exact-Scope filtering, signed cursor binding, and response budgets from `readSystemKnowledge`. Parse canonical JSON only from exact-Scope rows and cap a page at 200 facts.

- [ ] **Step 4: Register the tool**

```ts
registerFederationJsonTool(server, "read_system_knowledge_snapshot", {
  title: "Read canonical system knowledge snapshot",
  inputSchema: knowledgeReadInputSchema,
  permissions: ["knowledge:consume"],
  readOnly: true
}, async (input, caller) => readSystemKnowledgeSnapshot(prisma, input, caller));
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec vitest run apps/mcp-server/src/knowledge-readiness/snapshot.test.ts`  
Expected: PASS.

```bash
git add apps/mcp-server/src/knowledge-readiness/read.ts apps/mcp-server/src/federation/tools.ts apps/mcp-server/src/knowledge-readiness/snapshot.test.ts
git commit -m "feat: expose governed knowledge migration snapshots"
```

### Task 2: Apply A Target-Scope Migration Batch

**Files:**
- Create: `apps/mcp-server/src/system-baseline-migration.ts`
- Create: `apps/mcp-server/src/system-baseline-migration.test.ts`
- Modify: `apps/mcp-server/src/persistence.ts`
- Modify: `apps/mcp-server/src/tools.ts`

**Interfaces:**
- `apply_system_baseline_migration({ architectureScope, sourceScope, batchKey, sourceDigest, snapshot, dryRun })` returns `DRY_RUN`, `APPLIED`, or `IDEMPOTENT` with counts and digest reconciliation.
- `reconcile_system_baseline_migration({ architectureScope, sourceScope, batchKey })` returns `CONVERGED` only when inventories, payload digests, localized fields, and typed endpoints match.

- [ ] **Step 1: Write failing plan tests**

```ts
it("overwrites matching IDs and deletes target-only residue", () => {
  const plan = buildSystemBaselineMigrationPlan({ source, target, sourceScope, targetScope, batchKey: "baseline-v1" });
  expect(plan.upserts.assets.map((item) => item.id)).toContain("api-design");
  expect(plan.deletes.assets).toContain("stale-target-api");
});

it("rejects a link endpoint absent from the source snapshot", () => {
  expect(() => buildSystemBaselineMigrationPlan(invalidEndpointInput)).toThrow("MIGRATION_ENDPOINT_MISSING");
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm exec vitest run apps/mcp-server/src/system-baseline-migration.test.ts`  
Expected: FAIL because the planner is absent.

- [ ] **Step 3: Implement planning and atomic persistence**

```ts
export function buildSystemBaselineMigrationPlan(input: MigrationPlanInput): SystemBaselineMigrationPlan {
  assertExactScope(input.sourceScope);
  assertExactScope(input.targetScope);
  const idMap = new Map(input.source.assets.map((asset) => [asset.id, asset.id]));
  validateTargetLocalEndpoints(input.source.assetLinks, idMap);
  return { batchKey: input.batchKey, sourceDigest: input.source.digest, idMap,
    upserts: sourceFacts(input.source), deletes: targetOnlyFacts(input.source, input.target),
    links: rewriteLinks(input.source.assetLinks, idMap) };
}

export async function applySystemBaselineMigration(input: ApplySystemBaselineMigrationInput) {
  const target = resolveWritableScope(writableActor(), input.architectureScope);
  return prisma.$transaction(async (transaction) => {
    const existing = await findMigrationReceipt(transaction, target, input.batchKey);
    if (existing?.sourceDigest === input.sourceDigest) return existingIdempotentReceipt(existing);
    if (existing) throw new Error("MIGRATION_BATCH_DIGEST_CONFLICT");
    return input.dryRun ? validateMigrationPlan(transaction, input) : persistMigrationPlan(transaction, input);
  });
}
```

Reject incompatible duplicate ID/type pairs, missing canonical English fields, missing Chinese overlays, and any unresolved relationship endpoint. Write audit revisions for all upserts and deletes; remove target links before their endpoints; persist a receipt with both scopes, counts, batch key, and digests.

- [ ] **Step 4: Register and verify the MCP write tool**

```ts
registerJsonTool(server, "apply_system_baseline_migration", {
  title: "Apply system baseline migration",
  inputSchema: { architectureScope: architectureScopeSchema, sourceScope: architectureScopeSchema,
    batchKey: z.string().min(1).max(256), sourceDigest: z.string().min(1),
    snapshot: z.record(z.unknown()), dryRun: z.boolean() },
  permissions: ["asset:write", "proposal:write", "context-pack:generate"], readOnly: false
}, applySystemBaselineMigration);
```

Register `reconcile_system_baseline_migration` as a read-only tool that loads the durable receipt, reads target facts under the exact target Scope, compares them with the receipt manifest, and returns categorized discrepancies without mutating either Scope.

Run: `pnpm exec vitest run apps/mcp-server/src/system-baseline-migration.test.ts apps/mcp-server/src/persistence.test.ts`  
Expected: PASS.

```bash
git add apps/mcp-server/src/system-baseline-migration.ts apps/mcp-server/src/system-baseline-migration.test.ts apps/mcp-server/src/persistence.ts apps/mcp-server/src/tools.ts
git commit -m "feat: apply governed baseline migration batches"
```

### Task 3: Add CLI And Reconciliation

**Files:**
- Create: `scripts/system-baseline-scope.ts`
- Create: `scripts/system-baseline-scope.test.ts`
- Modify: `package.json`

**Interfaces:**
- `pnpm system-baseline:inspect -- --source-application-service <id> --source-scope-path <path>`
- `pnpm system-baseline:migrate -- --session <id> --source-application-service <id> --source-scope-path <path> --target-application-service <id> --target-scope-path <path> --batch-key <key> --dry-run|--apply`
- `pnpm system-baseline:reconcile -- --batch-key <key> --source-application-service <id> --source-scope-path <path> --target-application-service <id> --target-scope-path <path>`

- [ ] **Step 1: Write failing call-order test**

```ts
it("reads readiness and all source pages before one target dry run", async () => {
  await runSystemBaselineMigration(fakeClient, options);
  expect(fakeClient.calls.map((call) => call.name)).toEqual([
    "evaluate_system_knowledge_readiness", "read_system_knowledge_snapshot",
    "read_system_knowledge_snapshot", "apply_system_baseline_migration"
  ]);
});
```

- [ ] **Step 2: Implement orchestration**

```ts
export async function runSystemBaselineMigration(client: MigrationMcpClient, options: MigrationOptions) {
  const source = await readAllSnapshotPages(client, options.sourceScope);
  const target = await readAllSnapshotPages(client, options.targetScope);
  const manifest = createMigrationManifest(source, target, options.batchKey);
  const result = await call(client, "apply_system_baseline_migration", {
    architectureScope: options.targetScope, sourceScope: options.sourceScope,
    batchKey: options.batchKey, sourceDigest: manifest.sourceDigest,
    snapshot: manifest.snapshot, dryRun: options.mode === "dry-run"
  });
  return { manifest, result };
}
```

Store inspect and reconciliation results under `.specforge/system-baseline/`; reconciliation exits non-zero for source-only, target-only, payload digest, localization, link endpoint, or projection discrepancies.

- [ ] **Step 3: Expose scripts, verify, and commit**

```json
"system-baseline:inspect": "tsx scripts/system-baseline-scope.ts inspect",
"system-baseline:migrate": "tsx scripts/system-baseline-scope.ts migrate",
"system-baseline:reconcile": "tsx scripts/system-baseline-scope.ts reconcile"
```

Run: `pnpm exec vitest run scripts/system-baseline-scope.test.ts && pnpm --filter @specforge/mcp-server typecheck`  
Expected: PASS.

```bash
git add scripts/system-baseline-scope.ts scripts/system-baseline-scope.test.ts package.json
git commit -m "feat: add baseline migration CLI"
```

### Task 4: Execute, Rebuild, And Record Facts

**Files:**
- Modify: `apps/mcp-server/src/bootstrap-3a.ts`
- Create: `docs/adr/0050-specforge-system-baseline-scope.md`
- Create: `docs/design-facts/system-baseline-scope-manifest.json`
- Modify: `docs/TODO.md`

**Interfaces:**
- 3A bootstrap requires a reconciled migration receipt.
- ADR ID: `adr-specforge-system-baseline-scope`.

- [ ] **Step 1: Gate target 3A bootstrap**

```ts
const reconciliation = await callTool("reconcile_system_baseline_migration", { architectureScope, batchKey });
if (reconciliation.status !== "CONVERGED") throw new Error("BASELINE_MIGRATION_NOT_RECONCILED");
await callTool("bootstrap_3a_from_design_assets", { architectureScope, baselineVersion: reconciliation.sourceDigest });
```

- [ ] **Step 2: Run governed migration and reconcile**

```powershell
pnpm design-context:preflight -- --application-service com.huawei.celon.desiner --scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --intent "Migrate complete SpecForge baseline" --affected "adr-mcp-first-architecture,data-specforge-assets,data-specforge-asset-graph" --evidence "approved-complete-migration-design"
pnpm system-baseline:migrate -- --session <source-session> --source-application-service com.huawei.celon.desiner --source-scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --target-application-service com.specforge.designcenter --target-scope-path pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter --batch-key system-baseline-2026-09-15 --dry-run
pnpm system-baseline:migrate -- --session <source-session> --source-application-service com.huawei.celon.desiner --source-scope-path pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner --target-application-service com.specforge.designcenter --target-scope-path pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter --batch-key system-baseline-2026-09-15 --apply
```

Expected: dry run has no invalid endpoints; apply is `APPLIED`; reconciliation is `CONVERGED`.

- [ ] **Step 3: Write MCP facts and close the session**

Create the bilingual ADR, Proposal, Context Pack, migration manifest, and typed target links through MCP. Rebuild target 3A, run Docker and old/new Scope page smoke tests, then close the source design session with the exact evidence.

- [ ] **Step 4: Run final checks and commit**

Run: `pnpm --filter @specforge/core test && pnpm --filter @specforge/mcp-server typecheck && git diff --check`  
Expected: PASS.

```bash
git add apps/mcp-server/src/bootstrap-3a.ts docs/adr/0050-specforge-system-baseline-scope.md docs/design-facts/system-baseline-scope-manifest.json docs/TODO.md
git commit -m "docs: record complete baseline migration"
```

## Plan Self-Review

- Canonical reads stay receipt-bound, paginated, and MCP-mediated.
- Atomic writes cover all facts, typed links, cleanup, audit receipts, and idempotency.
- The source Scope remains untouched; no unrelated Scope is migrated.
- Tasks cover projection rebuild, Docker verification, and synchronized design records.
