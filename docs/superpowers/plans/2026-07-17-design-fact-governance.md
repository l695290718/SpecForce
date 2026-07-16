# Design Fact Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every SpecForge architectural change traceable as synchronized repository and MCP design facts.

**Architecture:** Keep repository ADRs as reviewable records under `docs/adr/`; retain English as canonical and Chinese as localized content. Use MCP as the only system-of-record write path for ADRs, Proposals, Context Packs, and typed links in the exact owning application-service scope. A reconciliation manifest maps every repository decision to its MCP ID and required evidence.

**Tech Stack:** Markdown, TypeScript, Vitest, PostgreSQL/Prisma, MCP SDK, SpecForge persistence tools.

## Global Constraints

- All human-facing decision content is English canonical with complete Chinese localized overlays.
- Every MCP write uses an exact `architectureScope`; no implicit or cross-scope write is permitted.
- PostgreSQL remains authoritative for authored assets and relationship events; graph stores remain derived projections.
- A failed MCP write is recorded as blocked work and prevents completion claims.
- Do not rewrite unrelated seeded application-service assets.

---

### Task 1: Establish the Repository Governance Contract

**Files:**
- Create: `AGENTS.md`
- Create: `docs/adr/README.md`
- Test: `scripts/design-fact-governance.test.ts`

**Interfaces:**
- Produces a machine-checkable repository policy and ADR directory contract.
- Consumes `docs/superpowers/specs/2026-07-17-design-fact-governance-design.md`.

- [ ] **Step 1: Write the failing policy test**

```ts
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("requires dual-record ADR governance", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  expect(agents).toContain("MCP synchronization blocked");
  expect(agents).toContain("English canonical");
  expect(agents).toContain("docs/adr/");
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm exec vitest run scripts/design-fact-governance.test.ts`

Expected: FAIL because `AGENTS.md` does not exist.

- [ ] **Step 3: Add the governance contract**

Create `AGENTS.md` with mandatory completion rules: classify non-trivial changes; create/update ADRs; synchronously write matching MCP assets and links; verify exact scope, IDs, English canonical fields, Chinese overlays, and evidence; commit code and facts together; record `MCP synchronization blocked` plus retry trigger when unable to persist.

Create `docs/adr/README.md` defining filenames as `NNNN-kebab-case.md`, required ADR sections (`Status`, `Context`, `Decision`, `Alternatives`, `Consequences`, `Constraints`, `Evidence`, `MCP Record`), and the matching MCP ID requirement.

- [ ] **Step 4: Run the policy test**

Run: `pnpm exec vitest run scripts/design-fact-governance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/adr/README.md scripts/design-fact-governance.test.ts
git commit -m "docs: require synchronized design facts"
```

### Task 2: Create the Baseline ADR Corpus and Reconciliation Manifest

**Files:**
- Create: `docs/adr/0001-application-service-scope-isolation.md`
- Create: `docs/adr/0002-mcp-first-design-authoring.md`
- Create: `docs/adr/0003-english-canonical-bilingual-overlays.md`
- Create: `docs/adr/0004-postgresql-authoritative-design-store.md`
- Create: `docs/adr/0005-nebulagraph-derived-impact-runtime.md`
- Create: `docs/adr/0006-transactional-outbox-graph-projection.md`
- Create: `docs/adr/0007-design-fact-dual-record-governance.md`
- Create: `docs/design-facts/baseline-manifest.json`
- Test: `scripts/design-fact-manifest.test.ts`

**Interfaces:**
- Produces one stable repository ADR and one MCP ADR ID for each baseline decision.
- Manifest entries contain `id`, `repositoryAdr`, `mcpAdrId`, `scope`, `proposalId`, `contextPackId`, `relatedAssetIds`, and `evidence`.

- [ ] **Step 1: Write the failing manifest test**

```ts
import manifest from "../docs/design-facts/baseline-manifest.json";
import { expect, it } from "vitest";

it("maps every baseline decision to a repository ADR and MCP record", () => {
  expect(manifest.decisions).toHaveLength(7);
  for (const decision of manifest.decisions) {
    expect(decision.repositoryAdr).toMatch(/^docs\/adr\/\d{4}-.+\.md$/);
    expect(decision.mcpAdrId).toMatch(/^adr-/);
    expect(decision.scope.applicationServiceId).toBe("com.huawei.celon.desiner");
  }
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm exec vitest run scripts/design-fact-manifest.test.ts`

Expected: FAIL because the manifest does not exist.

- [ ] **Step 3: Write the ADRs and manifest**

Write the seven ADRs with complete English and Chinese sections. Use the decisions enumerated in the governance spec. For each ADR include alternatives actually rejected, explicit consequences, constraints, implementation status, commands/tests that verified local behavior, and a `MCP Record` section containing its stable ID and scope.

Create `baseline-manifest.json` with exactly seven entries. Use existing stable IDs where present (`adr-mcp-first-architecture`, `adr-canonical-english-localized-overlay`) and new stable IDs for the five missing facts. Link each entry to its existing or new Proposal and Context Pack IDs.

- [ ] **Step 4: Run the manifest test**

Run: `pnpm exec vitest run scripts/design-fact-manifest.test.ts`

Expected: PASS with seven complete entries.

- [ ] **Step 5: Commit**

```bash
git add docs/adr docs/design-facts/baseline-manifest.json scripts/design-fact-manifest.test.ts
git commit -m "docs: record SpecForge baseline architecture decisions"
```

### Task 3: Persist the Baseline Through MCP and Link Its Evidence

**Files:**
- Create: `scripts/sync-design-facts.ts`
- Create: `scripts/sync-design-facts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes `docs/design-facts/baseline-manifest.json` and a configured MCP stdio client.
- Calls `create_adr`, `create_proposal` or `update_proposal`, `upsert_context_pack`, and `link_assets` using the exact manifest scope.
- Produces `DesignFactSyncReceipt` with `id`, `mcpAdrId`, `status`, `assetLinks`, and `verification`.

- [ ] **Step 1: Write the failing sync test**

```ts
import { expect, it, vi } from "vitest";
import { synchronizeDesignFacts } from "./sync-design-facts";

it("writes every manifest ADR with its scope and bilingual payload", async () => {
  const call = vi.fn().mockResolvedValue({ ok: true });
  const receipt = await synchronizeDesignFacts({ callTool: call, manifest: { decisions: [] } as never });
  expect(receipt.status).toBe("complete");
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm exec vitest run scripts/sync-design-facts.test.ts`

Expected: FAIL because `synchronizeDesignFacts` does not exist.

- [ ] **Step 3: Implement MCP synchronization**

Implement `synchronizeDesignFacts` to load every manifest record, read its repository ADR, construct English canonical and Chinese localized payloads, and call MCP tools in this order: ADR, Proposal, Context Pack, then links. Reject a missing scope, missing localized content, failed tool call, or returned ID mismatch. Add root script `design-facts:sync` using `tsx scripts/sync-design-facts.ts`.

- [ ] **Step 4: Run unit and real MCP synchronization**

Run:

```bash
pnpm exec vitest run scripts/sync-design-facts.test.ts
pnpm design-facts:sync
```

Expected: tests pass; the command prints one `complete` receipt per manifest entry and exits `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-design-facts.ts scripts/sync-design-facts.test.ts package.json
git commit -m "feat: synchronize baseline design facts through MCP"
```

### Task 4: Reconcile MCP Records, Graph Links, and Deferred Work

**Files:**
- Create: `scripts/reconcile-design-facts.ts`
- Create: `scripts/reconcile-design-facts.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes the manifest and scoped MCP read tools.
- Produces `DesignFactReconciliationReport` with `missing`, `mismatched`, `outOfScope`, `blocked`, and `verified` arrays.
- Exits non-zero when any array except `verified` is non-empty.

- [ ] **Step 1: Write the failing reconciliation test**

```ts
import { expect, it } from "vitest";
import { reconcileDesignFacts } from "./reconcile-design-facts";

it("reports a missing ADR as incomplete", async () => {
  const report = await reconcileDesignFacts({ manifest: { decisions: [{ id: "scope" }] } as never, find: async () => undefined });
  expect(report.missing).toEqual(["scope"]);
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm exec vitest run scripts/reconcile-design-facts.test.ts`

Expected: FAIL because `reconcileDesignFacts` does not exist.

- [ ] **Step 3: Implement reconciliation and deferred-work records**

Implement scoped reads for every ADR, Proposal, Context Pack, and typed link required by the manifest. Compare stable IDs, scope, English canonical fields, Chinese overlays, and evidence references. Persist the deferred enterprise graph operations as a bilingual backlog fact linked to ADR 0005 and ADR 0006. Add root script `design-facts:check` using `tsx scripts/reconcile-design-facts.ts`.

- [ ] **Step 4: Verify repository and MCP consistency**

Run:

```bash
pnpm exec vitest run scripts/reconcile-design-facts.test.ts
pnpm design-facts:check
pnpm --filter @specforge/mcp-server test
```

Expected: reconciliation has empty `missing`, `mismatched`, `outOfScope`, and `blocked` arrays; MCP tests pass.

- [ ] **Step 5: Document and commit**

Add a README section explaining `design-facts:sync` and `design-facts:check`, required environment variables, failure semantics, and the rule that a blocked synchronization prevents a completion claim.

```bash
git add scripts/reconcile-design-facts.ts scripts/reconcile-design-facts.test.ts package.json README.md
git commit -m "feat: reconcile synchronized design facts"
```

## Self-Review

- Spec coverage: Tasks 1-4 respectively enforce the agent rule, establish the complete baseline, write facts through MCP, and prove two-record consistency with deferred work visible.
- Placeholder scan: all files, commands, interfaces, IDs, and expected outcomes are stated.
- Type consistency: `DesignFactSyncReceipt` and `DesignFactReconciliationReport` are command-level outputs; MCP write tool names and `architectureScope` match `apps/mcp-server/src/tools.ts`.
